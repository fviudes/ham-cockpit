import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { asSer2netDevice, type Ser2netDevice } from "../shared/const";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ser2net";
const HELPER = "/opt/ham-cockpit/bin/ser2net-ctl";
const GENERATED = "# Ham Cockpit generated — do not edit";
const BAUDS = new Set([1200, 9600, 19200, 38400, 57600, 115200]);
const BIND_RE = /^(127\.0\.0\.1|0\.0\.0\.0|localhost|(\d{1,3}\.){3}\d{1,3})$/;
const HAMLIB_NET_PORT = 4532;

export type Ser2netSvc = {
  id: string;
  name: string;
  serial: string;
  tcpPort: number;
  baud: number;
  device: Ser2netDevice;
};

export type Ser2netConfig = {
  ok: boolean;
  folder: string;
  bind: string;
  services: Ser2netSvc[];
  yamlPath: string;
  jsonPath: string;
  running: boolean;
  /** rigctld NET :4532 respondendo (daemon up; não exige RF). */
  hamlibRunning: boolean;
  error?: string;
};

function dataDir(): string {
  if (existsSync(OPT_DIR)) return OPT_DIR;
  const local = join(ROOT, "data", "ser2net");
  mkdirSync(local, { recursive: true });
  return local;
}

function paths() {
  const folder = dataDir();
  return {
    folder,
    jsonPath: join(folder, "services.json"),
    yamlPath: join(folder, "ser2net.yaml"),
  };
}

function newId(): string {
  return randomBytes(4).toString("hex");
}

function slug(name: string, id: string, used: Set<string>): string {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(base)) base = `svc_${base}`;
  if (!base || base === "svc_") base = `svc_${id.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "x"}`;
  base = base.slice(0, 28);
  let a = base;
  let n = 2;
  while (used.has(a)) a = `${base.slice(0, 24)}_${n++}`;
  used.add(a);
  return a;
}

function writeAtomic(file: string, body: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, file);
}

/** SPE Expert precisa de telnet(rfc2217) para DTR/RTS (power-on). Demais: TCP raw. */
function accepterLine(bind: string, port: number, device: Ser2netDevice): string {
  if (device === "spe") return `    accepter: telnet(rfc2217),tcp,${bind},${port}`;
  return `    accepter: tcp,${bind},${port}`;
}

function renderYaml(bind: string, services: Ser2netSvc[]): string {
  const used = new Set<string>();
  const blocks = services.map((svc) => {
    const a = slug(svc.name, svc.id, used);
    const baud = BAUDS.has(svc.baud) ? svc.baud : 9600;
    return [
      `connection: &${a}`,
      accepterLine(bind, svc.tcpPort, svc.device),
      `    enable: on`,
      `    options:`,
      `      kickolduser: true`,
      `    connector: serialdev,${svc.serial},${baud}n81,local`,
    ].join("\n");
  });
  return [
    "%YAML 1.1",
    "---",
    GENERATED,
    "# ser2net 4 — único processo na TTY. SPE usa telnet(rfc2217) (DTR/RTS); demais TCP raw.",
    `# Pasta: ${dataDir()}`,
    "",
    // ser2net 4 recusa documento só com comentários ("Unexpected scalar value") e o
    // systemd reiniciava a cada 2 s. `define` vazio é aceito e mantém o daemon de pé.
    ...(blocks.length ? blocks : ["# (nenhum serviço cadastrado)", 'define: &hc_empty ""']),
    "",
  ].join("\n");
}

function parseYaml(text: string): Ser2netSvc[] | null {
  if (!text.includes("Ham Cockpit generated")) return null;
  const out: Ser2netSvc[] = [];
  const re =
    /connection:\s*&(\S+)\s+accepter:\s*(?:telnet\(rfc2217\),)?tcp,([^,]+),(\d+)\s+enable:\s*on[\s\S]*?connector:\s*serialdev,([^,]+),(\d+)n81,local/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tcpPort = Number(m[3]);
    const baud = Number(m[5]);
    if (!tcpPort) continue;
    out.push({
      id: newId(),
      name: m[1].replace(/_/g, " "),
      serial: m[4].trim(),
      tcpPort,
      baud: BAUDS.has(baud) ? baud : 9600,
      device: "",
    });
  }
  return out;
}

function normalizeSvc(raw: unknown, seen: { name: Set<string>; port: Set<number>; serial: Set<string> }): Ser2netSvc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  const serial = String(r.serial ?? "").trim();
  const tcpPort = Number(r.tcpPort);
  const baud = Number(r.baud);
  if (!name || name.length > 48 || /[\r\n]/.test(name)) return null;
  if (!serial || serial.length > 256 || /[\r\n,]/.test(serial)) return null;
  if (!Number.isInteger(tcpPort) || tcpPort < 1024 || tcpPort > 65535) return null;
  if (!BAUDS.has(baud)) return null;
  const key = name.toLowerCase();
  if (seen.name.has(key) || seen.port.has(tcpPort) || seen.serial.has(serial)) return null;
  seen.name.add(key);
  seen.port.add(tcpPort);
  seen.serial.add(serial);
  const id = String(r.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || newId();
  return { id, name, serial, tcpPort, baud, device: asSer2netDevice(r.device) };
}

