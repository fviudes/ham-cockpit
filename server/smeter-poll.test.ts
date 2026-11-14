import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SMETER_POLL_MS,
  hamlibStrengthToUiSMeter,
  parseHamlibStrength,
  runSmeterPoll,
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
  it("tenta 60 vezes por segundo", () => {
    expect(SMETER_POLL_MS).toBe(17);
    expect(SMETER_POLL_MS).toBe(Math.round(1000 / 60));
    expect(1000 / SMETER_POLL_MS).toBeGreaterThan(58);
    expect(1000 / SMETER_POLL_MS).toBeLessThan(62);
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
    expect(rigCommandAdmission("\\get_level STRENGTH", true, 0)).toBe("ocupado");
    expect(rigCommandAdmission("f", true, 0)).toBe("ok");
    expect(rigCommandAdmission("f", false, 1)).toBe("ocupado");
    expect(rigCommandAdmission("f", false, 0)).toBe("ok");
    expect(rigCommandAdmission("F 7100000", true, 0)).toBe("ok");
    expect(rigCommandAdmission("F 7100000", false, 4)).toBe("fila cheia");
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
});
