import { execFile, spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  close,
  constants as fsConstants,
  createReadStream,
  existsSync,
  mkdirSync,
  open as openFd,
  read,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type ReadStream,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inspectCapture, LextelDecoder, type LextelInspect, type LextelLayout, type LextelReading } from "./lextel-parse";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/lextel";
const HELPER = "/opt/ham-cockpit/bin/lextel-bt";
const RFCOMM = "/dev/rfcomm0";
const SPP_UUID = "00001101-0000-1000-8000-00805f9b34fb";
const NAME_RE = /lextel|ms-?2000|ms-?800|ms-?600|ms-?1000|ms-?1200|ms-?1800|hc-?0[56]|linvor|monitor.?station/i;
const SKIP_SPP_MAC = new Set(["000000000000", "30317DBAC263"]);

export type LextelDevice = {
  addr: string;
  name: string;
  paired: boolean;
  kind: "bt" | "serial";
  likely: boolean;
};

export type LextelPhase = "idle" | "scanning" | "pairing" | "connecting" | "streaming" | "error";

export type LextelSnapshot = {
  ok: boolean;
  folder: string;
  sppUuid: string;
  phase: LextelPhase;
  connected: boolean;
  decoded: boolean;
  addr: string;
  name: string;
  pin: string;
  channel: number;
  autoConnect: boolean;
  path: string;
  error: string;
  hex: string;
  layout: string;
  bytes: number;
  updatedAt: number;
  pep: number;
  avg: number;
  ref: number;
  swr: number;
  vdc: number;
  z: number;
  mod: number;
  alarms: string[];
  devices: LextelDevice[];
  ascii: string;
  note: string;
  captureBytes: number;
  period: number | null;
};

type Saved = {
  addr: string;
  name: string;
  pin: string;
  channel: number;
  autoConnect: boolean;
  layout: LextelLayout | null;
};

let stream: ReadStream | null = null;
let sppChild: ChildProcess | null = null;
let decoder = new LextelDecoder();
let phase: LextelPhase = "idle";
let error = "";
let pathOpen = "";
let reading: LextelReading | null = null;
let devices: LextelDevice[] = [];
let bytes = 0;
let updatedAt = 0;
let inspect: LextelInspect = inspectCapture(Buffer.alloc(0));
let captureWatch: ReturnType<typeof setInterval> | null = null;
let captureOff = 0;
let wantOpen = false;
let autoRunning = false;
let recoverBusy = false;
/** pair/bind (ou o connect inteiro) já está no helper. O clique seguinte fica na fila. */
let connectBusy = false;
let pendingConnect: { addr?: string; pin?: string; name?: string; channel?: number } | null = null;
/** O bind atual não corresponde a um open que tenha funcionado. */
let rfcommStale = true;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 600;
let sppPortsAt = 0;
let sppPortsCache: { com: string; incoming: boolean; mac: string }[] = [];
let sppLockCom = "";
let attachedAt = 0;
let lastRemapAt = 0;
const CAPTURE_MAX = 256 * 1024;

function dataDir(): string {
  if (existsSync(OPT_DIR)) return OPT_DIR;
  const local = join(ROOT, "data", "lextel");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "config.json");
}

function capturePath() {
  return join(dataDir(), "capture.bin");
}

function winSppScript() {
  return join(ROOT, "deploy", "lextel", "win-spp.ps1");
}

function isRfcommPath(addr: string) {
  return /(?:^|\/)dev\/rfcomm\d+$/i.test(addr.trim().replace(/\\/g, "/"));
}

function normalizeSerialPath(addr: string) {
  const t = addr.trim().replace(/\\/g, "/");
  if (!t) return t;
  // Corrige configs antigas gravadas com /DEV/RFCOMM0
  if (isRfcommPath(t) || /^\/DEV\//i.test(t)) {
    return t.replace(/^\/DEV\//i, "/dev/").replace(/RFCOMM(\d*)/gi, (_m, n: string) => `rfcomm${n}`);
  }
  if (/^\/dev\//i.test(t)) return `/dev/${t.slice(5)}`;
  return addr.trim();
}

function ensureCaptureReady() {
  mkdirSync(dataDir(), { recursive: true });
  const cap = capturePath();
  if (!existsSync(cap)) writeFileSync(cap, Buffer.alloc(0));
  return cap;
}

function loadSaved(): Saved {
  const fallback: Saved = { addr: "", name: "", pin: "1234", channel: 1, autoConnect: true, layout: null };
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as Partial<Saved>;
    const addrRaw = typeof raw.addr === "string" ? raw.addr : "";
    // Config antiga podia gravar /DEV/RFCOMM0 (toUpperCase indevido) — inutiliza o open() no Linux
    const addr = normalizeSerialPath(addrRaw);
    return {
      addr: isRfcommPath(addr) ? "" : addr,
      name: typeof raw.name === "string" ? raw.name : "",
      pin: typeof raw.pin === "string" && raw.pin ? raw.pin : "1234",
      channel: Number(raw.channel) > 0 ? Number(raw.channel) : 1,
      autoConnect: raw.autoConnect !== false,
      layout: raw.layout && typeof raw.layout === "object" ? raw.layout : null,
    };
  } catch {
    return fallback;
  }
}

let saved = loadSaved();
decoder = new LextelDecoder(saved.layout);

function diskAddr(): string {
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as { addr?: unknown };
    return typeof raw.addr === "string" ? raw.addr.trim() : "";
  } catch {
    return "";
  }
}

