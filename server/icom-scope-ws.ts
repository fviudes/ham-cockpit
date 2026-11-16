/**
 * Waterfall do rádio.
 * Rede e serial: quadro CI-V 0x27 0x00, sem entrar no TCP do rigctld.
 * A serial desvia esse quadro no tap. O Bluetooth monta o mesmo quadro no navegador.
 * O socket só liga a saída (27 10 / 27 11) enquanto houver um card aberto.
 */
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { ScopeAssembler, civScopeOn, scopePayload, type ScopeSweep } from "../shared/icom-scope";
import {
  onSerialScopeFrame,
  onSerialScopeRevive,
  prepareSerialScopeTap,
  serialScopeCenter,
  serialScopeOutput,
  serialScopeReady,
  serialScopeSpan,
} from "./civ-scope-tap";
import { SCOPE_SPAN_HZ } from "../shared/icom-scope";
import { consoleSessionOk } from "./console-session";
import { subscribeScopeFrame } from "./icom-scope-hub";
import { icomLanCmd } from "./icom-lan";
import { currentSerialHamlib } from "./radios";

const attached = new WeakSet<Server>();
const lanAsm = new ScopeAssembler();
const serialAsm = new ScopeAssembler();
const lanClients = new Set<WebSocket>();
const serialClients = new Set<WebSocket>();
let scopeOn = false;
let serialOn = false;
let serialOffTimer: ReturnType<typeof setTimeout> | null = null;
let unlisten: (() => void) | null = null;
let unlistenSerial: (() => void) | null = null;
let serialAsmLogged = false;
let centerAt = 0;

function askScopeCenter(via: "serial" | "lan", span = false, spanHz?: number) {
  const now = Date.now();
  if (!span && now - centerAt < 800) return;
  centerAt = now;
  if (via === "serial") {
    if (span) serialScopeSpan(spanHz);
    else serialScopeCenter();
    return;
  }
  void icomLanCmd(span ? "scopeSpan" : "scopeCenter", spanHz != null ? { spanHz } : {});
}

function sendJson(ws: WebSocket, body: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(body));
}

type ScopeAsk = { kind: "center" } | { kind: "span"; spanHz?: number };

function readScopeAsk(data: unknown): ScopeAsk | null {
  const text = typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString("utf8") : "";
  if (!text) return null;
  try {
    const body = JSON.parse(text) as { type?: string; spanHz?: number };
    if (body.type === "center") return { kind: "center" };
    if (body.type === "span") return { kind: "span", spanHz: body.spanHz };
    return null;
  } catch {
    return null;
  }
}

function broadcast(group: Set<WebSocket>, sweep: ScopeSweep) {
  const body = {
    type: "sweep",
    startHz: sweep.startHz,
    endHz: sweep.endHz,
    mode: sweep.mode,
    bins: Array.from(sweep.bins),
  };
  for (const ws of group) sendJson(ws, body);
}

async function setLanScope(on: boolean) {
  if (scopeOn === on) return { ok: true as const };
  scopeOn = on;
  lanAsm.reset();
  const result = await icomLanCmd("scope", { on });
  if (!result.ok && on) scopeOn = false;
  return result;
}

function ensureLanListen() {
  if (unlisten) return;
  unlisten = subscribeScopeFrame((frame) => {
    if (lanClients.size === 0) return;
    const payload = scopePayload(frame);
    if (!payload) return;
    const sweep = lanAsm.push(payload);
    if (sweep) broadcast(lanClients, sweep);
  });
}

function ensureSerialListen() {
  if (unlistenSerial) return;
  onSerialScopeRevive(() => {
    serialAsm.reset();
    serialAsmLogged = false;
  });
  unlistenSerial = onSerialScopeFrame((frame) => {
    if (serialClients.size === 0) return;
    const payload = scopePayload(frame);
    if (!payload) return;
    const sweep = serialAsm.push(payload);
    if (sweep) {
      if (!serialAsmLogged) {
        serialAsmLogged = true;
        console.log(`civ-scope: varredura ${sweep.bins.length} pontos, ${sweep.startHz}–${sweep.endHz} Hz`);
      }
      broadcast(serialClients, sweep);
      return;
    }
    if (!serialAsmLogged && payload.length <= 24) {
      console.log(`civ-scope: cabeçalho ${Buffer.from(payload).toString("hex")}`);
    }
  });
}

function setSerialScope(on: boolean) {
  const radio = currentSerialHamlib();
  if (!radio?.scope || radio.link !== "usb" || radio.proto !== "civ" || !civScopeOn(radio.equipmentId, "serial")) {
    return { ok: false as const, error: "off" };
  }
  if (on && !serialScopeReady()) return { ok: false as const, error: "tap" };
  ensureSerialListen();
  if (on) {
    if (serialOffTimer) {
      clearTimeout(serialOffTimer);
      serialOffTimer = null;
    }
    if (serialOn) return { ok: true as const };
    serialAsm.reset();
    serialOn = true;
    return { ok: true as const };
  }
  // O navegador fecha o card quando o console reinicia e abre de novo.
  // OFF imediato manda 27 11 no CI-V; o ON seguinte disputa o f/m e os dois caem.
  if (serialOffTimer) return { ok: true as const };
  serialOffTimer = setTimeout(() => {
    serialOffTimer = null;
    if (serialClients.size > 0) return;
    serialOn = false;
    serialAsm.reset();
  }, 4000);
  serialOffTimer.unref?.();
  return { ok: true as const };
}

async function bind(ws: WebSocket, via: string) {
  if (via === "serial") {
    serialClients.add(ws);
    const result = await setSerialScope(true);
    if (!result.ok) {
      sendJson(ws, { type: "error", reason: result.error || "serial" });
      if (result.error === "tap") {
        setTimeout(() => {
          if (serialClients.has(ws)) void setSerialScope(true);
        }, 1500);
      }
    } else {
      sendJson(ws, { type: "ready", via: "serial" });
      void prepareSerialScopeTap().then((ok) => {
        if (!ok) return;
        serialScopeOutput(true);
        serialScopeSpan(SCOPE_SPAN_HZ);
      });
    }
    ws.on("message", (data) => {
      const ask = readScopeAsk(data);
      if (ask) askScopeCenter("serial", ask.kind === "span", ask.kind === "span" ? ask.spanHz : undefined);
    });
    ws.on("close", () => {
      serialClients.delete(ws);
      if (serialClients.size === 0) void setSerialScope(false);
    });
    return;
  }
  lanClients.add(ws);
  ensureLanListen();
  const result = await setLanScope(true);
  if (!result.ok) sendJson(ws, { type: "error", reason: "lan" });
  else sendJson(ws, { type: "ready", via: "lan" });
  ws.on("message", (data) => {
    const ask = readScopeAsk(data);
    if (ask) askScopeCenter("lan", ask.kind === "span", ask.kind === "span" ? ask.spanHz : undefined);
  });
  ws.on("close", () => {
    lanClients.delete(ws);
    if (lanClients.size === 0) void setLanScope(false);
  });
}

export function attachScopeWs(server: Server) {
  if (attached.has(server)) return;
  attached.add(server);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/ws/scope") return;
    if (!consoleSessionOk(req.headers.cookie)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const via = url.searchParams.get("via") === "serial" ? "serial" : "lan";
    wss.handleUpgrade(req, socket, head, (ws) => {
      void bind(ws, via);
    });
  });
}
