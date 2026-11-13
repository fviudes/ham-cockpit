/**
 * VPN de suporte (OpenVPN cliente). O IP da LAN gravado na primeira vez
 * não é trocado pelo endereço do túnel. Não registra perfil nem credencial.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = "/opt/ham-cockpit/bin/station-support-vpn";
const STATE_OPT = "/opt/ham-cockpit/support-vpn.json";
const AP_IP = "192.168.4.1";
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const SKIP_IFACE = /^(lo|docker|br-|veth|vEthernet|virbr|tailscale|vmnet|vbox|zt|tun|tap|wg|npcap|Loopback|Bluetooth)/i;

export type VpnPhase = "off" | "connecting" | "on" | "error";

export type VpnStatus = {
  ok: boolean;
  state: VpnPhase;
  enabled: boolean;
  originalIp: string;
  tunnelIface?: string;
  tunnelIp?: string;
  rxBytes?: number;
  txBytes?: number;
  rxBps?: number;
  txBps?: number;
  pingMs?: number;
  error?: string;
};

export type IfaceAddr = { name: string; address: string };

type SavedState = { enabled: boolean; originalIp: string };

type Sample = { iface: string; t: number; rx: number; tx: number };

let lastSample: Sample | null = null;
let armAt = 0;

export function isIpv4(value: string): boolean {
  if (!IPV4.test(value)) return false;
  return value.split(".").every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

export function isTunnelIface(name: string): boolean {
  return SKIP_IFACE.test(name);
}

function isLinkLocal(ip: string): boolean {
  return ip.startsWith("169.254.");
}

function hostIp(header: string): string {
  const trimmed = header.trim().replace(/^https?:\/\//i, "");
  const noPath = trimmed.split("/")[0] || "";
  if (noPath.startsWith("[")) return "";
  return noPath.replace(/:\d+$/, "");
}

function bestLan(ifaces: IfaceAddr[]): string {
  const candidates = ifaces.filter(
    (row) => isIpv4(row.address) && !isTunnelIface(row.name) && row.address !== "127.0.0.1" && !isLinkLocal(row.address),
  );
  const rank = (name: string) => {
    if (/^(eth|enp|eno|ens|Ethernet)/i.test(name)) return 0;
    if (/^(wlan|wlp|wlx|Wi-Fi|wifi)/i.test(name)) return 1;
    return 2;
  };
  const ranked = [...candidates].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  const house = ranked.find((row) => row.address !== AP_IP);
  return (house || ranked[0])?.address || "";
}

/**
 * Mantém o IP já gravado. Na primeira vez usa o endereço LAN da estação
 * (não o túnel, não o AP se houver outra interface).
 */
export function chooseOriginalIp(saved: string, hostHeader: string, ifaces: IfaceAddr[]): string {
  const lan = bestLan(ifaces);
  if (isIpv4(saved)) {
    const onTunnel = ifaces.some((row) => row.address === saved && isTunnelIface(row.name));
    if (!onTunnel) {
      if (saved === AP_IP && lan && lan !== AP_IP) return lan;
      return saved;
    }
  }
  const host = hostIp(hostHeader);
  if (isIpv4(host) && host !== "127.0.0.1" && host !== AP_IP && !isLinkLocal(host)) {
    const hit = ifaces.find((row) => row.address === host && !isTunnelIface(row.name));
    if (hit) return hit.address;
  }
  return lan;
}

export function parseTunAddr(text: string): { local?: string; peer?: string } {
  const local = text.match(/\binet\s+(\d+\.\d+\.\d+\.\d+)/);
  const peer = text.match(/\bpeer\s+(\d+\.\d+\.\d+\.\d+)/);
  return {
    local: local && isIpv4(local[1]) ? local[1] : undefined,
    peer: peer && isIpv4(peer[1]) ? peer[1] : undefined,
  };
}

export function parseVia(text: string): string | undefined {
  const via = text.match(/\bvia\s+(\d+\.\d+\.\d+\.\d+)/);
  return via && isIpv4(via[1]) ? via[1] : undefined;
}

export function parsePingMs(text: string): number | undefined {
  const match = text.match(/time[=<]\s*([0-9]+(?:[.,][0-9]+)?)\s*ms/i);
  if (!match) return undefined;
  const n = Number(match[1].replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 10) / 10;
}

