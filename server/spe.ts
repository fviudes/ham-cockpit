/**
 * SPE Expert 1.3K/1.5K/2K-FA — protocolo nativo (Application Programmer's Guide rev 1.1).
 * Host → amp: 0x55×3 | CNT | DATA… | CHK (sum DATA mod 256)
 * Status ← amp: 0xAA×3 | 0x43 | 67 CSV | chk0 chk1 | CR LF
 *
 * ampctld -m 401 (Hamlib Beta) falha em get_level/dump_state neste lab; o console
 * fala direto no ser2net device=spe e para o ampctld@spe enquanto estiver conectado.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadSer2net } from "./ser2net-store";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/spe";
const HELPER = "/opt/ham-cockpit/bin/station-svc";
const POLL_MS = 800;
const BAUD = 9600;

export type SpePhase = "idle" | "connecting" | "ready" | "error";
export type SpePwr = "L" | "M" | "H";
export type SpeCmd =
  | "input"
  | "band-"
  | "band+"
  | "antenna"
  | "l-"
  | "l+"
  | "c-"
  | "c+"
  | "tune"
  | "off"
  | "pwr"
  | "disp"
  | "op"
  | "op1"
  | "op0"
  | "cat"
  | "nav"
  | "set"
  | "status";

export type SpeSnap = {
  ok: boolean;
  port: string;
  baud: number;
  autoConnect: boolean;
  connected: boolean;
  hardware: boolean;
  phase: SpePhase;
  error: string;
  model: string;
  operate: boolean;
  tx: boolean;
  bank: "A" | "B" | "x";
  pout: number;
  pwr: SpePwr;
  swrAtu: number;
  swrAnt: number;
  vpa: number;
  ipa: number;
  band: string;
  ant: number;
  input: number;
  temp: number;
  alarm: string;
  warning: string;
  ledAl: boolean;
  ledTune: boolean;
  ledOn: boolean;
  lastRx: string;
  lastTxHex: string;
  folder: string;
};

type Saved = { autoConnect: boolean };

const CMD_BYTE: Record<string, number> = {
  input: 0x01,
  "band-": 0x02,
  "band+": 0x03,
  antenna: 0x04,
  ant: 0x04,
  "l-": 0x05,
  "← l": 0x05,
  "l →": 0x06,
  "l+": 0x06,
  "c-": 0x07,
  "← c": 0x07,
  "c →": 0x08,
  "c+": 0x08,
  tune: 0x09,
  tuner: 0x09,
  off: 0x0a,
  pwr: 0x0b,
  power: 0x0b,
  disp: 0x0c,
  display: 0x0c,
  op: 0x0d,
  operate: 0x0d,
  op1: 0x0d,
  op0: 0x0d,
  cat: 0x0e,
  nav: 0x0f,
  left: 0x0f,
  "← ↑": 0x0f,
  right: 0x10,
  "↓ →": 0x10,
  set: 0x11,
  status: 0x90,
};

const BANDS = ["160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m", "4m"] as const;

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "spe");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "spe.json");
}

function writeAtomic(file: string, body: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, file);
}

function loadSaved(): Saved {
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as Partial<Saved>;
    return { autoConnect: raw.autoConnect !== false };
  } catch {
    return { autoConnect: true };
  }
}

function persist() {
  writeAtomic(jsonPath(), `${JSON.stringify({ autoConnect: saved.autoConnect }, null, 2)}\n`);
}

function hostPacket(data: Buffer): Buffer {
  let chk = 0;
  for (let i = 0; i < data.length; i++) chk = (chk + (data[i] || 0)) & 0xff;
  const out = Buffer.alloc(4 + data.length + 1);
  out[0] = 0x55;
  out[1] = 0x55;
  out[2] = 0x55;
  out[3] = data.length;
  data.copy(out, 4);
  out[4 + data.length] = chk;
  return out;
}

function bandLabel(code: string): string {
  const n = Number.parseInt(code, 10);
  if (!Number.isFinite(n) || n < 0 || n >= BANDS.length) return code || "—";
  return BANDS[n]!;
}

function parseStatusCsv(payload: string): boolean {
  // Guia: ",13K,S,R,A,1,05,1t,0r,L,0000, 0.00, 0.00, 0.0, 0.0, 25,000,000,N,N,"
  const parts = payload.split(",");
  // leading empty from initial comma
  const f = parts[0] === "" ? parts.slice(1) : parts;
  if (f.length < 19) return false;
  const model = (f[0] || "").trim();
  if (!/^\d{2}K$/.test(model) && model !== "15K") return false;
  const state = (f[1] || "").trim().toUpperCase();
  const ptt = (f[2] || "").trim().toUpperCase();
  const bankRaw = (f[3] || "A").trim();
  const input = Number.parseInt(f[4] || "1", 10);
  const band = bandLabel((f[5] || "").trim());
  const txAnt = (f[6] || "1").trim();
  const ant = Number.parseInt(txAnt[0] || "1", 10) || 1;
  // 0=ID 1=S/O 2=R/T 3=bank 4=input 5=band 6=txAnt 7=rxAnt 8=pwr 9=pout …
  const pwrCh = (f[8] || "L").trim().toUpperCase();
  const pout = Number.parseInt((f[9] || "0").trim(), 10) || 0;
  const swrAtu = Number.parseFloat((f[10] || "0").trim()) || 0;
  const swrAnt = Number.parseFloat((f[11] || "0").trim()) || 0;
  const vpa = Number.parseFloat((f[12] || "0").trim()) || 0;
  const ipa = Number.parseFloat((f[13] || "0").trim()) || 0;
  const temp = Number.parseInt((f[14] || "0").trim(), 10) || 0;
  const warning = (f[17] || "N").trim().toUpperCase();
  const alarm = (f[18] || "N").trim().toUpperCase();

  live.model = model;
  live.operate = state === "O";
  live.tx = ptt === "T";
  live.bank = bankRaw === "B" ? "B" : bankRaw === "x" ? "x" : "A";
  live.input = input === 2 ? 2 : 1;
  live.band = band;
  live.ant = ant >= 1 && ant <= 6 ? ant : 1;
  live.pwr = pwrCh === "M" || pwrCh === "H" ? pwrCh : "L";
  live.pout = pout;
  live.swrAtu = Math.round(swrAtu * 100) / 100;
  live.swrAnt = Math.round(swrAnt * 100) / 100;
  live.vpa = Math.round(vpa * 10) / 10;
  live.ipa = Math.round(ipa * 10) / 10;
  live.temp = temp;
  live.warning = warning === "N" ? "" : warning;
  live.alarm = alarm === "N" ? "" : alarm;
  live.ledAl = alarm !== "N" && alarm !== "";
  live.ledTune = /t/i.test(txAnt.slice(1));
  live.ledOn = true;
  live.hardware = true;
  live.phase = "ready";
  live.error = "";
  live.lastRx = payload.slice(0, 80);
  return true;
}

function consumeRx() {
  for (;;) {
    const sync = rx.indexOf(0xaa);
    if (sync < 0) {
      if (rx.length > 512) rx = rx.subarray(rx.length - 16);
      return;
    }
    if (sync > 0) rx = rx.subarray(sync);
    if (rx.length < 4) return;
    if (rx[0] !== 0xaa || rx[1] !== 0xaa || rx[2] !== 0xaa) {
      rx = rx.subarray(1);
      continue;
    }
    const cnt = rx[3]!;
    // STATUS: AA×3|0x43|67 CSV|chk0 chk1|sep|CR LF  → 76 bytes
    if (cnt === 0x43) {
      if (rx.length < 76) return;
      const payload = rx.subarray(4, 4 + 67).toString("latin1");
      parseStatusCsv(payload);
      rx = rx.subarray(76);
      continue;
    }
    // ACK de tecla: AA×3|0x01|cmd|chk
    if (cnt === 0x01) {
      if (rx.length < 6) return;
      rx = rx.subarray(6);
      continue;
    }
    // SCREEN (0x80) / outros: CNT dados + 1 chk (sem CR LF garantido)
    const frameLen = 4 + cnt + 1;
    if (rx.length < frameLen) return;
    rx = rx.subarray(frameLen);
  }
}

let saved = loadSaved();
let live: Omit<SpeSnap, "ok" | "folder" | "baud"> = {
  port: "",
  autoConnect: saved.autoConnect,
  connected: false,
  hardware: false,
  phase: "idle",
  error: "",
  model: "13K",
  operate: false,
  tx: false,
  bank: "A",
  pout: 0,
  pwr: "L",
  swrAtu: 1,
  swrAnt: 1,
  vpa: 0,
  ipa: 0,
  band: "20m",
  ant: 1,
  input: 1,
  temp: 0,
  alarm: "",
  warning: "",
  ledAl: false,
  ledTune: false,
  ledOn: false,
  lastRx: "",
  lastTxHex: "",
};

let sock: net.Socket | null = null;
let rx = Buffer.alloc(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let chain = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function snap(): SpeSnap {
  return { ok: true, ...live, baud: BAUD, folder: dataDir() };
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function dropSock() {
  stopPoll();
  rx = Buffer.alloc(0);
  const s = sock;
  sock = null;
  if (!s) return;
  try {
    s.removeAllListeners();
    s.destroy();
  } catch {
    /* ignore */
  }
}

