import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statfsSync } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { APP_VERSION } from "../shared/brand";
import { serialDisplay, serialFromCpuinfo } from "../shared/license";
import { readDeviceSerial } from "./license";

const execFileAsync = promisify(execFile);

export const HOST_SAMPLE_MS = 5000;
export const HOST_WINDOW_MS = 5 * 60 * 1000;
const MAX_SAMPLES = Math.ceil(HOST_WINDOW_MS / HOST_SAMPLE_MS) + 4;

export type HostSample = {
  t: number;
  cpuPct: number | null;
  ramPct: number | null;
  ramUsedBytes: number;
  ramTotalBytes: number;
  cpuTempC: number | null;
  netRxBps: number | null;
  netTxBps: number | null;
};

export type HostStatus = {
  ok: boolean;
  cpuTempC: number | null;
  diskTotalBytes: number;
  diskFreeBytes: number;
  diskUsedBytes: number;
  diskPath: string;
  error: string;
  hardware: string;
  soc: string;
  osPretty: string;
  appVersion: string;
  /** Serial do Raspberry (display com dígito verificador, se disponível). */
  serial: string | null;
  serialDisplay: string | null;
  uptimeSec: number;
  cpuPct: number | null;
  ramPct: number | null;
  ramUsedBytes: number;
  ramTotalBytes: number;
  netRxBps: number | null;
  netTxBps: number | null;
  sampleMs: number;
  windowMs: number;
  samples: HostSample[];
};

const samples: HostSample[] = [];
let cpuPrev: { idle: number; total: number } | null = null;
let netPrev: { t: number; rx: number; tx: number } | null = null;
let sampler: ReturnType<typeof setInterval> | null = null;
let sampling = false;
let identity: { hardware: string; soc: string; osPretty: string; serial: string | null; serialDisplay: string | null } | null =
  null;

/** Tipos oficiais (new-style revision, bits 4–11). */
const PI_TYPE: Record<number, string> = {
  0x00: "Raspberry Pi A",
  0x01: "Raspberry Pi B",
  0x02: "Raspberry Pi A+",
  0x03: "Raspberry Pi B+",
  0x04: "Raspberry Pi 2 Model B",
  0x06: "Raspberry Pi Compute Module 1",
  0x08: "Raspberry Pi 3 Model B",
  0x09: "Raspberry Pi Zero",
  0x0a: "Raspberry Pi Compute Module 3",
  0x0c: "Raspberry Pi Zero W",
  0x0d: "Raspberry Pi 3 Model B Plus",
  0x0e: "Raspberry Pi 3 Model A Plus",
  0x10: "Raspberry Pi Compute Module 3+",
  0x11: "Raspberry Pi 4 Model B",
  0x12: "Raspberry Pi Zero 2 W",
  0x13: "Raspberry Pi 400",
  0x14: "Raspberry Pi Compute Module 4",
  0x15: "Raspberry Pi Compute Module 4S",
  0x17: "Raspberry Pi 5",
  0x18: "Raspberry Pi Compute Module 5",
  0x19: "Raspberry Pi 500",
  0x1a: "Raspberry Pi Compute Module 5 Lite",
};

const PI_SOC: Record<number, string> = {
  0x00: "BCM2835",
  0x01: "BCM2835",
  0x02: "BCM2835",
  0x03: "BCM2835",
  0x04: "BCM2836",
  0x06: "BCM2835",
  0x08: "BCM2837",
  0x09: "BCM2835",
  0x0a: "BCM2837",
  0x0c: "BCM2835",
  0x0d: "BCM2837B0",
  0x0e: "BCM2837B0",
  0x10: "BCM2837B0",
  0x11: "BCM2711",
  0x12: "BCM2710A1",
  0x13: "BCM2711",
  0x14: "BCM2711",
  0x15: "BCM2711",
  0x17: "BCM2712",
  0x18: "BCM2712",
  0x19: "BCM2712",
  0x1a: "BCM2712",
};

