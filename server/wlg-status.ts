import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = existsSync("/opt/wavelog-gate/wavelog-gate.mjs")
  ? "/opt/wavelog-gate/wavelog-gate.mjs"
  : join(ROOT, "deploy", "wavelog-gate", "wavelog-gate.mjs");

export type WlgStatus = {
  ok: boolean;
  udpPort: number;
  qsyPort: number;
  reason: "ok" | "down" | "error";
  error?: string;
};

let child: ChildProcess | null = null;

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(`http://127.0.0.1:${port}/status`, { method: "GET", timeout: 1500 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 500);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

const STATION_SVC = "/opt/ham-cockpit/bin/station-svc";

/** start/stop/enable exigem root: via `sudo station-svc` (systemctl direto falhava com polkit). */
async function systemctl(action: "start" | "stop" | "enable" | "is-active"): Promise<boolean> {
  try {
    if (existsSync(STATION_SVC)) {
      const { stdout } = await execFileAsync("sudo", ["-n", STATION_SVC, action, "wlg"], {
        timeout: 30_000,
        windowsHide: true,
      });
      if (action === "is-active") return stdout.trim() === "active";
      return true;
    }
    const { stdout } = await execFileAsync("systemctl", [action, "waveloggate.service"], {
      timeout: 20_000,
      windowsHide: true,
    });
    if (action === "is-active") return stdout.trim() === "active";
    return true;
  } catch {
    return false;
  }
}

export async function wlgStatus(udpPort = 2333, qsyPort = 54321): Promise<WlgStatus> {
  const ok = await probe(qsyPort);
  if (ok) return { ok: true, udpPort, qsyPort, reason: "ok" };
  const unit = process.platform === "linux" ? await systemctl("is-active") : Boolean(child && !child.killed);
  return {
    ok: unit,
    udpPort,
    qsyPort,
    reason: unit ? "ok" : "down",
  };
}

export async function wlgUp(udpPort = 2333, qsyPort = 54321): Promise<WlgStatus> {
  const already = await wlgStatus(udpPort, qsyPort);
  if (already.ok) return already;
  if (process.platform === "linux") {
    await systemctl("enable");
    await systemctl("start");
  } else if (!child || child.killed) {
    child = spawn(process.execPath, [SCRIPT], {
      cwd: dirname(SCRIPT),
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("exit", () => {
      child = null;
    });
  }
  await new Promise((r) => setTimeout(r, 800));
  return wlgStatus(udpPort, qsyPort);
}

export async function wlgDown(udpPort = 2333, qsyPort = 54321): Promise<WlgStatus> {
  if (process.platform === "linux") {
    await systemctl("stop");
  } else if (child) {
    child.kill();
    child = null;
  }
  await new Promise((r) => setTimeout(r, 400));
  return wlgStatus(udpPort, qsyPort);
}
