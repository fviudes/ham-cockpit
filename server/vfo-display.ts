import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Request } from "express";

const execFileAsync = promisify(execFile);
const HELPER = "/opt/ham-cockpit/bin/vfo-display-ctl";

function clientIp(req: Request) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0]!.trim();
  const real = String(req.headers["x-real-ip"] || "").trim();
  return real || forwarded || req.socket.remoteAddress || "";
}

export function isLoopback(req: Request) {
  const ip = clientIp(req);
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.endsWith("127.0.0.1");
}

export async function vfoDisplayExit() {
  try {
    await execFileAsync("sudo", ["-n", HELPER, "exit"], { timeout: 8000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
