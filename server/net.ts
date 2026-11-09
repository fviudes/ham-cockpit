import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname as osHostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/net";
const HELPER = "/opt/ham-cockpit/bin/station-net";
const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export type NetLink = "wifi" | "ethernet";
export type WifiNet = { ssid: string; rssi: number; open: boolean };
export type ManagedNet = { ssid: string };

export type NetSnapshot = {
  ok: boolean;
  folder: string;
  hostname: string;
  liveHostname: string;
  link: NetLink;
  dhcp: boolean;
  ip: string;
  mask: string;
  gw: string;
  dns1: string;
  dns2: string;
  staSsid: string;
  staConnected: boolean;
  staPassSet: boolean;
  apSsid: string;
  apPassSet: boolean;
  ethConnected: boolean;
  ethName: string;
  wlanName: string;
  liveIp: string;
  liveMask: string;
  liveGw: string;
  scan: WifiNet[];
  managed: ManagedNet[];
  error: string;
  note: string;
};

type Saved = {
  hostname: string;
  link: NetLink;
  dhcp: boolean;
  ip: string;
  mask: string;
  gw: string;
  dns1: string;
  dns2: string;
  staSsid: string;
  staPass: string;
  apSsid: string;
  apPass: string;
  managed: { ssid: string; psk?: string }[];
};

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "net");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "config.json");
}