function readJson(file: string): { bind?: string; folder?: string; services?: unknown } | null {
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as { bind?: string; folder?: string; services?: unknown };
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

async function daemonActive(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", "ser2net.service"], {
      timeout: 5000,
      windowsHide: true,
    });
    return stdout.trim() === "active";
  } catch {
    return false;
  }
}

/** Probe leve: daemon Hamlib NET escuta e responde (mesmo sem rádio/RF). */
export async function probeHamlibNet(port = HAMLIB_NET_PORT, host = "127.0.0.1", timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        /* */
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    sock.connect(port, host, () => {
      sock.write("f\n");
    });
    sock.on("data", () => {
      clearTimeout(timer);
      finish(true);
    });
    sock.on("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    sock.on("close", () => {
      clearTimeout(timer);
      if (!done) finish(false);
    });
  });
}

async function reloadDaemon(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  try {
    if (existsSync(HELPER)) {
      await execFileAsync("sudo", ["-n", HELPER, "reload-or-restart"], { timeout: 15_000, windowsHide: true });
    } else {
      await execFileAsync("systemctl", ["reload-or-restart", "ser2net.service"], {
        timeout: 15_000,
        windowsHide: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function hamlibCtl(action: "start" | "stop"): Promise<boolean> {
  if (process.platform !== "linux") return false;
  const cmd = action === "start" ? "start-hamlib" : "stop-hamlib";
  try {
    if (existsSync(HELPER)) {
      await execFileAsync("sudo", ["-n", HELPER, cmd], { timeout: 20_000, windowsHide: true });
    } else {
      const unit = "rigctld@ic705.service";
      if (action === "start") {
        await execFileAsync("systemctl", ["restart", unit], { timeout: 15_000, windowsHide: true });
      } else {
        await execFileAsync("systemctl", ["stop", unit], { timeout: 15_000, windowsHide: true });
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function loadSer2net(): Promise<Ser2netConfig> {
  const { folder, jsonPath, yamlPath } = paths();
  let bind = "127.0.0.1";
  let services: Ser2netSvc[] = [];
  const json = existsSync(jsonPath) ? readJson(jsonPath) : null;
  if (json) {
    if (typeof json.bind === "string" && BIND_RE.test(json.bind.trim())) bind = json.bind.trim();
    const seen = { name: new Set<string>(), port: new Set<number>(), serial: new Set<string>() };
    if (Array.isArray(json.services)) {
      for (const row of json.services) {
        const svc = normalizeSvc(row, seen);
        if (svc) services.push(svc);
      }
    }
  } else if (existsSync(yamlPath)) {
    try {
      const parsed = parseYaml(readFileSync(yamlPath, "utf8"));
      if (parsed) services = parsed;
    } catch {
      /* ignore */
    }
  }
  const [running, hamlibRunning] = await Promise.all([daemonActive(), probeHamlibNet()]);
  return {
    ok: true,
    folder,
    bind,
    services,
    yamlPath,
    jsonPath,
    running,
    hamlibRunning,
  };
}

export async function saveSer2net(input: {
  bind?: string;
  folder?: string;
  services?: unknown;
}): Promise<Ser2netConfig> {
  const current = await loadSer2net();
  const bind = typeof input.bind === "string" && BIND_RE.test(input.bind.trim()) ? input.bind.trim() : current.bind;
  if (!Array.isArray(input.services)) {
    return { ...current, ok: false, error: "services", hamlibRunning: current.hamlibRunning };
  }
  if (input.services.length > 32) {
    return { ...current, ok: false, error: "limit", hamlibRunning: current.hamlibRunning };
  }
  const seen = { name: new Set<string>(), port: new Set<number>(), serial: new Set<string>() };
  const services: Ser2netSvc[] = [];
  for (const row of input.services) {
    const svc = normalizeSvc(row, seen);
    if (!svc) return { ...current, ok: false, error: "invalid", hamlibRunning: current.hamlibRunning };
    services.push(svc);
  }
  const taken = new Set<string>();
  for (const svc of services) {
    if (!svc.device) continue;
    if (taken.has(svc.device)) svc.device = "";
    else taken.add(svc.device);
  }
  const { folder, jsonPath, yamlPath } = paths();
  mkdirSync(folder, { recursive: true });
  const payload = JSON.stringify({ bind, folder, services }, null, 2);
  writeAtomic(jsonPath, `${payload}\n`);
  writeAtomic(yamlPath, renderYaml(bind, services));
  await reloadDaemon();
  const [running, hamlibRunning] = await Promise.all([daemonActive(), probeHamlibNet()]);
  return {
    ok: true,
    folder,
    bind,
    services,
    yamlPath,
    jsonPath,
    running,
    hamlibRunning,
  };
}
