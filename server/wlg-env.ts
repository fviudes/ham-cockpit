import { execFile } from "node:child_process";
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
  envPath: string;
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
};

function envPath(): string {
  const opt = join(GATE_OPT, ENV_NAME);
  if (existsSync(opt)) return opt;
  const deploy = join(ROOT, "deploy", "wavelog-gate", ENV_NAME);
  if (existsSync(deploy)) return deploy;
  return opt;
}

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
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

function formatEnv(vars: Record<string, string>): string {
  const lines = templateText().split(/\r?\n/);
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

export function readWlgEnv(): WlgEnvPublic {
  const path = envPath();
  const raw = existsSync(path) ? readFileSync(path, "utf8") : templateText();
  const v = parseEnvFile(raw);
  const key = v.WAVELOG_API_KEY ?? "";
  return {
    wavelogUrl: v.WAVELOG_URL || "http://127.0.0.1:8086/index.php",
    stationId: v.WAVELOG_STATION_ID || "1",
    radioName: v.RADIO_NAME || "IC-705",
    hamlibHost: v.HAMLIB_HOST || "127.0.0.1",
    hamlibPort: num(v.HAMLIB_PORT, 4532),
    udpPort: num(v.UDP_PORT, 2333),
    qsyPort: num(v.QSY_PORT, 54321),
    publishCat: bool01(v.PUBLISH_CAT, true),
    hasApiKey: key.trim().length > 0,
    envPath: path,
  };
}

export async function writeWlgEnv(patch: WlgEnvPatch): Promise<WlgEnvPublic> {
  if (process.platform !== "linux") {
    throw new Error("WaveLogGate env só grava na estação Linux");
  }
  const path = envPath();
  const cur = parseEnvFile(existsSync(path) ? readFileSync(path, "utf8") : templateText());

  if (patch.wavelogUrl !== undefined) cur.WAVELOG_URL = String(patch.wavelogUrl).trim();
  if (patch.stationId !== undefined) cur.WAVELOG_STATION_ID = String(patch.stationId).trim();
  if (patch.radioName !== undefined) cur.RADIO_NAME = String(patch.radioName).trim();
  if (patch.hamlibHost !== undefined) cur.HAMLIB_HOST = String(patch.hamlibHost).trim();
  if (patch.hamlibPort !== undefined) cur.HAMLIB_PORT = String(Math.max(1, Math.floor(patch.hamlibPort)));
  if (patch.udpPort !== undefined) cur.UDP_PORT = String(Math.max(1, Math.floor(patch.udpPort)));
  if (patch.qsyPort !== undefined) cur.QSY_PORT = String(Math.max(1, Math.floor(patch.qsyPort)));
  if (patch.publishCat !== undefined) cur.PUBLISH_CAT = patch.publishCat ? "1" : "0";
  if (patch.apiKey !== undefined && patch.apiKey.trim()) {
    cur.WAVELOG_API_KEY = patch.apiKey.trim();
  }

  if (!existsSync(GATE_OPT)) {
    throw new Error(`pasta ${GATE_OPT} ausente`);
  }
  const dest = join(GATE_OPT, ENV_NAME);
  const body = formatEnv(cur);
  const tmp = `${dest}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, dest);

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
  return readWlgEnv();
}