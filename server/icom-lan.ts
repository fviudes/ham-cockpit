/**
 * Transporte Icom Network Control (RS-BA1 / LAN UDP) no servidor.
 * Autentica em 50001, abre CI-V em 50002 via icom-wlan-node, expõe TCP local
 * para o Hamlib (rigctld -r 127.0.0.1:45002) e comandos do painel.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server, type Socket } from "node:net";
import { promisify } from "node:util";
import { IcomControl, type IcomMode, type IcomModelId } from "icom-wlan-node";

const execFileAsync = promisify(execFile);

/** TCP CI-V local para o Hamlib / clientes seriais. */
export const ICOM_LAN_CIV_TCP_PORT = 45002;
const CIV_PRE = 0xfe;
const CIV_END = 0xfd;

export type IcomLanPhase = "idle" | "connecting" | "ready" | "error";

export type IcomLanSnapshot = {
  ok: boolean;
  phase: IcomLanPhase;
  connected: boolean;
  host: string;
  controlPort: number;
  civTcpPort: number;
  civAddr: string;
  model: string;
  radioId: string;
  deviceName: string;
  error: string;
  hamlibPid: number | null;
};

type ConnectOpts = {
  radioId: string;
  host: string;
  /** Porta de controle UDP (padrão 50001). */
  controlPort?: number;
  userName: string;
  password: string;
  civAddr?: string;
  /** Modelo Hamlib USB equivalente (ex. 3085 = IC-705). */
  hamlibModel?: number;
  equipmentId?: string;
  deviceName?: string;
};

let rig: IcomControl | null = null;
let phase: IcomLanPhase = "idle";
let error = "";
let radioId = "";
let host = "";
let controlPort = 50001;
let civAddr = "0xA4";
let modelLabel = "";
let deviceName = "";
let hamlibModel = 3085;
let tcpServer: Server | null = null;
const tcpClients = new Set<Socket>();
let rigctld: ChildProcess | null = null;
let stoppedSystemdHamlib = false;
let connectGen = 0;

function snap(): IcomLanSnapshot {
  return {
    ok: phase !== "error",
    phase,
    connected: phase === "ready",
    host,
    controlPort,
    civTcpPort: ICOM_LAN_CIV_TCP_PORT,
    civAddr,
    model: modelLabel,
    radioId,
    deviceName,
    error,
    hamlibPid: rigctld?.pid ?? null,
  };
}

function parseCivAddr(raw?: string): number {
  const s = String(raw || "0xA4").trim();
  const n = Number.parseInt(s.replace(/^0x/i, ""), 16);
  return Number.isFinite(n) && n >= 0 && n <= 0xff ? n : 0xa4;
}

