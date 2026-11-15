import { createServer, type AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SMETER_DT_CAP_MS,
  SMETER_FRAME_MS,
  hamlibStrengthToUiSMeter,
  nextSmeterWaitMs,
  parseHamlibStrength,
  runSmeterPoll,
  stepSmeter,
} from "../shared/smeter";
import { hubRigctl, noteRigPower, rewriteIc705PowerOn, rigCommandAdmission } from "./hamlib-hub";
import { pollPrimarySmeter, sendPrimaryCmd } from "../client/src/console/radio-cmd";
import type { StationRadio } from "../client/src/console/state";

function radio(partial: Partial<StationRadio>): StationRadio {
  return {
    id: "r1",
    name: "IC-705",
    maker: "icom",
    link: "usb",
    device: "",
    deviceName: "IC-705",
    proto: "civ",
    port: "4002",
    baud: 115200,
    civAddr: "0xA4",
    connected: true,
    primary: true,
    error: "",
    hamlibModel: 3085,
    ...partial,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S-meter rápido", () => {
  it("a leitura seguinte espera a anterior e ocupado não vira rajada", () => {
    expect(nextSmeterWaitMs(true)).toBe(0);
    expect(nextSmeterWaitMs(false)).toBeGreaterThanOrEqual(100);
    expect(nextSmeterWaitMs(false)).toBeLessThanOrEqual(250);
  });

  it("desenha na casa de 30 quadros por segundo", () => {
    expect(SMETER_FRAME_MS).toBe(33);
    expect(SMETER_FRAME_MS).toBe(Math.round(1000 / 30));
    expect(1000 / SMETER_FRAME_MS).toBeGreaterThan(28);
    expect(1000 / SMETER_FRAME_MS).toBeLessThan(32);
  });

  it("um quadro não fecha o salto e a curva é simétrica", () => {
    const up = stepSmeter(0, 9, SMETER_FRAME_MS);
    const down = stepSmeter(9, 0, SMETER_FRAME_MS);
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(2.5);
    expect(9 - down).toBeCloseTo(up, 5);
    let risen = 0;
    for (let i = 0; i < 8; i++) risen = stepSmeter(risen, 9, SMETER_FRAME_MS);
    expect(risen).toBeGreaterThan(3);
    expect(risen).toBeLessThan(9);
    const late = stepSmeter(0, 9, 500);
    expect(late).toBeCloseTo(stepSmeter(0, 9, SMETER_DT_CAP_MS), 5);
    expect(late).toBeLessThan(4);
  });

  it("lê zero como S9 e ignora a linha RPRT", () => {
    expect(parseHamlibStrength("0\nRPRT 0")).toBe(0);
    expect(parseHamlibStrength("-12\nRPRT 0")).toBe(-12);
    expect(hamlibStrengthToUiSMeter(0)).toBe(9);
  });

  it("sem rádio não busca nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const value = await pollPrimarySmeter([radio({ connected: false })]);
    expect(value).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Hamlib pede só o endpoint do medidor, não o poll geral", async () => {
    const seen: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), body: String(init?.body ?? "") });
      return Promise.resolve(json({ ok: true, reply: "-12\nRPRT 0" }));
    });
    const value = await pollPrimarySmeter([radio({})]);
    expect(value).toBe(hamlibStrengthToUiSMeter(-12));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("/api/hamlib/smeter");
    expect(seen[0]!.body).toBe(JSON.stringify({ port: 4532 }));
    expect(seen[0]!.body).not.toMatch(/command|poll|\\bf\\b|STRENGTH|get_level/);
  });

  it("ocupado no medidor vira leitura pulada, sem segundo fetch", async () => {
    let calls = 0;
    let release: (value: Response) => void = () => {};
    const hung = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", () => {
      calls += 1;
      return hung;
    });
    const gate = { busy: false };
    const row = radio({});
    const first = runSmeterPoll(gate, () => pollPrimarySmeter([row]));
    const second = await runSmeterPoll(gate, () => pollPrimarySmeter([row]));
    expect(second).toBeNull();
    expect(calls).toBe(1);
    release(json({ ok: false, reply: "", error: "ocupado" }));
    await expect(first).resolves.toBeNull();
  });

  it("CI-V LAN pede só smeter", async () => {
    const seen: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), body: String(init?.body ?? "") });
      return Promise.resolve(json({ ok: true, reply: { skipped: true } }));
    });
    const value = await pollPrimarySmeter([
      radio({ link: "network", netProfile: "icom-lan-udp", proto: "civ" }),
    ]);
    expect(value).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("/api/radios/civ");
    expect(JSON.parse(seen[0]!.body)).toEqual({ cmd: "smeter" });
  });
});