async function resolveEndpoint(): Promise<{ host: string; port: number } | null> {
  const cfg = await loadSer2net();
  const svc = cfg.services.find((x) => x.device === "spe");
  if (!svc) return null;
  return { host: cfg.bind || "127.0.0.1", port: svc.tcpPort };
}

/** Libera :4001 — ampctld Expert Beta segura a TCP e impede o protocolo nativo. */
async function stopAmpctld(): Promise<void> {
  if (process.platform !== "linux" || !existsSync(HELPER)) return;
  try {
    await execFileAsync("sudo", ["-n", HELPER, "stop", "spe"], {
      timeout: 40_000,
      windowsHide: true,
    });
  } catch {
    /* sem helper / sem permissão — tenta conectar mesmo assim */
  }
}

function writePacket(data: Buffer): boolean {
  if (!sock || sock.destroyed) return false;
  try {
    const pkt = hostPacket(data);
    live.lastTxHex = pkt.toString("hex");
    sock.write(pkt);
    return true;
  } catch {
    return false;
  }
}

function requestStatus() {
  writePacket(Buffer.from([0x90]));
}

function startPoll() {
  stopPoll();
  const tick = () => {
    if (!sock || sock.destroyed) return;
    requestStatus();
  };
  tick();
  pollTimer = setInterval(tick, POLL_MS);
  pollTimer.unref?.();
}