function formatCivAddr(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** Resolve perfil icom-wlan-node a partir do catálogo / nome. */
export function resolveIcomLanModel(equipmentId?: string, hint?: string): IcomModelId | "auto" {
  const id = `${equipmentId || ""} ${hint || ""}`.toLowerCase();
  if (id.includes("705")) return "IC-705";
  if (id.includes("905")) return "IC-905";
  if (id.includes("9700")) return "IC-9700";
  if (id.includes("7610")) return "IC-7610";
  if (id.includes("7760")) return "IC-7760";
  if (id.includes("7300mk2") || id.includes("7300-mk2") || id.includes("7300mkii")) return "IC-7300MK2";
  if (id.includes("7300")) return "IC-7300";
  return "auto";
}

function mapUiMode(mode: string): { mode: IcomMode; dataMode?: boolean } {
  const key = mode.trim().toUpperCase();
  if (key === "LSB-D") return { mode: "LSB", dataMode: true };
  if (key === "USB-D") return { mode: "USB", dataMode: true };
  if (key === "LSB" || key === "USB" || key === "AM" || key === "CW" || key === "FM" || key === "DV") {
    return { mode: key as IcomMode };
  }
  if (key === "RTTY") return { mode: "RTTY" };
  return { mode: "USB" };
}

function feedTcp(frame: Buffer) {
  Array.from(tcpClients).forEach((sock) => {
    if (sock.destroyed) {
      tcpClients.delete(sock);
      return;
    }
    try {
      sock.write(frame);
    } catch {
      try {
        sock.destroy();
      } catch {
        /* */
      }
      tcpClients.delete(sock);
    }
  });
}

function attachCivListeners(control: IcomControl) {
  control.events.on("civFrame", (frame: Buffer) => {
    feedTcp(Buffer.from(frame));
  });
  control.events.on("connectionLost", () => {
    if (phase === "ready") {
      phase = "error";
      error = "Sessão Icom LAN perdida";
    }
  });
  control.events.on("error", (err: Error) => {
    if (phase === "connecting" || phase === "ready") {
      error = err?.message || String(err);
    }
  });
}

function ensureTcpBridge() {
  if (tcpServer) return;
  const server = createServer((sock) => {
    tcpClients.add(sock);
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const start = buf.indexOf(CIV_PRE);
        if (start < 0) {
          buf = Buffer.alloc(0);
          break;
        }
        if (start > 0) buf = buf.subarray(start);
        if (buf.length < 2) break;
        if (buf[1] !== CIV_PRE) {
          buf = buf.subarray(1);
          continue;
        }
        const end = buf.indexOf(CIV_END, 2);
        if (end < 0) break;
        const frame = buf.subarray(0, end + 1);
        buf = buf.subarray(end + 1);
        if (rig && phase === "ready") {
          try {
            rig.sendCiv(Buffer.from(frame));
          } catch {
            /* */
          }
        }
      }
    });
    sock.on("close", () => tcpClients.delete(sock));
    sock.on("error", () => tcpClients.delete(sock));
  });
  server.on("error", (err) => {
    error = `TCP CI-V local: ${err.message}`;
  });
  server.listen(ICOM_LAN_CIV_TCP_PORT, "127.0.0.1");
  tcpServer = server;
}

async function stopSystemdHamlib() {
  if (process.platform !== "linux") return;
  try {
    await execFileAsync("systemctl", ["stop", "rigctld@ic705.service"], {
      timeout: 8_000,
      windowsHide: true,
    });
    stoppedSystemdHamlib = true;
  } catch {
    stoppedSystemdHamlib = false;
  }
}

async function startSystemdHamlib() {
  if (process.platform !== "linux" || !stoppedSystemdHamlib) return;
  try {
    await execFileAsync("systemctl", ["start", "rigctld@ic705.service"], {
      timeout: 8_000,
      windowsHide: true,
    });
  } catch {
    /* */
  }
  stoppedSystemdHamlib = false;
}

function killRigctld() {
  if (!rigctld) return;
  try {
    rigctld.kill("SIGTERM");
  } catch {
    /* */
  }
  rigctld = null;
}