export function bytesPerSec(
  prev: Sample | null,
  now: number,
  iface: string,
  rx: number,
  tx: number,
): { rxBps?: number; txBps?: number; sample: Sample } {
  const sample: Sample = { iface, t: now, rx, tx };
  if (!prev || prev.iface !== iface) return { sample };
  const dt = (now - prev.t) / 1000;
  if (dt < 0.4 || dt > 60) return { sample };
  const rxBps = (rx - prev.rx) / dt;
  const txBps = (tx - prev.tx) / dt;
  if (!Number.isFinite(rxBps) || !Number.isFinite(txBps) || rxBps < 0 || txBps < 0) return { sample };
  return { rxBps: Math.round(rxBps), txBps: Math.round(txBps), sample };
}

export function publicVpnError(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return "Falha ao subir a VPN de suporte.";
  if (/BEGIN |PRIVATE KEY|<ca>|<cert>|<key>|auth\.txt/i.test(clean)) return "Falha ao subir a VPN de suporte.";
  return clean.slice(0, 240);
}

function statePath(): string {
  if (existsSync("/opt/ham-cockpit")) return STATE_OPT;
  return join(ROOT, "data", "support-vpn.json");
}

function readState(): SavedState {
  try {
    const raw = JSON.parse(readFileSync(statePath(), "utf8")) as Partial<SavedState>;
    return {
      enabled: raw.enabled === true,
      originalIp: typeof raw.originalIp === "string" && isIpv4(raw.originalIp) ? raw.originalIp : "",
    };
  } catch {
    return { enabled: false, originalIp: "" };
  }
}

function writeState(state: SavedState) {
  const path = statePath();
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify({ enabled: state.enabled, originalIp: state.originalIp }, null, 2) + "\n";
  writeFileSync(path, body, { mode: 0o644 });
}

function liveIfaces(): IfaceAddr[] {
  const out: IfaceAddr[] = [];
  const table = networkInterfaces();
  for (const [name, addrs] of Object.entries(table)) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family);
      if ((family === "IPv4" || family === "4") && !addr.internal) out.push({ name, address: addr.address });
    }
  }
  return out;
}

function rememberOriginal(hostHeader: string): SavedState {
  const state = readState();
  const originalIp = chooseOriginalIp(state.originalIp, hostHeader, liveIfaces());
  if (originalIp !== state.originalIp) {
    const next = { ...state, originalIp };
    writeState(next);
    return next;
  }
  return state;
}

function linux(): boolean {
  return process.platform === "linux";
}

async function runHelper(cmd: "start" | "stop" | "is-active" | "is-enabled"): Promise<{ code: number; stdout: string; stderr: string }> {
  if (!existsSync(HELPER)) return { code: 127, stdout: "", stderr: "helper ausente" };
  try {
    const { stdout, stderr } = await execFileAsync("sudo", ["-n", HELPER, cmd], { timeout: 20_000, windowsHide: true });
    return { code: 0, stdout: String(stdout || ""), stderr: String(stderr || "") };
  } catch (err) {
    const e = err as { code?: number; stdout?: unknown; stderr?: unknown; message?: unknown };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: typeof e.stdout === "string" ? e.stdout : "",
      stderr: typeof e.stderr === "string" ? e.stderr : typeof e.message === "string" ? e.message : "",
    };
  }
}

function tunNames(): string[] {
  if (!existsSync("/sys/class/net")) return [];
  try {
    return readdirSync("/sys/class/net")
      .filter((name) => /^tun\d+$/.test(name))
      .sort();
  } catch {
    return [];
  }
}