function attachSock(s: net.Socket, host: string, port: number) {
  dropSock();
  sock = s;
  rx = Buffer.alloc(0);
  live.port = `${host}:${port}`;
  live.connected = true;
  live.hardware = false;
  live.phase = "ready";
  live.error = "";
  live.ledOn = true;
  s.setNoDelay(true);
  s.on("data", (buf) => {
    rx = Buffer.concat([rx, buf]);
    consumeRx();
  });
  s.on("error", (err) => {
    live.error = err.message;
    live.phase = "error";
    live.hardware = false;
    live.connected = false;
    dropSock();
  });
  s.on("close", () => {
    if (sock !== s) return;
    sock = null;
    stopPoll();
    live.connected = false;
    live.hardware = false;
    if (live.phase !== "idle") live.phase = "error";
  });
  startPoll();
}

export function speStatus(): SpeSnap {
  return snap();
}

export async function spePeek(): Promise<SpeSnap> {
  return snap();
}

export async function speSave(body: Record<string, unknown>): Promise<SpeSnap> {
  if (typeof body.autoConnect === "boolean") saved.autoConnect = body.autoConnect;
  persist();
  live.autoConnect = saved.autoConnect;
  return snap();
}

export async function speConnect(): Promise<SpeSnap> {
  return enqueue(async () => {
    live.error = "";
    live.phase = "connecting";
    live.autoConnect = saved.autoConnect;
    await stopAmpctld();
    const ep = await resolveEndpoint();
    if (!ep) {
      live.connected = false;
      live.hardware = false;
      live.phase = "error";
      live.error = "noport";
      return snap();
    }
    live.port = `${ep.host}:${ep.port}`;
    return await new Promise<SpeSnap>((resolve) => {
      const s = new net.Socket();
      let settled = false;
      const finish = (ok: boolean, error?: string) => {
        if (settled) return;
        settled = true;
        if (!ok) {
          try {
            s.destroy();
          } catch {
            /* ignore */
          }
          live.connected = false;
          live.hardware = false;
          live.phase = "error";
          live.error = error || "timeout";
          resolve(snap());
          return;
        }
        attachSock(s, ep.host, ep.port);
        resolve(snap());
      };
      const timer = setTimeout(() => finish(false, "timeout"), 2500);
      s.once("error", (err) => {
        clearTimeout(timer);
        finish(false, err.message);
      });
      s.connect(ep.port, ep.host, () => {
        clearTimeout(timer);
        finish(true);
      });
    });
  });
}

export async function speDisconnect(): Promise<SpeSnap> {
  dropSock();
  live.connected = false;
  live.hardware = false;
  live.phase = "idle";
  live.error = "";
  live.tx = false;
  live.pout = 0;
  live.ipa = 0;
  live.ledOn = false;
  live.lastTxHex = "";
  return snap();
}

export async function speCmd(cmd: string): Promise<SpeSnap> {
  const key = String(cmd || "")
    .trim()
    .toLowerCase();
  return enqueue(async () => {
    if (!live.connected || !sock) {
      const up = await speConnect();
      if (!up.connected) return up;
    }
    // op1 / op0: só dispara o toggle se o estado alvo for diferente
    if (key === "op1" && live.operate) return snap();
    if (key === "op0" && !live.operate) return snap();
    if (key === "off") {
      const ok = writePacket(Buffer.from([0x0a]));
      if (!ok) {
        live.error = "tx";
        live.phase = "error";
        return snap();
      }
      // amp desliga a UART — marca offline
      setTimeout(() => {
        void speDisconnect();
      }, 200);
      return snap();
    }
    const code = CMD_BYTE[key];
    if (code == null) {
      live.error = "cmd";
      return snap();
    }
    const ok = writePacket(Buffer.from([code]));
    if (!ok) {
      live.error = "tx";
      live.phase = "error";
      return snap();
    }
    // status imediato após comando (além do poll)
    setTimeout(() => requestStatus(), 120);
    return snap();
  });
}