function validIp(s: string) {
  if (!IPV4_RE.test(s)) return false;
  return s.split(".").every((p) => {
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

function loadSaved(): Saved {
  const fallback: Saved = {
    hostname: "ham-cockpit",
    link: "wifi",
    dhcp: true,
    ip: "",
    mask: "255.255.255.0",
    gw: "",
    dns1: "1.1.1.1",
    dns2: "8.8.8.8",
    staSsid: "",
    staPass: "",
    apSsid: "Ham-Cockpit",
    apPass: "hamcockpit",
    managed: [],
  };
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as Partial<Saved>;
    return {
      hostname: typeof raw.hostname === "string" && HOST_RE.test(raw.hostname) ? raw.hostname : fallback.hostname,
      link: raw.link === "ethernet" ? "ethernet" : "wifi",
      dhcp: raw.dhcp !== false,
      ip: typeof raw.ip === "string" ? raw.ip : "",
      mask: typeof raw.mask === "string" && raw.mask ? raw.mask : fallback.mask,
      gw: typeof raw.gw === "string" ? raw.gw : "",
      dns1: typeof raw.dns1 === "string" && raw.dns1 ? raw.dns1 : fallback.dns1,
      dns2: typeof raw.dns2 === "string" ? raw.dns2 : fallback.dns2,
      staSsid: typeof raw.staSsid === "string" ? raw.staSsid : "",
      staPass: typeof raw.staPass === "string" ? raw.staPass : "",
      apSsid: typeof raw.apSsid === "string" && raw.apSsid ? raw.apSsid : fallback.apSsid,
      apPass: typeof raw.apPass === "string" && raw.apPass ? raw.apPass : fallback.apPass,
      managed: Array.isArray(raw.managed)
        ? raw.managed.filter((m) => m && typeof m.ssid === "string").map((m) => ({ ssid: m.ssid, psk: typeof m.psk === "string" ? m.psk : "" }))
        : [],
    };
  } catch {
    return fallback;
  }
}

let saved = loadSaved();
let lastScan: WifiNet[] = [];
let lastError = "";
let lastNote = "";

function persist() {
  const tmp = `${jsonPath()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(saved, null, 2), "utf8");
  renameSync(tmp, jsonPath());
}

function rememberSsid(ssid: string, psk?: string) {
  if (!ssid) return;
  const rest = saved.managed.filter((m) => m.ssid !== ssid);
  saved.managed = [{ ssid, psk: psk || rest.find((m) => m.ssid === ssid)?.psk }, ...rest].slice(0, 12);
}

function run(cmd: string, args: string[], input?: string, timeout = 20_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* */
      }
    }, timeout);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

async function helper(args: string[], input?: string) {
  if (!existsSync(HELPER)) {
    const err = new Error("helper station-net ausente — use no Raspberry Pi");
    (err as Error & { code?: string }).code = "NO_HELPER";
    throw err;
  }
  return run("sudo", ["-n", HELPER, ...args], input);
}

function pctToRssi(pct: number) {
  const n = Math.max(0, Math.min(100, pct));
  return Math.round(n / 2 - 100);
}

function signalToRssi(raw: string) {
  const n = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return -80;
  if (n <= 0 && n >= -100) return Math.round(n);
  return pctToRssi(n);
}

async function winScan(): Promise<WifiNet[]> {
  const { stdout } = await execFileAsync("netsh", ["wlan", "show", "networks", "mode=bssid"], {
    timeout: 18_000,
    windowsHide: true,
    encoding: "utf8",
  }).catch(async () => {
    const r = await execFileAsync("cmd.exe", ["/c", "chcp 65001>nul & netsh wlan show networks mode=bssid"], {
      timeout: 18_000,
      windowsHide: true,
    });
    return { stdout: r.stdout.toString() };
  });
  const text = String(stdout || "");
  const bySsid = new Map<string, WifiNet>();
  let ssid = "";
  let auth = "";
  for (const line of text.split(/\r?\n/)) {
    const s = line.match(/^\s*SSID\s+\d+\s*:\s*(.*)$/i);
    if (s) {
      ssid = s[1].trim();
      auth = "";
      continue;
    }
    const a = line.match(/^\s*Authentication\s*:\s*(.*)$/i) || line.match(/^\s*Autenticação\s*:\s*(.*)$/i);
    if (a) {
      auth = a[1].trim();
      continue;
    }
    const sig = line.match(/^\s*Signal\s*:\s*(\d+)\s*%/i) || line.match(/^\s*Sinal\s*:\s*(\d+)\s*%/i);
    if (sig && ssid) {
      const rssi = pctToRssi(Number(sig[1]));
      const open = !auth || /^open$/i.test(auth) || /abert/i.test(auth);
      const prev = bySsid.get(ssid);
      if (!prev || rssi > prev.rssi) bySsid.set(ssid, { ssid, rssi, open });
    }
  }
  return Array.from(bySsid.values()).sort((a, b) => b.rssi - a.rssi);
}

async function linuxScan(): Promise<WifiNet[]> {
  const r = existsSync(HELPER)
    ? await helper(["scan"])
    : await run("nmcli", ["-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list"]);
  const bySsid = new Map<string, WifiNet>();
  for (const line of r.stdout.split(/\r?\n/)) {
    const parts = line.split("\t");
    const ssid = (parts[0] || "").trim();
    if (!ssid || ssid === "--") continue;
    const rssi = signalToRssi(parts[1] || "40");
    const sec = (parts[2] || "").trim();
    const open = !sec || sec === "--" || /^none$/i.test(sec);
    const prev = bySsid.get(ssid);
    if (!prev || rssi > prev.rssi) bySsid.set(ssid, { ssid, rssi, open });
  }
  return Array.from(bySsid.values()).sort((a, b) => b.rssi - a.rssi);
}

type LiveIf = {
  name: string;
  kind: "wifi" | "ethernet" | "other";
  connected: boolean;
  ip: string;
  mask: string;
  gw: string;
  dns: string[];
  ssid: string;
};

function guessKind(name: string, hint = ""): LiveIf["kind"] {
  const n = `${name} ${hint}`.toLowerCase();
  if (/wi-?fi|wlan|wireless|802\.11/.test(n)) return "wifi";
  if (/eth|ethernet|end0|enp|eno|cabo|local area/.test(n)) return "ethernet";
  return "other";
}

function parseIpconfig(text: string): LiveIf[] {
  const blocks = text.split(/\r?\n(?=\S)/);
  const out: LiveIf[] = [];
  for (const block of blocks) {
    const head = block.split(/\r?\n/)[0] || "";
    if (!/adapter|adaptador/i.test(head)) continue;
    const name = head
      .replace(/:\s*$/, "")
      .replace(/^(wireless\s+lan\s+adapter|ethernet\s+adapter|adaptador\s+de\s+rede\s+sem\s+fio|adaptador\s+ethernet|adaptador)\s+/i, "")
      .trim();
    const disconnected = /media disconnected|m[ií]dia desconectada|midia desconectada/i.test(block);
    const ip = (block.match(/IPv4[^:\n]*:\s*([\d.]+)/i) || [])[1] || "";
    const mask =
      (block.match(/Subnet Mask[^:\n]*:\s*([\d.]+)/i) || block.match(/M[aá]scara[^:\n]*:\s*([\d.]+)/i) || [])[1] || "";
    const gw =
      (block.match(/Default Gateway[^:\n]*:\s*([\d.]+)/i) ||
        block.match(/Gateway Padr[aã]o[^:\n]*:\s*([\d.]+)/i) ||
        block.match(/Gateway[^:\n]*:\s*([\d.]+)/i) ||
        [])[1] || "";
    const dns: string[] = [];
    const dnsBlock = block.split(/DNS Servers[^:\n]*:\s*/i)[1] || block.split(/Servidores DNS[^:\n]*:\s*/i)[1] || "";
    for (const line of dnsBlock.split(/\r?\n/)) {
      const m = line.match(/([\d.]+)/);
      if (m && validIp(m[1]!)) dns.push(m[1]!);
      else if (line.trim() && !/^\s*[\d.]+/.test(line) && dns.length) break;
    }
    const ssid = (block.match(/SSID[^:\n]*:\s*(.+)/i) || [])[1]?.trim() || "";
    out.push({
      name,
      kind: guessKind(name, head),
      connected: !disconnected && Boolean(ip),
      ip,
      mask,
      gw: validIp(gw) ? gw : "",
      dns,
      ssid,
    });
  }
  return out;
}

async function winLive(): Promise<LiveIf[]> {
  const { stdout } = await execFileAsync("ipconfig", ["/all"], { timeout: 8_000, windowsHide: true }).catch(() => ({ stdout: "" }));
  const ifs = parseIpconfig(String(stdout || ""));
  try {
    const wlan = await execFileAsync("netsh", ["wlan", "show", "interfaces"], { timeout: 6_000, windowsHide: true });
    const text = String(wlan.stdout || "");
    const ssid = (text.match(/^\s*SSID\s*:\s*(.+)$/im) || [])[1]?.trim() || "";
    const state = (text.match(/^\s*State\s*:\s*(.+)$/im) || text.match(/^\s*Estado\s*:\s*(.+)$/im) || [])[1] || "";
    const connected = /connected|conectado/i.test(state);
    const wifi = ifs.find((i) => i.kind === "wifi");
    if (wifi) {
      wifi.ssid = ssid || wifi.ssid;
      if (connected) wifi.connected = true;
    } else if (ssid) {
      ifs.push({ name: "Wi-Fi", kind: "wifi", connected, ip: "", mask: "", gw: "", dns: [], ssid });
    }
  } catch {
    /* */
  }
  return ifs;
}

async function linuxLive(): Promise<LiveIf[]> {
  const ifs: LiveIf[] = [];
  try {
    const { stdout } = await execFileAsync("ip", ["-j", "addr"], { timeout: 5_000 });
    const rows = JSON.parse(String(stdout || "[]")) as { ifname?: string; addr_info?: { family?: string; local?: string; prefixlen?: number }[] }[];
    for (const row of rows) {
      const name = row.ifname || "";
      if (!name || name === "lo") continue;
      const v4 = (row.addr_info || []).find((a) => a.family === "inet");
      const prefix = Number(v4?.prefixlen) || 24;
      const mask = prefixToMask(prefix);
      ifs.push({
        name,
        kind: guessKind(name),
        connected: Boolean(v4?.local),
        ip: v4?.local || "",
        mask,
        gw: "",
        dns: [],
        ssid: "",
      });
    }
  } catch {
    /* */
  }
  try {
    const { stdout } = await execFileAsync("ip", ["-j", "route"], { timeout: 4_000 });
    const routes = JSON.parse(String(stdout || "[]")) as { dst?: string; gateway?: string; dev?: string }[];
    const def = routes.find((r) => r.dst === "default");
    if (def?.gateway && def.dev) {
      const hit = ifs.find((i) => i.name === def.dev);
      if (hit) hit.gw = def.gateway;
    }
  } catch {
    /* */
  }
  try {
    const resolv = readFileSync("/etc/resolv.conf", "utf8");
    const dns: string[] = [];
    const re = /^nameserver\s+([\d.]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(resolv))) dns.push(m[1]!);
    for (const i of ifs) if (i.connected) i.dns = dns;
  } catch {
    /* */
  }
  try {
    const { stdout } = await execFileAsync("iwgetid", ["-r"], { timeout: 3_000 });
    const ssid = String(stdout || "").trim();
    const wifi = ifs.find((i) => i.kind === "wifi") || ifs.find((i) => /^wlan/i.test(i.name));
    if (wifi && ssid) {
      wifi.ssid = ssid;
      wifi.kind = "wifi";
      wifi.connected = true;
    }
  } catch {
    /* */
  }
  return ifs;
}

function prefixToMask(prefix: number) {
  const n = Math.max(0, Math.min(32, prefix));
  const bits = n === 0 ? 0 : (-1 << (32 - n)) >>> 0;
  return [24, 16, 8, 0].map((s) => ((bits >>> s) & 255).toString()).join(".");
}

async function liveIfs(): Promise<LiveIf[]> {
  if (process.platform === "win32") return winLive();
  if (process.platform === "linux") return linuxLive();
  return [];
}

function pickLive(ifs: LiveIf[], link: NetLink): LiveIf | undefined {
  if (link === "ethernet") return ifs.find((i) => i.kind === "ethernet" && i.connected) || ifs.find((i) => i.kind === "ethernet");
  return ifs.find((i) => i.kind === "wifi" && i.connected) || ifs.find((i) => i.kind === "wifi");
}

export async function netStatus(): Promise<NetSnapshot> {
  const ifs = await liveIfs().catch(() => [] as LiveIf[]);
  const wifi = pickLive(ifs, "wifi");
  const eth = pickLive(ifs, "ethernet");
  const chosen = pickLive(ifs, saved.link) || wifi || eth;
  const liveHost = osHostname().replace(/\.local$/i, "");
  return {
    ok: lastError === "",
    folder: dataDir(),
    hostname: saved.hostname,
    liveHostname: liveHost,
    link: saved.link,
    dhcp: saved.dhcp,
    ip: saved.ip || chosen?.ip || "",
    mask: saved.mask || chosen?.mask || "255.255.255.0",
    gw: saved.gw || chosen?.gw || "",
    dns1: saved.dns1 || chosen?.dns[0] || "1.1.1.1",
    dns2: saved.dns2 || chosen?.dns[1] || "",
    staSsid: wifi?.ssid || saved.staSsid,
    staConnected: Boolean(wifi?.connected && wifi.ssid),
    staPassSet: Boolean(saved.staPass),
    apSsid: saved.apSsid,
    apPassSet: Boolean(saved.apPass),
    ethConnected: Boolean(eth?.connected),
    ethName: eth?.name || "",
    wlanName: wifi?.name || "",
    liveIp: chosen?.ip || "",
    liveMask: chosen?.mask || "",
    liveGw: chosen?.gw || "",
    scan: lastScan,
    managed: saved.managed.map((m) => ({ ssid: m.ssid })),
    error: lastError,
    note: lastNote,
  };
}

export async function netScan(): Promise<NetSnapshot> {
  lastError = "";
  lastNote = "";
  try {
    lastScan = process.platform === "win32" ? await winScan() : await linuxScan();
    if (!lastScan.length) lastNote = process.platform === "win32" ? "Nenhuma rede Wi‑Fi visível. Ligue o adaptador wireless." : "Nenhuma rede visível. Confira a antena wlan0.";
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    lastScan = [];
  }
  return netStatus();
}

export async function netConnect(body: { ssid?: string; pass?: string }): Promise<NetSnapshot> {
  const ssid = String(body.ssid || saved.staSsid).trim();
  const pass = typeof body.pass === "string" && body.pass ? body.pass : saved.staPass;
  lastError = "";
  lastNote = "";
  if (!ssid) {
    lastError = "Escolha uma rede Wi‑Fi";
    return netStatus();
  }
  saved.staSsid = ssid;
  if (typeof body.pass === "string" && body.pass) saved.staPass = body.pass;
  saved.link = "wifi";
  rememberSsid(ssid, pass);
  persist();
  try {
    if (process.platform === "linux") {
      await helper(["connect", ssid], pass);
      if (!saved.dhcp) await applyIpv4Linux();
    } else if (process.platform === "win32") {
      await winConnect(ssid, pass);
    } else {
      lastError = "Wi‑Fi STA precisa do Raspberry Pi";
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  return netStatus();
}

async function winConnect(ssid: string, pass: string) {
  const profile = join(dataDir(), "wlan-profile.xml");
  const open = !pass;
  const xml = open
    ? `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${escXml(ssid)}</name><SSIDConfig><SSID><name>${escXml(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption></security></MSM></WLANProfile>`
    : `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${escXml(ssid)}</name><SSIDConfig><SSID><name>${escXml(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${escXml(pass)}</keyMaterial></sharedKey></security></MSM></WLANProfile>`;
  writeFileSync(profile, xml, "utf8");
  const add = await run("netsh", ["wlan", "add", "profile", `filename=${profile}`, "user=current"]);
  if (add.code !== 0 && !/already|já existe/i.test(add.stdout + add.stderr)) {
    throw new Error((add.stderr || add.stdout || "falha ao gravar perfil Wi‑Fi").trim());
  }
  const con = await run("netsh", ["wlan", "connect", `name=${ssid}`, `ssid=${ssid}`]);
  if (con.code !== 0) throw new Error((con.stderr || con.stdout || "falha ao conectar").trim());
}

function escXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function netForget(ssid: string): Promise<NetSnapshot> {
  const name = ssid.trim();
  saved.managed = saved.managed.filter((m) => m.ssid !== name);
  if (saved.staSsid === name) saved.staPass = "";
  persist();
  lastError = "";
  try {
    if (process.platform === "linux") await helper(["forget", name]);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  return netStatus();
}

export async function netSetLink(link: NetLink): Promise<NetSnapshot> {
  saved.link = link === "ethernet" ? "ethernet" : "wifi";
  persist();
  lastError = "";
  lastNote = "";
  try {
    if (process.platform === "linux") {
      await helper(["link", saved.link]);
      await applyIpv4Linux();
    } else {
      lastNote =
        saved.link === "ethernet"
          ? "Cabo selecionado. No Raspberry Pi a STA Wi‑Fi desliga e o Ethernet sobe. Neste Windows só guarda a preferência."
          : "Wi‑Fi selecionado. No Raspberry Pi o cabo deixa de ser o uplink. Neste Windows só guarda a preferência.";
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  return netStatus();
}

export async function netSetIp(body: {
  dhcp?: boolean;
  ip?: string;
  mask?: string;
  gw?: string;
  dns1?: string;
  dns2?: string;
}): Promise<NetSnapshot> {
  if (typeof body.dhcp === "boolean") saved.dhcp = body.dhcp;
  if (typeof body.ip === "string") saved.ip = body.ip.trim();
  if (typeof body.mask === "string") saved.mask = body.mask.trim() || "255.255.255.0";
  if (typeof body.gw === "string") saved.gw = body.gw.trim();
  if (typeof body.dns1 === "string") saved.dns1 = body.dns1.trim();
  if (typeof body.dns2 === "string") saved.dns2 = body.dns2.trim();
  lastError = "";
  lastNote = "";
  if (!saved.dhcp) {
    if (!validIp(saved.ip)) lastError = "IP inválido";
    else if (!validIp(saved.mask)) lastError = "Máscara inválida";
    else if (saved.gw && !validIp(saved.gw)) lastError = "Gateway inválido";
    else if (saved.dns1 && !validIp(saved.dns1)) lastError = "DNS primário inválido";
    else if (saved.dns2 && !validIp(saved.dns2)) lastError = "DNS secundário inválido";
  }
  persist();
  if (lastError) return netStatus();
  try {
    if (process.platform === "linux") await applyIpv4Linux();
    else if (process.platform === "win32") lastNote = saved.dhcp ? "DHCP gravado. No Pi aplica na interface ativa." : "IP fixo gravado. No Raspberry Pi aplica com nmcli; neste Windows não altera o adaptador.";
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  return netStatus();
}

async function applyIpv4Linux() {
  const conn = saved.link === "ethernet" ? "" : saved.staSsid;
  if (saved.dhcp) {
    await helper(["ipv4", "dhcp", conn]);
    return;
  }
  await helper(["ipv4", "manual", conn, saved.ip, saved.mask, saved.gw, saved.dns1, saved.dns2]);
}

export async function netSetHostname(name: string): Promise<NetSnapshot> {
  const host = name.trim().toLowerCase();
  lastError = "";
  lastNote = "";
  if (!HOST_RE.test(host)) {
    lastError = "Nome inválido (letras, números e hífen)";
    return netStatus();
  }
  saved.hostname = host;
  persist();
  try {
    if (process.platform === "linux") {
      await helper(["hostname", host]);
      lastNote = `Na LAN: http://${host}.local`;
    } else {
      lastNote = `Nome gravado (${host}.local no Pi). Neste Windows o nome do PC continua ${osHostname()}.`;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  return netStatus();
}

export async function netSetAp(body: { ssid?: string; pass?: string }): Promise<NetSnapshot> {
  if (typeof body.ssid === "string" && body.ssid.trim()) saved.apSsid = body.ssid.trim();
  if (typeof body.pass === "string" && body.pass) saved.apPass = body.pass;
  persist();
  lastError = "";
  lastNote = "";
  if (saved.apPass && saved.apPass.length < 8) {
    lastError = "Senha do AP precisa de pelo menos 8 caracteres";
    return netStatus();
  }
  try {
    if (process.platform === "linux") await helper(["ap", saved.apSsid], saved.apPass);
    else lastNote = "AP gravado. Sobe no Raspberry Pi (192.168.4.1).";
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  return netStatus();
}

export async function netSave(body: Partial<Saved> & { pass?: string }): Promise<NetSnapshot> {
  if (typeof body.hostname === "string" && HOST_RE.test(body.hostname.trim())) saved.hostname = body.hostname.trim().toLowerCase();
  if (body.link === "ethernet" || body.link === "wifi") saved.link = body.link;
  if (typeof body.dhcp === "boolean") saved.dhcp = body.dhcp;
  if (typeof body.ip === "string") saved.ip = body.ip.trim();
  if (typeof body.mask === "string") saved.mask = body.mask.trim();
  if (typeof body.gw === "string") saved.gw = body.gw.trim();
  if (typeof body.dns1 === "string") saved.dns1 = body.dns1.trim();
  if (typeof body.dns2 === "string") saved.dns2 = body.dns2.trim();
  if (typeof body.staSsid === "string") saved.staSsid = body.staSsid.trim();
  if (typeof body.pass === "string") saved.staPass = body.pass;
  if (typeof body.apSsid === "string") saved.apSsid = body.apSsid.trim();
  persist();
  return netStatus();
}
