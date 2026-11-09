import { execFile } from "node:child_process";
import { access, copyFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export type WavelogStatus = {
  ok: boolean;
  url: string;
  port: number;
  docker: boolean;
  compose: string;
  reason: "ok" | "down" | "no-docker" | "no-compose" | "error";
  error?: string;
  httpStatus?: number;
};

async function composeDir(): Promise<string> {
  if (process.env.WAVELOG_DIR) return process.env.WAVELOG_DIR;
  const pi = "/opt/wavelog";
  if (await fileExists(join(pi, "docker-compose.yml"))) return pi;
  return join(ROOT, "deploy", "wavelog");
}

async function systemctlWavelog(action: "start" | "stop" | "enable"): Promise<boolean> {
  try {
    await execFileAsync("systemctl", [action, "wavelog.service"], {
      timeout: 120_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function probeWavelog(port = 8086, host = "127.0.0.1"): Promise<{
  ok: boolean;
  httpStatus?: number;
  error?: string;
  url: string;
}> {
  const url = `http://${host}:${port}/`;
  return new Promise((resolve) => {
    const req = httpRequest(url, { method: "GET", timeout: 2500 }, (res) => {
      res.resume();
      const httpStatus = res.statusCode ?? 0;
      resolve({ ok: httpStatus > 0 && httpStatus < 500, httpStatus, url });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout", url });
    });
    req.on("error", (err) => resolve({ ok: false, error: err.message, url }));
    req.end();
  });
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"], {
      timeout: 4000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function wavelogStatus(port = 8086): Promise<WavelogStatus> {
  const compose = await composeDir();
  const url = `http://127.0.0.1:${port}/`;
  const docker = await dockerAvailable();
  const hasCompose = await fileExists(join(compose, "docker-compose.yml"));
  const probe = await probeWavelog(port);
  if (probe.ok) {
    return { ok: true, url, port, docker, compose, reason: "ok", httpStatus: probe.httpStatus };
  }
  if (!hasCompose) {
    return { ok: false, url, port, docker, compose, reason: "no-compose", error: probe.error };
  }
  if (!docker) {
    return { ok: false, url, port, docker, compose, reason: "no-docker", error: probe.error };
  }
  return { ok: false, url, port, docker, compose, reason: "down", error: probe.error };
}

async function ensureEnv(dir: string): Promise<void> {
  const env = join(dir, ".env");
  if (await fileExists(env)) return;
  const example = join(dir, ".env.example");
  if (await fileExists(example)) await copyFile(example, env);
}

export async function wavelogUp(port = 8086): Promise<WavelogStatus> {
  const status = await wavelogStatus(port);
  if (status.ok) return status;
  if (!status.docker) return status;
  if (status.reason === "no-compose") return status;
  try {
    await ensureEnv(status.compose);
    const viaSystemd = (await systemctlWavelog("enable")) && (await systemctlWavelog("start"));
    if (!viaSystemd) {
      await execFileAsync("docker", ["compose", "up", "-d"], {
        cwd: status.compose,
        timeout: 120_000,
        windowsHide: true,
      });
    }
  } catch (err) {
    return { ...status, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
  const after = await wavelogStatus(port);
  return after.ok ? after : { ...after, reason: after.reason === "ok" ? "down" : after.reason };
}

export async function wavelogDown(port = 8086): Promise<WavelogStatus> {
  const stopped = await systemctlWavelog("stop");
  if (!stopped && (await dockerAvailable())) {
    try {
      await execFileAsync("docker", ["compose", "stop"], {
        cwd: await composeDir(),
        timeout: 60_000,
        windowsHide: true,
      });
    } catch {
      /* ignore */
    }
  }
  return wavelogStatus(port);
}
