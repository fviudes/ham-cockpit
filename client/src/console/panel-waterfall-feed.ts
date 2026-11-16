import { decodeScopeBins, normalizeScopeSpan, type ScopeSweep } from "@shared/icom-scope";
import { ic705Ble } from "./ic705-ble";
import { subscribeScope } from "./scope-bus";
import {
  PANEL_HISTORY_SEC_DEFAULT,
  PANEL_SPAN_HZ,
  holdSweepInterval,
  panelHistoryCap,
  panelizeRfSweep,
  sweepIntervalMs,
} from "./waterfall-view";

export type PanelTrace = { bins: Uint8Array; at: number; startHz: number; endHz: number; rf: boolean };

type FeedOpts = {
  feed: "ble" | "lan" | "serial" | "off";
  rfScope: boolean;
  via: string;
  getTuneHz: () => number;
  getSpanHz: () => number;
};

let rows: PanelTrace[] = [];
let gen = 0;
let sweepMs = 0;
let serialFail = false;
let live = false;
let listeners = new Set<() => void>();
let activeKey = "";
let activeOpts: FeedOpts | null = null;
let stopFeed: (() => void) | null = null;
let scopeWs: WebSocket | null = null;
let scopeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastSweepAt = 0;
let feedStartedAt = 0;
let historySec = PANEL_HISTORY_SEC_DEFAULT;
let spanHz = PANEL_SPAN_HZ;

function emit() {
  for (const fn of listeners) fn();
}

function pruneRows(now: number) {
  const cap = panelHistoryCap(historySec, sweepMs);
  while (rows.length > cap) rows.pop();
  const floor = now - historySec * 1000;
  while (rows.length && (rows[rows.length - 1]?.at ?? 0) < floor) rows.pop();
}

function pushRow(sweep: ScopeSweep, rf: boolean, tuneHz: number, spanHz: number) {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const tuned = rf ? panelizeRfSweep(sweep, tuneHz, spanHz) : sweep;
  rows.unshift({
    bins: tuned.bins,
    at: Date.now(),
    startHz: tuned.startHz,
    endHz: tuned.endHz,
    rf,
  });
  const times = rows.map((row) => row.at);
  sweepMs = holdSweepInterval(sweepMs, sweepIntervalMs(times));
  pruneRows(Date.now());
  gen += 1;
  live = true;
  lastSweepAt = tuned.at;
  emit();
}

function clearScopeReconnect() {
  if (scopeReconnectTimer) {
    clearTimeout(scopeReconnectTimer);
    scopeReconnectTimer = null;
  }
}

function scheduleScopeReconnect() {
  if (!activeOpts || scopeReconnectTimer) return;
  const feed = activeOpts.feed;
  if (feed !== "lan" && feed !== "serial") return;
  scopeReconnectTimer = window.setTimeout(() => {
    scopeReconnectTimer = null;
    if (!activeOpts || activeOpts.feed !== feed) return;
    syncPanelWaterfallFeed(activeOpts);
  }, 1500);
}

export function panelWaterfallSubscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function panelWaterfallSnapshot() {
  return { rows, gen, sweepMs, serialFail, live };
}

export function panelWaterfallSetHistorySec(sec: number) {
  if (historySec === sec) return;
  historySec = sec;
  pruneRows(Date.now());
  emit();
}

export function panelWaterfallSetSpan(hz: number) {
  spanHz = hz;
}

export function panelWaterfallGetSpan() {
  return spanHz;
}

export function panelWaterfallSetSweepMs(ms: number) {
  sweepMs = ms;
}

export function panelWaterfallSendSpan(spanHz: number, feed: FeedOpts["feed"], via: string) {
  const span = normalizeScopeSpan(spanHz);
  if (via === "ble") {
    void ic705Ble.setScopeSpan(span).catch(() => undefined);
    return;
  }
  const ws = scopeWs;
  if ((feed === "lan" || feed === "serial") && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "span", spanHz: span }));
  }
}

export function syncPanelWaterfallFeed(opts: FeedOpts) {
  const key = `${opts.feed}|${opts.rfScope}|${opts.via}`;
  spanHz = opts.getSpanHz();
  if (key === activeKey && stopFeed) return;
  clearScopeReconnect();
  stopFeed?.();
  stopFeed = null;
  scopeWs = null;
  activeKey = key;
  activeOpts = opts;
  serialFail = false;
  feedStartedAt = Date.now();
  lastSweepAt = 0;

  if (opts.feed === "off") {
    live = rows.length > 0;
    emit();
    return;
  }

  const push = (sweep: ScopeSweep, rf: boolean) => {
    pushRow(sweep, rf, opts.getTuneHz(), opts.getSpanHz());
  };

  let stop = () => {};

  if (opts.via === "ble") {
    const unsub = subscribeScope((sweep) => push(sweep, true));
    let alive = true;
    const armBleScope = (attempt = 0) => {
      void ic705Ble
        .setScope(true)
        .then((ok) => {
          if (!alive && ok) void ic705Ble.setScope(false).catch(() => undefined);
          if (alive && !ok && attempt < 8) window.setTimeout(() => armBleScope(attempt + 1), 400);
        })
        .catch(() => {
          if (alive && attempt < 8) window.setTimeout(() => armBleScope(attempt + 1), 400);
        });
    };
    armBleScope();
    stop = () => {
      alive = false;
      unsub();
      void ic705Ble.setScope(false).catch(() => undefined);
    };
  } else if (opts.feed === "lan" || opts.feed === "serial") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(`${proto}//${window.location.host}/ws/scope?via=${opts.feed}`);
      scopeWs = socket;
    } catch {
      socket = null;
      scopeWs = null;
    }
    if (socket) {
      socket.addEventListener("open", () => {
        serialFail = false;
        socket?.send(JSON.stringify({ type: "span", spanHz: normalizeScopeSpan(opts.getSpanHz()) }));
      });
      socket.addEventListener("close", () => {
        if (scopeWs === socket) scopeWs = null;
        live = false;
        emit();
        scheduleScopeReconnect();
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        try {
          const body = JSON.parse(event.data) as {
            type?: string;
            startHz?: number;
            endHz?: number;
            mode?: number;
            bins?: number[];
            binsB64?: string;
          };
          if (body.type === "error") {
            serialFail = true;
            emit();
            return;
          }
          const bins = body.type === "sweep" ? decodeScopeBins(body) : null;
          if (!bins) return;
          push(
            {
              startHz: Number(body.startHz) || 0,
              endHz: Number(body.endHz) || 0,
              mode: Number(body.mode) || 0,
              bins,
              oor: false,
            },
            true,
          );
        } catch {
          /* quadro incompleto */
        }
      });
    }
    stop = () => socket?.close();
  }

  stopFeed = () => {
    stop();
    scopeWs = null;
  };
}

export function stopPanelWaterfallFeed() {
  clearScopeReconnect();
  stopFeed?.();
  stopFeed = null;
  scopeWs = null;
  activeKey = "";
  activeOpts = null;
}

/** Reabre o feed LAN/serial quando o scope some sem cair o WebSocket. */
export function panelWaterfallKickIfStale(maxMs = 4500) {
  const opts = activeOpts;
  if (!opts || !stopFeed) return;
  if (opts.feed !== "lan" && opts.feed !== "serial") return;
  const now = Date.now();
  if (lastSweepAt > 0 && now - lastSweepAt < maxMs) return;
  if (lastSweepAt === 0 && now - feedStartedAt < maxMs) return;
  clearScopeReconnect();
  stopFeed();
  stopFeed = null;
  scopeWs = null;
  activeKey = "";
  syncPanelWaterfallFeed(opts);
}