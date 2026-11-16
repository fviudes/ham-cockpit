import { useEffect, useRef, useState, type MouseEvent } from "react";
import { civScopeOn } from "@shared/icom-scope";
import type { I18nKey } from "./i18n";
import { resolvePrimaryRoute, sendPrimaryCmd } from "./radio-cmd";
import { useConsole } from "./state";
import {
  FRAME_MS,
  PANEL_HISTORY_SEC_DEFAULT,
  PANEL_HISTORY_SEC_OPTIONS,
  freqTicks,
  holdSweepInterval,
  clickedTuneHz,
  hzAtClick,
  mhzLabel,
  panelBinCount,
  panelHistoryCap,
  PANEL_SPAN_HZ,
  PANEL_SPAN_STEPS_HZ,
  panelView,
  sampleAt,
  sweepDisplayFull,
  sweepIntervalMs,
  timeMarks,
  waterfallBands,
} from "./waterfall-view";
import {
  panelWaterfallGetSpan,
  panelWaterfallSendSpan,
  panelWaterfallSetHistorySec,
  panelWaterfallSetSpan,
  panelWaterfallKickIfStale,
  panelWaterfallSubscribe,
  panelWaterfallSnapshot,
  stopPanelWaterfallFeed,
  syncPanelWaterfallFeed,
} from "./panel-waterfall-feed";
import { PanelTitle } from "./widgets";

function ampColor(level: number, full: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, level / full));
  const stops: [number, number, number][] = [
    [4, 8, 16],
    [10, 30, 120],
    [0, 160, 190],
    [40, 200, 80],
    [230, 210, 40],
    [220, 50, 30],
  ];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

const GUTTER = 36;
const BAR_H = 16;
/** Mesmos tons dos chips de serviço no cabeçalho (bg #10b981/15 · texto #34d399). */
const FREQ_BAR = "#10b981";
const BAR_INK = "#34d399";

function signalRgb(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [
    [52, 211, 153],
    [251, 191, 36],
    [239, 68, 68],
  ];
  const scaled = v * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** X do clique em px de layout, mesmo espaço do desenho mesmo com o card em escala. */
function layoutX(canvas: HTMLCanvasElement, clientX: number): number | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0) return null;
  return ((clientX - rect.left) / rect.width) * canvas.clientWidth;
}

type Trace = { bins: Uint8Array; at: number; startHz: number; endHz: number; rf: boolean };

type Atlas = { key: string; canvas: HTMLCanvasElement };