function readText(path: string): string {
  const raw = readFileSync(path);
  return raw.toString("utf8").replace(/\0/g, "").trim();
}

function readDtModel(): string {
  for (const p of ["/sys/firmware/devicetree/base/model", "/proc/device-tree/model"]) {
    try {
      if (!existsSync(p)) continue;
      const s = readText(p);
      if (s) return s;
    } catch {
      /* next */
    }
  }
  return "";
}

function parseCpuinfo(): { hardware: string; revision: string; model: string } {
  const out = { hardware: "", revision: "", model: "" };
  try {
    if (!existsSync("/proc/cpuinfo")) return out;
    const text = readFileSync("/proc/cpuinfo", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (k === "hardware") out.hardware = v;
      else if (k === "revision") out.revision = v;
      else if (k === "model") out.model = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function decodePiRevision(raw: string): { model: string; soc: string } | null {
  const n = Number.parseInt(raw.replace(/^0x/i, ""), 16);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!((n >> 23) & 1)) return null;
  const type = (n >> 4) & 0xff;
  const rev = n & 0xf;
  const name = PI_TYPE[type];
  if (!name) return { model: `Raspberry Pi (rev ${raw})`, soc: PI_SOC[type] || "" };
  return { model: `${name} Rev 1.${rev}`, soc: PI_SOC[type] || "" };
}

function readOsRelease(): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    if (!existsSync("/etc/os-release")) return map;
    for (const line of readFileSync("/etc/os-release", "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      map[k] = v;
    }
  } catch {
    /* ignore */
  }
  return map;
}

function formatOsPretty(rel: Record<string, string>): string {
  const pretty = rel.PRETTY_NAME || "";
  const variant = (rel.VARIANT || rel.VARIANT_ID || "").toLowerCase();
  if (pretty) {
    const serverHint =
      variant.includes("server") ||
      existsSync("/usr/share/doc/ubuntu-server") ||
      existsSync("/var/lib/dpkg/info/ubuntu-server.list") ||
      existsSync("/proc/device-tree/model");
    if (/ubuntu/i.test(pretty) && !/server/i.test(pretty) && serverHint) {
      return pretty.replace(/Ubuntu/i, "Ubuntu Server");
    }
    return pretty;
  }
  const name = rel.NAME || "";
  const ver = rel.VERSION || rel.VERSION_ID || "";
  return [name, ver].filter(Boolean).join(" ").trim();
}

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function cpuPctFromDelta(): number | null {
  const cur = cpuTimes();
  const prev = cpuPrev;
  cpuPrev = cur;
  if (!prev) return null;
  const dTotal = cur.total - prev.total;
  const dIdle = cur.idle - prev.idle;
  if (dTotal <= 0) return null;
  const pct = (1 - dIdle / dTotal) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
}

function readRam(): { total: number; used: number; pct: number | null } {
  try {
    if (existsSync("/proc/meminfo")) {
      const text = readFileSync("/proc/meminfo", "utf8");
      const grab = (key: string) => {
        const m = text.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
        return m ? Number(m[1]) * 1024 : 0;
      };
      const total = grab("MemTotal");
      let avail = grab("MemAvailable");
      if (!avail) avail = grab("MemFree") + grab("Buffers") + grab("Cached");
      if (total > 0) {
        const used = Math.max(0, total - avail);
        return { total, used, pct: Math.round((used / total) * 1000) / 10 };
      }
    }
  } catch {
    /* fallback */
  }
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : null;
  return { total, used, pct };
}

function readThermalZoneC(): number | null {
  const root = "/sys/class/thermal";
  if (!existsSync(root)) return null;
  try {
    const zones = readdirSync(root).filter((n) => n.startsWith("thermal_zone"));
    let best: number | null = null;
    for (const z of zones) {
      const typePath = `${root}/${z}/type`;
      const tempPath = `${root}/${z}/temp`;
      if (!existsSync(tempPath)) continue;
      let prefer = false;
      try {
        const type = readFileSync(typePath, "utf8").trim().toLowerCase();
        prefer = type.includes("cpu") || type.includes("soc") || type === "x86_pkg_temp" || type === "cpu-thermal";
      } catch {
        /* ignore */
      }
      const raw = Number(readFileSync(tempPath, "utf8").trim());
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const c = raw > 1000 ? raw / 1000 : raw;
      if (prefer) return Math.round(c * 10) / 10;
      if (best == null || c > best) best = c;
    }
    return best == null ? null : Math.round(best * 10) / 10;
  } catch {
    return null;
  }
}

async function readVcgencmdTempC(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("vcgencmd", ["measure_temp"], { timeout: 2000 });
    const m = stdout.match(/temp=([\d.]+)/i);
    if (!m) return null;
    const c = Number(m[1]);
    return Number.isFinite(c) ? Math.round(c * 10) / 10 : null;
  } catch {
    return null;
  }
}