function counter(iface: string, which: "rx_bytes" | "tx_bytes"): number | undefined {
  try {
    const n = Number(readFileSync(`/sys/class/net/${iface}/statistics/${which}`, "utf8").trim());
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

async function tunInfo(iface: string): Promise<{ local?: string; peer?: string }> {
  try {
    const { stdout } = await execFileAsync("ip", ["-4", "-o", "addr", "show", "dev", iface], { timeout: 3000, windowsHide: true });
    const addr = parseTunAddr(String(stdout || ""));
    if (addr.peer) return addr;
    const route = await execFileAsync("ip", ["-4", "route", "show", "dev", iface], { timeout: 3000, windowsHide: true });
    return { local: addr.local, peer: parseVia(String(route.stdout || "")) };
  } catch {
    return {};
  }
}

async function pingMs(ip: string): Promise<number | undefined> {
  if (!isIpv4(ip)) return undefined;
  try {
    const { stdout } = await execFileAsync("ping", ["-c", "1", "-W", "2", ip], { timeout: 4000, windowsHide: true });
    return parsePingMs(String(stdout || ""));
  } catch (err) {
    const e = err as { stdout?: unknown; stderr?: unknown };
    return parsePingMs(`${typeof e.stdout === "string" ? e.stdout : ""}\n${typeof e.stderr === "string" ? e.stderr : ""}`);
  }
}

function base(state: SavedState, phase: VpnPhase, extra: Partial<VpnStatus> = {}): VpnStatus {
  return {
    ok: phase !== "error",
    state: phase,
    enabled: state.enabled,
    originalIp: state.originalIp,
    ...extra,
  };
}

async function measure(iface: string): Promise<Partial<VpnStatus>> {
  const info = await tunInfo(iface);
  const rx = counter(iface, "rx_bytes");
  const tx = counter(iface, "tx_bytes");
  const out: Partial<VpnStatus> = { tunnelIface: iface };
  if (info.local) out.tunnelIp = info.local;
  if (rx !== undefined) out.rxBytes = rx;
  if (tx !== undefined) out.txBytes = tx;
  if (rx !== undefined && tx !== undefined) {
    const rate = bytesPerSec(lastSample, Date.now(), iface, rx, tx);
    lastSample = rate.sample;
    if (rate.rxBps !== undefined) out.rxBps = rate.rxBps;
    if (rate.txBps !== undefined) out.txBps = rate.txBps;
  }
  if (info.peer) {
    const ms = await pingMs(info.peer);
    if (ms !== undefined) out.pingMs = ms;
  }
  return out;
}

async function activeState(): Promise<string> {
  const r = await runHelper("is-active");
  const line = (r.stdout || r.stderr).trim().split(/\s+/)[0] || "";
  if (line === "active" || line === "activating" || line === "failed" || line === "inactive" || line === "deactivating") return line;
  return "inactive";
}

export async function supportVpnStatus(hostHeader = ""): Promise<VpnStatus> {
  const state = rememberOriginal(hostHeader);
  if (!state.enabled) {
    lastSample = null;
    return base(state, "off");
  }
  if (!linux() || !existsSync(HELPER)) {
    return base(state, "error", {
      error: "A VPN de suporte só sobe na estação Linux, com OpenVPN e o serviço instalados.",
    });
  }
  const active = await activeState();
  if (active === "activating" || active === "deactivating") return base(state, "connecting");
  if (active === "failed") {
    return base(state, "error", { error: "O OpenVPN não conseguiu estabelecer o túnel." });
  }
  if (active !== "active") {
    if (armAt && Date.now() - armAt < 15_000) return base(state, "connecting");
    return base(state, "error", { error: "O serviço da VPN não está em execução." });
  }
  const names = tunNames();
  for (const iface of names) {
    const info = await tunInfo(iface);
    if (!info.local) continue;
    const metrics = await measure(iface);
    return base(state, "on", metrics);
  }
  return base(state, "connecting");
}

export async function supportVpnSet(enabled: boolean, hostHeader = ""): Promise<VpnStatus> {
  const state = rememberOriginal(hostHeader);
  if (!enabled) {
    armAt = 0;
    lastSample = null;
    if (linux() && existsSync(HELPER)) {
      const stopped = await runHelper("stop");
      if (stopped.code !== 0 && !/inactive|not loaded|could not be found/i.test(stopped.stderr)) {
        writeState({ ...state, enabled: false });
        return base({ ...state, enabled: false }, "error", { error: publicVpnError(stopped.stderr || stopped.stdout) });
      }
    }
    const next = { ...state, enabled: false };
    writeState(next);
    return base(next, "off");
  }
  if (!linux() || !existsSync(HELPER)) {
    const next = { ...state, enabled: false };
    writeState(next);
    return base(next, "error", {
      error: "A VPN de suporte só sobe na estação Linux, com OpenVPN e o serviço instalados.",
    });
  }
  const next = { ...state, enabled: true };
  writeState(next);
  armAt = Date.now();
  const started = await runHelper("start");
  if (started.code !== 0) {
    armAt = 0;
    const failed = { ...next, enabled: false };
    writeState(failed);
    return base(failed, "error", { error: publicVpnError(started.stderr || started.stdout) });
  }
  return supportVpnStatus(hostHeader);
}
