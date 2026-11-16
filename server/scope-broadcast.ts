import { cropScopeSweep, normalizeScopeSpan, SCOPE_SPAN_HZ, type ScopeSweep } from "../shared/icom-scope";
import type { WebSocket } from "ws";
import { tryWsSendText, wsSendWouldBlock } from "./ws-backpressure";

/** Taxa máxima de sweeps para o navegador; o rádio mantém CI-V em taxa cheia. */
export const SCOPE_DISPLAY_MAX_HZ = 12;
export const SCOPE_BROADCAST_MIN_MS = Math.ceil(1000 / SCOPE_DISPLAY_MAX_HZ);

export type ScopeWireSweep = {
  type: "sweep";
  startHz: number;
  endHz: number;
  mode: number;
  binsB64: string;
};

export function scopeSweepWire(sweep: ScopeSweep): ScopeWireSweep {
  return {
    type: "sweep",
    startHz: sweep.startHz,
    endHz: sweep.endHz,
    mode: sweep.mode,
    binsB64: Buffer.from(sweep.bins).toString("base64"),
  };
}

type ClientSlot = { pending: ScopeSweep | null; spanHz: number };

const slots = new WeakMap<WebSocket, ClientSlot>();

function slot(ws: WebSocket): ClientSlot {
  let hit = slots.get(ws);
  if (!hit) {
    hit = { pending: null, spanHz: SCOPE_SPAN_HZ };
    slots.set(ws, hit);
  }
  return hit;
}

export function forgetScopeClient(ws: WebSocket) {
  slots.delete(ws);
}

export function setScopeClientSpan(ws: WebSocket, spanHz?: number) {
  if (spanHz == null || !Number.isFinite(spanHz)) return;
  slot(ws).spanHz = normalizeScopeSpan(spanHz);
}

function wireSweep(ws: WebSocket, sweep: ScopeSweep): ScopeSweep {
  const span = slot(ws).spanHz;
  return cropScopeSweep(sweep, span);
}

function sendOne(ws: WebSocket, sweep: ScopeSweep): boolean {
  const json = JSON.stringify(scopeSweepWire(wireSweep(ws, sweep)));
  return tryWsSendText(ws, json);
}

/** Latest-only por cliente: substitui sweep pendente se o buffer estiver cheio. */
export function deliverScopeSweep(ws: WebSocket, sweep: ScopeSweep): void {
  if (ws.readyState !== ws.OPEN) return;
  const s = slot(ws);
  if (s.pending) {
    s.pending = sweep;
    return;
  }
  if (sendOne(ws, sweep)) return;
  if (wsSendWouldBlock(ws)) s.pending = sweep;
}

export function flushScopePending(ws: WebSocket): void {
  if (ws.readyState !== ws.OPEN) return;
  const s = slot(ws);
  const pending = s.pending;
  if (!pending) return;
  if (sendOne(ws, pending)) s.pending = null;
}

type GroupState = {
  latest: ScopeSweep | null;
  timer: ReturnType<typeof setTimeout> | null;
  lastAt: number;
};

const groups = new WeakMap<Set<WebSocket>, GroupState>();

function groupState(group: Set<WebSocket>): GroupState {
  let g = groups.get(group);
  if (!g) {
    g = { latest: null, timer: null, lastAt: 0 };
    groups.set(group, g);
  }
  return g;
}

function flushGroup(group: Set<WebSocket>, st: GroupState) {
  st.timer = null;
  const sweep = st.latest;
  st.latest = null;
  if (!sweep) return;
  st.lastAt = Date.now();
  for (const ws of group) {
    flushScopePending(ws);
    deliverScopeSweep(ws, sweep);
  }
}

/** Coalesce global do grupo: no máximo ~SCOPE_DISPLAY_MAX_HZ para todos os clientes. */
export function broadcastScopeSweeps(group: Set<WebSocket>, sweep: ScopeSweep) {
  if (group.size === 0) return;
  const st = groupState(group);
  st.latest = sweep;
  const now = Date.now();
  const elapsed = now - st.lastAt;
  if (elapsed >= SCOPE_BROADCAST_MIN_MS) {
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }
    flushGroup(group, st);
    return;
  }
  if (st.timer) return;
  const wait = SCOPE_BROADCAST_MIN_MS - elapsed;
  st.timer = setTimeout(() => flushGroup(group, st), wait);
  st.timer.unref?.();
}