let windowsTempTried = false;
let windowsTempOk = false;

async function readWindowsTempC(): Promise<number | null> {
  if (process.platform !== "win32") return null;
  if (windowsTempTried && !windowsTempOk) return null;
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Temperature)",
      ],
      { timeout: 4000, windowsHide: true }
    );
    windowsTempTried = true;
    const kelvin = Number(String(stdout).trim());
    if (!Number.isFinite(kelvin) || kelvin < 200) return null;
    windowsTempOk = true;
    return Math.round((kelvin - 273.15) * 10) / 10;
  } catch {
    windowsTempTried = true;
    return null;
  }
}

async function readCpuTempC(): Promise<number | null> {
  let cpuTempC = readThermalZoneC();
  if (cpuTempC == null) cpuTempC = await readVcgencmdTempC();
  if (cpuTempC == null) cpuTempC = await readWindowsTempC();
  return cpuTempC;
}

function diskRoots(): string[] {
  if (process.platform === "win32") {
    const home = process.env.SystemDrive || "C:";
    return [`${home}\\`];
  }
  return ["/", "/data", "/opt"];
}

function readDisk(): { total: number; free: number; path: string } {
  for (const p of diskRoots()) {
    try {
      if (!existsSync(p)) continue;
      const s = statfsSync(p);
      const total = Number(s.bsize) * Number(s.blocks);
      const free = Number(s.bsize) * Number(s.bavail ?? s.bfree);
      if (total > 0) return { total, free, path: p };
    } catch {
      /* try next */
    }
  }
  return { total: 0, free: 0, path: process.platform === "win32" ? "C:\\" : "/" };
}

function formatCpuModel(model: string, n: number): string {
  const mhz = os.cpus()[0]?.speed;
  const hz = mhz && mhz > 0 ? ` · ${n}×${mhz >= 1000 ? `${(mhz / 1000).toFixed(1)} GHz` : `${mhz} MHz`}` : n > 1 ? ` · ${n} núcleos` : "";
  return `${model}${hz}`;
}

