import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

const ROOT_LOGIN = "/opt/ham-cockpit/bin/root-login";
const attached = new WeakSet<Server>();

function spawnShell(): ChildProcessWithoutNullStreams {
  const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" };
  if (process.platform === "win32") {
    return spawn("powershell.exe", ["-NoLogo"], { env, windowsHide: true });
  }
  const cwd = existsSync("/root") ? "/root" : process.cwd();
  const rootEnv = { ...env, HOME: "/root", USER: "root", LOGNAME: "root" };
  if (existsSync(ROOT_LOGIN) && existsSync("/usr/bin/script")) {
    return spawn("sudo", ["-n", "/usr/bin/script", "-qefc", ROOT_LOGIN, "/dev/null"], { env: rootEnv, cwd });
  }
  if (existsSync(ROOT_LOGIN)) {
    return spawn("sudo", ["-n", ROOT_LOGIN], { env: rootEnv, cwd });
  }
  return spawn("sudo", ["-n", "/bin/bash", "-l"], { env: rootEnv, cwd });
}

function bindSocket(ws: WebSocket) {
  const proc = spawnShell();
  const send = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };

  send(
    process.platform === "win32"
      ? "Ham Cockpit · PowerShell (neste PC Windows). No Raspberry Pi isso é root.\r\n"
      : "Ham Cockpit · shell root\r\n",
  );

  proc.stdout.on("data", (d: Buffer) => send(d.toString("utf8")));
  proc.stderr.on("data", (d: Buffer) => send(d.toString("utf8")));
  proc.on("error", (err) => send(`\r\n${err.message}\r\n`));
  proc.on("close", (code) => {
    send(`\r\n[exit ${code ?? 0}]\r\n`);
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  ws.on("message", (raw) => {
    const text =
      typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString("utf8")
          : Buffer.from(raw as Buffer).toString("utf8");
    if (text.startsWith("{")) {
      try {
        const msg = JSON.parse(text) as { type?: string };
        if (msg.type === "resize") return;
      } catch {
        /* teclado */
      }
    }
    const payload = process.platform === "win32" ? text.replace(/\r(?!\n)/g, "\r\n") : text;
    proc.stdin.write(payload);
  });
  ws.on("close", () => {
    proc.kill();
  });
}

export function attachTerminal(server: Server) {
  if (attached.has(server)) return;
  attached.add(server);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = req.url?.split("?")[0];
    if (path !== "/ws/term") return;
    wss.handleUpgrade(req, socket, head, (ws) => bindSocket(ws));
  });
}
