import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSer2net } from "./ser2net-store";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/lp100a";
const POLL_MS = 200;
const BAUD = 115200;

export type Lp100aCmd = "alarm" | "meter";
export type Lp100aMeter = "AVG" | "PEAK" | "TUNE";
export type Lp100aRange = "HIGH" | "MID" | "LOW";
export type Lp100aPhase = "idle" | "connecting" | "ready" | "error";

export type Lp100aSnap = {
  ok: boolean;
  port: string;
  baud: number;
  autoConnect: boolean;
  connected: boolean;
  hardware: boolean;
  phase: Lp100aPhase;
  error: string;
  fwd: number;
  ref: number;
  swr: number;
  z: number;
  phaseDeg: number;
  dbm: number;
  alarm: number;
  callsign: string;
  range: Lp100aRange;
  meter: Lp100aMeter;
  tx: boolean;
  lastRx: string;
  folder: string;
};

type Saved = { autoConnect: boolean };

const ALARM_SWR = [0, 1.5, 2, 2.5, 3, 0];
const CMD_BYTE: Record<Lp100aCmd, string> = { alarm: "A", meter: "F" };

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "lp100a");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "lp100a.json");
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

function reflected(fwd: number, swr: number) {
  if (!(fwd > 0) || !(swr > 1)) return 0;
  const rho = (swr - 1) / (swr + 1);
  return fwd * rho * rho;
}

function dbmOf(watts: number) {
  if (!(watts > 0)) return -99;
  return 10 * Math.log10(watts * 1000);
}

async function resolveEndpoint(): Promise<{ host: string; port: number } | null> {
  const cfg = await loadSer2net();
  const svc = cfg.services.find((x) => x.device === "lp100a");
  if (!svc) return null;
  return { host: cfg.bind || "127.0.0.1", port: svc.tcpPort };
}

function asMeter(n: number): Lp100aMeter {
  if (n === 1) return "PEAK";
  if (n === 2) return "TUNE";
  return "AVG";
}

function asRange(n: number): Lp100aRange {
  if (n === 1) return "MID";
  if (n === 2) return "LOW";
  return "HIGH";
}

function parseFrame(raw: string) {
  const line = raw.replace(/[\r\n]+/g, "").trim();
  if (!line.startsWith(";")) return false;
  const parts = line.slice(1).split(",").map((p) => p.trim());
  if (parts.length < 7) return false;
  const fwd = Number(parts[0]);
  const z = Number(parts[1]);
  const phaseDeg = Number(parts[2]);
  const alarm = Math.trunc(Number(parts[3]));
  const callsign = (parts[4] || "").replace(/\s+$/g, "");
  const rangeN = Math.trunc(Number(parts[5]));
  const meterN = Math.trunc(Number(parts[6]));
  const dbm = parts.length >= 8 ? Number(parts[7]) : dbmOf(fwd);
  const swr = parts.length >= 9 ? Number(parts[8]) : 1;
  if (!Number.isFinite(fwd)) return false;
  live.fwd = Math.round(fwd * 100) / 100;
  live.z = Number.isFinite(z) ? Math.round(z * 10) / 10 : 0;
  live.phaseDeg = Number.isFinite(phaseDeg) ? Math.round(phaseDeg * 10) / 10 : 0;
  live.alarm = alarm >= 0 && alarm <= 5 ? alarm : 0;
  live.callsign = callsign.slice(0, 12);
  live.range = asRange(rangeN);
  live.meter = asMeter(meterN);
  live.dbm = Number.isFinite(dbm) ? Math.round(dbm * 10) / 10 : dbmOf(fwd);
  live.swr = Number.isFinite(swr) && swr > 0 ? Math.round(swr * 100) / 100 : 1;
  live.ref = Math.round(reflected(live.fwd, live.swr) * 100) / 100;
  live.tx = live.fwd > 0.2;
  live.lastRx = line.slice(0, 64);
  live.hardware = true;
  live.phase = "ready";
  live.error = "";
  return true;
}