describe("fila do Hamlib", () => {
  it("não admite outro STRENGTH com a faixa ocupada", () => {
    expect(rigCommandAdmission("\\get_level STRENGTH", true, 0, "unknown", false, "\\get_level STRENGTH")).toBe("ocupado");
    expect(rigCommandAdmission("\\get_level STRENGTH", true, 0, "unknown", false, "f")).toBe("ok");
    expect(rigCommandAdmission("f", true, 0)).toBe("ok");
    expect(rigCommandAdmission("f", false, 1)).toBe("ok");
    expect(rigCommandAdmission("f", false, 2)).toBe("ocupado");
    expect(rigCommandAdmission("f", false, 3)).toBe("ocupado");
    expect(rigCommandAdmission("f", false, 0)).toBe("ok");
    expect(rigCommandAdmission("F 7100000", true, 0)).toBe("ok");
    expect(rigCommandAdmission("F 7100000", false, 4)).toBe("fila cheia");
    expect(rigCommandAdmission("f", true, 1, "unknown", true)).toBe("ok");
    expect(rigCommandAdmission("M PKTUSB 0", true, 1, "unknown", true)).toBe("ok");
    expect(rigCommandAdmission("F 14074000", false, 4, "unknown", true)).toBe("fila cheia");
  });

  it("standby pula f e STRENGTH e deixa o ligar passar", () => {
    expect(rigCommandAdmission("f", false, 0, "off")).toBe("ocupado");
    expect(rigCommandAdmission("\\get_level STRENGTH", false, 0, "off")).toBe("ocupado");
    expect(rigCommandAdmission("\\get_powerstat", false, 0, "off")).toBe("ocupado");
    expect(rigCommandAdmission("\\set_powerstat 1", false, 0, "off")).toBe("ok");
    expect(rigCommandAdmission("F 7140000", false, 0, "off")).toBe("ok");
  });

  it("com o rádio em standby o poll nem abre socket", async () => {
    noteRigPower("127.0.0.1", 9, "off");
    const started = Date.now();
    const out = await hubRigctl(9, "f", "127.0.0.1", 400);
    expect(Date.now() - started).toBeLessThan(150);
    expect(out).toEqual({ ok: false, reply: "", error: "ocupado" });
    noteRigPower("127.0.0.1", 9, "unknown");
  });

  it("IC-705 troca set_powerstat 1 pelo quadro 0x18 0x01", () => {
    const raw = "\\send_raw icom 0xFE:0xFE:0xA4:0xE0:0x18:0x01:0xFD";
    expect(rewriteIc705PowerOn("\\set_powerstat 1", { hamlibModel: 3085, civAddr: "0xA4" })).toBe(raw);
    expect(rewriteIc705PowerOn("\\set_powerstat 1", { equipmentId: "icom-ic-705" })).toBe(raw);
    expect(rewriteIc705PowerOn("\\set_powerstat 1", { hamlibModel: 3070, equipmentId: "icom-ic-7100" })).toBe(
      "\\set_powerstat 1",
    );
    expect(rewriteIc705PowerOn("\\set_powerstat 0", { hamlibModel: 3085 })).toBe("\\set_powerstat 0");
  });

  it("Power on do IC-705 manda o quadro cru e o standby não pede o medidor", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
      seen.push(String(init?.body ?? ""));
      return Promise.resolve(json({ ok: true, reply: "RPRT 0" }));
    });
    const row = radio({});
    await sendPrimaryCmd([row], { type: "setPower", on: false });
    expect(seen.some((b) => b.includes("0x18:0x00"))).toBe(true);
    expect(seen.some((b) => b.includes("set_powerstat"))).toBe(false);
    seen.length = 0;
    expect(await pollPrimarySmeter([row])).toBeNull();
    expect(seen).toHaveLength(0);
    await sendPrimaryCmd([row], { type: "setPower", on: true });
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0]!).command).toBe("\\send_raw icom 0xFE:0xFE:0xA4:0xE0:0x18:0x01:0xFD");
  });

  it("STRENGTH com leitura no ar responde ocupado sem esperar o socket", async () => {
    const first = hubRigctl(1, "\\get_level STRENGTH", "127.0.0.1", 400);
    const started = Date.now();
    const second = await hubRigctl(1, "\\get_level STRENGTH", "127.0.0.1", 400);
    expect(Date.now() - started).toBeLessThan(150);
    expect(second).toEqual({ ok: false, reply: "", error: "ocupado" });
    await first;
  });

  it("STRENGTH fecha no dB e não espera o RPRT atrasado", async () => {
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        while (buf.includes("\n")) {
          const nl = buf.indexOf("\n");
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (/strength/i.test(line)) {
            sock.write("-18\n");
            setTimeout(() => sock.write("RPRT 0\n"), 700);
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    try {
      const started = Date.now();
      const meter = await hubRigctl(port, "\\get_level STRENGTH", "127.0.0.1", 2000);
      expect(Date.now() - started).toBeLessThan(500);
      expect(meter.ok).toBe(true);
      expect(meter.reply).toContain("-18");
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("RPRT no mesmo pacote da leitura não segura o S-meter", async () => {
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        while (buf.includes("\n")) {
          const nl = buf.indexOf("\n");
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line === "f") sock.write("28074000\nRPRT 0\n");
          else if (/strength/i.test(line)) sock.write("-18\nRPRT 0\n");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    try {
      const freq = await hubRigctl(port, "f", "127.0.0.1", 1000);
      await new Promise((r) => setTimeout(r, 30));
      const started = Date.now();
      const meter = await hubRigctl(port, "\\get_level STRENGTH", "127.0.0.1", 1000);
      expect(Date.now() - started).toBeLessThan(800);
      expect(freq.ok).toBe(true);
      expect(freq.reply).toContain("28074000");
      expect(meter).toMatchObject({ ok: true });
      expect(meter.reply).toContain("-18");
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("escrita da escuta passa na frente do poll e o rigctld responde", async () => {
    const seen: string[] = [];
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        while (buf.includes("\n")) {
          const nl = buf.indexOf("\n");
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          seen.push(line);
          if (line.startsWith("F")) sock.write("RPRT 0\n");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const held = hubRigctl(port, "f", "127.0.0.1", 500);
    await new Promise((r) => setTimeout(r, 60));
    const queued = hubRigctl(port, "m", "127.0.0.1", 500);
    const write = hubRigctl(port, "F 14074000", "127.0.0.1", 3000, true);
    try {
      expect(await queued).toEqual({ ok: false, reply: "", error: "ocupado" });
      const out = await write;
      expect(out.ok).toBe(true);
      expect(seen).toContain("F 14074000");
      expect(seen).not.toContain("m");
      await held;
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("f toma o lugar do poll na fila e o rigctld responde", async () => {
    const seen: string[] = [];
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        while (buf.includes("\n")) {
          const nl = buf.indexOf("\n");
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          seen.push(line);
          if (line === "f") sock.write("7074000\nRPRT 0\n");
          else if (line === "m") sock.write("PKTUSB\n2400\nRPRT 0\n");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const held = hubRigctl(port, "\\get_level STRENGTH", "127.0.0.1", 400);
    await new Promise((r) => setTimeout(r, 40));
    const queued = hubRigctl(port, "m", "127.0.0.1", 800);
    const freq = hubRigctl(port, "f", "127.0.0.1", 1500);
    try {
      const mode = await queued;
      const out = await freq;
      expect(mode.ok).toBe(true);
      expect(mode.reply).toContain("PKTUSB");
      expect(out.ok).toBe(true);
      expect(out.reply).toContain("7074000");
      expect(seen).toContain("f");
      expect(seen).toContain("m");
      await held;
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("t sem RPRT não segura a faixa", async () => {
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      sock.on("data", (chunk) => {
        if (chunk.toString().includes("t")) sock.write("0\n");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    try {
      const started = Date.now();
      const out = await hubRigctl(port, "t", "127.0.0.1", 900);
      expect(Date.now() - started).toBeLessThan(400);
      expect(out.ok).toBe(true);
      expect(out.reply).toContain("0");
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("f segue o S-meter quando o dB chega e não espera o RPRT", async () => {
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        while (buf.includes("\n")) {
          const nl = buf.indexOf("\n");
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (/strength/i.test(line)) sock.write("-18\n");
          else if (line === "f") sock.write("28074000\nRPRT 0\n");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const held = hubRigctl(port, "\\get_level STRENGTH", "127.0.0.1", 2000);
    await new Promise((r) => setTimeout(r, 40));
    try {
      const started = Date.now();
      const freq = await hubRigctl(port, "f", "127.0.0.1", 1500);
      const meter = await held;
      expect(Date.now() - started).toBeLessThan(800);
      expect(meter.ok).toBe(true);
      expect(meter.reply).toContain("-18");
      expect(freq.ok).toBe(true);
      expect(freq.reply).toContain("28074000");
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("STRENGTH passa na frente de um f que só está esperando", async () => {
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        while (buf.includes("\n")) {
          const nl = buf.indexOf("\n");
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line === "f") sock.write("7074000\nRPRT 0\n");
          else if (/strength/i.test(line)) sock.write("-16\nRPRT 0\n");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const first = hubRigctl(port, "f", "127.0.0.1", 1000);
    await new Promise((r) => setTimeout(r, 30));
    const queued = hubRigctl(port, "f", "127.0.0.1", 1000);
    try {
      const started = Date.now();
      const meter = await hubRigctl(port, "\\get_level STRENGTH", "127.0.0.1", 1000);
      expect(Date.now() - started).toBeLessThan(500);
      expect(meter.ok).toBe(true);
      expect(meter.reply).toContain("-16");
      expect((await first).ok).toBe(true);
      expect((await queued).ok).toBe(true);
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
