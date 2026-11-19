import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GATE_OPT = "/opt/wavelog-gate";
const ENV_NAME = "wavelog-gate.env";
const STATION_SVC = "/opt/ham-cockpit/bin/station-svc";

export type WlgEnvPublic = {
  wavelogUrl: string;
  stationId: string;
  radioName: string;
  hamlibHost: string;
  hamlibPort: number;
  udpPort: number;
  qsyPort: number;
  publishCat: boolean;
  hasApiKey: boolean;
  apiKeyHint: string;
  envPath: string;
  folder: string;
  wavelogFolder: string;
  wavelogHttpPort: number;
};

export type WlgEnvPatch = {
  wavelogUrl?: string;
  apiKey?: string;
  stationId?: string;
  radioName?: string;
  hamlibHost?: string;
  hamlibPort?: number;
  udpPort?: number;
  qsyPort?: number;
  publishCat?: boolean;
  folder?: string;
  wavelogFolder?: string;
  wavelogHttpPort?: number;
};

function envPath(): string {
  const opt = join(GATE_OPT, ENV_NAME);
  if (existsSync(opt)) return opt;
  const deploy = join(ROOT, "deploy", "wavelog-gate", ENV_NAME);
  if (existsSync(deploy)) return deploy;
  return opt;
}

/** Remove aspas simples/duplas do valor (systemd EnvironmentFile). */
export function unquoteEnv(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2) {
    const a = v[0];
    const b = v[v.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return v.slice(1, -1);
  }
  return v;
}

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = unquoteEnv(t.slice(i + 1));
  }
  return out;
}

function templateText(): string {
  const p = join(ROOT, "deploy", "wavelog-gate", ENV_NAME);
  if (existsSync(p)) return readFileSync(p, "utf8");
  return [
    "# WaveLogGate headless",
    "WAVELOG_URL=http://127.0.0.1:8086/index.php",
    "WAVELOG_API_KEY=",
    "WAVELOG_STATION_ID=1",
    "RADIO_NAME=IC-705",
    "HAMLIB_HOST=127.0.0.1",
    "HAMLIB_PORT=4532",
    "PUBLISH_CAT=1",
    "UDP_PORT=2333",
    "QSY_PORT=54321",
    "",
  ].join("\n");
}

function liveEnvText(): string {
  const path = envPath();
  if (existsSync(path)) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      /* cai no template */
    }
  }
  return templateText();
}

export function formatEnv(vars: Record<string, string>, base = templateText()): string {
  const lines = base.split(/\r?\n/);
  const out: string[] = [];
  const written = new Set<string>();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      out.push(line.replace(/\r$/, ""));
      continue;
    }
    const i = t.indexOf("=");
    if (i < 0) {
      out.push(line);
      continue;
    }
    const key = t.slice(0, i).trim();
    if (key in vars) {
      out.push(`${key}=${vars[key]}`);
      written.add(key);
    } else {
      out.push(line.replace(/\r$/, ""));
    }
  }
  for (const [key, val] of Object.entries(vars)) {
    if (!written.has(key)) out.push(`${key}=${val}`);
  }
  return `${out.join("\n").trimEnd()}\n`;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool01(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return /^(1|true|yes)$/i.test(v);
}

export function maskApiKey(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length < 8) return "••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function httpPortFromUrl(url: string, fallback = 8086): number {
  try {
    const u = new URL(url);
    if (u.port) return Number(u.port) || fallback;
    if (u.protocol === "https:") return 443;
    return 80;
  } catch {
    const m = url.match(/:(\d+)/);
    return m ? Number(m[1]) || fallback : fallback;
  }
}

export function envToPublic(v: Record<string, string>, path: string): WlgEnvPublic {
  const key = v.WAVELOG_API_KEY ?? "";
  const url = v.WAVELOG_URL || "http://127.0.0.1:8086/index.php";
  return {
    wavelogUrl: url,
    stationId: v.WAVELOG_STATION_ID || "1",
    radioName: v.RADIO_NAME || "IC-705",
    hamlibHost: v.HAMLIB_HOST || "127.0.0.1",
    hamlibPort: num(v.HAMLIB_PORT, 4532),
    udpPort: num(v.UDP_PORT, 2333),
    qsyPort: num(v.QSY_PORT, 54321),
    publishCat: bool01(v.PUBLISH_CAT, true),
    hasApiKey: key.trim().length > 0,
    apiKeyHint: maskApiKey(key),
    envPath: path,
    folder: v.WLG_FOLDER || "/opt/wavelog-gate",
    wavelogFolder: v.WAVELOG_FOLDER || "/opt/wavelog",
    wavelogHttpPort: num(v.WAVELOG_HTTP_PORT, httpPortFromUrl(url)),
  };
}

function asTrimmed(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v).trim();
}

function asPort(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(65535, Math.floor(n));
}

function asBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  return /^(1|true|yes)$/i.test(String(v).trim());
}

