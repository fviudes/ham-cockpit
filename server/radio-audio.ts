/**
 * Encaminha o áudio USB de recepção da estação para o navegador.
 * O cabo USB do IC-705 / 7300 / 7100 expõe um codec (ALSA), separado do CI-V do ser2net.
 * O navegador toca esse PCM na placa de som do computador.
 * Rede/Wi‑Fi Icom (UDP 50003) fica para um gateway próprio — este socket não abre essa porta.
 *
 * A escuta de FT8 pode ser dona do arecord. O websocket da página só recebe o PCM:
 * sair do menu não mata o processo. Desabilitar mata.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { pickAlsaCapture } from "../shared/pc-audio";
import { consoleSessionOk } from "./console-session";
import { tryWsSendBinary, tryWsSendText } from "./ws-backpressure";

const attached = new WeakSet<Server>();
let capture: ChildProcess | null = null;
let captureOwner: WebSocket | null = null;
let captureReserved: WebSocket | "digital" | null = null;
let captureKind: "socket" | "digital" | null = null;
let playbackHold = false;
let digitalWanted = false;
let announced = false;
let captureFault: "none" | null = null;
const taps = new Set<WebSocket>();
let pcmSink: ((chunk: Buffer) => void) | null = null;

const FORMAT = { type: "format", sampleRate: 48000, channels: 1, via: "usb" };

/** O decodificador de FT8 lê o mesmo PCM, sem abrir outro arecord. */
export function setRadioPcmSink(fn: ((chunk: Buffer) => void) | null) {
  pcmSink = fn;
}

/** TX digital: solta o arecord e recusa outro cliente até o aplay terminar. */
export function holdRadioCapture(on: boolean) {
  playbackHold = on;
  if (on) killChild();
  else if (digitalWanted) void beginDigitalCapture();
}

function arecordBin(): string {
  if (existsSync("/usr/bin/arecord")) return "/usr/bin/arecord";
  return "arecord";
}

function sendJson(ws: WebSocket, body: unknown) {
  tryWsSendText(ws, JSON.stringify(body));
}

function killChild() {
  captureOwner = null;
  captureKind = null;
  announced = false;
  const child = capture;
  capture = null;
  if (!child) return;
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode == null && child.signalCode == null) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* o processo já saiu */
      }
    }
  }, 300);
  child.once("close", () => clearTimeout(timer));
}

