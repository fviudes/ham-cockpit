import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSer2net } from "./ser2net-store";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/ldg";
const SYNC_MARK = "AzAz";

export const LDG_MODELS = ["at100pro2", "at600pro2", "at1000pro2"] as const;
export type LdgModel = (typeof LDG_MODELS)[number];
export type LdgCmd = "mem" | "full" | "bypass" | "auto" | "manual" | "ant" | "sync";
export type LdgMatch = "" | "T" | "M" | "F";
export type LdgMode = "AUTO" | "MANUAL" | "BYPASS";
export type LdgPhase = "idle" | "connecting" | "ready" | "tuning" | "error";

export type LdgSnap = {
  ok: boolean;
  model: LdgModel;
  port: string;
  baud: number;
  autoConnect: boolean;
  connected: boolean;
  hardware: boolean;
  serialOk: boolean;
  maxW: number;
  label: string;
  phase: LdgPhase;
  error: string;
  ant: 1 | 2;
  mode: LdgMode;
  match: LdgMatch;
  tuning: boolean;
  fwd: number;
  ref: number;
  swr: number;
  lastRx: string;
  folder: string;
};

type Saved = {
  model: LdgModel;
  port: string;
  autoConnect: boolean;
};

const META: Record<LdgModel, { label: string; maxW: number; serial: boolean }> = {
  at100pro2: { label: "AT-100ProII", maxW: 125, serial: false },
  at600pro2: { label: "AT-600ProII", maxW: 600, serial: true },
  at1000pro2: { label: "AT-1000ProII", maxW: 1000, serial: true },
};

const CMD_BYTE: Record<LdgCmd, string> = {
  mem: "T",
  full: "F",
  bypass: "P",
  auto: "C",
  manual: "M",
  ant: "A",
  sync: "Z",
};

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "ldg");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "ldg.json");
}

function writeAtomic(file: string, body: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, file);
}

function asModel(v: unknown): LdgModel {
  return LDG_MODELS.includes(v as LdgModel) ? (v as LdgModel) : "at1000pro2";
}

function loadSaved(): Saved {
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as Partial<Saved>;
    return {
      model: asModel(raw.model),
      port: String(raw.port || ""),
      autoConnect: raw.autoConnect !== false,
    };
  } catch {
    return { model: "at1000pro2", port: "", autoConnect: true };
  }
}

function persist() {
  writeAtomic(jsonPath(), `${JSON.stringify({ model: saved.model, port: saved.port, autoConnect: saved.autoConnect }, null, 2)}\n`);
}

function swrOf(fwd: number, ref: number) {
  if (fwd <= 0.2) return 1;
  const rho = Math.sqrt(Math.max(0, Math.min(0.98, ref / fwd)));
  return (1 + rho) / (1 - rho);
}

function watts(raw: number, maxW: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= maxW * 1.25) return raw;
  return (raw / 65535) * maxW;
}

async function resolveEndpoint(): Promise<{ host: string; port: number } | null> {
  const cfg = await loadSer2net();
  const svc = cfg.services.find((x) => x.device === "ldg");
  if (!svc) return null;
  return { host: cfg.bind || "127.0.0.1", port: svc.tcpPort };
}

function tcpSession(
  host: string,
  port: number,
  send: Buffer | null,
  timeoutMs: number,
): Promise<{ ok: boolean; buf: Buffer; error?: string }> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve({ ok, buf: Buffer.concat(chunks), error });
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    sock.once("error", (err) => finish(false, err.message));
    sock.on("data", (d) => chunks.push(d));
    sock.connect(port, host, () => {
      if (send?.length) sock.write(send);
    });
  });
}

async function trx(
  cmdByte: string | null,
  timeoutMs: number,
): Promise<{ ok: boolean; rx: string; buf: Buffer; error?: string }> {
  const ep = await resolveEndpoint();
  if (!ep) return { ok: false, rx: "", buf: Buffer.alloc(0), error: "noport" };
  live.port = `${ep.host}:${ep.port}`;
  const send = cmdByte ? Buffer.from(` ${cmdByte}`, "ascii") : null;
  const r = await tcpSession(ep.host, ep.port, send, timeoutMs);
  const sim = !r.ok && /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|connect /i.test(r.error || "");
  return {
    ok: r.ok,
    rx: r.buf.toString("latin1"),
    buf: r.buf,
    error: sim ? "sim" : r.error,
  };
}

let saved = loadSaved();
let live: Omit<LdgSnap, "ok" | "serialOk" | "maxW" | "label" | "folder"> = {
  model: saved.model,
  port: saved.port,
  baud: 38400,
  autoConnect: saved.autoConnect,
  connected: false,
  hardware: false,
  phase: "idle",
  error: "",
  ant: 1,
  mode: "AUTO",
  match: "",
  tuning: false,
  fwd: 0,
  ref: 0,
  swr: 1,
  lastRx: "",
};

let chain = Promise.resolve();
let tuneTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function snap(): LdgSnap {
  const meta = META[live.model];
  return {
    ok: true,
    ...live,
    serialOk: meta.serial,
    maxW: meta.maxW,
    label: meta.label,
    folder: dataDir(),
    baud: 38400,
  };
}

