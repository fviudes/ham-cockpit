/**
 * Encaminha o áudio USB de recepção da estação para o navegador.
 * O cabo USB do IC-705 / 7300 / 7100 expõe um codec (ALSA), separado do CI-V do ser2net.
 * O navegador toca esse PCM na placa de som do computador.
 * Rede/Wi‑Fi Icom (UDP 50003) fica para um gateway próprio — este socket não abre essa porta.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { pickAlsaCapture } from "../shared/pc-audio";
import { consoleSessionOk } from "./console-session";

const attached = new WeakSet<Server>();
let capture: ChildProcess | null = null;

function arecordBin(): string {
  if (existsSync("/usr/bin/arecord")) return "/usr/bin/arecord";
  return "arecord";
}

function sendJson(ws: WebSocket, body: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(body));
}

function stopCapture() {
  const child = capture;
  capture = null;
  if (!child) return;
  child.kill("SIGTERM");
}

async function listCapture(): Promise<string> {
  if (process.platform !== "linux") return "";
  return await new Promise((resolve) => {
    const child = spawn(arecordBin(), ["-l"], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 4000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(out).toString("utf8"));
    });
  });
}

async function bindRadioAudio(ws: WebSocket) {
  if (capture) {
    sendJson(ws, { type: "error", reason: "busy" });
    ws.close();
    return;
  }
  const listing = await listCapture();
  const hit = pickAlsaCapture(listing);
  if (!hit) {
    sendJson(ws, { type: "error", reason: "no-device" });
    ws.close();
    return;
  }
  const child = spawn(
    arecordBin(),
    ["-D", `plughw:${hit.card},${hit.device}`, "-f", "S16_LE", "-r", "48000", "-c", "1", "-t", "raw"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  capture = child;
  let announced = false;
  const fail = (reason: string) => {
    if (ws.readyState === WebSocket.OPEN) sendJson(ws, { type: "error", reason });
    stopCapture();
    if (ws.readyState === WebSocket.OPEN) ws.close();
  };
  child.on("error", () => fail("no-device"));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    if (/audio open error|não encontrado|No such file|Permission denied/i.test(text)) fail("no-device");
  });
  child.stdout.on("data", (chunk: Buffer) => {
    if (!announced) {
      announced = true;
      sendJson(ws, { type: "format", sampleRate: 48000, channels: 1, via: "usb" });
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
  });
  child.on("close", () => {
    if (capture === child) capture = null;
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });
  ws.on("close", () => {
    if (capture === child) stopCapture();
  });
}

export function attachRadioAudio(server: Server) {
  if (attached.has(server)) return;
  attached.add(server);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = req.url?.split("?")[0];
    if (path !== "/ws/radio-audio") return;
    if (!consoleSessionOk(req.headers.cookie)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void bindRadioAudio(ws);
    });
  });
}