function readNetTotals(): { rx: number; tx: number } {
  if (process.platform !== "linux" || !existsSync("/proc/net/dev")) return { rx: 0, tx: 0 };
  try {
    let rx = 0;
    let tx = 0;
    const text = readFileSync("/proc/net/dev", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([^:]+):\s*(.+)$/);
      if (!m) continue;
      const name = m[1].trim();
      if (name === "lo" || name.startsWith("veth") || name.startsWith("br-") || name === "docker0") continue;
      const cols = m[2].trim().split(/\s+/);
      rx += Number(cols[0]) || 0;
      tx += Number(cols[8]) || 0;
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

function netBpsFromDelta(): { rx: number | null; tx: number | null } {
  const now = Date.now();
  const cur = readNetTotals();
  const prev = netPrev;
  netPrev = { t: now, rx: cur.rx, tx: cur.tx };
  if (!prev || now <= prev.t) return { rx: null, tx: null };
  const dt = (now - prev.t) / 1000;
  if (dt <= 0) return { rx: null, tx: null };
  const rx = Math.max(0, (cur.rx - prev.rx) / dt);
  const tx = Math.max(0, (cur.tx - prev.tx) / dt);
  return { rx, tx };
}

function linuxHardware(): { hardware: string; soc: string } {
  const dt = readDtModel();
  const info = parseCpuinfo();
  const decoded = info.revision ? decodePiRevision(info.revision) : null;
  const hardware = dt || info.model || decoded?.model || os.hostname() || "Raspberry Pi";
  const socFromRev = decoded?.soc || "";
  const n = os.cpus().length || 1;
  let soc = "";
  if (socFromRev) soc = formatCpuModel(socFromRev, n);
  else if (info.hardware) soc = formatCpuModel(info.hardware, n);
  else {
    const m = os.cpus()[0]?.model?.trim();
    if (m) soc = formatCpuModel(m, n);
    else soc = formatCpuModel("ARM", n);
  }
  return { hardware, soc };
}

function parseRegSzMap(stdout: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+)\s+REG_SZ\s+(.+)$/i);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

function windowsIdentityQuick(): { hardware: string; soc: string; osPretty: string } {
  const n = os.cpus().length || 1;
  const cpu = os.cpus()[0]?.model?.trim() || "";
  return {
    hardware: os.hostname(),
    soc: cpu ? formatCpuModel(cpu, n) : "",
    osPretty: `Windows ${os.release()}`,
  };
}

let windowsEnrichStarted = false;

function enrichWindowsIdentity(): void {
  if (windowsEnrichStarted) return;
  windowsEnrichStarted = true;
  void (async () => {
    let hardware = identity?.hardware || "";
    let osPretty = identity?.osPretty || "";
    try {
      const { stdout } = await execFileAsync("reg", ["query", "HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS"], {
        timeout: 8000,
        windowsHide: true,
      });
      const bios = parseRegSzMap(stdout);
      const mfr = bios.SystemManufacturer || "";
      const ver = bios.SystemVersion || "";
      const family = bios.SystemFamily || "";
      const product = bios.SystemProductName || "";
      const found = [mfr, ver || family || product].filter(Boolean).join(" ").trim();
      if (found) hardware = found;
    } catch {
      /* keep hostname */
    }
    try {
      const { stdout } = await execFileAsync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"], {
        timeout: 8000,
        windowsHide: true,
      });
      const nt = parseRegSzMap(stdout);
      const pretty = [nt.ProductName, nt.DisplayVersion].filter(Boolean).join(" ").trim();
      if (pretty) osPretty = pretty;
    } catch {
      /* keep fallback */
    }
    if (identity) identity = { ...identity, hardware, osPretty };
  })();
}

async function windowsIdentity(): Promise<{ hardware: string; soc: string; osPretty: string }> {
  const quick = windowsIdentityQuick();
  enrichWindowsIdentity();
  return quick;
}

async function readSerialFields(): Promise<{ serial: string | null; serialDisplay: string | null }> {
  try {
    const serial = readDeviceSerial();
    if (!serial) {
      // Fallback direto do cpuinfo (mesmo caminho da licença).
      const cpu = existsSync("/proc/cpuinfo") ? readFileSync("/proc/cpuinfo", "utf8") : null;
      const dt = existsSync("/proc/device-tree/serial-number")
        ? readFileSync("/proc/device-tree/serial-number", "utf8")
        : null;
      const s = serialFromCpuinfo(cpu, dt);
      if (!s) return { serial: null, serialDisplay: null };
      return { serial: s, serialDisplay: await serialDisplay(s) };
    }
    return { serial, serialDisplay: await serialDisplay(serial) };
  } catch {
    return { serial: null, serialDisplay: null };
  }
}

