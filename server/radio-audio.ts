/**
 * Encaminha o áudio USB de recepção da estação para o navegador.
 * O cabo USB do IC-705 / 7300 / 7100 expõe um codec (ALSA), separado do CI-V do ser2net.
 * O navegador toca esse PCM na placa de som do computador.
 * Rede/Wi‑Fi Icom (UDP 50003) fica para um gateway próprio — este socket não abre essa porta.
 *
 * A escuta de FT8 pode ser dona do arecord. O websocket da página só recebe o PCM:
 * sair do menu não mata o processo. Desabilitar mata.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { pickAlsaCapture, pickAlsaMmdvmMonitor } from "../shared/pc-audio";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function mmdvmPcmScript(): string {
  const candidates = [
    join(ROOT, "deploy", "mmdvm", "hc-mmdvm-pc-audio.sh"),
    join(ROOT, "bin", "mmdvm-pc-audio.sh"),
    "/opt/ham-cockpit/bin/mmdvm-pc-audio.sh",
    "/opt/ham-cockpit/deploy/mmdvm/hc-mmdvm-pc-audio.sh",
  ];
  return candidates.find((p) => existsSync(p)) ?? "";
}

function mmdvmDecoderReady(): boolean {
  if (process.platform !== "linux") return false;
  const dec = "/opt/ham-cockpit/bin/hc-mmdvm-decode";
  if (!existsSync(dec)) return false;
  try {
    const out = execFileSync("file", [dec], { encoding: "utf8" });
    return /ELF/i.test(out);
  } catch {
    return true;
  }
}
import { consoleSessionOk } from "./console-session";
import { mmdvmStatus } from "./mmdvm";
import { tryWsSendBinary, tryWsSendText } from "./ws-backpressure";

const attached = new WeakSet<Server>();
let capture: ChildProcess | null = null;
let captureOwner: WebSocket | null = null;
let captureReserved: WebSocket | "digital" | null = null;
let captureKind: "socket" | "digital" | "mmdvm" | null = null;
let captureSource: "radio" | "mmdvm" | null = null;
let playbackHold = false;
let digitalWanted = false;
let announced = false;
let captureFault: "none" | null = null;
const taps = new Set<WebSocket>();
let pcmSink: ((chunk: Buffer) => void) | null = null;

let formatAnnounced = { type: "format", sampleRate: 48000, channels: 1, via: "usb" as string };

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
  captureSource = null;
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

/** Troca só o dono do websocket. A captura que já está no ar continua. */
function handoffPcAudio(next: WebSocket) {
  const prev = captureOwner;
  captureOwner = next;
  if (prev && prev !== next && prev.readyState === WebSocket.OPEN) {
    try {
      prev.close();
    } catch {
      /* a sessão antiga já caiu */
    }
  }
  next.on("close", () => {
    if (captureOwner === next) {
      if (captureKind === "mmdvm") killChild();
      else stopSocketCapture();
    }
  });
}

/** O clique novo fica com o alto-falante. A sessão anterior não deixa o botão desligado. */
function takeOverPcAudio(next: WebSocket) {
  const prev = captureOwner;
  if (prev && prev !== next && prev.readyState === WebSocket.OPEN) {
    try {
      prev.close();
    } catch {
      /* a sessão antiga já caiu */
    }
  }
  captureOwner = null;
  if (captureReserved && captureReserved !== "digital" && captureReserved !== next) captureReserved = null;
  if (capture) killChild();
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
  if (captureOwner) sendJson(captureOwner, formatAnnounced);
  for (const ws of taps) sendJson(ws, formatAnnounced);
}

function attachTap(ws: WebSocket) {
  taps.add(ws);
  if (announced) sendJson(ws, formatAnnounced);
  ws.on("close", () => {
    taps.delete(ws);
  });
}

function wireCaptureChild(
  child: ChildProcess,
  kind: "socket" | "digital" | "mmdvm",
  source: "radio" | "mmdvm" | null,
  owner: WebSocket | null,
  failReason: string,
) {
  capture = child;
  captureKind = kind;
  captureSource = source;
  captureOwner = owner;
  announced = false;
  captureFault = null;
  const fail = (reason: string) => {
    captureFault = "none";
    if (owner && owner.readyState === WebSocket.OPEN) sendJson(owner, { type: "error", reason });
    if (capture === child) killChild();
    if (owner && owner.readyState === WebSocket.OPEN) owner.close();
  };
  // O botão do console espera esta mensagem para ficar ligado. Sem amostra
  // (rádio em silêncio ou FIFO do MMDVM ainda sem voz) ela não pode depender do stdout.
  child.on("spawn", () => {
    if (capture !== child || announced) return;
    announced = true;
    fanFormat();
  });
  child.on("error", () => fail(failReason));
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    if (/audio open error|não encontrado|No such file|Permission denied/i.test(text)) fail(failReason);
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    if (!announced) {
      announced = true;
      fanFormat();
    }
    fanPcm(chunk);
  });
  child.on("close", (code) => {
    if (capture !== child) return;
    if (code && code !== 0 && owner && owner.readyState === WebSocket.OPEN && !announced) {
      sendJson(owner, { type: "error", reason: failReason });
    }
    capture = null;
    captureOwner = null;
    captureKind = null;
    captureSource = null;
    announced = false;
    if (owner && owner.readyState === WebSocket.OPEN) owner.close();
    if (digitalWanted && !playbackHold && captureFault !== "none" && kind !== "mmdvm") {
      setTimeout(() => {
        if (digitalWanted && !playbackHold && !capture && captureFault !== "none") void beginDigitalCapture();
      }, 500);
    }
  });
}