export function parseWlgEnvPatch(raw: unknown): WlgEnvPatch {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const patch: WlgEnvPatch = {};
  const url = asTrimmed(b.wavelogUrl);
  if (url !== undefined) patch.wavelogUrl = url;
  if (b.apiKey !== undefined) patch.apiKey = String(b.apiKey ?? "");
  const stationId = asTrimmed(b.stationId);
  if (stationId !== undefined) patch.stationId = stationId;
  const radioName = asTrimmed(b.radioName);
  if (radioName !== undefined) patch.radioName = radioName;
  const hamlibHost = asTrimmed(b.hamlibHost);
  if (hamlibHost !== undefined) patch.hamlibHost = hamlibHost;
  const hamlibPort = asPort(b.hamlibPort);
  if (hamlibPort !== undefined) patch.hamlibPort = hamlibPort;
  const udpPort = asPort(b.udpPort);
  if (udpPort !== undefined) patch.udpPort = udpPort;
  const qsyPort = asPort(b.qsyPort);
  if (qsyPort !== undefined) patch.qsyPort = qsyPort;
  const publishCat = asBool(b.publishCat);
  if (publishCat !== undefined) patch.publishCat = publishCat;
  const folder = asTrimmed(b.folder);
  if (folder !== undefined) patch.folder = folder;
  const wavelogFolder = asTrimmed(b.wavelogFolder);
  if (wavelogFolder !== undefined) patch.wavelogFolder = wavelogFolder;
  const wavelogHttpPort = asPort(b.wavelogHttpPort);
  if (wavelogHttpPort !== undefined) patch.wavelogHttpPort = wavelogHttpPort;
  return patch;
}

/** Aplica o patch sem apagar WAVELOG_API_KEY se a chave nova vier vazia. */
export function applyWlgPatch(cur: Record<string, string>, patch: WlgEnvPatch): Record<string, string> {
  const next = { ...cur };
  if (patch.wavelogUrl !== undefined) next.WAVELOG_URL = patch.wavelogUrl;
  if (patch.stationId !== undefined) next.WAVELOG_STATION_ID = patch.stationId;
  if (patch.radioName !== undefined) next.RADIO_NAME = patch.radioName;
  if (patch.hamlibHost !== undefined) next.HAMLIB_HOST = patch.hamlibHost;
  if (patch.hamlibPort !== undefined) next.HAMLIB_PORT = String(patch.hamlibPort);
  if (patch.udpPort !== undefined) next.UDP_PORT = String(patch.udpPort);
  if (patch.qsyPort !== undefined) next.QSY_PORT = String(patch.qsyPort);
  if (patch.publishCat !== undefined) next.PUBLISH_CAT = patch.publishCat ? "1" : "0";
  if (patch.folder !== undefined && patch.folder) next.WLG_FOLDER = patch.folder;
  if (patch.wavelogFolder !== undefined && patch.wavelogFolder) next.WAVELOG_FOLDER = patch.wavelogFolder;
  if (patch.wavelogHttpPort !== undefined) next.WAVELOG_HTTP_PORT = String(patch.wavelogHttpPort);
  if (patch.apiKey !== undefined && patch.apiKey.trim()) {
    next.WAVELOG_API_KEY = patch.apiKey.trim();
  }
  return next;
}

function sudoWriteEnv(body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-n", STATION_SVC, "write-wlg-env"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `write-wlg-env ${code}`));
    });
    child.stdin.write(body);
    child.stdin.end();
  });
}

export function readWlgEnv(): WlgEnvPublic {
  const path = envPath();
  const raw = liveEnvText();
  return envToPublic(parseEnvFile(raw), path);
}

export async function writeWlgEnv(patch: WlgEnvPatch): Promise<WlgEnvPublic> {
  if (process.platform !== "linux") {
    throw new Error("WaveLogGate env só grava na estação Linux");
  }
  const path = envPath();
  const cur = parseEnvFile(liveEnvText());
  const next = applyWlgPatch(cur, patch);
  if (!existsSync(GATE_OPT) && !existsSync(STATION_SVC)) {
    throw new Error(`pasta ${GATE_OPT} ausente`);
  }
  const dest = join(GATE_OPT, ENV_NAME);
  const body = formatEnv(next, liveEnvText());
  let wrote = false;
  if (existsSync(STATION_SVC)) {
    try {
      await sudoWriteEnv(body);
      wrote = true;
    } catch {
      wrote = false;
    }
  }
  if (!wrote) {
    const tmp = `${dest}.${process.pid}.tmp`;
    writeFileSync(tmp, body, { encoding: "utf8" });
    renameSync(tmp, dest);
  }
  if (existsSync(STATION_SVC)) {
    try {
      await execFileAsync("sudo", ["-n", STATION_SVC, "restart-unit", "waveloggate.service"], {
        timeout: 30_000,
        windowsHide: true,
      });
    } catch {
      await execFileAsync("systemctl", ["restart", "waveloggate.service"], { timeout: 30_000, windowsHide: true }).catch(
        () => undefined,
      );
    }
  }
  const saved = readWlgEnv();
  if (patch.udpPort !== undefined && saved.udpPort !== patch.udpPort) {
    throw new Error("gravação do env não persistiu UDP_PORT");
  }
  if (patch.wavelogUrl !== undefined && saved.wavelogUrl !== patch.wavelogUrl) {
    throw new Error("gravação do env não persistiu WAVELOG_URL");
  }
  if (patch.apiKey && patch.apiKey.trim() && !saved.hasApiKey) {
    throw new Error("gravação do env não persistiu WAVELOG_API_KEY");
  }
  return saved;
}
