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

/**
 * Network User do Icom é case-sensitive e o menu do rádio grava em maiúsculas.
 * `pr2pt` ≠ `PR2PT` → login 0xFEFFFFFF na UDP 50001.
 */
export function normalizeIcomNetUser(user: string): string {
  return String(user || "")
    .trim()
    .toUpperCase()
    .slice(0, 16);
}

function loginRejectHint(errorCode: number | undefined): string {
  const code = errorCode != null ? errorCode >>> 0 : undefined;
  // Rádio manda LE 0xFEFFFFFF (bytes ff ff ff fe); libs BE leem 0xFFFFFFFE.
  const authFail = code === 0xfeffffff || code === 0xfffffffe || code === 0xffffffff;
  if (authFail) {
    return "Login Icom LAN recusado — confira Network User/senha (maiúsculas/minúsculas) e se outro cliente (wfview/RS-BA1) já está conectado";
  }
  if (code != null) {
    return `Login Icom LAN recusado (código 0x${code.toString(16).toUpperCase()}) — confira Network User/senha e sessão concorrente`;
  }
  return "Login Icom LAN recusado — confira Network User/senha e se outro cliente já está na LAN";
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

function formatLanConnectError(
  raw: string,
  loginHint: string,
  targetHost: string,
  targetPort: number,
): string {
  if (loginHint) return `${loginHint} (${targetHost}:${targetPort})`;
  const timeoutStage = raw.match(/timeout at ([^\s]+)/i)?.[1];
  if (timeoutStage) {
    return `Timeout Icom LAN na etapa ${timeoutStage} (${targetHost}:${targetPort}). Confira IP/rota, Network Control ON e se outro cliente (wfview/RS-BA1) não está na sessão`;
  }
  if (/login rejected/i.test(raw)) {
    return `${loginRejectHint(undefined)} (${targetHost}:${targetPort})`;
  }
  if (raw.trim()) return `${raw} (${targetHost}:${targetPort})`;
  return `Falha Icom LAN em ${targetHost}:${targetPort} (UDP controle). Confira IP, Network User, senha, Network Control ON e sessão concorrente`;
}

export async function icomLanConnect(opts: ConnectOpts): Promise<IcomLanSnapshot> {
  // disconnect() sempre sobe connectGen para cancelar connects em voo.
  // Por isso a geração deste connect só é reservada DEPOIS do teardown inicial —
  // senão gen !== connectGen aborta na hora com error vazio (falso “Falha 50001”).
  await icomLanDisconnect({ keepRadioMark: true });
  const gen = ++connectGen;

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
  const userName = normalizeIcomNetUser(opts.userName || "");
  if (!userName) {
    phase = "error";
    error = "Informe o Network User do Icom LAN";
    return snap();
  }

  ensureTcpBridge();

  const password = String(opts.password || "").slice(0, 16);
  const control = new IcomControl({
    control: { ip: host, port: controlPort },
    userName,
    password,
    model: modelLabel === "auto" ? "auto" : (modelLabel as IcomModelId),
    connectTimeoutMs: 18_000,
    logger: () => {
      /* sem credenciais nos logs */
    },
  });
  attachCivListeners(control);
  let loginHint = "";
  let loginCode: number | undefined;
  control.events.on("login", (res) => {
    if (!res.ok) {
      loginCode = res.errorCode;
      loginHint = loginRejectHint(res.errorCode);
    }
  });
  rig = control;

  try {
    await control.connect({ timeout: 22_000 });
    if (gen !== connectGen) {
      await control.disconnect().catch(() => undefined);
      if (rig === control) rig = null;
      // snap() já reflete idle/error do disconnect concorrente; se ainda estamos
      // nesta tentativa órfã, marca cancelamento explícito.
      if (!error) error = "Conexão Icom LAN cancelada";
      if (phase === "connecting") phase = "idle";
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
    const raw = err instanceof Error ? err.message : String(err);
    if (!loginHint && loginCode != null) loginHint = loginRejectHint(loginCode);
    error = formatLanConnectError(raw, loginHint, host, controlPort);
    try {
      await control.disconnect().catch(() => undefined);
    } catch {
      /* */
    }
    if (rig === control) rig = null;
    return snap();
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function icomLanDisconnect(opts?: { keepRadioMark?: boolean }): Promise<IcomLanSnapshot> {
  connectGen += 1;
  // Marca idle cedo: o HTTP de Desconectar não fica preso no teardown UDP/Hamlib.
  phase = "idle";
  error = "";
  killRigctld();
  void startSystemdHamlib();
  const cur = rig;
  rig = null;
  Array.from(tcpClients).forEach((sock) => {
    try {
      sock.destroy();
    } catch {
      /* */
    }
  });
  tcpClients.clear();
  if (cur) {
    try {
      // Sem timeout o disconnect da lib pode segurar o request e o browser vê Failed to fetch.
      await withTimeout(cur.disconnect().catch(() => undefined), 2_500);
    } catch {
      /* */
    }
  }
  if (!opts?.keepRadioMark) {
    radioId = "";
    host = "";
    deviceName = "";
    modelLabel = "";
  }
  return snap();
}

const PRE_BYTE = { OFF: 0x00, ON1: 0x01, ON2: 0x02 } as const;
const AGC_BYTE = { OFF: 0x00, FAST: 0x01, MID: 0x02, SLOW: 0x03 } as const;

/** Monta frame CI-V FE FE to e0 … FD para comandos sem wrapper na lib. */
function civPayload(...body: number[]): Buffer {
  const to = parseCivAddr(civAddr);
  return Buffer.from([CIV_PRE, CIV_PRE, to, 0xe0, ...body, CIV_END]);
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
      case "setNr":
      case "nr": {
        await rig.setFunction("NR", Boolean(body.on ?? body.nr));
        return { ok: true };
      }
      case "setNb":
      case "nb": {
        await rig.setFunction("NB", Boolean(body.on ?? body.nb));
        return { ok: true };
      }
      case "setPre":
      case "pre": {
        const v = String(body.pre ?? body.value ?? "OFF").toUpperCase();
        const byte = v === "ON1" || v === "ON2" ? PRE_BYTE[v] : PRE_BYTE.OFF;
        rig.sendCiv(civPayload(0x16, 0x02, byte));
        return { ok: true };
      }
      case "setAtt":
      case "att": {
        rig.sendCiv(civPayload(0x11, Boolean(body.on ?? body.att) ? 0x20 : 0x00));
        return { ok: true };
      }
      case "setAgc":
      case "agc": {
        const v = String(body.agc ?? body.value ?? "OFF").toUpperCase() as keyof typeof AGC_BYTE;
        const byte = v === "OFF" ? 0x01 : AGC_BYTE[v] ?? AGC_BYTE.MID;
        rig.sendCiv(civPayload(0x16, 0x12, byte));
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
      case "poll":
      case "readTelemetry": {
        const tick = Number(body.tick ?? 0) || 0;
        const reply = await pollLanTelemetry(tick);
        return { ok: true, reply };
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

type LanTelemetry = {
  freq?: number;
  freqA?: number;
  freqB?: number;
  mode?: string;
  modeA?: string;
  modeB?: string;
  vfo?: "A" | "B";
  ptt?: boolean;
  smeter?: number;
  po?: number;
  swr?: number;
  nr?: boolean;
  nb?: boolean;
  pre?: "OFF" | "ON1" | "ON2";
  att?: boolean;
  agc?: "OFF" | "FAST" | "MID" | "SLOW";
  split?: boolean;
};

function mapModeReply(mode: {
  modeName?: string;
  dataMode?: boolean;
  mode?: number;
} | null): string | undefined {
  if (!mode) return undefined;
  const name = String(mode.modeName || "").toUpperCase();
  if (!name) return undefined;
  if (mode.dataMode && (name === "USB" || name === "LSB")) return `${name}-D`;
  return name;
}

function askCivReply(match: (frame: Buffer) => boolean, body: number[], timeoutMs = 900): Promise<Buffer | null> {
  const control = rig;
  if (!control || phase !== "ready") return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (frame: Buffer | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      control.events.off("civFrame", onFrame);
      resolve(frame);
    };
    const onFrame = (frame: Buffer) => {
      try {
        if (match(frame)) finish(Buffer.from(frame));
      } catch {
        /* */
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    control.events.on("civFrame", onFrame);
    try {
      control.sendCiv(civPayload(...body));
    } catch {
      finish(null);
    }
  });
}

function parsePreFrame(frame: Buffer): "OFF" | "ON1" | "ON2" | undefined {
  // FE FE E0 to 16 02 xx FD
  if (frame.length < 8 || frame[4] !== 0x16 || frame[5] !== 0x02) return undefined;
  const v = frame[6];
  if (v === 0x02) return "ON2";
  if (v === 0x01) return "ON1";
  if (v === 0x00) return "OFF";
  return undefined;
}

function parseAttFrame(frame: Buffer): boolean | undefined {
  // FE FE E0 to 11 xx FD
  if (frame.length < 7 || frame[4] !== 0x11) return undefined;
  return frame[5] === 0x20;
}

function parseAgcFrame(frame: Buffer): "OFF" | "FAST" | "MID" | "SLOW" | undefined {
  if (frame.length < 8 || frame[4] !== 0x16 || frame[5] !== 0x12) return undefined;
  const v = frame[6];
  if (v === 0x03) return "SLOW";
  if (v === 0x02) return "MID";
  if (v === 0x01) return "FAST";
  if (v === 0x00) return "OFF";
  return undefined;
}

/** Poll rotativo: freq/modo/PTT/S-meter sempre; filtros e VFO B em cadência menor. */
async function pollLanTelemetry(tick: number): Promise<LanTelemetry> {
  const control = rig;
  const out: LanTelemetry = {};
  if (!control || phase !== "ready") return out;

  const q = { timeout: 1_200 } as const;
  const seq = ((tick % 8) + 8) % 8;

  try {
    const vfo = await control.getVfo(q);
    if (vfo === "A" || vfo === "B") out.vfo = vfo;
  } catch {
    /* */
  }

  try {
    const hz = await control.readOperatingFrequency(q);
    if (hz != null && hz >= 100_000) {
      out.freq = hz;
      if (out.vfo === "B") out.freqB = hz;
      else out.freqA = hz;
    }
  } catch {
    /* */
  }

  if (seq === 1 || seq === 5) {
    try {
      const mode = await control.readOperatingMode(q);
      const mapped = mapModeReply(mode);
      if (mapped) {
        out.mode = mapped;
        if (out.vfo === "B") out.modeB = mapped;
        else out.modeA = mapped;
      }
    } catch {
      /* */
    }
  }

  try {
    const ptt = await control.readPtt(q);
    if (ptt != null) out.ptt = ptt;
  } catch {
    /* */
  }

  if (out.ptt) {
    try {
      const po = await control.readPowerLevel(q);
      if (po?.watts != null && Number.isFinite(po.watts)) out.po = po.watts;
      else if (po?.percent != null) out.po = Math.max(0, Math.min(10, (po.percent / 100) * 10));
    } catch {
      /* */
    }
    try {
      const swr = await control.readSWR(q);
      if (swr?.swr != null && Number.isFinite(swr.swr)) out.swr = swr.swr;
    } catch {
      /* */
    }
  } else if (seq === 0 || seq === 2 || seq === 4 || seq === 6) {
    try {
      const meter = await control.getLevelMeter(q);
      if (meter?.sUnits != null && Number.isFinite(meter.sUnits)) out.smeter = meter.sUnits;
    } catch {
      /* */
    }
  }

  if (seq === 3) {
    try {
      const nr = await control.getNoiseReductionEnabled(q);
      if (nr != null) out.nr = nr;
    } catch {
      /* */
    }
    try {
      const nb = await control.getNoiseBlankerEnabled(q);
      if (nb != null) out.nb = nb;
    } catch {
      /* */
    }
  }

  if (seq === 7) {
    try {
      const split = await control.getSplitEnabled(q);
      if (split != null) out.split = split;
    } catch {
      /* */
    }
    const preFrame = await askCivReply((f) => f.length >= 8 && f[4] === 0x16 && f[5] === 0x02, [0x16, 0x02]);
    const pre = preFrame ? parsePreFrame(preFrame) : undefined;
    if (pre) out.pre = pre;
    const attFrame = await askCivReply((f) => f.length >= 7 && f[4] === 0x11, [0x11]);
    const att = attFrame ? parseAttFrame(attFrame) : undefined;
    if (att != null) out.att = att;
    const agcFrame = await askCivReply((f) => f.length >= 8 && f[4] === 0x16 && f[5] === 0x12, [0x16, 0x12]);
    const agc = agcFrame ? parseAgcFrame(agcFrame) : undefined;
    if (agc) out.agc = agc;
  }

  // VFO inativo: lê sem deixar o PTT ativo (troca rápida A↔B).
  if (!out.ptt && (seq === 2 || seq === 6) && (out.vfo === "A" || out.vfo === "B")) {
    const cur = out.vfo;
    const other: "A" | "B" = cur === "A" ? "B" : "A";
    try {
      await control.setVfo(other);
      const otherHz = await control.readOperatingFrequency(q);
      const otherMode = await control.readOperatingMode(q);
      await control.setVfo(cur);
      if (otherHz != null && otherHz >= 100_000) {
        if (other === "B") out.freqB = otherHz;
        else out.freqA = otherHz;
      }
      const mapped = mapModeReply(otherMode);
      if (mapped) {
        if (other === "B") out.modeB = mapped;
        else out.modeA = mapped;
      }
    } catch {
      try {
        await control.setVfo(cur);
      } catch {
        /* */
      }
    }
  }

  return out;
}
