/**
 * Um cliente só no ser2net da serial. O rigctld fala com esta porta.
 * O 27 00 sai para o waterfall e não entra no Hamlib.
 */
import { createServer, Socket, type Server } from "node:net";
import { readFileSync } from "node:fs";
import { peelCivScope } from "../shared/civ-peel";
import {
  CIV_SCOPE_TAP_HOST,
  CIV_SCOPE_TAP_PORT,
  SCOPE_WAKE_MS,
  civAddrByte,
  isCivFrequencyReply,
  scopeCenterFrame,
  scopeOutputStale,
  scopeRadioWoke,
  scopeSpanFrame,
  scopeSwitchFrames,
} from "../shared/icom-scope";
import { hamlibCtl } from "./ser2net-store";
import { currentSerialHamlib, type StationRadio } from "./radios";

type Tap = {
  server: Server;
  upstreamHost: string;
  upstreamPort: number;
  civ: number;
  output: boolean;
  sawScope: boolean;
  samples: number;
  pendingOff: boolean;
  lastRxAt: number;
  upSince: number;
  armedAt: number;
  lastScopeAt: number;
  upDelay: number;
  upTimer: ReturnType<typeof setTimeout> | null;
  down: Socket | null;
  up: Socket | null;
  upRest: Uint8Array;
  chain: Promise<void>;
};

let tap: Tap | null = null;
let onFrame: ((frame: Uint8Array) => void) | null = null;
let onRevive: (() => void) | null = null;

export function onSerialScopeRevive(fn: () => void): () => void {
  onRevive = fn;
  return () => {
    if (onRevive === fn) onRevive = null;
  };
}

export function onSerialScopeFrame(fn: (frame: Uint8Array) => void): () => void {
  onFrame = fn;
  return () => {
    if (onFrame === fn) onFrame = null;
  };
}

export function serialScopeReady(): boolean {
  return tap != null;
}

function scopeTx(state: Tap, on: boolean): Uint8Array[] {
  const frames = scopeSwitchFrames(state.civ, on);
  if (on) {
    frames.push(scopeCenterFrame(state.civ));
    frames.push(scopeSpanFrame(state.civ));
  }
  return frames;
}

function sendFrames(state: Tap, frames: Uint8Array[]): boolean {
  const sock = state.up;
  if (!sock || sock.destroyed) return false;
  for (const frame of frames) writeUp(state, Buffer.from(frame));
  return true;
}

function rearmScope(state: Tap, why: string, force = false): void {
  if (!state.output) return;
  const now = Date.now();
  if (!force && now - state.armedAt < SCOPE_WAKE_MS) return;
  const frames = scopeTx(state, true);
  if (!sendFrames(state, frames)) return;
  state.armedAt = now;
  state.samples = 0;
  const hex = frames.map((frame) => Buffer.from(frame).toString("hex")).join(" ");
  console.log(`civ-scope-tap: ${why}; religando espectro ${hex}`);
  onRevive?.();
}

export function serialScopeOutput(on: boolean): void {
  if (!tap) return;
  tap.output = on;
  tap.sawScope = false;
  tap.samples = 0;
  const frames = scopeTx(tap, on);
  const hex = frames.map((frame) => Buffer.from(frame).toString("hex")).join(" ");
  console.log(`civ-scope-tap: saída do espectro ${on ? "ligada" : "desligada"} ${hex}`);
  if (on) tap.pendingOff = false;
  else tap.pendingOff = true;
  if (!sendFrames(tap, frames)) return;
  if (on) tap.armedAt = Date.now();
  else tap.pendingOff = false;
}

/** 27 14 0000: o scope em modo centro acompanha o VFO. */
export function serialScopeCenter(): void {
  if (!tap) return;
  writeUp(tap, Buffer.from(scopeCenterFrame(tap.civ)));
}

/** 27 14 e 27 15: modo centro com o passo de ±250 kHz. */
export function serialScopeSpan(): void {
  if (!tap) return;
  writeUp(tap, Buffer.from(scopeCenterFrame(tap.civ)));
  writeUp(tap, Buffer.from(scopeSpanFrame(tap.civ)));
}

function writeUp(state: Tap, buf: Buffer): void {
  state.chain = state.chain.then(
    () =>
      new Promise((resolve) => {
        const sock = state.up;
        if (!sock || sock.destroyed) {
          resolve();
          return;
        }
        sock.write(buf, () => resolve());
      }),
  );
}

function dropUp(state: Tap): void {
  if (state.upTimer) {
    clearTimeout(state.upTimer);
    state.upTimer = null;
  }
  const sock = state.up;
  state.up = null;
  state.upRest = new Uint8Array();
  state.lastRxAt = 0;
  if (!sock) return;
  sock.removeAllListeners();
  sock.destroy();
}

function scheduleUp(state: Tap): void {
  if (state.upTimer || state.up) return;
  if (!state.down || state.down.destroyed) return;
  const wait = state.upDelay;
  state.upTimer = setTimeout(() => {
    state.upTimer = null;
    if (tap !== state || state.up) return;
    if (!state.down || state.down.destroyed) return;
    state.upDelay = Math.min(2000, Math.round(Math.max(200, state.upDelay) * 1.5));
    console.log("civ-scope-tap: reconectando upstream");
    connectUp(state);
  }, wait);
  state.upTimer.unref?.();
}

