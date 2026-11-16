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
  normalizeScopeSpan,
  scopeSpanFrame,
  scopeSwitchFrames,
  SCOPE_SPAN_HZ,
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
  /** Até este instante o rigctld está esperando resposta. Fora disso o byte não entra no socket dele. */
  replyUntil: number;
  deferred: Uint8Array[] | null;
  replyTimer: ReturnType<typeof setTimeout> | null;
  /** Espectro pausado só enquanto o comando do rigctld ocupa o CI-V. */
  heldScope: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
};

let tap: Tap | null = null;
let onFrame: ((frame: Uint8Array) => void) | null = null;
let onRevive: (() => void) | null = null;
let rigQuiet = false;
let outputWanted = false;
let scopeSpanHz = SCOPE_SPAN_HZ;

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
    frames.push(scopeSpanFrame(state.civ, scopeSpanHz));
  }
  return frames;
}

function writeFrames(state: Tap, frames: Uint8Array[]): boolean {
  const sock = state.up;
  if (!sock || sock.destroyed) return false;
  for (const frame of frames) writeUp(state, Buffer.from(frame));
  return true;
}

function flushDeferred(state: Tap) {
  if (Date.now() < state.replyUntil) return;
  const frames = state.deferred;
  state.deferred = null;
  if (!frames?.length) return;
  writeFrames(state, frames);
}

/** O rigctld só consome o CI-V enquanto há um comando dele no ar. */
function noteRigCommand(state: Tap) {
  // O IC-705 passa de 1,5 s quando o espectro acabou de sair do barramento.
  // Janela curta engole o quadro e o Hamlib devolve timeout.
  const waitMs = 5000;
  state.replyUntil = Date.now() + waitMs;
  if (state.replyTimer) clearTimeout(state.replyTimer);
  state.replyTimer = setTimeout(() => {
    state.replyTimer = null;
    if (tap === state) flushDeferred(state);
  }, waitMs);
  state.replyTimer.unref?.();
}

function sendFrames(state: Tap, frames: Uint8Array[]): boolean {
  if (Date.now() < state.replyUntil) {
    state.deferred = frames;
    return true;
  }
  return writeFrames(state, frames);
}

function rearmScope(_state: Tap, _why: string, _force = false): void {
  // 27 10/27 11 no meio do f/m deixa o CI-V mudo e o chip fica vermelho.
}

function applyScopeOutput(on: boolean): void {
  if (!tap || tap.output === on) return;
  tap.output = on;
  tap.pendingOff = false;
  if (on) tap.armedAt = Date.now();
}

export function serialScopeOutput(on: boolean): void {
  outputWanted = on;
  if (rigQuiet && on) return;
  applyScopeOutput(on);
}

/** O FT8 não manda 27 11. Desligar o espectro no CI-V é o que deixa o chip vermelho. */
export async function withSerialScopeQuiet<T>(fn: () => Promise<T>): Promise<T> {
  if (rigQuiet) return fn();
  rigQuiet = true;
  try {
    return await fn();
  } finally {
    rigQuiet = false;
  }
}

/** O card pede centro a cada varredura. Esse 27 14 no CI-V derruba o f/m. */
export function serialScopeCenter(): void {}

/** Repete 27 15 com a largura pedida no painel (sem novo 27 14). */
export function serialScopeSpan(spanHz?: number): void {
  if (spanHz != null) scopeSpanHz = normalizeScopeSpan(spanHz);
  if (!tap?.output || rigQuiet) return;
  sendFrames(tap, [scopeSpanFrame(tap.civ, scopeSpanHz)]);
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
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        };
        // O callback atrasa quando o ser2net não drena. Fechar aqui derruba
        // a sessão TCP (o daemon continua active) e o CI-V/waterfall morrem
        // até o próximo reconnect — e o ciclo recomeça.
        const timer = setTimeout(() => finish(), 1500);
        try {
          sock.write(buf, finish);
        } catch {
          finish();
        }
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
    state.pendingOff = false;
  });
  sock.on("data", (chunk: Buffer) => {
    const now = Date.now();
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
    const rigWaiting = now < state.replyUntil;
    if (down && !down.destroyed && peeled.forward.length && rigWaiting) down.write(Buffer.from(peeled.forward));
  });
  sock.on("error", () => {
    // Erro de escrita não fecha a sessão. dropUp aqui derruba o TCP do
    // ser2net (o daemon continua active) e o chip fica vermelho.
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
            down.on("data", (chunk: Buffer) => {
              noteRigCommand(state);
              // O f/m sai na hora. 27 11 antes e 27 10 depois deixam o chip
              // verde por um instante e vermelho no comando seguinte.
              const up = state.up;
              if (!up || up.destroyed) return;
              try {
                up.write(chunk);
              } catch {
                /* o close trata a sessão */
              }
            });
            down.on("error", () => undefined);
            down.resume();
            down.on("close", () => {
              if (state.down !== down) return;
              state.down = null;
              // O rigctld pisca a 4012. A sessão com o ser2net fica: senão
              // o TTY cai junto e a 4012 volta a LISTEN sem rádio.
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
          replyUntil: 0,
          deferred: null,
          replyTimer: null,
          heldScope: false,
          holdTimer: null,
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

/** O rigctld tem TCP estabelecido na 4012. CLOSE-WAIT e LISTEN não contam. */
function tapHasRig(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const port = CIV_SCOPE_TAP_PORT.toString(16).toUpperCase().padStart(4, "0");
    const text = readFileSync("/proc/net/tcp", "utf8");
    for (const line of text.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const local = (parts[1] || "").toUpperCase();
      const st = parts[3] || "";
      if (local.endsWith(`:${port}`) && st === "01") return true;
    }
  } catch {
    /* sem /proc */
  }
  return false;
}

/** Abre o tap. Não reinicia o rigctld: o processo de 13:51 segue na 4012. */
export async function syncSerialScopeTap(): Promise<void> {
  await prepareSerialScopeTap();
}