/** Uma linha de espectro por varredura. Cada linha fica no próprio startHz/endHz. */
function buildAtlas(rows: Trace[], tuneHz: number, spanHz: number, plotPx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, plotPx);
  canvas.height = Math.max(1, rows.length);
  const actx = canvas.getContext("2d");
  if (!actx || !rows.length) return canvas;
  const latest = rows[0]!;
  const view = panelView(tuneHz, spanHz);
  const span = Math.max(1, view.endHz - view.startHz);
  const img = actx.createImageData(canvas.width, canvas.height);
  const data = img.data;
  for (let i = 0; i < rows.length; i++) {
    const rowEdge = rows[i]!;
    const bins = rowEdge.bins;
    const full = sweepDisplayFull(bins, rowEdge.rf);
    const row = i * canvas.width * 4;
    for (let x = 0; x < canvas.width; x++) {
      const hz = view.startHz + ((x + 0.5) / canvas.width) * span;
      const sample = rowEdge.rf
        ? (() => {
            const t = (hz - rowEdge.startHz) / span;
            const idx = Math.min(bins.length - 1, Math.max(0, Math.floor(t * bins.length)));
            return bins[idx] ?? 0;
          })()
        : sampleAt(bins, rowEdge, hz);
      const [r, g, b] = sample == null ? [5, 8, 12] : ampColor(sample, full);
      const o = row + x * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  actx.putImageData(img, 0, 0);
  return canvas;
}

function paint(
  canvas: HTMLCanvasElement,
  rows: Trace[],
  tuneHz: number,
  spanHz: number,
  historySec: number,
  atlasRef: { current: Atlas | null },
  sweepMsRef: { current: number },
  gen: number,
  now: number,
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 8 || h < 8) return;
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const plotW = Math.max(8, w - GUTTER);
  const plotPx = Math.max(1, Math.round(plotW * dpr));
  const specH = Math.max(32, Math.round((h - BAR_H) * 0.3));
  const fallTop = specH + BAR_H;
  const fallH = Math.max(0, h - fallTop);
  const edge = rows[0] && rows[0].endHz > rows[0].startHz ? rows[0] : null;
  const view = edge ? panelView(tuneHz, spanHz) : null;
  const span = view ? view.endHz - view.startHz : 1;
  const times = rows.map((row) => row.at);
  const intervalMs = holdSweepInterval(rows.length > 1 ? sweepMsRef.current : 0, sweepIntervalMs(times));
  if (rows.length > 1) sweepMsRef.current = intervalMs;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#05080c";
  ctx.fillRect(0, 0, bw, bh);
  const gutterPx = Math.max(0, bw - Math.floor(plotW * dpr));
  const plotXPx = Math.floor(plotW * dpr);
  ctx.fillStyle = FREQ_BAR;
  ctx.fillRect(plotXPx, 0, gutterPx, bh);

  const historyCap = panelHistoryCap(historySec, intervalMs);
  const visibleRows = rows.filter((row) => now - row.at <= historySec * 1000);

  if (fallH > 0 && visibleRows.length && view && edge) {
    const fallPx = Math.max(1, Math.round(fallH * dpr));
    const rowPx = fallPx / Math.max(1, historyCap);
    const key = `${plotPx}|${tuneHz}|${spanHz}|${gen}`;
    if (!atlasRef.current || atlasRef.current.key !== key) {
      atlasRef.current = { key, canvas: buildAtlas(visibleRows, tuneHz, spanHz, plotPx) };
    }
    const timesVis = visibleRows.map((row) => row.at);
    const bands = waterfallBands(timesVis, intervalMs, rowPx, now, fallPx);
    const fallTopPx = Math.round(fallTop * dpr);
    ctx.imageSmoothingEnabled = false;
    for (let b = bands.length - 1; b >= 0; b--) {
      const band = bands[b]!;
      const src = atlasRef.current.canvas;
      if (band.index < 0 || band.index >= src.height) continue;
      const top = band.y0;
      const bot = Math.min(fallPx, Math.max(top + 1, band.y1 + 1));
      if (bot <= top) continue;
      ctx.drawImage(src, 0, band.index, plotPx, 1, 0, fallTopPx + top, plotPx, bot - top);
    }
    ctx.imageSmoothingEnabled = true;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const latest = visibleRows[0];
  if (latest && latest.bins.length && view && edge) {
    const full = sweepDisplayFull(latest.bins, latest.rf);
    const baseY = specH - 0.5;
    for (let x = 0; x < plotW; x++) {
      const hz = view.startHz + ((x + 0.5) / plotW) * span;
      const sample = latest.rf
        ? (latest.bins[Math.min(latest.bins.length - 1, Math.max(0, Math.floor(((hz - latest.startHz) / span) * latest.bins.length)))] ?? 0)
        : (sampleAt(latest.bins, latest, hz) ?? 0);
      const y = specH - 4 - (sample / full) * (specH - 8);
      const [r, g, b] = signalRgb(sample / full);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, Math.max(1, baseY - y));
    }
    ctx.beginPath();
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 1.25;
    for (let x = 0; x < plotW; x++) {
      const hz = view.startHz + ((x + 0.5) / plotW) * span;
      const sample = latest.rf
        ? (latest.bins[Math.min(latest.bins.length - 1, Math.max(0, Math.floor(((hz - latest.startHz) / span) * latest.bins.length)))] ?? 0)
        : (sampleAt(latest.bins, latest, hz) ?? 0);
      const y = specH - 4 - (sample / full) * (specH - 8);
      if (x === 0) ctx.moveTo(x + 0.5, y);
      else ctx.lineTo(x + 0.5, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = FREQ_BAR;
  ctx.fillRect(0, specH, plotW, BAR_H);
  if (view) {
    ctx.font = "9px IBM Plex Mono, ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = BAR_INK;
    for (const hz of freqTicks(view, plotW)) {
      const x = ((hz - view.startHz) / span) * plotW;
      ctx.fillRect(x, specH, 1, 4);
      ctx.fillText(mhzLabel(hz), x, specH + BAR_H / 2 + 1);
    }
  }

  const cx = plotW / 2 + 0.5;
  ctx.strokeStyle = "rgba(180, 244, 255, 0.35)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();
  ctx.strokeStyle = "#e9fbff";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  ctx.font = "9px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillStyle = BAR_INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (const mark of timeMarks(historySec, fallH)) {
    ctx.fillText(mark.label, plotW + 4, fallTop + mark.y);
  }
}

/** Mantém o feed do waterfall vivo ao trocar de menu no console. */
export function PanelWaterfallCollector({
  getTuneHz,
  feed,
  rfScope,
  via,
}: {
  getTuneHz: () => number;
  feed: "ble" | "lan" | "serial" | "off";
  rfScope: boolean;
  via: string;
}) {
  useEffect(() => {
    syncPanelWaterfallFeed({
      feed,
      rfScope,
      via,
      getTuneHz,
      getSpanHz: () => panelWaterfallGetSpan(),
    });
    return () => stopPanelWaterfallFeed();
  }, [feed, rfScope, via, getTuneHz]);

  return null;
}

/** Card do painel. O sweep chega pelo BLE ou pela rede; o CI-V USB fica com o rigctld. */
export function WaterfallViz() {
  const { s, setS, setFreq, pushLog, tx } = useConsole();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowsRef = useRef<Trace[]>([]);
  const atlasRef = useRef<Atlas | null>(null);
  const sweepMsRef = useRef(0);
  const genRef = useRef(0);
  const tuneRef = useRef(0);
  tuneRef.current = s.vfo === "B" ? s.freqB : s.freq;
  const [spanHz, setSpanHz] = useState(PANEL_SPAN_HZ);
  const [historySec, setHistorySec] = useState(PANEL_HISTORY_SEC_DEFAULT);
  const spanRef = useRef(spanHz);
  spanRef.current = spanHz;
  const historyRef = useRef(historySec);
  historyRef.current = historySec;
  const [live, setLive] = useState(false);
  const liveUi = useRef(false);
  const [serialFail, setSerialFail] = useState(false);
  const serialUi = useRef(false);
  const route = resolvePrimaryRoute(s.radios.items, {
    bleReady: s.ic705.phase === "ready" && s.ic705.ble,
  });
  const via = route.live ? route.transport : "none";
  const equipmentId = route.radio?.equipmentId;
  const bleScope = via === "ble" && (civScopeOn(equipmentId, "bluetooth") || !equipmentId);
  const lanScope = via === "lan" && (civScopeOn(equipmentId, "lan") || (!equipmentId && route.radio?.maker === "icom"));
  const serialScope = via === "hamlib" && Boolean(route.radio?.scope) && civScopeOn(equipmentId, "serial");
  const feed = bleScope ? "ble" : lanScope ? "lan" : serialScope ? "serial" : "off";
  const rfScope = feed !== "off";

  const hint: I18nKey = serialFail
    ? "waterfallSerialFail"
    : feed === "serial" || feed === "ble" || feed === "lan"
      ? "waterfallWait"
      : via === "hamlib"
        ? "waterfallSerialOff"
        : "waterfallIdle";

  useEffect(() => {
    panelWaterfallSetSpan(spanHz);
  }, [spanHz]);

  useEffect(() => {
    panelWaterfallSetHistorySec(historySec);
  }, [historySec]);

  useEffect(() => {
    const pull = () => {
      const shot = panelWaterfallSnapshot();
      rowsRef.current = shot.rows;
      genRef.current = shot.gen;
      sweepMsRef.current = shot.sweepMs;
      if (shot.live !== liveUi.current) {
        liveUi.current = shot.live;
        setLive(shot.live);
      }
      if (shot.serialFail !== serialUi.current) {
        serialUi.current = shot.serialFail;
        setSerialFail(shot.serialFail);
      }
    };
    pull();
    return panelWaterfallSubscribe(pull);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    let raf = 0;
    let last = 0;
    let running = true;
    const draw = () => {
      if (!canvas) return;
      paint(
        canvas,
        rowsRef.current,
        tuneRef.current,
        spanRef.current,
        historyRef.current,
        atlasRef,
        sweepMsRef,
        genRef.current,
        Date.now(),
      );
    };
    const loop = (ts: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (document.visibilityState === "hidden") return;
      if (last !== 0 && ts - last < FRAME_MS) return;
      last = ts;
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    panelWaterfallSendSpan(spanHz, feed, via);
  }, [spanHz, feed, via]);

  useEffect(() => {
    if (feed === "off") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      panelWaterfallKickIfStale();
    }, 2000);
    return () => window.clearInterval(id);
  }, [feed]);

  const tuneClicked = (event: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    const edge = rowsRef.current[0];
    if (!canvas || !edge || edge.endHz <= edge.startHz) return;
    const x = layoutX(canvas, event.clientX);
    if (x == null) return;
    const view = panelView(tuneRef.current, spanRef.current);
    const hz = hzAtClick(x, canvas.clientWidth, view, GUTTER);
    if (hz == null) return;
    const next = clickedTuneHz(hz);
    const which = s.vfo;
    if (which === "B") setS((p) => ({ ...p, freqB: next }));
    else setFreq(next);
    void sendPrimaryCmd(s.radios.items, { type: "setFreq", hz: next }, {
      bleReady: s.ic705.phase === "ready" && s.ic705.ble,
      hamlibPort: s.wlg.hamlibPort || 4532,
    });
    if (s.wlg.publishCat && s.wavelog.running) {
      pushLog("WLOG", `CAT ${next} ${which === "B" ? s.modeB : s.mode} → ${s.wlg.radioName}`);
    }
  };

  const aimPlot = (event: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const x = layoutX(canvas, event.clientX);
    const plotW = canvas.clientWidth - GUTTER;
    const edge = rowsRef.current[0];
    const over = edge != null && edge.endHz > edge.startHz && x != null && x >= 0 && x < plotW;
    const cursor = over ? "pointer" : "default";
    canvas.style.cursor = cursor;
    event.currentTarget.style.cursor = cursor;
  };

  const view = panelView(tuneRef.current, spanHz);
  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        <PanelTitle>{tx("panelWaterfall")}</PanelTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1 text-[10px] tracking-wide text-[#8ea0b3] uppercase">
          Tempo
          <select
            aria-label="Tempo"
            className="h-6 rounded border border-[#1c2a32] bg-[#0b1520] px-1 font-['IBM_Plex_Mono'] text-[11px] normal-case text-[#e8eef4]"
            value={historySec}
            data-history-sec={historySec}
            onChange={(event) => setHistorySec(Number(event.target.value))}
          >
            {PANEL_HISTORY_SEC_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>
                {sec} s
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] tracking-wide text-[#8ea0b3] uppercase">
          Largura
          <select
            aria-label="Largura"
            className="h-6 rounded border border-[#1c2a32] bg-[#0b1520] px-1 font-['IBM_Plex_Mono'] text-[11px] normal-case text-[#e8eef4]"
            value={spanHz}
            data-span-hz={spanHz}
            data-start-hz={view.startHz}
            data-end-hz={view.endHz}
            data-bins={panelBinCount(view.endHz - view.startHz)}
            onChange={(event) => setSpanHz(Number(event.target.value))}
          >
            {PANEL_SPAN_STEPS_HZ.map((hz) => (
              <option key={hz} value={hz}>
                {hz >= 1_000_000 ? "1000 kHz" : `${hz / 1000} kHz`}
              </option>
            ))}
          </select>
        </label>
        </div>
      </div>
      <div
        className="relative h-64 overflow-hidden bg-[#05080c]"
        title={tx("waterfallTune")}
        onMouseMove={aimPlot}
        onMouseLeave={(event) => {
          event.currentTarget.style.cursor = "";
          canvasRef.current?.style.setProperty("cursor", "");
        }}
        onClick={tuneClicked}
      >
        <canvas ref={canvasRef} className="h-full w-full" title={tx("waterfallTune")} />
        {live ? null : (
          <p className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-xs leading-relaxed text-[#8ea0b3]">
            {tx(hint)}
          </p>
        )}
      </div>
    </>
  );
}