async function readIdentity(): Promise<{
  hardware: string;
  soc: string;
  osPretty: string;
  serial: string | null;
  serialDisplay: string | null;
}> {
  if (identity) return identity;
  if (process.platform === "win32") {
    const base = await windowsIdentity();
    identity = { ...base, serial: null, serialDisplay: null };
    return identity;
  }
  const hw = linuxHardware();
  const osPretty = formatOsPretty(readOsRelease());
  const ser = await readSerialFields();
  identity = {
    hardware: hw.hardware,
    soc: hw.soc,
    osPretty: osPretty || `${os.type()} ${os.release()}`,
    serial: ser.serial,
    serialDisplay: ser.serialDisplay,
  };
  return identity;
}

function pruneSamples(now: number) {
  const cut = now - HOST_WINDOW_MS;
  while (samples.length && samples[0].t < cut) samples.shift();
  while (samples.length > MAX_SAMPLES) samples.shift();
}

async function sampleOnce(): Promise<HostSample> {
  const t = Date.now();
  const ram = readRam();
  const cpuPct = cpuPctFromDelta();
  const cpuTempC = await readCpuTempC();
  const net = netBpsFromDelta();
  const row: HostSample = {
    t,
    cpuPct,
    ramPct: ram.pct,
    ramUsedBytes: ram.used,
    ramTotalBytes: ram.total,
    cpuTempC,
    netRxBps: net.rx,
    netTxBps: net.tx,
  };
  samples.push(row);
  pruneSamples(t);
  return row;
}

export function startHostSampler(): void {
  if (sampler) return;
  void (async () => {
    if (sampling) return;
    sampling = true;
    try {
      await sampleOnce();
    } finally {
      sampling = false;
    }
  })();
  sampler = setInterval(() => {
    if (sampling) return;
    sampling = true;
    void sampleOnce().finally(() => {
      sampling = false;
    });
  }, HOST_SAMPLE_MS);
  sampler.unref?.();
}

function emptyStatus(error: string): HostStatus {
  return {
    ok: false,
    cpuTempC: null,
    diskTotalBytes: 0,
    diskFreeBytes: 0,
    diskUsedBytes: 0,
    diskPath: "/",
    error,
    hardware: "",
    soc: "",
    osPretty: "",
    appVersion: APP_VERSION,
    serial: null,
    serialDisplay: null,
    uptimeSec: Math.floor(os.uptime()),
    cpuPct: null,
    ramPct: null,
    ramUsedBytes: 0,
    ramTotalBytes: 0,
    netRxBps: null,
    netTxBps: null,
    sampleMs: HOST_SAMPLE_MS,
    windowMs: HOST_WINDOW_MS,
    samples: [],
  };
}

export async function hostStatus(): Promise<HostStatus> {
  startHostSampler();
  try {
    const now = Date.now();
    const last = samples[samples.length - 1];
    if (!last || now - last.t > HOST_SAMPLE_MS * 1.5) {
      if (!sampling) {
        sampling = true;
        try {
          await sampleOnce();
        } finally {
          sampling = false;
        }
      }
    }
    const [id, disk] = await Promise.all([readIdentity(), Promise.resolve(readDisk())]);
    const used = Math.max(0, disk.total - disk.free);
    const ram = readRam();
    const row = samples[samples.length - 1];
    pruneSamples(Date.now());
    return {
      ok: true,
      cpuTempC: row?.cpuTempC ?? null,
      diskTotalBytes: disk.total,
      diskFreeBytes: disk.free,
      diskUsedBytes: used,
      diskPath: disk.path,
      error: "",
      hardware: id.hardware,
      soc: id.soc,
      osPretty: id.osPretty,
      appVersion: APP_VERSION,
      serial: id.serial,
      serialDisplay: id.serialDisplay,
      uptimeSec: Math.floor(os.uptime()),
      cpuPct: row?.cpuPct ?? null,
      ramPct: ram.pct,
      ramUsedBytes: ram.used,
      ramTotalBytes: ram.total,
      netRxBps: row?.netRxBps ?? null,
      netTxBps: row?.netTxBps ?? null,
      sampleMs: HOST_SAMPLE_MS,
      windowMs: HOST_WINDOW_MS,
      samples: samples.slice(),
    };
  } catch (err) {
    return emptyStatus(String(err));
  }
}

startHostSampler();
