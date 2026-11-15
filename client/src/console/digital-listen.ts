import { useEffect, useRef, type MutableRefObject } from "react";
import type { DecodeRow, DigMode } from "./digital-modes-model";
import { periodAt } from "./digital-modes-model";
import { graphEnd } from "./digital-modes-model";
import {
  chunkStart,
  pcmDbfs,
  pcmLevel,
  periodAt12k,
  periodSeconds,
  rowsFromDecode,
  trimChunks,
  type DecodeLine,
  type PcmChunk,
} from "./digital-pcm";
import { spectrumColumns } from "./digital-spectrum";

export type ListenPhase = "off" | "on" | "busy" | "none" | "auth";

type GraphView = { start: number; end: number; gain: number; zero: number; flatten: boolean; spec: number };

const FFT_N = 4096;
const COLS = 256;

export function useDigitalListen(opts: {
  enabled: boolean;
  mode: DigMode;
  graph: GraphView;
  specRef: MutableRefObject<Float32Array | null>;
  onLevel: (level: number, dbfs: number) => void;
  onPhase: (phase: ListenPhase) => void;
  onRows: (rows: DecodeRow[]) => void;
  onDecode: (info: { ran: boolean; count: number } | null) => void;
  /** A decodificação fica no servidor. Aqui só a cascata e o medidor. */
  spectrumOnly?: boolean;
  /** A cascata agrupada fica no servidor. Aqui só o medidor. */
  meterOnly?: boolean;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!opts.enabled) {
      opts.onPhase("off");
      return;
    }
    let generation = 0;
    let skew = 0;
    let clockReady = false;
    let socket: WebSocket | null = null;
    let retry: number | null = null;
    let stopped = false;
    const hold = new Int16Array(FFT_N);
    let fill = 0;
    let lastFft = 0;
    let lastLevel = 0;
    const chunks: PcmChunk[] = [];
    let lastIndex: number | null = null;
    let decoding = false;
    let pending: { pcm: Int16Array; mode: DigMode; startMs: number; even: boolean } | null = null;

    const clearRetry = () => {
      if (retry != null) window.clearTimeout(retry);
      retry = null;
    };

    const schedule = (ms: number, gen: number) => {
      clearRetry();
      retry = window.setTimeout(() => {
        if (!stopped && gen === generation) open(gen);
      }, ms);
    };

    const pumpDecode = () => {
      if (decoding || !pending) return;
      const job = pending;
      pending = null;
      decoding = true;
      const bytes = new Uint8Array(job.pcm.buffer, job.pcm.byteOffset, job.pcm.byteLength);
      void fetch(`/api/digital/decode?mode=${job.mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => null)) as { ran?: boolean; lines?: DecodeLine[] } | null;
          if (stopped) return;
          const ran = Boolean(body && body.ran);
          const lines = ran && Array.isArray(body?.lines) ? body!.lines! : [];
          const rows = ran ? rowsFromDecode(lines, job.startMs, job.even) : [];
          if (rows.length) optsRef.current.onRows(rows);
          optsRef.current.onDecode({ ran, count: rows.length });
        })
        .catch(() => {
          if (!stopped) optsRef.current.onDecode({ ran: false, count: 0 });
        })
        .finally(() => {
          decoding = false;
          if (!stopped) pumpDecode();
        });
    };

    const takePeriod = (now: number) => {
      const mode = optsRef.current.mode;
      const mark = periodAt(now, mode);
      if (lastIndex == null) {
        lastIndex = mark.index;
        return;
      }
      if (lastIndex === mark.index) return;
      const currentStart = now - mark.elapsed * 1000;
      const startMs = currentStart - periodSeconds(mode) * 1000;
      const even = lastIndex % 2 === 0;
      lastIndex = mark.index;
      const slot = periodAt12k(chunks, startMs, mode);
      if (!slot) return;
      pending = { pcm: slot, mode, startMs, even };
      pumpDecode();
    };

    const onPcm = (pcm: Int16Array, now: number) => {
      const t0 = chunkStart(now, pcm.length);
      chunks.push({ t0, pcm });
      const kept = trimChunks(chunks, now);
      if (kept.length !== chunks.length) {
        chunks.length = 0;
        chunks.push(...kept);
      }
      const db = pcmDbfs(pcm);
      const level = pcmLevel(pcm);
      if (now - lastLevel > 120) {
        lastLevel = now;
        optsRef.current.onLevel(level, db);
      }
      if (optsRef.current.meterOnly) {
        if (!optsRef.current.spectrumOnly) takePeriod(now);
        return;
      }
      for (let i = 0; i < pcm.length; i++) {
        hold[fill++] = pcm[i] ?? 0;
        if (fill < FFT_N) continue;
        if (now - lastFft > 70) {
          const view = optsRef.current.graph;
          const snap = hold.slice();
          optsRef.current.specRef.current = spectrumColumns(
            snap,
            48_000,
            view.start,
            view.end,
            COLS,
            view.gain,
            view.zero,
            view.flatten,
            view.spec,
          );
          lastFft = now;
        }
        hold.copyWithin(0, FFT_N / 2);
        fill = FFT_N / 2;
      }
      if (!optsRef.current.spectrumOnly) takePeriod(now);
    };

    const open = (gen: number) => {
      if (stopped || gen !== generation) return;
      let ws: WebSocket;
      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${window.location.host}/ws/radio-audio`);
      } catch {
        optsRef.current.onPhase("none");
        schedule(2000, gen);
        return;
      }
      socket = ws;
      ws.binaryType = "arraybuffer";
      ws.onmessage = (ev) => {
        if (stopped || gen !== generation) return;
        if (typeof ev.data === "string") {
          let msg: { type?: string; reason?: string };
          try {
            msg = JSON.parse(ev.data) as { type?: string; reason?: string };
          } catch {
            return;
          }
          if (msg.type === "error") {
            const reason = msg.reason === "auth" ? "auth" : msg.reason === "busy" ? "busy" : "none";
            optsRef.current.onPhase(reason);
            if (reason === "auth") generation += 1;
            ws.close();
            return;
          }
          if (msg.type === "format") optsRef.current.onPhase("on");
          return;
        }
        if (ev.data instanceof ArrayBuffer && ev.data.byteLength >= 2) {
          if (!clockReady) return;
          const bytes = ev.data.byteLength - (ev.data.byteLength % 2);
          const pcm = new Int16Array(ev.data.slice(0, bytes));
          onPcm(pcm, Date.now() + skew);
        }
      };
      ws.onerror = () => {
        if (gen === generation) optsRef.current.onPhase("none");
      };
      ws.onclose = () => {
        if (stopped || gen !== generation) return;
        schedule(1200, gen);
      };
    };

    generation += 1;
    const clockGiveUp = window.setTimeout(() => {
      clockReady = true;
    }, 2000);
    void fetch("/api/digital/clock", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { now?: number } | null) => {
        if (stopped || typeof body?.now !== "number") return;
        skew = body.now - Date.now();
        clockReady = true;
      })
      .catch(() => undefined);
    open(generation);
    return () => {
      stopped = true;
      generation += 1;
      window.clearTimeout(clockGiveUp);
      clearRetry();
      socket?.close();
      socket = null;
    };
  }, [opts.enabled]);
}

export function graphView(start: number, bins: number, gain: number, zero: number, flatten: boolean, spec: number): GraphView {
  return { start, end: graphEnd(start, bins), gain, zero, flatten, spec };
}