function applyLocal(cmd: LdgCmd) {
  if (cmd === "ant") live.ant = live.ant === 1 ? 2 : 1;
  if (cmd === "bypass") {
    live.mode = "BYPASS";
    live.match = "";
  }
  if (cmd === "auto") {
    live.mode = "AUTO";
  }
  if (cmd === "manual") {
    live.mode = "MANUAL";
  }
  if (cmd === "mem" || cmd === "full") {
    live.tuning = true;
    live.mode = "AUTO";
    live.match = "";
    live.phase = "tuning";
    if (tuneTimer) clearTimeout(tuneTimer);
    tuneTimer = setTimeout(() => {
      live.tuning = false;
      live.match = "T";
      live.phase = live.connected ? "ready" : "idle";
      live.lastRx = "T";
    }, 1200);
  }
}

function parseReply(cmd: LdgCmd, rx: string) {
  const t = rx.replace(/\s+/g, "");
  live.lastRx = t.slice(-24);
  if (cmd === "ant") {
    if (t.includes("2")) live.ant = 2;
    else if (t.includes("1")) live.ant = 1;
  }
  if (cmd === "bypass" && t.includes("P")) live.mode = "BYPASS";
  if (cmd === "auto" && t.includes("A")) live.mode = "AUTO";
  if (cmd === "manual" && /M/.test(t)) live.mode = "MANUAL";
  if (cmd === "mem" || cmd === "full") {
    live.tuning = false;
    live.phase = "ready";
    if (t.includes("F") && !t.endsWith("T")) live.match = t.includes("T") ? "T" : "F";
    const last = t.replace(/[^TMF]/g, "").slice(-1) as LdgMatch;
    if (last === "T" || last === "M" || last === "F") live.match = last;
    if (live.match && live.match !== "F") live.mode = "AUTO";
  }
  if (cmd === "sync" && t.includes(SYNC_MARK)) {
    live.hardware = true;
    live.phase = "ready";
    live.error = "";
  }
}

function parseFramesBuf(buf: Buffer) {
  const maxW = META[live.model].maxW;
  for (let i = 0; i + 8 <= buf.length; i++) {
    if (buf[i + 6] !== 0x3b || buf[i + 7] !== 0x3b) continue;
    const fwd = watts(buf.readUInt16BE(i), maxW);
    const ref = watts(buf.readUInt16BE(i + 2), maxW);
    live.fwd = Math.round(fwd * 10) / 10;
    live.ref = Math.round(ref * 10) / 10;
    live.swr = Math.round(swrOf(live.fwd, live.ref) * 100) / 100;
  }
}

function parseFrames(hexOrAscii: string) {
  const buf = Buffer.from(hexOrAscii, /[^0-9a-fA-F]/.test(hexOrAscii) ? "latin1" : "hex");
  parseFramesBuf(buf);
}

export function ldgStatus(): LdgSnap {
  return snap();
}

export async function ldgSave(body: Record<string, unknown>): Promise<LdgSnap> {
  if (typeof body.model === "string") saved.model = asModel(body.model);
  if (typeof body.autoConnect === "boolean") saved.autoConnect = body.autoConnect;
  persist();
  live.model = saved.model;
  live.autoConnect = saved.autoConnect;
  return snap();
}

export async function ldgConnect(body: Record<string, unknown> = {}): Promise<LdgSnap> {
  return enqueue(async () => {
    if (typeof body.model === "string") saved.model = asModel(body.model);
    persist();
    live.model = saved.model;
    live.autoConnect = saved.autoConnect;
    live.error = "";
    live.phase = "connecting";
    const meta = META[live.model];
    if (!meta.serial) {
      live.connected = true;
      live.hardware = false;
      live.phase = "ready";
      live.error = "noserial";
      return snap();
    }
    const r = await trx("Z", 2000);
    if (live.port) {
      saved.port = live.port;
      persist();
    }
    if (r.error === "noport") {
      live.connected = false;
      live.hardware = false;
      live.phase = "error";
      live.error = "noport";
      return snap();
    }
    if (r.ok && r.rx.includes(SYNC_MARK)) {
      live.connected = true;
      live.hardware = true;
      live.phase = "ready";
      live.lastRx = r.rx;
      return snap();
    }
    live.connected = true;
    live.hardware = false;
    live.phase = "ready";
    live.error = r.error === "sim" || !r.ok ? r.error || "sim" : "sync";
    live.lastRx = r.rx;
    return snap();
  });
}

export async function ldgDisconnect(): Promise<LdgSnap> {
  live.connected = false;
  live.hardware = false;
  live.tuning = false;
  live.phase = "idle";
  live.error = "";
  live.fwd = 0;
  live.ref = 0;
  live.swr = 1;
  return snap();
}

export async function ldgCmd(cmd: string): Promise<LdgSnap> {
  const c = cmd as LdgCmd;
  if (!CMD_BYTE[c]) {
    live.error = "cmd";
    return snap();
  }
  return enqueue(async () => {
    applyLocal(c);
    if (!live.connected) live.connected = true;
    if (!live.hardware || !META[live.model].serial) return snap();
    const timeout = c === "mem" || c === "full" ? 16000 : 2500;
    if (c === "mem" || c === "full") {
      live.tuning = true;
      live.phase = "tuning";
    }
    const r = await trx(CMD_BYTE[c], timeout);
    if (r.ok && r.rx) parseReply(c, r.rx);
    else if (!r.ok && r.error && r.error !== "sim" && r.error !== "noport") live.error = r.error;
    if (r.buf.length) parseFramesBuf(r.buf);
    return snap();
  });
}

export async function ldgPeek(): Promise<LdgSnap> {
  if (!live.connected || !live.hardware) return snap();
  const r = await trx(null, 400);
  if (r.ok && r.buf.length) parseFramesBuf(r.buf);
  else if (r.ok && r.rx) parseFrames(r.rx);
  return snap();
}
