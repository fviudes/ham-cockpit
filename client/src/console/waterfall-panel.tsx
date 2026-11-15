import { useEffect, useRef, useState } from "react";
import type { ScopeSweep } from "@shared/icom-scope";
import type { I18nKey } from "./i18n";
import { resolvePrimaryRoute } from "./radio-cmd";
import { ic705Ble } from "./ic705-ble";
import { subscribeScope } from "./scope-bus";
import { useConsole } from "./state";
import { PanelTitle } from "./widgets";

const HISTORY = 96;

function ampColor(level: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, level / 160));
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

function khz(hz: number) {
  return `${(hz / 1000).toFixed(1)}`;
}

function paint(canvas: HTMLCanvasElement, rows: Uint8Array[], edge: { startHz: number; endHz: number } | null) {
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
  const specH = Math.max(28, Math.round(h * 0.28));
  const specPx = Math.round(specH * dpr);
  const fallH = bh - specPx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#05080c";
  ctx.fillRect(0, 0, bw, specPx);
  if (fallH > 0 && rows.length) {
    const img = ctx.createImageData(bw, fallH);
    const data = img.data;
    for (let y = 0; y < fallH; y++) {
      const src = rows[Math.min(rows.length - 1, Math.floor((y / fallH) * rows.length))];
      if (!src || src.length < 1) continue;
      for (let x = 0; x < bw; x++) {
        const sample = src[Math.min(src.length - 1, Math.floor((x / bw) * src.length))] ?? 0;
        const [r, g, b] = ampColor(sample);
        const o = (y * bw + x) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, specPx);
  } else {
    ctx.fillRect(0, specPx, bw, Math.max(0, fallH));
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const latest = rows[0];
  if (latest && latest.length) {
    ctx.beginPath();
    ctx.strokeStyle = "#7ee0ff";
    ctx.lineWidth = 1.25;
    for (let x = 0; x < w; x++) {
      const sample = latest[Math.min(latest.length - 1, Math.floor((x / w) * latest.length))] ?? 0;
      const y = specH - 6 - (sample / 160) * (specH - 14);
      if (x === 0) ctx.moveTo(x + 0.5, y);
      else ctx.lineTo(x + 0.5, y);
    }
    ctx.stroke();
  }
  if (edge && edge.endHz > edge.startHz) {
    ctx.fillStyle = "#8ea0b3";
    ctx.font = "10px IBM Plex Mono, ui-monospace, monospace";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(`${khz(edge.startHz)} kHz`, 4, specH - 2);
    ctx.textAlign = "right";
    ctx.fillText(`${khz(edge.endHz)} kHz`, w - 4, specH - 2);
  }
}

/** Card do painel. O sweep chega pelo BLE ou pela rede; o CI-V USB fica com o rigctld. */
export function WaterfallViz() {
  const { s, tx } = useConsole();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowsRef = useRef<Uint8Array[]>([]);
  const edgeRef = useRef<{ startHz: number; endHz: number } | null>(null);
  const [live, setLive] = useState(false);
  const [serialFail, setSerialFail] = useState(false);
  const route = resolvePrimaryRoute(s.radios.items, {
    bleReady: s.ic705.phase === "ready" && s.ic705.ble,
  });
  const via = route.live ? route.transport : "none";
  const serialScope = via === "hamlib" && Boolean(route.radio?.scope);
  const feed = via === "ble" ? "ble" : via === "lan" ? "lan" : serialScope ? "serial" : "off";

  const hint: I18nKey = serialFail
    ? "waterfallSerialFail"
    : feed === "serial" || feed === "ble" || feed === "lan"
      ? "waterfallWait"
      : via === "hamlib"
        ? "waterfallSerialOff"
        : "waterfallIdle";

  useEffect(() => {
    rowsRef.current = [];
    edgeRef.current = null;
    setLive(false);
    setSerialFail(false);
    const canvas = canvasRef.current;
    const draw = () => {
      if (canvas) paint(canvas, rowsRef.current, edgeRef.current);
    };
    const onSweep = (sweep: ScopeSweep) => {
      edgeRef.current = { startHz: sweep.startHz, endHz: sweep.endHz };
      const next = rowsRef.current;
      next.unshift(sweep.bins);
      if (next.length > HISTORY) next.pop();
      setLive(true);
      draw();
    };

    let stop = () => {};
    if (via === "ble") {
      const unsub = subscribeScope(onSweep);
      let alive = true;
      void ic705Ble.setScope(true).then((ok) => {
        if (!alive && ok) void ic705Ble.setScope(false).catch(() => undefined);
      }).catch(() => undefined);
      stop = () => {
        alive = false;
        unsub();
        void ic705Ble.setScope(false).catch(() => undefined);
      };
    } else if (feed === "lan" || feed === "serial") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      let socket: WebSocket | null = null;
      try {
        socket = new WebSocket(`${proto}//${window.location.host}/ws/scope?via=${feed}`);
      } catch {
        socket = null;
      }
      if (socket) {
        socket.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          try {
            const body = JSON.parse(event.data) as {
              type?: string;
              startHz?: number;
              endHz?: number;
              mode?: number;
              bins?: number[];
            };
            if (body.type === "error") {
              setSerialFail(true);
              return;
            }
            if (body.type !== "sweep" || !Array.isArray(body.bins)) return;
            onSweep({
              startHz: Number(body.startHz) || 0,
              endHz: Number(body.endHz) || 0,
              mode: Number(body.mode) || 0,
              bins: Uint8Array.from(body.bins),
              oor: false,
            });
          } catch {
            /* quadro incompleto */
          }
        });
      }
      stop = () => socket?.close();
    }

    const view = canvas?.parentElement;
    const ro = view ? new ResizeObserver(draw) : null;
    if (view && ro) ro.observe(view);
    draw();
    return () => {
      stop();
      ro?.disconnect();
    };
  }, [feed]);

  return (
    <>
      <PanelTitle>{tx("panelWaterfall")}</PanelTitle>
      <div className="relative mt-2 h-64 overflow-hidden rounded-md border border-[rgba(79,195,247,0.28)] bg-[#05080c]">
        <canvas ref={canvasRef} className="h-full w-full" />
        {live ? null : (
          <p className="absolute inset-0 grid place-items-center px-4 text-center text-xs leading-relaxed text-[#8ea0b3]">
            {tx(hint)}
          </p>
        )}
      </div>
    </>
  );
}