function stopSocketCapture() {
  if (captureKind === "digital") return;
  killChild();
  if (digitalWanted && !playbackHold) {
    setTimeout(() => {
      if (digitalWanted && !playbackHold && !capture) void beginDigitalCapture();
    }, 200);
  }
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

function releaseStaleCapture() {
  if (captureOwner && captureOwner.readyState !== WebSocket.OPEN) stopSocketCapture();
  if (captureReserved && captureReserved !== "digital" && captureReserved.readyState !== WebSocket.OPEN) captureReserved = null;
}

function fanPcm(chunk: Buffer) {
  if (!pcmSink && !captureOwner && taps.size === 0) return;
  pcmSink?.(chunk);
  if (captureOwner && captureOwner.readyState === WebSocket.OPEN) tryWsSendBinary(captureOwner, chunk);
  for (const ws of taps) {
    if (ws.readyState === WebSocket.OPEN) tryWsSendBinary(ws, chunk);
  }
}

function fanFormat() {
  if (captureOwner) sendJson(captureOwner, FORMAT);
  for (const ws of taps) sendJson(ws, FORMAT);
}

function attachTap(ws: WebSocket) {
  taps.add(ws);
  if (announced) sendJson(ws, FORMAT);
  ws.on("close", () => {
    taps.delete(ws);
  });
}

async function spawnCapture(kind: "socket" | "digital", owner: WebSocket | null): Promise<"on" | "none"> {
  const listing = await listCapture();
  if (playbackHold) return "none";
  if (capture) return "none";
  const hit = pickAlsaCapture(listing);
  if (!hit) return "none";
  const child = spawn(
    arecordBin(),
    ["-D", `plughw:${hit.card},${hit.device}`, "-f", "S16_LE", "-r", "48000", "-c", "1", "-t", "raw"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  capture = child;
  captureKind = kind;
  captureOwner = owner;
  announced = false;
  captureFault = null;
  const fail = (reason: string) => {
    captureFault = "none";
    if (owner && owner.readyState === WebSocket.OPEN) sendJson(owner, { type: "error", reason });
    if (capture === child) killChild();
    if (owner && owner.readyState === WebSocket.OPEN) owner.close();
  };
  child.on("error", () => fail("no-device"));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    if (/audio open error|não encontrado|No such file|Permission denied/i.test(text)) fail("no-device");
  });
  child.stdout.on("data", (chunk: Buffer) => {
    if (!announced) {
      announced = true;
      fanFormat();
    }
    fanPcm(chunk);
  });
  child.on("close", () => {
    if (capture !== child) return;
    capture = null;
    captureOwner = null;
    captureKind = null;
    announced = false;
    if (owner && owner.readyState === WebSocket.OPEN) owner.close();
    if (digitalWanted && !playbackHold && captureFault !== "none") {
      setTimeout(() => {
        if (digitalWanted && !playbackHold && !capture && captureFault !== "none") void beginDigitalCapture();
      }, 500);
    }
  });
  return "on";
}

/** A escuta de FT8 segura o codec. Fechar o websocket da página não para o arecord. */
export async function beginDigitalCapture(): Promise<"on" | "none" | "busy"> {
  digitalWanted = true;
  if (playbackHold) return "busy";
  if (capture && captureKind === "digital") return "on";
  if (capture && captureKind === "socket") {
    captureKind = "digital";
    if (captureOwner) {
      taps.add(captureOwner);
      captureOwner = null;
    }
    return "on";
  }
  if (captureReserved) return "busy";
  captureReserved = "digital";
  try {
    const started = await spawnCapture("digital", null);
    if (started === "on") return "on";
    if (capture && captureKind === "socket") {
      captureKind = "digital";
      if (captureOwner) {
        taps.add(captureOwner);
        captureOwner = null;
      }
      return "on";
    }
    return started === "none" && capture ? "busy" : started;
  } finally {
    if (captureReserved === "digital") captureReserved = null;
  }
}

/** Para o arecord da escuta. Não mexe no PTT. */
export function endDigitalCapture() {
  digitalWanted = false;
  for (const ws of taps) {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  }
  taps.clear();
  killChild();
}

function radioAudioRole(req: IncomingMessage): "pc-audio" | "tap" {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.searchParams.get("role") === "pc-audio") return "pc-audio";
  } catch {
    /* padrão */
  }
  return "tap";
}

async function bindRadioAudio(ws: WebSocket, role: "pc-audio" | "tap") {
  releaseStaleCapture();
  if (playbackHold) {
    sendJson(ws, { type: "error", reason: "busy" });
    ws.close();
    return;
  }
  if (digitalWanted || captureKind === "digital" || capture) {
    if (role === "pc-audio" || digitalWanted) attachTap(ws);
    else {
      sendJson(ws, { type: "error", reason: "off" });
      ws.close();
    }
    return;
  }
  if (role !== "pc-audio") {
    sendJson(ws, { type: "error", reason: "off" });
    ws.close();
    return;
  }
  captureReserved = ws;
  let gone = ws.readyState !== WebSocket.OPEN;
  ws.on("close", () => {
    gone = true;
    if (captureReserved === ws) captureReserved = null;
    if (captureOwner === ws) stopSocketCapture();
  });
  if (gone || ws.readyState !== WebSocket.OPEN) {
    if (captureReserved === ws) captureReserved = null;
    return;
  }
  const started = await spawnCapture("socket", ws);
  if (captureReserved === ws) captureReserved = null;
  if (gone || ws.readyState !== WebSocket.OPEN) {
    if (captureOwner === ws) stopSocketCapture();
    return;
  }
  if (started === "none") {
    sendJson(ws, { type: "error", reason: capture ? "busy" : "no-device" });
    ws.close();
  }
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
    const role = radioAudioRole(req);
    wss.handleUpgrade(req, socket, head, (ws) => {
      void bindRadioAudio(ws, role);
    });
  });
}