function connectUp(state: Tap): void {
  if (state.up) return;
  const sock = new Socket();
  state.up = sock;
  sock.on("connect", () => {
    state.upSince = Date.now();
    state.lastRxAt = 0;
    state.upDelay = 200;
    if (state.output) {
      rearmScope(state, "upstream reconectou", true);
      return;
    }
    if (state.pendingOff && sendFrames(state, scopeTx(state, false))) {
      state.pendingOff = false;
      console.log("civ-scope-tap: upstream reconectou; espectro desligado");
    }
  });
  sock.on("data", (chunk: Buffer) => {
    const now = Date.now();
    const woke = scopeRadioWoke(state.lastRxAt, state.upSince, now);
    state.lastRxAt = now;
    const pending = new Uint8Array(state.upRest.length + chunk.length);
    pending.set(state.upRest, 0);
    pending.set(chunk, state.upRest.length);
    const peeled = peelCivScope(pending);
    state.upRest = peeled.rest;
    if (peeled.scopes.length) state.lastScopeAt = now;
    for (const frame of peeled.scopes) {
      if (state.samples < 6) {
        state.samples += 1;
        const head = Buffer.from(frame.subarray(0, Math.min(frame.length, 28))).toString("hex");
        console.log(`civ-scope-tap: quadro ${frame.length} ${head}`);
      }
      onFrame?.(frame);
    }
    const down = state.down;
    if (down && !down.destroyed && peeled.forward.length) down.write(Buffer.from(peeled.forward));
    const freq = isCivFrequencyReply(peeled.forward);
    if (state.output && (woke || freq) && scopeOutputStale(state.lastScopeAt, state.armedAt, now)) {
      rearmScope(state, freq ? "frequência CI-V sem espectro" : "rádio respondeu após silêncio");
    } else if (!state.output && state.pendingOff && (woke || freq) && sendFrames(state, scopeTx(state, false))) {
      state.pendingOff = false;
      console.log("civ-scope-tap: rádio respondeu; espectro desligado");
    }
  });
  sock.on("error", () => {
    if (state.up !== sock) return;
    dropUp(state);
    scheduleUp(state);
  });
  sock.on("close", () => {
    if (state.up !== sock) return;
    state.up = null;
    state.upRest = new Uint8Array();
    scheduleUp(state);
  });
  sock.connect(state.upstreamPort, state.upstreamHost);
}

function radioEndpoint(row: StationRadio): { host: string; port: number } | null {
  const match = row.port.trim().match(/^(.*):(\d+)$/);
  if (!match) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === CIV_SCOPE_TAP_PORT) return null;
  const civ = civAddrByte(row.civAddr);
  if (civ == null) return null;
  return { host: match[1] || CIV_SCOPE_TAP_HOST, port };
}

function closeTap(): Promise<void> {
  const cur = tap;
  tap = null;
  if (!cur) return Promise.resolve();
  cur.down?.destroy();
  dropUp(cur);
  return new Promise((resolve) => cur.server.close(() => resolve()));
}

async function rigctldUsesTap(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    const { stdout } = await exec("systemctl", ["show", "-p", "MainPID", "--value", "rigctld@ic705.service"], {
      timeout: 4000,
      windowsHide: true,
    });
    const pid = String(stdout).trim();
    if (!pid || pid === "0") return false;
    const cmd = readFileSync(`/proc/${pid}/cmdline`);
    return cmd.includes(`${CIV_SCOPE_TAP_HOST}:${CIV_SCOPE_TAP_PORT}`);
  } catch {
    return false;
  }
}

function openTap(row: StationRadio, endpoint: { host: string; port: number }): Promise<void> {
  if (
    tap &&
    tap.upstreamHost === endpoint.host &&
    tap.upstreamPort === endpoint.port &&
    tap.civ === (civAddrByte(row.civAddr) ?? -1)
  ) {
    return Promise.resolve();
  }
  return closeTap().then(
    () =>
      new Promise((resolve, reject) => {
        const server = createServer((down) => {
          const state = tap;
          if (!state) {
            down.destroy();
            return;
          }
          try {
            const prev = state.down;
            state.down = down;
            if (prev) {
              prev.removeAllListeners();
              prev.destroy();
            }
            down.on("data", (chunk: Buffer) => writeUp(state, chunk));
            down.on("error", () => undefined);
            down.on("close", () => {
              if (state.down !== down) return;
              state.down = null;
              dropUp(state);
            });
            if (!state.up) connectUp(state);
          } catch (err) {
            console.error("civ-scope-tap", err);
            down.destroy();
          }
        });
        const civ = civAddrByte(row.civAddr) ?? 0;
        tap = {
          server,
          upstreamHost: endpoint.host,
          upstreamPort: endpoint.port,
          civ,
          output: false,
          sawScope: false,
          samples: 0,
          pendingOff: false,
          lastRxAt: 0,
          upSince: 0,
          armedAt: 0,
          lastScopeAt: 0,
          upDelay: 200,
          upTimer: null,
          down: null,
          up: null,
          upRest: new Uint8Array(),
          chain: Promise.resolve(),
        };
        server.once("error", reject);
        server.listen(CIV_SCOPE_TAP_PORT, CIV_SCOPE_TAP_HOST, () => {
          server.off("error", reject);
          resolve();
        });
      }),
  );
}

/** Abre ou fecha o tap conforme o rádio serial. Não reinicia o rigctld. */
export async function prepareSerialScopeTap(): Promise<boolean> {
  const row = currentSerialHamlib();
  const endpoint = row && row.link === "usb" && row.proto === "civ" && row.scope ? radioEndpoint(row) : null;
  if (!row || !endpoint) {
    await closeTap();
    return false;
  }
  await openTap(row, endpoint);
  return true;
}

/** Deixa a 4012 no estado do rádio e só reinicia o rigctld quando a porta discada precisa mudar. */
export async function syncSerialScopeTap(): Promise<void> {
  const listening = await prepareSerialScopeTap();
  const onTap = await rigctldUsesTap();
  if (listening !== onTap) await hamlibCtl("start");
}
