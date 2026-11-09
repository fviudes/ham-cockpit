import { execFile, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, type ReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inspectCapture, LextelDecoder, type LextelInspect, type LextelLayout, type LextelReading } from "./lextel-parse";
import { listSerialDevices } from "./list-serials";

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
let autoTried = false;
let inspect: LextelInspect = inspectCapture(Buffer.alloc(0));
let captureWatch: ReturnType<typeof setInterval> | null = null;
let captureOff = 0;
let wantOpen = false;
let recoverBusy = false;
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

function loadSaved(): Saved {
  const fallback: Saved = { addr: "", name: "", pin: "1234", channel: 1, autoConnect: true, layout: null };
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as Partial<Saved>;
    return {
      addr: typeof raw.addr === "string" ? raw.addr : "",
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

function persist() {
  const tmp = `${jsonPath()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(saved, null, 2), "utf8");
  renameSync(tmp, jsonPath());
}

function helperExists() {
  return existsSync(HELPER);
}

async function runHelper(args: string[], timeout = 30_000): Promise<string> {
  if (!helperExists()) {
    const err = new Error("BlueZ helper ausente — o SPP Classic corre no Raspberry Pi");
    (err as Error & { code?: string }).code = "NO_BLUEZ";
    throw err;
  }
  const { stdout, stderr } = await execFileAsync("sudo", ["-n", HELPER, ...args], {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return `${stdout}\n${stderr}`.trim();
}

function parseDevLines(text: string): LextelDevice[] {
  const out: LextelDevice[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^DEV\s+([0-9A-Fa-f:]{11,17})\s+([01])\s+(.*)$/);
    if (!m) continue;
    const addr = m[1].toUpperCase();
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
      out.push({ addr, name, paired: true, kind: "bt", likely: NAME_RE.test(name) });
    }
  } catch {
    /* */
  }
  return out;
}

export async function lextelLearn(): Promise<LextelSnapshot> {
  try {
    const buf = existsSync(capturePath()) ? readFileSync(capturePath()) : Buffer.alloc(0);
    inspect = inspectCapture(buf);
    if (inspect.reading) reading = inspect.reading;
    if (inspect.layout) {
      decoder.layout = inspect.layout;
      saved.layout = inspect.layout;
      persist();
    }
    if (!buf.length) error = "Sem dump — conecte o MS-2000 e deixe o SPP aberto alguns segundos";
    else if (!inspect.reading) error = inspect.note;
    else error = "";
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

async function serialCandidates(): Promise<LextelDevice[]> {
  try {
    const list = await listSerialDevices();
    const spp = process.platform === "win32" ? await winSppPorts() : [];
    const incoming = new Set(spp.filter((p) => p.incoming).map((p) => p.com));
    const outgoing = new Set(spp.filter((p) => !p.incoming).map((p) => p.com));
    return list.map((d) => {
      const com = (d.path.match(/COM\d+/i) || [])[0]?.toUpperCase() || "";
      const isIn = incoming.has(com);
      return {
        addr: d.path,
        name: isIn ? `${d.label} (entrada)` : d.label,
        paired: true,
        kind: "serial" as const,
        likely:
          !isIn &&
          (outgoing.has(com) ||
            NAME_RE.test(`${d.path} ${d.label}`) ||
            /bluetooth|rfcomm|monitor.?station/i.test(`${d.path} ${d.label}`)),
      };
    });
  } catch {
    return [];
  }
}

function ingest(buf: Buffer, alreadyOnDisk = false) {
  if (!buf.length) return;
  bytes += buf.length;
  updatedAt = Date.now();
  const live = comKey(pathOpen);
  if (live && saved.addr !== live) {
    saved.addr = live;
    saved.name = saved.name.replace(/COM\d+/gi, live).replace(/\s*\(entrada\)/i, "").trim() || live;
    persist();
  }
  if (!alreadyOnDisk) {
    try {
      const cap = capturePath();
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

function comKey(s: string) {
  const m = s.match(/COM\d+/i);
  if (m) return m[0].toUpperCase();
  return s.replace(/\\/g, "").toUpperCase();
}

function samePort(a: string, b: string) {
  if (!a || !b) return false;
  if (a.toUpperCase() === b.toUpperCase()) return true;
  const ca = comKey(a);
  const cb = comKey(b);
  return Boolean(ca && cb && ca === cb);
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!wantOpen || recoverBusy || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void recoverLink();
  }, reconnectDelay);
  reconnectDelay = Math.min(10_000, Math.round(reconnectDelay * 1.5));
}

async function remapIfWrongCom() {
  if (process.platform !== "win32" || !wantOpen || recoverBusy) return;
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
  if (!wantOpen || recoverBusy) return;
  if (linkAlive()) {
    if (process.platform === "win32" && bytes === 0 && attachedAt && Date.now() - attachedAt > 5000) {
      await remapIfWrongCom();
    }
    reconnectDelay = 600;
    return;
  }
  if (!saved.addr) return;
  recoverBusy = true;
  if (phase !== "scanning" && phase !== "pairing") phase = "connecting";
  error = "";
  try {
    await lextelConnect({ addr: saved.addr, pin: saved.pin, name: saved.name, channel: saved.channel });
  } catch {
    /* */
  } finally {
    recoverBusy = false;
    if (wantOpen && !linkAlive()) scheduleReconnect();
    else reconnectDelay = 600;
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
  const rs = createReadStream(path, { flags: "r", highWaterMark: 256 });
  stream = rs;
  rs.on("open", () => {
    phase = "streaming";
    reconnectDelay = 600;
  });
  rs.on("data", (chunk: string | Buffer) => {
    ingest(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  rs.on("error", (err) => {
    error = err.message;
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
  if (samePort(pathOpen, path) && linkAlive()) {
    phase = "streaming";
    return;
  }
  closeStream();
  if (!decoder.layout && saved.layout) decoder.reset(saved.layout);
  try {
    writeFileSync(capturePath(), Buffer.alloc(0));
  } catch {
    /* */
  }
  phase = "connecting";
  error = "";
  pathOpen = path;
  attachedAt = Date.now();
  bytes = 0;
  if (process.platform === "win32" && /COM\d+/i.test(path)) {
    const m = path.match(/COM\d+/i);
    attachWinSpp(m ? m[0].toUpperCase() : path);
    return;
  }
  attachFd(path);
}

export function lextelStatus(): LextelSnapshot {
  const r = reading;
  return {
    ok: phase !== "error",
    folder: dataDir(),
    sppUuid: SPP_UUID,
    phase,
    connected: linkAlive() || (wantOpen && (phase === "connecting" || phase === "streaming")),
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
  const serials = await serialCandidates();
  let classic: LextelDevice[] = [];
  if (process.platform === "win32") {
    classic = await winClassicDevices();
  }
  if (process.platform === "linux") {
    try {
      const out = await runHelper(["scan", String(Math.min(20, Math.max(5, seconds)))], 25_000);
      classic = parseDevLines(out);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      try {
        const out = await runHelper(["devices"], 8_000);
        classic = parseDevLines(out);
      } catch {
        /* helper missing */
      }
    }
  }
  const seen = new Set<string>();
  devices = [...classic, ...serials].filter((d) => {
    if (seen.has(d.addr)) return false;
    seen.add(d.addr);
    return true;
  });
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
  if (typeof body.addr === "string") saved.addr = body.addr.trim();
  if (typeof body.name === "string") saved.name = body.name.trim();
  if (typeof body.pin === "string" && /^\d{4,6}$/.test(body.pin.trim())) saved.pin = body.pin.trim();
  if (typeof body.channel === "number" && body.channel >= 1 && body.channel <= 30) saved.channel = Math.round(body.channel);
  if (typeof body.autoConnect === "boolean") saved.autoConnect = body.autoConnect;
  persist();
  return lextelStatus();
}

function isSerialPath(addr: string) {
  return /^(COM\d+|\\\\\.\\COM\d+|\/dev\/)/i.test(addr);
}

export async function lextelConnect(body: { addr?: string; pin?: string; name?: string; channel?: number } = {}): Promise<LextelSnapshot> {
  const addr = String(body.addr || saved.addr).trim();
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

  if (isSerialPath(addr)) {
    const serial = process.platform === "win32" ? await winPreferOutgoingCom(addr) : addr;
    if (linkAlive() && samePort(pathOpen, serial) && (bytes > 0 || Date.now() - attachedAt < 8000)) {
      if (phase !== "error") phase = "streaming";
      saved.addr = comKey(serial) || serial;
      persist();
      return lextelStatus();
    }
    if (serial !== saved.addr) {
      saved.name = saved.name.replace(/COM\d+/gi, serial).replace(/\s*\(entrada\)/i, "").trim() || serial;
    }
    saved.addr = comKey(serial) || serial;
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

  try {
    phase = "pairing";
    const listed = devices.find((d) => d.addr.toUpperCase() === addr.toUpperCase());
    if (!listed?.paired) {
      try {
        await runHelper(["pair", addr, saved.pin], 30_000);
      } catch (err) {
        error = `Pareamento: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    phase = "connecting";
    let ch = saved.channel;
    try {
      const out = await runHelper(["channel", addr], 8_000);
      const n = Number((out.match(/\d+/) || [])[0]);
      if (n >= 1 && n <= 30) ch = n;
    } catch {
      /* default 1 */
    }
    saved.channel = ch;
    persist();
    await runHelper(["bind", addr, saved.pin, String(ch)], 12_000);
    attach(RFCOMM);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
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
  if (wantOpen && saved.addr && !linkAlive()) {
    reconnectDelay = 400;
    clearReconnect();
    void recoverLink();
  }
  return lextelStatus();
}

export async function lextelDisconnect(): Promise<LextelSnapshot> {
  wantOpen = false;
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
  if (autoTried) return;
  autoTried = true;
  const { isServiceAutostart } = await import("./services");
  if (!isServiceAutostart("lextel")) return;
  if (!saved.autoConnect || !saved.addr) return;
  if (process.platform !== "linux" && !isSerialPath(saved.addr)) return;
  await new Promise((r) => setTimeout(r, 1500));
  try {
    await lextelConnect({ addr: saved.addr, pin: saved.pin, name: saved.name, channel: saved.channel });
  } catch {
    /* leave idle */
  }
}

setInterval(() => {
  if (!wantOpen || recoverBusy) return;
  if (phase === "scanning" || phase === "pairing") return;
  if (linkAlive()) {
    if (process.platform === "win32" && bytes === 0 && attachedAt && Date.now() - attachedAt > 5000) {
      void remapIfWrongCom();
    }
    return;
  }
  scheduleReconnect();
}, 2000);

void SPP_UUID;