async function startRigctldChild() {
  killRigctld();
  await stopSystemdHamlib();
  const addr = parseCivAddr(civAddr);
  const args = [
    "-m",
    String(hamlibModel || 3085),
    "-r",
    `127.0.0.1:${ICOM_LAN_CIV_TCP_PORT}`,
    "-t",
    "4532",
    "-c",
    `0x${addr.toString(16).toUpperCase()}`,
  ];
  try {
    const child = spawn("rigctld", args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    child.on("exit", () => {
      if (rigctld === child) rigctld = null;
    });
    child.stderr?.on("data", () => {
      /* discard — evita encher pipe */
    });
    rigctld = child;
  } catch (err) {
    error = `Hamlib (rigctld) não iniciado: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function icomLanStatus(): IcomLanSnapshot {
  return snap();
}

export function icomLanLive(): boolean {
  return phase === "ready" && Boolean(rig);
}

export async function icomLanConnect(opts: ConnectOpts): Promise<IcomLanSnapshot> {
  const gen = ++connectGen;
  await icomLanDisconnect({ keepRadioMark: true });
  if (gen !== connectGen) return snap();

  radioId = opts.radioId;
  host = String(opts.host || "").trim();
  controlPort = Number(opts.controlPort) > 0 ? Number(opts.controlPort) : 50001;
  civAddr = formatCivAddr(parseCivAddr(opts.civAddr));
  hamlibModel = opts.hamlibModel && opts.hamlibModel > 0 ? opts.hamlibModel : 3085;
  deviceName = String(opts.deviceName || "").trim();
  modelLabel = resolveIcomLanModel(opts.equipmentId, deviceName);
  error = "";
  phase = "connecting";

  if (!host) {
    phase = "error";
    error = "Informe o IP ou hostname do rádio";
    return snap();
  }
  if (!opts.userName?.trim()) {
    phase = "error";
    error = "Informe o Network User do Icom LAN";
    return snap();
  }

  ensureTcpBridge();

  const control = new IcomControl({
    control: { ip: host, port: controlPort },
    userName: opts.userName.trim().slice(0, 16),
    password: String(opts.password || "").slice(0, 16),
    model: modelLabel === "auto" ? "auto" : (modelLabel as IcomModelId),
    connectTimeoutMs: 18_000,
    logger: () => {
      /* sem credenciais nos logs */
    },
  });
  attachCivListeners(control);
  rig = control;

  try {
    await control.connect({ timeout: 18_000 });
    if (gen !== connectGen) {
      await control.disconnect().catch(() => undefined);
      return snap();
    }
    phase = "ready";
    error = "";
    try {
      const id = await control.getRadioIdentity({ timeout: 2500 });
      if (id.civAddress != null) civAddr = formatCivAddr(id.civAddress);
      if (id.rigName) deviceName = id.rigName;
      if (id.modelId) modelLabel = id.modelId;
    } catch {
      /* identidade opcional */
    }
    await startRigctldChild();
    return snap();
  } catch (err) {
    phase = "error";
    error = err instanceof Error ? err.message : String(err);
    try {
      await control.disconnect().catch(() => undefined);
    } catch {
      /* */
    }
    if (rig === control) rig = null;
    return snap();
  }
}

export async function icomLanDisconnect(opts?: { keepRadioMark?: boolean }): Promise<IcomLanSnapshot> {
  connectGen += 1;
  killRigctld();
  await startSystemdHamlib();
  const cur = rig;
  rig = null;
  if (cur) {
    try {
      await cur.disconnect();
    } catch {
      /* */
    }
  }
  Array.from(tcpClients).forEach((sock) => {
    try {
      sock.destroy();
    } catch {
      /* */
    }
  });
  tcpClients.clear();
  phase = "idle";
  error = "";
  if (!opts?.keepRadioMark) {
    radioId = "";
    host = "";
    deviceName = "";
    modelLabel = "";
  }
  return snap();
}

export async function icomLanCmd(
  cmd: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string; reply?: unknown }> {
  if (!rig || phase !== "ready") {
    return { ok: false, error: "Icom LAN não conectado" };
  }
  try {
    switch (cmd) {
      case "freq":
      case "setFreq": {
        const hz = Number(body.hz ?? body.freq);
        if (!Number.isFinite(hz) || hz < 1000) return { ok: false, error: "frequência inválida" };
        await rig.setFrequency(Math.round(hz));
        return { ok: true };
      }
      case "ptt":
      case "setPtt": {
        await rig.setPtt(Boolean(body.on ?? body.ptt));
        return { ok: true };
      }
      case "mode":
      case "setMode": {
        const raw = String(body.mode ?? "USB");
        const mapped = mapUiMode(raw);
        await rig.setMode(mapped.mode, mapped.dataMode ? { dataMode: true } : undefined);
        return { ok: true };
      }
      case "vfo":
      case "setVfo": {
        const which = String(body.vfo ?? body.which ?? "A").toUpperCase() === "B" ? "B" : "A";
        await rig.setVfo(which);
        return { ok: true };
      }
      case "readFreq": {
        const hz = await rig.readOperatingFrequency();
        return { ok: true, reply: { hz } };
      }
      case "readMode": {
        const mode = await rig.readOperatingMode();
        return { ok: true, reply: { mode } };
      }
      case "civ": {
        const hex = String(body.hex || "").replace(/\s+/g, "");
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 10) return { ok: false, error: "frame CI-V inválido" };
        rig.sendCiv(Buffer.from(hex, "hex"));
        return { ok: true };
      }
      default:
        return { ok: false, error: `comando desconhecido: ${cmd}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