function persist(opts?: { allowEmpty?: boolean }) {
  // Uma falha de bind/scan não pode apagar o MAC que já está no disco.
  if (!opts?.allowEmpty && !saved.addr.trim()) {
    const disk = diskAddr().toUpperCase();
    if (/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(disk)) saved.addr = disk;
  }
  const tmp = `${jsonPath()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(saved, null, 2), "utf8");
  renameSync(tmp, jsonPath());
}

function parsePairedMac(text: string, nameHint: string): string {
  const hint = nameHint.trim().toLowerCase();
  const rows: { mac: string; paired: boolean; name: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^DEV\s+([0-9A-Fa-f:]{17})\s+([01])\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const mac = m[1]!.toUpperCase();
    if (SKIP_SPP_MAC.has(mac.replace(/:/g, ""))) continue;
    rows.push({ mac, paired: m[2] === "1", name: (m[3] || "").trim() });
  }
  const paired = rows.filter((r) => r.paired);
  const pool = paired.length ? paired : rows;
  const byHint = hint
    ? pool.find((r) => {
        const n = r.name.toLowerCase();
        return Boolean(n) && (n === hint || n.includes(hint) || hint.includes(n));
      })
    : undefined;
  if (byHint) return byHint.mac;
  const byName = pool.find((r) => NAME_RE.test(r.name));
  if (byName) return byName.mac;
  if (pool.length === 1) return pool[0]!.mac;
  return "";
}

/** MAC já gravado, ou o aparelho pareado quando a config antiga só tinha /dev/rfcomm. */
async function ensureSavedMac(): Promise<boolean> {
  if (/^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/.test(saved.addr)) {
    saved.addr = saved.addr.toUpperCase();
    return true;
  }
  if (process.platform !== "linux" || !helperExists()) return false;
  for (let i = 0; i < 6; i++) {
    try {
      const out = await runHelper(["devices"], 8_000);
      const mac = parsePairedMac(out, saved.name);
      if (mac) {
        saved.addr = mac;
        if (!saved.name) saved.name = "Monitor Station";
        persist();
        return true;
      }
    } catch (err) {
      if (noController(helperText(err))) return false;
      /* bluetoothd ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function helperText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function noController(msg: string): boolean {
  return /sem controlador|no default controller|no controller available/i.test(msg);
}

function helperBusy(msg: string): boolean {
  return /lextel-bt ocupado/i.test(msg);
}

const NO_CONTROLLER_MSG =
  "Sem controlador Bluetooth. O Dual Hat segue em ttyAMA0. O MAC salvo continua; a conexão tenta de novo quando aparecer um adaptador.";

function helperExists() {
  return existsSync(HELPER);
}

function openNoctty(
  path: string,
  _flags: string | number,
  mode: number,
  cb: (err: NodeJS.ErrnoException | null, fd: number) => void,
) {
  // O_NOCTTY: abrir /dev/rfcomm0 não pode instalar o tty como terminal de controle
  // do Node (session leader do systemd). Sem isso o hangup manda SIGHUP e mata o console.
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOCTTY || 0);
  openFd(path, flags, mode, cb);
}

function killHelper(child: ChildProcess) {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (process.platform !== "win32") {
      process.kill(-pid, "SIGTERM");
      return;
    }
  } catch {
    /* grupo já saiu */
  }
  try {
    child.kill("SIGTERM");
  } catch {
    /* */
  }
}

function runHelper(args: string[], timeout = 30_000): Promise<string> {
  if (!helperExists()) {
    const err = new Error("BlueZ helper ausente — o SPP Classic roda no Raspberry Pi");
    (err as Error & { code?: string }).code = "NO_BLUEZ";
    return Promise.reject(err);
  }
  // detached = setsid: o sudo/lextel-bt não fica no mesmo session do console.
  // O helper ainda reexecuta em systemd-run/setsid. O await é só o child_process;
  // o event loop segue atendendo serviços e o resto da API.
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-n", HELPER, ...args], {
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (err: Error | null, out?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve(out ?? "");
    };
    timer = setTimeout(() => {
      finish(new Error(`lextel-bt ${args[0] || "?"} excedeu ${timeout} ms`));
      killHelper(child);
    }, timeout);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-1024 * 1024);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-256 * 1024);
    });
    child.on("error", (err) => finish(err));
    child.on("close", (code, signal) => {
      const text = `${stdout}\n${stderr}`.trim();
      if (signal) {
        finish(new Error(text || `lextel-bt encerrou (${signal})`));
        return;
      }
      if (code === 0) finish(null, stdout.trim());
      else finish(new Error(text || `lextel-bt saiu com código ${code}`));
    });
  });
}

const BT_MAC = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/** Endereço de inquiry/pareamento Classic. COM, /dev/tty e rfcomm aberto não entram. */
function bluetoothMac(addr: string): string {
  const t = addr.trim();
  if (!t || /COM\d+/i.test(t) || /[\\/]/.test(t) || /rfcomm|tty/i.test(t)) return "";
  const mac = t.toUpperCase();
  return BT_MAC.test(mac) ? mac : "";
}

function onlyBluetooth(list: LextelDevice[]): LextelDevice[] {
  const seen = new Set<string>();
  const out: LextelDevice[] = [];
  for (const d of list) {
    if (d.kind === "serial") continue;
    const addr = bluetoothMac(d.addr);
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    out.push({ ...d, addr, kind: "bt" });
  }
  return out;
}

function parseDevLines(text: string): LextelDevice[] {
  const out: LextelDevice[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^DEV\s+([0-9A-Fa-f:]{17})\s+([01])\s+(.*)$/);
    if (!m) continue;
    const addr = bluetoothMac(m[1]);
    if (!addr) continue;
    const name = m[3].trim() || "unknown";
    out.push({ addr, name, paired: m[2] === "1", kind: "bt", likely: NAME_RE.test(name) });
  }
  return out;
}

function winComPath(p: string) {
  const m = p.match(/COM\d+/i);
  if (!m) return p;
  const n = Number(m[0].slice(3));
  return n >= 10 ? `\\\\.\\${m[0].toUpperCase()}` : m[0].toUpperCase();
}

function pidRunning(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sppLockPath(com: string) {
  return join(dataDir(), `spp-${comKey(com) || "port"}.lock`);
}

function acquireSppLock(com: string): boolean {
  const p = sppLockPath(com);
  try {
    if (existsSync(p)) {
      const old = Number(readFileSync(p, "utf8").trim());
      if (old && old !== process.pid && pidRunning(old)) return false;
    }
  } catch {
    /* */
  }
  try {
    writeFileSync(p, String(process.pid), "utf8");
    sppLockCom = comKey(com);
    return true;
  } catch {
    return true;
  }
}

function releaseSppLock() {
  if (!sppLockCom) return;
  const p = sppLockPath(sppLockCom);
  sppLockCom = "";
  try {
    if (!existsSync(p)) return;
    const old = Number(readFileSync(p, "utf8").trim());
    if (!old || old === process.pid) unlinkSync(p);
  } catch {
    /* */
  }
}

function startCaptureWatch() {
  if (captureWatch) clearInterval(captureWatch);
  try {
    if (existsSync(capturePath())) {
      const all = readFileSync(capturePath());
      if (!reading && all.length) ingest(all.subarray(Math.max(0, all.length - 2048)), true);
      captureOff = all.length;
    }
  } catch {
    /* */
  }
  captureWatch = setInterval(() => {
    try {
      if (!existsSync(capturePath())) return;
      const all = readFileSync(capturePath());
      if (all.length < captureOff) captureOff = 0;
      if (all.length > captureOff) {
        ingest(all.subarray(captureOff), true);
        captureOff = all.length;
      }
    } catch {
      /* */
    }
  }, 200);
}

async function winSppPorts(): Promise<{ com: string; incoming: boolean; mac: string }[]> {
  const script = [
    "Get-PnpDevice -Class Ports -Status OK -ErrorAction SilentlyContinue | ForEach-Object {",
    "  $com = [regex]::Match($_.FriendlyName,'COM\\d+').Value",
    "  if (-not $com -or $_.InstanceId -notmatch 'BTHENUM') { return }",
    "  $m = [regex]::Match($_.InstanceId, '([0-9A-Fa-f]{12})_')",
    "  $hex = if ($m.Success) { $m.Groups[1].Value.ToUpper() } else { '' }",
    "  $inc = if ($hex -eq '000000000000' -or $hex -eq '') { '1' } else { '0' }",
    "  \"$com`t$inc`t$hex\"",
    "}",
  ].join(" ");
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      timeout: 8000,
    });
    const ports = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [com, inc, mac] = l.split("\t");
        return { com: (com || "").toUpperCase(), incoming: inc === "1", mac: (mac || "").toUpperCase() };
      })
      .filter((p) => /^COM\d+$/.test(p.com));
    sppPortsCache = ports;
    sppPortsAt = Date.now();
    return ports;
  } catch {
    return sppPortsCache;
  }
}

async function winSppPortsCached(): Promise<{ com: string; incoming: boolean; mac: string }[]> {
  if (sppPortsCache.length && Date.now() - sppPortsAt < 4000) return sppPortsCache;
  return winSppPorts();
}

async function winComForMac(mac: string): Promise<string | null> {
  const hex = mac.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  const ports = await winSppPorts();
  const hit = ports.find((p) => !p.incoming && p.mac === hex) || ports.find((p) => p.mac === hex && !p.incoming);
  return hit?.com ?? null;
}

let resolvedOutgoing = "";

function isIncomingPort(ports: { com: string; incoming: boolean; mac: string }[], com: string) {
  const hit = ports.find((p) => p.com === com);
  if (!hit) return false;
  return hit.incoming || SKIP_SPP_MAC.has(hit.mac);
}

function pickOutgoing(ports: { com: string; incoming: boolean; mac: string }[], prefer = "") {
  const outgoing = ports.filter((p) => !p.incoming && p.mac && !SKIP_SPP_MAC.has(p.mac));
  if (prefer && outgoing.some((p) => p.com === prefer)) return prefer;
  if (resolvedOutgoing && outgoing.some((p) => p.com === resolvedOutgoing)) return resolvedOutgoing;
  return outgoing[0]?.com || "";
}

async function winPreferOutgoingCom(addr: string): Promise<string> {
  const want = (addr.match(/COM\d+/i) || [])[0]?.toUpperCase() || "";
  const ports = await winSppPortsCached();
  if (!ports.length) return resolvedOutgoing || want || addr;
  if (want && !isIncomingPort(ports, want) && ports.some((p) => p.com === want && !p.incoming)) {
    resolvedOutgoing = want;
    return want;
  }
  const picked = pickOutgoing(ports, want) || (!want || isIncomingPort(ports, want) ? "" : want);
  if (/^COM\d+$/i.test(picked)) resolvedOutgoing = picked.toUpperCase();
  return picked || want || addr;
}

function colonMac(hex: string) {
  const h = hex.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (h.length !== 12) return hex.toUpperCase();
  return h.match(/.{2}/g)?.join(":") ?? h;
}

async function winClassicDevices(): Promise<LextelDevice[]> {
  const out: LextelDevice[] = [];
  try {
    const { stdout } = await execFileAsync(
      "reg",
      ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\BTHPORT\\Parameters\\Devices"],
      { windowsHide: true, timeout: 8000 },
    );
    const keys = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\\Devices\\[0-9a-fA-F]{12}$/.test(l));
    for (const key of keys) {
      const hex = key.split("\\").pop() || "";
      const addr = colonMac(hex);
      let name = "Bluetooth";
      try {
        const { stdout: det } = await execFileAsync("reg", ["query", key, "/v", "Name"], { windowsHide: true, timeout: 4000 });
        const m = det.match(/Name\s+REG_BINARY\s+([0-9A-Fa-f ]+)/i);
        if (m) {
          const hex = m[1].replace(/\s+/g, "");
          const raw = Buffer.from(hex, "hex");
          name = raw.toString("ascii").replace(/\0/g, "").trim() || raw.toString("utf16le").replace(/\0/g, "").trim() || name;
        }
      } catch {
        /* */
      }
      const mac = bluetoothMac(addr);
      if (!mac) continue;
      out.push({ addr: mac, name, paired: true, kind: "bt", likely: NAME_RE.test(name) });
    }
  } catch {
    /* */
  }
  return out;
}

export async function lextelLearn(): Promise<LextelSnapshot> {
  try {
    const cap = ensureCaptureReady();
    const buf = readFileSync(cap);
    bytes = Math.max(bytes, buf.length);
    inspect = inspectCapture(buf);
    if (inspect.reading) reading = inspect.reading;
    if (inspect.layout) {
      decoder.layout = inspect.layout;
      saved.layout = inspect.layout;
      persist();
    }
    if (!buf.length) {
      error =
        "Sem captura — conecte o SPP do MS-2000, deixe transmitir alguns segundos (PTT ajuda) e tente de novo. Arquivo: " +
        cap;
      inspect = { ...inspect, note: error };
    } else if (!inspect.reading) {
      error =
        inspect.note ||
        `Dump com ${buf.length} B, mas ainda sem mapa PEP/ROE/V — transmita mais ou confira o quadro`;
      inspect = { ...inspect, note: error };
    } else {
      error = "";
      inspect = { ...inspect, note: `decoder ${inspect.layout?.kind || "ok"} · ${buf.length} B` };
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return lextelStatus();
}

export async function lextelOpenBluetooth(): Promise<LextelSnapshot> {
  if (process.platform === "win32") {
    try {
      await execFileAsync("cmd.exe", ["/c", "start", "ms-settings:bluetooth"], { windowsHide: true, timeout: 5000 });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  return lextelScan(8);
}

function ingest(buf: Buffer, alreadyOnDisk = false) {
  if (!buf.length) return;
  bytes += buf.length;
  updatedAt = Date.now();
  // Só remapeia COM no Windows — nunca sobrescrever MAC Classic com /dev/rfcomm0 (nem uppercased)
  if (process.platform === "win32" && /COM\d+/i.test(pathOpen)) {
    const live = comKey(pathOpen);
    if (live && saved.addr !== live) {
      saved.addr = live;
      saved.name = saved.name.replace(/COM\d+/gi, live).replace(/\s*\(entrada\)/i, "").trim() || live;
      persist();
    }
  }
  if (!alreadyOnDisk) {
    try {
      const cap = ensureCaptureReady();
      if (existsSync(cap) && readFileSync(cap).length > CAPTURE_MAX) writeFileSync(cap, Buffer.alloc(0));
      appendFileSync(cap, buf);
    } catch {
      /* disk */
    }
  }
  const got = decoder.push(buf);
  if (got) {
    reading = got;
    if (error && /UnauthorizedAccess|win-spp/i.test(error)) error = "";
    if (decoder.layout && JSON.stringify(decoder.layout) !== JSON.stringify(saved.layout)) {
      saved.layout = decoder.layout;
      persist();
    }
  }
  inspect = {
    ascii: buf
      .toString("latin1")
      .replace(/[^\t\r\n\x20-\x7e]/g, ".")
      .slice(-480),
    printable: 1,
    period: inspect.period,
    hexHead: decoder.lastHex,
    note:
      decoder.layout?.kind === "ascii"
        ? "ASCII A-F (PEP/AVG/REF mW → W, ROE, V; F = MHz)"
        : decoder.layout
          ? `quadro ${decoder.layout.kind}`
          : inspect.note || "aguardando bytes",
    layout: decoder.layout,
    reading,
  };
}

function killPidTree(pid: number | undefined) {
  if (process.platform !== "win32" || !pid) return;
  try {
    const child = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
      windowsHide: true,
      stdio: "ignore",
      detached: true,
    });
    child.unref();
  } catch {
    /* */
  }
}

function linkAlive() {
  return Boolean(stream || sppChild);
}

/** Normaliza só COM Windows; paths Unix (/dev/rfcomm0) nunca levam toUpperCase. */
function comKey(s: string) {
  const t = s.trim();
  if (!t) return "";
  const m = t.match(/COM\d+/i);
  if (m) return m[0].toUpperCase();
  if (/^\/dev\//i.test(t) || t.startsWith("/")) {
    // Linux é case-sensitive: /DEV/RFCOMM0 ≠ /dev/rfcomm0
    return normalizeSerialPath(t);
  }
  if (/^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/.test(t)) return t.toUpperCase();
  return t.replace(/\\/g, "");
}

function samePort(a: string, b: string) {
  if (!a || !b) return false;
  const ca = comKey(a);
  const cb = comKey(b);
  if (ca && cb && ca === cb) return true;
  // COM: comparação case-insensitive; /dev: case-sensitive
  if (/COM\d+/i.test(a) && /COM\d+/i.test(b)) return a.toUpperCase() === b.toUpperCase();
  return a === b;
}

function preferBtMac(hint = ""): string {
  const want = hint.trim().toUpperCase();
  if (/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(want)) return want;
  const hit =
    devices.find((d) => d.kind === "bt" && d.likely) ||
    devices.find((d) => d.kind === "bt" && NAME_RE.test(d.name));
  return hit?.addr || "";
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!wantOpen || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void recoverLink();
  }, reconnectDelay);
  reconnectDelay = Math.min(10_000, Math.round(reconnectDelay * 1.5));
}

async function remapIfWrongCom() {
  if (process.platform !== "win32" || !wantOpen || recoverBusy || connectBusy) return;
  const now = Date.now();
  if (now - lastRemapAt < 8000) return;
  lastRemapAt = now;
  const next = await winPreferOutgoingCom(saved.addr || pathOpen);
  if (!next || samePort(pathOpen, next)) return;
  recoverBusy = true;
  try {
    closeStream();
    saved.addr = comKey(next) || next;
    saved.name = saved.name.replace(/COM\d+/gi, saved.addr).replace(/\s*\(entrada\)/i, "").trim() || saved.addr;
    persist();
    attach(winComPath(next));
  } finally {
    recoverBusy = false;
  }
}

async function recoverLink() {
  if (!wantOpen) return;
  if (recoverBusy || connectBusy) {
    scheduleReconnect();
    return;
  }
  if (linkAlive()) {
    if (process.platform === "win32" && bytes === 0 && attachedAt && Date.now() - attachedAt > 5000) {
      await remapIfWrongCom();
    }
    reconnectDelay = 600;
    return;
  }
  recoverBusy = true;
  if (phase !== "scanning" && phase !== "pairing") phase = "connecting";
  try {
    if (!bluetoothMac(saved.addr)) {
      const ready = await ensureSavedMac();
      if (!wantOpen) return;
      if (!ready || !bluetoothMac(saved.addr)) {
        if (!error) error = "Aguardando o MAC do MS-2000. O endereço salvo não foi apagado.";
        reconnectDelay = 10_000;
        return;
      }
    }
    await lextelConnectBody({ addr: saved.addr, pin: saved.pin, name: saved.name, channel: saved.channel });
  } catch {
    /* o corpo já agenda a próxima tentativa */
  } finally {
    recoverBusy = false;
    if (pendingConnect && wantOpen) {
      const next = pendingConnect;
      pendingConnect = null;
      clearReconnect();
      void lextelConnect(next);
      return;
    }
    if (wantOpen && !linkAlive()) scheduleReconnect();
    else if (linkAlive()) reconnectDelay = 600;
  }
}

function killLeftoverWinSpp(_com?: string) {
  if (process.platform !== "win32") return;
  const pid = sppChild?.pid;
  if (pid) killPidTree(pid);
}

function closeStream() {
  if (stream) {
    stream.removeAllListeners();
    stream.destroy();
    stream = null;
  }
  if (captureWatch) {
    clearInterval(captureWatch);
    captureWatch = null;
  }
  captureOff = 0;
  if (sppChild) {
    const pid = sppChild.pid;
    try {
      sppChild.kill();
    } catch {
      /* */
    }
    sppChild = null;
    killPidTree(pid);
  }
  pathOpen = "";
  releaseSppLock();
  if (!wantOpen && (phase === "streaming" || phase === "connecting")) phase = "idle";
}

function attachFd(path: string) {
  const rs = createReadStream(path, {
    flags: "r",
    highWaterMark: 256,
    ...(process.platform === "linux" ? { fs: { open: openNoctty, read, close } } : {}),
  });
  stream = rs;
  rs.on("open", () => {
    phase = "streaming";
    reconnectDelay = 600;
    rfcommStale = false;
    error = "";
  });
  rs.on("data", (chunk: string | Buffer) => {
    ingest(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  rs.on("error", (err) => {
    error = err.message;
    rfcommStale = true;
    if (wantOpen) {
      phase = "connecting";
      closeStream();
      scheduleReconnect();
      return;
    }
    phase = "error";
    closeStream();
  });
  rs.on("close", () => {
    if (pathOpen === path) {
      stream = null;
      pathOpen = "";
      if (wantOpen) {
        rfcommStale = true;
        scheduleReconnect();
        return;
      }
      if (phase !== "error" && !sppChild) phase = "idle";
    }
  });
}

function attachWinSpp(com: string) {
  const script = winSppScript();
  if (!existsSync(script)) {
    attachFd(winComPath(com));
    return;
  }
  if (!acquireSppLock(com)) {
    startCaptureWatch();
    phase = "connecting";
    error = `${com} em uso`;
    scheduleReconnect();
    return;
  }
  killLeftoverWinSpp(com);
  const bauds = [9600];
  const run = (baud: number) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-Port",
        com,
        "-Baud",
        String(baud),
        "-OutFile",
        capturePath(),
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    sppChild = child;
    startCaptureWatch();
    child.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString("utf8").trim();
      if (msg) error = msg.split(/\r?\n/).pop() || msg;
    });
    child.on("error", (err) => {
      error = err.message;
      if (wantOpen) {
        phase = "connecting";
        scheduleReconnect();
        return;
      }
      phase = "error";
    });
    child.on("exit", () => {
      if (sppChild !== child) return;
      sppChild = null;
      const idx = bauds.indexOf(baud);
      const busy = /UnauthorizedAccess|porta em uso|em uso/i.test(error);
      if (!busy && bytes === 0 && idx >= 0 && idx < bauds.length - 1 && wantOpen && phase !== "idle") {
        run(bauds[idx + 1]!);
        return;
      }
      if (wantOpen) {
        phase = "connecting";
        scheduleReconnect();
        return;
      }
      if (bytes > 0) {
        phase = "streaming";
        return;
      }
      if (phase === "streaming" || phase === "connecting") {
        phase = "error";
        if (!error) error = `Não abriu ${com} (baud ${baud})`;
      }
    });
    phase = "streaming";
  };
  run(bauds[0]!);
}

function attach(path: string) {
  const openPath = normalizeSerialPath(path) || path;
  if (samePort(pathOpen, openPath) && linkAlive()) {
    phase = "streaming";
    return;
  }
  closeStream();
  if (!decoder.layout && saved.layout) decoder.reset(saved.layout);
  try {
    writeFileSync(ensureCaptureReady(), Buffer.alloc(0));
  } catch {
    /* */
  }
  phase = "connecting";
  error = "";
  pathOpen = openPath;
  attachedAt = Date.now();
  bytes = 0;
  if (process.platform === "win32" && /COM\d+/i.test(openPath)) {
    const m = openPath.match(/COM\d+/i);
    attachWinSpp(m ? m[0].toUpperCase() : openPath);
    return;
  }
  attachFd(openPath);
}

export function lextelStatus(): LextelSnapshot {
  const r = reading;
  return {
    ok: phase !== "error",
    folder: dataDir(),
    sppUuid: SPP_UUID,
    phase,
    connected: phase === "streaming" && linkAlive(),
    decoded: Boolean(r) || Boolean(decoder.layout && bytes > 0),
    addr: saved.addr,
    name: saved.name,
    pin: saved.pin,
    channel: saved.channel,
    autoConnect: saved.autoConnect,
    path: pathOpen,
    error,
    hex: decoder.lastHex,
    layout: decoder.layout?.kind ?? "",
    bytes,
    updatedAt,
    pep: r?.pep ?? 0,
    avg: r?.avg ?? 0,
    ref: r?.ref ?? 0,
    swr: r?.swr ?? 1,
    vdc: r?.vdc ?? 0,
    z: r?.z ?? 0,
    mod: r?.mod ?? 0,
    alarms: r?.labels ?? [],
    devices,
    ascii: inspect.ascii,
    note: inspect.note || error,
    captureBytes: bytes,
    period: inspect.period,
  };
}

export async function lextelScan(seconds = 12): Promise<LextelSnapshot> {
  phase = "scanning";
  error = "";
  let classic: LextelDevice[] = [];
  if (process.platform === "win32") {
    classic = await winClassicDevices();
  }
  if (process.platform === "linux") {
    try {
      const out = await runHelper(["scan", String(Math.min(20, Math.max(5, seconds)))], 25_000);
      classic = parseDevLines(out);
    } catch (err) {
      const msg = helperText(err);
      error = noController(msg) ? NO_CONTROLLER_MSG : msg;
      if (!noController(msg)) {
        try {
          const out = await runHelper(["devices"], 8_000);
          classic = parseDevLines(out);
        } catch {
          /* helper missing */
        }
      }
    }
  }
  // Procurar MS-2000 é só inquiry Bluetooth (MAC). Sem fallback de COM / tty / rfcomm.
  devices = onlyBluetooth(classic);
  devices.sort((a, b) => Number(b.likely) - Number(a.likely) || a.name.localeCompare(b.name));
  if (phase === "scanning") {
    if (linkAlive()) phase = "streaming";
    else if (wantOpen) {
      phase = "connecting";
      scheduleReconnect();
    } else phase = "idle";
  }
  return lextelStatus();
}

export async function lextelSave(body: Partial<Saved>): Promise<LextelSnapshot> {
  if (typeof body.addr === "string") {
    const next = body.addr.trim();
    // /dev/rfcommN é o tty do bind, não o endereço do aparelho.
    if (!isRfcommPath(next)) saved.addr = normalizeSerialPath(next) || next;
  }
  if (typeof body.name === "string") saved.name = body.name.trim();
  if (typeof body.pin === "string" && /^\d{4,6}$/.test(body.pin.trim())) saved.pin = body.pin.trim();
  if (typeof body.channel === "number" && body.channel >= 1 && body.channel <= 30) saved.channel = Math.round(body.channel);
  if (typeof body.autoConnect === "boolean") saved.autoConnect = body.autoConnect;
  persist({ allowEmpty: typeof body.addr === "string" });
  return lextelStatus();
}

function isSerialPath(addr: string) {
  return /^(COM\d+|\\\\\.\\COM\d+|\/dev\/)/i.test(addr);
}

export async function lextelConnect(
  body: { addr?: string; pin?: string; name?: string; channel?: number } = {},
): Promise<LextelSnapshot & { skipped?: boolean; queued?: boolean }> {
  if (connectBusy || recoverBusy) {
    pendingConnect = { ...body };
    wantOpen = true;
    return { ...lextelStatus(), queued: true };
  }
  connectBusy = true;
  try {
    return await lextelConnectBody(body);
  } finally {
    connectBusy = false;
    const next = pendingConnect;
    pendingConnect = null;
    if (next && wantOpen) {
      clearReconnect();
      void lextelConnect(next);
    }
  }
}

async function lextelConnectBody(body: { addr?: string; pin?: string; name?: string; channel?: number }): Promise<LextelSnapshot> {
  let addr = String(body.addr || saved.addr).trim();
  // Config/UI com /DEV/RFCOMM0: no Linux o SPP Classic exige MAC + bind, não open() no path uppercased
  if (process.platform === "linux" && isRfcommPath(addr)) {
    const kept = bluetoothMac(saved.addr) || preferBtMac();
    if (kept) addr = kept;
  } else if (isSerialPath(addr)) {
    addr = normalizeSerialPath(addr);
  }
  if (!addr) {
    phase = "error";
    error = "Selecione o MS-2000 no scan";
    return lextelStatus();
  }
  wantOpen = true;
  if (typeof body.pin === "string" && body.pin) saved.pin = body.pin.trim();
  if (typeof body.name === "string" && body.name) saved.name = body.name.trim();
  if (typeof body.channel === "number" && body.channel >= 1) saved.channel = Math.round(body.channel);
  error = "";

  if (isSerialPath(addr) && !(process.platform === "linux" && isRfcommPath(addr))) {
    const serial =
      process.platform === "win32" ? await winPreferOutgoingCom(addr) : normalizeSerialPath(addr);
    if (linkAlive() && samePort(pathOpen, serial) && (bytes > 0 || Date.now() - attachedAt < 8000)) {
      if (phase !== "error") phase = "streaming";
      // Windows: grava COM; Linux serial real: path com case preservado — nunca comKey uppercased em /dev
      saved.addr = process.platform === "win32" ? comKey(serial) || serial : serial;
      persist();
      return lextelStatus();
    }
    if (serial !== saved.addr) {
      saved.name = saved.name.replace(/COM\d+/gi, serial).replace(/\s*\(entrada\)/i, "").trim() || serial;
    }
    saved.addr = process.platform === "win32" ? comKey(serial) || serial : serial;
    persist();
    attach(process.platform === "win32" ? winComPath(serial) : serial);
    return lextelStatus();
  }

  if (process.platform === "win32") {
    const serial = (await winComForMac(addr)) || (await winPreferOutgoingCom(addr));
    if (serial && isSerialPath(serial)) {
      saved.name = saved.name || "Monitor Station";
      saved.addr = serial;
      persist();
      attach(winComPath(serial));
      return lextelStatus();
    }
    phase = "error";
    error =
      "No Windows o MS-2000 precisa estar pareado (PIN 1234 ou 0000). Abra Configurações → Bluetooth, pareie, e o SPP vira um COM. Depois toque em Procurar e Conectar.";
    try {
      await execFileAsync("cmd.exe", ["/c", "start", "ms-settings:bluetooth"], { windowsHide: true, timeout: 5000 });
    } catch {
      /* */
    }
    return lextelStatus();
  }

  if (process.platform !== "linux") {
    phase = "error";
    error = "Bluetooth Classic SPP precisa do BlueZ no Raspberry Pi";
    return lextelStatus();
  }

  if (isRfcommPath(addr) || isSerialPath(addr)) {
    phase = "connecting";
    error =
      "Endereço SPP inválido (ex.: /DEV/RFCOMM0). O MAC salvo foi mantido. Procure o MS-2000 e conecte pelo endereço Bluetooth.";
    if (wantOpen) scheduleReconnect();
    return lextelStatus();
  }

  try {
    phase = "pairing";
    const listed = devices.find((d) => d.addr.toUpperCase() === addr.toUpperCase());
    if (!listed?.paired) {
      try {
        await runHelper(["pair", addr, saved.pin], 30_000);
      } catch (err) {
        const msg = helperText(err);
        if (noController(msg) || helperBusy(msg)) throw err;
        error = `Pareamento: ${msg}`;
      }
    }
    phase = "connecting";
    let ch = saved.channel;
    try {
      const out = await runHelper(["channel", addr], 8_000);
      const n = Number((out.match(/\d+/) || [])[0]);
      if (n >= 1 && n <= 30) ch = n;
    } catch (err) {
      if (noController(helperText(err))) throw err;
    }
    saved.channel = ch;
    saved.addr = addr.toUpperCase();
    saved.name = saved.name || listed?.name || "Monitor Station";
    persist();
    await runHelper(["bind", addr, saved.pin, String(ch), rfcommStale ? "rebind" : ""], 12_000);
    attach(RFCOMM);
  } catch (err) {
    const msg = helperText(err);
    if (noController(msg)) {
      error = NO_CONTROLLER_MSG;
      reconnectDelay = 10_000;
    } else if (helperBusy(msg)) {
      error = "Bluetooth do Lextel ocupado — nova tentativa em seguida, sem derrubar a outra sessão.";
    } else {
      error = msg;
    }
    rfcommStale = true;
    closeStream();
    if (wantOpen) {
      phase = "connecting";
      scheduleReconnect();
    } else {
      phase = "error";
    }
  }
  return lextelStatus();
}

export async function lextelKeepalive(): Promise<LextelSnapshot> {
  if (!connectBusy && !recoverBusy && !autoRunning && wantOpen && !linkAlive()) {
    reconnectDelay = 400;
    clearReconnect();
    void recoverLink();
  }
  return lextelStatus();
}

export async function lextelDisconnect(): Promise<LextelSnapshot> {
  wantOpen = false;
  pendingConnect = null;
  rfcommStale = true;
  clearReconnect();
  closeStream();
  if (process.platform === "linux" && helperExists()) {
    try {
      if (saved.addr && !isSerialPath(saved.addr)) await runHelper(["disconnect", saved.addr], 8_000);
      else await runHelper(["release"], 5_000);
    } catch {
      /* ignore */
    }
  }
  phase = "idle";
  error = "";
  reading = null;
  return lextelStatus();
}

export async function lextelAutoConnect(): Promise<void> {
  const { isServiceAutostart } = await import("./services");
  if (!isServiceAutostart("lextel")) return;
  if (!saved.autoConnect) return;
  if (autoRunning || linkAlive() || connectBusy || recoverBusy || wantOpen) return;
  if (process.platform !== "linux" && !isSerialPath(saved.addr) && !bluetoothMac(saved.addr)) return;
  autoRunning = true;
  // Quer o link mesmo com o adaptador ainda ausente. O recover não desiste.
  wantOpen = true;
  try {
    if (process.platform === "linux") {
      const ready = await ensureSavedMac();
      if (!wantOpen) return;
      if (!ready || !bluetoothMac(saved.addr)) {
        phase = "connecting";
        if (!error) error = "Aguardando o MS-2000 no Bluetooth. O MAC salvo não foi apagado.";
        scheduleReconnect();
        return;
      }
    }
    await lextelConnect({ addr: saved.addr, pin: saved.pin, name: saved.name, channel: saved.channel });
  } catch {
    if (wantOpen && !linkAlive()) scheduleReconnect();
  } finally {
    autoRunning = false;
  }
}

const recoverWatch = setInterval(() => {
  if (!wantOpen || recoverBusy || connectBusy || autoRunning) return;
  if (phase === "scanning" || phase === "pairing") return;
  if (linkAlive()) {
    if (process.platform === "win32" && bytes === 0 && attachedAt && Date.now() - attachedAt > 5000) {
      void remapIfWrongCom();
    }
    return;
  }
  scheduleReconnect();
}, 2000);
recoverWatch.unref();

void SPP_UUID;
