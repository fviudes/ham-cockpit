/**
 * Waterfall do rádio.
 * Rede: quadro CI-V 0x27 0x00, sem entrar no TCP do rigctld.
 * Serial: o Hamlib entrega o espectro em multicast depois de \set_func SPECTRUM.
 * O socket só liga a saída enquanto houver um card aberto.
 */
import dgram from "node:dgram";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { sweepFromHamlib } from "../shared/hamlib-spectrum";
import { ScopeAssembler, scopePayload, type ScopeSweep } from "../shared/icom-scope";
import { consoleSessionOk } from "./console-session";
import { hubRigctl } from "./hamlib-hub";
import { subscribeScopeFrame } from "./icom-scope-hub";
import { icomLanCmd } from "./icom-lan";
import { currentSerialHamlib } from "./radios";

const HAMLIB_PORT = 4532;
const SPECTRUM_PORT = 4533;
const SPECTRUM_GROUP = "224.0.0.1";

const attached = new WeakSet<Server>();
const assembler = new ScopeAssembler();
const lanClients = new Set<WebSocket>();
const serialClients = new Set<WebSocket>();
let scopeOn = false;
let serialOn = false;
let unlisten: (() => void) | null = null;
let spectrumSock: dgram.Socket | null = null;

function sendJson(ws: WebSocket, body: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(body));
}

function broadcast(group: Set<WebSocket>, sweep: ScopeSweep) {
  const body = JSON.stringify({
    type: "sweep",
    startHz: sweep.startHz,
    endHz: sweep.endHz,
    mode: sweep.mode,
    bins: Array.from(sweep.bins),
  });
  for (const ws of group) sendJson(ws, body);
}

async function setLanScope(on: boolean) {
  if (scopeOn === on) return { ok: true as const };
  scopeOn = on;
  assembler.reset();
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
    const sweep = assembler.push(payload);
    if (sweep) broadcast(lanClients, sweep);
  });
}

function stopSpectrum() {
  const sock = spectrumSock;
  spectrumSock = null;
  serialOn = false;
  if (!sock) return;
  try {
    sock.close();
  } catch {
    /* já fechado */
  }
}

async function setSerialScope(on: boolean) {
  const radio = currentSerialHamlib();
  if (!radio?.scope) return { ok: false as const, error: "off" };
  if (serialOn === on && (on ? spectrumSock : !spectrumSock)) return { ok: true as const };
  const cmd = await hubRigctl(HAMLIB_PORT, `\\set_func SPECTRUM ${on ? 1 : 0}`, "127.0.0.1", 2500);
  if (!cmd.ok) {
    if (on) stopSpectrum();
    return { ok: false as const, error: cmd.error || "hamlib" };
  }
  if (!on) {
    stopSpectrum();
    return { ok: true as const };
  }
  serialOn = true;
  const opened = await new Promise<boolean>((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    spectrumSock = sock;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    sock.on("message", (msg) => {
      if (serialClients.size === 0) return;
      const sweep = sweepFromHamlib(msg.toString("utf8"));
      if (sweep) broadcast(serialClients, sweep);
    });
    sock.on("error", () => {
      if (spectrumSock === sock) stopSpectrum();
      finish(false);
    });
    sock.bind(SPECTRUM_PORT, () => {
      try {
        sock.addMembership(SPECTRUM_GROUP);
      } catch {
        /* sem grupo multicast neste host; o pacote local ainda pode chegar */
      }
      finish(true);
    });
  });
  if (!opened) return { ok: false as const, error: "multicast" };
  return { ok: true as const };
}

async function bind(ws: WebSocket, via: string) {
  if (via === "serial") {
    serialClients.add(ws);
    const result = await setSerialScope(true);
    if (!result.ok) sendJson(ws, { type: "error", reason: result.error || "serial" });
    else sendJson(ws, { type: "ready", via: "serial" });
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