async function spawnRadioCapture(kind: "socket" | "digital", owner: WebSocket | null): Promise<"on" | "none"> {
  const listing = await listCapture();
  if (playbackHold) return "none";
  if (capture) return "none";
  const hit = pickAlsaCapture(listing);
  if (!hit) return "none";
  formatAnnounced = { type: "format", sampleRate: 48000, channels: 1, via: "usb" };
  const child = spawn(
    arecordBin(),
    ["-D", `plughw:${hit.card},${hit.device}`, "-f", "S16_LE", "-r", "48000", "-c", "1", "-t", "raw"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  wireCaptureChild(child, kind, "radio", owner, "no-device");
  return "on";
}

async function spawnMmdvmCapture(owner: WebSocket | null): Promise<"on" | "none"> {
  if (playbackHold) return "none";
  if (capture) return "none";
  let hatLabel = "MMDVM";
  let hatMode = "idle";
  try {
    const st = await mmdvmStatus();
    hatLabel = st.hatActiveMode.label;
    hatMode = st.hatActiveMode.id;
    if (process.platform === "linux") {
      mkdirSync("/run/ham-cockpit", { recursive: true });
      writeFileSync(
        "/run/ham-cockpit/mmdvm-hat-mode.json",
        `${JSON.stringify(st.hatActiveMode)}\n`,
        "utf8",
      );
      if (existsSync("/usr/bin/systemctl")) {
        spawn("systemctl", ["start", "--no-block", "ham-cockpit-mmdvm-voice.service"], {
          detached: true,
          stdio: "ignore",
        }).unref();
      }
    }
  } catch {
    /* status opcional */
  }
  formatAnnounced = {
    type: "format",
    sampleRate: 48000,
    channels: 1,
    via: "mmdvm",
    hatLabel,
    hatMode,
  };
  const mmdvmFail = mmdvmDecoderReady() ? "no-device" : "no-decoder";
  const script = mmdvmPcmScript();
  if (script) {
    const child = spawn("bash", [script], { stdio: ["ignore", "pipe", "pipe"] });
    wireCaptureChild(child, "mmdvm", "mmdvm", owner, mmdvmFail);
    return "on";
  }
  const listing = await listCapture();
  const hit = pickAlsaMmdvmMonitor(listing);
  if (!hit) return "none";
  const child = spawn(
    arecordBin(),
    ["-D", `plughw:${hit.card},${hit.device}`, "-f", "S16_LE", "-r", "48000", "-c", "1", "-t", "raw"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  wireCaptureChild(child, "mmdvm", "mmdvm", owner, mmdvmFail);
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
    const started = await spawnRadioCapture("digital", null);
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

function radioAudioRole(req: IncomingMessage): { role: "pc-audio" | "tap"; source: "radio" | "mmdvm" } {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const source = url.searchParams.get("source") === "mmdvm" ? "mmdvm" : "radio";
    if (url.searchParams.get("role") === "pc-audio") return { role: "pc-audio", source };
    return { role: "tap", source: "radio" };
  } catch {
    return { role: "tap", source: "radio" };
  }
}

async function bindRadioAudio(ws: WebSocket, role: "pc-audio" | "tap", source: "radio" | "mmdvm") {
  releaseStaleCapture();
  if (playbackHold) {
    sendJson(ws, { type: "error", reason: "busy" });
    ws.close();
    return;
  }
  if (role !== "pc-audio") {
    if (digitalWanted || captureKind === "digital" || capture) attachTap(ws);
    else {
      sendJson(ws, { type: "error", reason: "off" });
      ws.close();
    }
    return;
  }
  if (source === "radio" && (digitalWanted || captureKind === "digital") && capture) {
    attachTap(ws);
    if (announced) sendJson(ws, formatAnnounced);
    return;
  }
  if (source === "mmdvm" && captureKind === "mmdvm" && capture) {
    handoffPcAudio(ws);
    if (announced) sendJson(ws, formatAnnounced);
    return;
  }
  if (source === "radio" && captureKind === "socket" && capture) {
    handoffPcAudio(ws);
    if (announced) sendJson(ws, formatAnnounced);
    return;
  }
  if (source === "radio" && capture && captureKind === "mmdvm") {
    const listing = await listCapture();
    if (!pickAlsaCapture(listing)) {
      sendJson(ws, { type: "error", reason: "no-device" });
      ws.close();
      return;
    }
  }
  takeOverPcAudio(ws);
  if (source === "mmdvm" && capture && captureKind !== "mmdvm") {
    stopSocketCapture();
    killChild();
  }
  if (source === "radio" && capture && captureKind === "mmdvm") {
    killChild();
  }
  captureReserved = ws;
  let gone = ws.readyState !== WebSocket.OPEN;
  ws.on("close", () => {
    gone = true;
    if (captureReserved === ws) captureReserved = null;
    if (captureOwner === ws) {
      if (captureKind === "mmdvm") killChild();
      else stopSocketCapture();
    }
  });
  if (gone || ws.readyState !== WebSocket.OPEN) {
    if (captureReserved === ws) captureReserved = null;
    return;
  }
  const started =
    source === "mmdvm" ? await spawnMmdvmCapture(ws) : await spawnRadioCapture("socket", ws);
  if (captureReserved === ws) captureReserved = null;
  if (gone || ws.readyState !== WebSocket.OPEN) {
    if (captureOwner === ws) {
      if (captureKind === "mmdvm") killChild();
      else stopSocketCapture();
    }
    return;
  }
  if (started === "none") {
    const reason = capture ? "busy" : source === "mmdvm" ? (mmdvmDecoderReady() ? "no-device" : "no-decoder") : "no-device";
    sendJson(ws, { type: "error", reason });
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
    const { role, source } = radioAudioRole(req);
    wss.handleUpgrade(req, socket, head, (ws) => {
      void bindRadioAudio(ws, role, source);
    });
  });
}