function consumeRx() {
  for (;;) {
    const start = rx.indexOf(";");
    if (start < 0) {
      if (rx.length > 96) rx = rx.slice(-24);
      return;
    }
    if (start > 0) rx = rx.slice(start);
    const next = rx.indexOf(";", 1);
    const chunk = next >= 0 ? rx.slice(0, next) : rx;
    const commas = (chunk.match(/,/g) || []).length;
    if (commas < 6) {
      if (next >= 0) {
        rx = rx.slice(next);
        continue;
      }
      if (chunk.length > 96) rx = "";
      return;
    }
    if (next < 0 && commas < 8 && chunk.length < 52) return;
    parseFrame(chunk);
    if (next < 0) {
      rx = "";
      return;
    }
    rx = rx.slice(next);
  }
}

let saved = loadSaved();
let live: Omit<Lp100aSnap, "ok" | "folder" | "baud"> = {
  port: "",
  autoConnect: saved.autoConnect,
  connected: false,
  hardware: false,
  phase: "idle",
  error: "",
  fwd: 0,
  ref: 0,
  swr: 1,
  z: 0,
  phaseDeg: 0,
  dbm: -99,
  alarm: 0,
  callsign: "",
  range: "HIGH",
  meter: "AVG",
  tx: false,
  lastRx: "",
};

let sock: net.Socket | null = null;
let rx = "";
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

function snap(): Lp100aSnap {
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
  rx = "";
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

function writeCmd(ch: string) {
  if (!sock || sock.destroyed) return false;
  try {
    sock.write(ch, "ascii");
    return true;
  } catch {
    return false;
  }
}

function startPoll() {
  stopPoll();
  const tick = () => {
    if (!sock || sock.destroyed) return;
    writeCmd("P");
  };
  tick();
  pollTimer = setInterval(tick, POLL_MS);
  pollTimer.unref?.();
}

function attachSock(s: net.Socket, host: string, port: number) {
  dropSock();
  sock = s;
  rx = "";
  live.port = `${host}:${port}`;
  live.connected = true;
  live.hardware = false;
  live.phase = "ready";
  live.error = "";
  s.setNoDelay(true);
  s.on("data", (buf) => {
    rx += buf.toString("latin1");
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

export function lp100aStatus(): Lp100aSnap {
  return snap();
}

export function lp100aAlarmSwr(idx: number) {
  return ALARM_SWR[idx] ?? 0;
}

export async function lp100aSave(body: Record<string, unknown>): Promise<Lp100aSnap> {
  if (typeof body.autoConnect === "boolean") saved.autoConnect = body.autoConnect;
  persist();
  live.autoConnect = saved.autoConnect;
  return snap();
}

export async function lp100aConnect(): Promise<Lp100aSnap> {
  return enqueue(async () => {
    live.error = "";
    live.phase = "connecting";
    live.autoConnect = saved.autoConnect;
    const ep = await resolveEndpoint();
    if (!ep) {
      live.connected = false;
      live.hardware = false;
      live.phase = "error";
      live.error = "noport";
      return snap();
    }
    live.port = `${ep.host}:${ep.port}`;
    return await new Promise<Lp100aSnap>((resolve) => {
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
          const sim = /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|connect /i.test(error || "");
          live.connected = true;
          live.hardware = false;
          live.phase = "ready";
          live.error = sim ? "sim" : error || "sim";
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

export async function lp100aDisconnect(): Promise<Lp100aSnap> {
  dropSock();
  live.connected = false;
  live.hardware = false;
  live.phase = "idle";
  live.error = "";
  live.fwd = 0;
  live.ref = 0;
  live.swr = 1;
  live.tx = false;
  live.dbm = -99;
  return snap();
}

export async function lp100aCmd(cmd: string): Promise<Lp100aSnap> {
  const c = cmd as Lp100aCmd;
  if (!CMD_BYTE[c]) {
    live.error = "cmd";
    return snap();
  }
  return enqueue(async () => {
    if (!live.connected) live.connected = true;
    if (c === "alarm") live.alarm = live.alarm >= 5 ? 0 : live.alarm + 1;
    if (c === "meter") live.meter = live.meter === "AVG" ? "PEAK" : live.meter === "PEAK" ? "TUNE" : "AVG";
    if (!live.hardware || !sock) return snap();
    writeCmd(CMD_BYTE[c]);
    return snap();
  });
}

export async function lp100aPeek(): Promise<Lp100aSnap> {
  return snap();
}
