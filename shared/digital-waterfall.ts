/**
 * Cascata de FT8/FT4 no ritmo do wide graph do WSJT-Z
 * (widgets/mainwindow.cpp, Detector/Detector.cpp, lib/symspec.f90, widgets/widegraph.cpp).
 *
 * FT8 e FT4 põem `m_nsps=6912` e `m_FFTSize = m_nsps/2` (3456). O Detector,
 * com downsample 4, junta 3456 amostras já em 12 kHz (`RX_SAMPLE_RATE`) e aí
 * emite `framesWritten`. symspec.f90 usa o mesmo passo: `jstep=nsps/2`.
 * 3456/12000 s = 288 ms por espectro. widegraph.cpp `dataSink2` soma
 * `WaterfallAvg` espectros (padrão 5) e só então chama `draw()`: uma faixa
 * a cada 288 ms × N Avg. A fronteira do ciclo é `tr < m_tr0`
 * (`tr = (ms/1000) % TRperiod`), sentinela 1e30. FT8 é 15 s e FT4 é 7,5 s.
 *
 * O log fica no servidor enquanto a escuta está ligada. Parar de ler não apaga.
 */
import { periodAt, type DigMode } from "../client/src/console/digital-modes-model";

/** Padrão de `m_settings->value("WaterfallAvg", 5)` em widgets/widegraph.cpp. */
export const WF_AVG_DEFAULT = 5;
export const WF_COLS = 160;
export const WF_START_HZ = 0;
export const WF_END_HZ = 4000;
/** `m_nsps` do wide graph de FT8 e de FT4. Não é o símbolo do modem. */
export const WF_NSPS = 6912;
/** `RX_SAMPLE_RATE` em commons.h. O id2() e o symspec andam nessa taxa. */
export const WF_SPEC_RATE = 12_000;
/** `m_FFTSize = m_nsps/2`. Um espectro a cada este tanto, em 12 kHz. */
export const WF_SPEC_STEP = WF_NSPS / 2;
/** 3456/12000 s. O Detector dispara um espectro neste intervalo. */
export const WF_SPEC_MS = (WF_SPEC_STEP / WF_SPEC_RATE) * 1000;
export const WF_SAMPLE_RATE = 48_000;
/** O mesmo passo no PCM de 48 kHz do codec: 3456 × (48000/12000) = 13824. */
export const WF_HOP = WF_SPEC_STEP * (WF_SAMPLE_RATE / WF_SPEC_RATE);
/**
 * FFT radix-2 que cobre o passo. O ritmo da faixa é o passo de 288 ms,
 * não o comprimento desta janela. nfft3 do symspec é 16384 em 12 kHz;
 * aqui o passo é que entra no log.
 */
export const WF_FFT = 16_384;
/** Vários minutos. O log não cresce para sempre. */
export const WF_WINDOW_MS = 6 * 60 * 1000;
/** Cabe a janela inteira mesmo com N Avg = 1 (uma faixa por espectro de 288 ms). */
export const WF_MAX_STRIPES = 4800;
/** Altura de uma faixa agrupada no canvas. A divisória fica na borda de baixo. */
export const WF_ROW_PX = 6;

const DB_LO = -140;
const DB_HI = 20;

export type FallStripe = {
  seq: number;
  t: number;
  cycle: boolean;
  cols: Uint8Array;
};

export type FallStripeJson = {
  seq: number;
  t: number;
  cycle: boolean;
  cols: string;
};

export type FallPayload = {
  ok: true;
  gen: number;
  avg: number;
  startHz: number;
  endHz: number;
  stripes: FallStripeJson[];
};

export type FallView = {
  startHz: number;
  endHz: number;
  gain: number;
  zero: number;
  flatten: boolean;
  spec: number;
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function quantizeDb(db: number): number {
  if (!Number.isFinite(db) || db < -120) return 0;
  const t = (Math.min(DB_HI, db) - DB_LO) / (DB_HI - DB_LO);
  return Math.max(1, Math.min(255, Math.round(t * 255)));
}

export function dequantDb(q: number): number {
  if (q <= 0) return -240;
  return DB_LO + (q / 255) * (DB_HI - DB_LO);
}

export function dbOfPeak(peak: number, fftN = WF_FFT): number {
  return 20 * Math.log10(peak / (fftN / 2) + 1e-12);
}

export function encodeCols(cols: Uint8Array): string {
  let out = "";
  for (let i = 0; i < cols.length; i += 3) {
    const a = cols[i] ?? 0;
    const b = i + 1 < cols.length ? cols[i + 1]! : 0;
    const c = i + 2 < cols.length ? cols[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < cols.length ? B64[(n >> 6) & 63]! : "=";
    out += i + 2 < cols.length ? B64[n & 63]! : "=";
  }
  return out;
}

export function decodeCols(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i] ?? "A");
    const b = B64.indexOf(clean[i + 1] ?? "A");
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2] ?? "A") : 0;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3] ?? "A") : 0;
    const n = ((a < 0 ? 0 : a) << 18) | ((b < 0 ? 0 : b) << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    if (at < out.length) out[at++] = (n >> 16) & 255;
    if (i + 2 < clean.length && at < out.length) out[at++] = (n >> 8) & 255;
    if (i + 3 < clean.length && at < out.length) out[at++] = n & 255;
  }
  return out;
}

export function sampleDb(cols: Uint8Array, hz: number, startHz = WF_START_HZ, endHz = WF_END_HZ): number {
  if (cols.length < 1 || !(endHz > startHz) || hz < startHz || hz > endHz) return -240;
  const t = (hz - startHz) / (endHz - startHz);
  const i = Math.min(cols.length - 1, Math.max(0, Math.floor(t * cols.length)));
  return dequantDb(cols[i] ?? 0);
}

function percentile(values: Float32Array, p: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx] ?? -120;
}

/** 0..1 na janela visível, com o mesmo piso do espectro da cascata. */
export function viewNorm(cols: Uint8Array, view: FallView, width: number): Float32Array {
  const w = Math.max(1, Math.round(width));
  const out = new Float32Array(w);
  const span = Math.max(1, view.endHz - view.startHz);
  const db = new Float32Array(w);
  let loud = -240;
  let any = false;
  for (let x = 0; x < w; x++) {
    const hz = view.startHz + (span * (x + 0.5)) / w;
    const value = sampleDb(cols, hz);
    if (value > -120) any = true;
    const shown = value + view.gain;
    db[x] = shown;
    if (shown > loud) loud = shown;
  }
  if (!any || loud < -110) return out;
  const range = Math.max(12, view.spec);
  const floor = (view.flatten ? percentile(db, 0.55) : loud - range) + view.zero;
  for (let x = 0; x < w; x++) {
    const norm = (db[x]! - floor) / range;
    out[x] = norm < 0 ? 0 : norm > 1 ? 1 : norm;
  }
  return out;
}

export type FallBand = { y0: number; y1: number; dividerY: number | null };

/**
 * Faixas da mais nova para a mais antiga. A divisória fica na borda
 * que encosta no período anterior (o de baixo, com o mais novo no topo).
 */
export function fallLayout(cycleNewestFirst: readonly boolean[], rowPx = WF_ROW_PX): FallBand[] {
  const px = rowPx > 0 ? rowPx : WF_ROW_PX;
  const bands: FallBand[] = [];
  for (let i = 0; i < cycleNewestFirst.length; i++) {
    const y0 = i * px;
    const y1 = y0 + px;
    bands.push({ y0, y1, dividerY: cycleNewestFirst[i] ? y1 : null });
  }
  return bands;
}

/** A lista de decodes segue o fim. Se o usuário subiu, não arranca o scroll. */
export function stickToBottom(scrollTop: number, scrollHeight: number, clientHeight: number, slack = 24): boolean {
  if (!(scrollHeight > clientHeight + 1)) return true;
  return scrollHeight - scrollTop - clientHeight <= slack;
}

/** A cascata tem o mais novo no topo. */
export function stickToNewest(scrollTop: number, slack = 24): boolean {
  return scrollTop <= slack;
}

export function trimStripes<T extends { t: number }>(rows: readonly T[], now: number, windowMs = WF_WINDOW_MS, max = WF_MAX_STRIPES): T[] {
  const cutoff = now - windowMs;
  const kept = rows.filter((row) => row.t >= cutoff);
  if (kept.length > max) return kept.slice(kept.length - max);
  return kept;
}

export function stripeFromJson(row: FallStripeJson | null | undefined): FallStripe | null {
  if (!row || !Number.isFinite(row.seq) || typeof row.cols !== "string") return null;
  return { seq: row.seq, t: Number(row.t) || 0, cycle: Boolean(row.cycle), cols: decodeCols(row.cols) };
}

/**
 * A tela agrupa este tanto de faixas já prontas numa só.
 * Com o intervalo medido de ~1,44 s, 20 faixas são ~29 s de áudio.
 */
export const WF_COMPACT = 20;

export type CompactRow = {
  cols: Uint8Array;
  t: number;
  /** Fração 0–1 a partir do topo (mais novo) da faixa, na fronteira do ciclo. */
  cuts: number[];
};

/** Junta `factor` faixas numa linha. A divisória fica no instante do ciclo, mesmo dentro da faixa. */
export function compactStripes(stripes: readonly FallStripe[], factor = WF_COMPACT): CompactRow[] {
  const n = Math.max(1, Math.round(factor));
  const rows: CompactRow[] = [];
  for (let i = 0; i < stripes.length; i += n) {
    const chunk = stripes.slice(i, Math.min(stripes.length, i + n));
    const width = chunk.reduce((m, stripe) => Math.max(m, stripe.cols.length), 0);
    const acc = new Float64Array(width);
    for (const stripe of chunk) {
      for (let c = 0; c < stripe.cols.length; c++) acc[c] += stripe.cols[c] ?? 0;
    }
    const cols = new Uint8Array(width);
    for (let c = 0; c < width; c++) cols[c] = Math.round(acc[c]! / chunk.length);
    const cuts: number[] = [];
    chunk.forEach((stripe, j) => {
      if (!stripe.cycle) return;
      const fromNewest = chunk.length - 1 - j;
      cuts.push(Math.min(1, (fromNewest + 1) / n));
    });
    rows.push({ cols, t: chunk[chunk.length - 1]!.t, cuts });
  }
  return rows;
}

/** Tempo entre as duas últimas faixas completas. É o intervalo que a tela passa a mostrar. */
export function compactStepMs(stripes: readonly { t: number }[], factor = WF_COMPACT): number | null {
  const n = Math.max(1, Math.round(factor));
  const groups = Math.floor(stripes.length / n);
  if (groups < 2) return null;
  const last = stripes[groups * n - 1]!;
  const prev = stripes[(groups - 1) * n - 1]!;
  return last.t - prev.t;
}

export type FallLog = {
  setAvg: (n: number) => void;
  avg: () => number;
  gen: () => number;
  clear: () => void;
  push: (peaks: Float32Array, nowMs: number, periodIndex: number) => FallStripe | null;
  since: (after: number) => FallStripe[];
  payload: (after: number) => FallPayload;
};

export function createFallLog(opts?: { windowMs?: number; max?: number }): FallLog {
  const windowMs = opts?.windowMs ?? WF_WINDOW_MS;
  const max = opts?.max ?? WF_MAX_STRIPES;
  let avg = WF_AVG_DEFAULT;
  let gen = 1;
  let seq = 0;
  let count = 0;
  let sum: Float32Array | null = null;
  let wrapped = false;
  let lastIndex: number | null = null;
  const stripes: FallStripe[] = [];

  const trim = (nowMs: number) => {
    const cutoff = nowMs - windowMs;
    while (stripes.length && (stripes[0]!.t < cutoff || stripes.length > max)) stripes.shift();
  };

  return {
    setAvg(n: number) {
      if (!Number.isFinite(n)) return;
      const next = Math.max(1, Math.min(99, Math.round(n)));
      if (next === avg) return;
      avg = next;
      count = 0;
      sum = null;
    },
    avg: () => avg,
    gen: () => gen,
    clear() {
      stripes.length = 0;
      count = 0;
      sum = null;
      wrapped = false;
      lastIndex = null;
      seq = 0;
      gen += 1;
    },
    push(peaks: Float32Array, nowMs: number, periodIndex: number) {
      if (lastIndex == null) lastIndex = periodIndex;
      else if (periodIndex !== lastIndex) {
        wrapped = true;
        lastIndex = periodIndex;
      }
      if (!sum || sum.length !== peaks.length) {
        sum = new Float32Array(peaks.length);
        count = 0;
      }
      if (count === 0) sum.set(peaks);
      else for (let i = 0; i < peaks.length; i++) sum[i] = (sum[i] ?? 0) + (peaks[i] ?? 0);
      count += 1;
      if (count < avg) return null;
      const cols = new Uint8Array(peaks.length);
      for (let i = 0; i < peaks.length; i++) cols[i] = quantizeDb(dbOfPeak((sum[i] ?? 0) / count));
      count = 0;
      const stripe: FallStripe = { seq: (seq += 1), t: nowMs, cycle: wrapped, cols };
      wrapped = false;
      stripes.push(stripe);
      trim(nowMs);
      return stripe;
    },
    since(after: number) {
      if (!(after > 0)) return stripes.slice();
      return stripes.filter((row) => row.seq > after);
    },
    payload(after: number): FallPayload {
      return {
        ok: true,
        gen,
        avg,
        startHz: WF_START_HZ,
        endHz: WF_END_HZ,
        stripes: this.since(after).map((row) => ({
          seq: row.seq,
          t: row.t,
          cycle: row.cycle,
          cols: encodeCols(row.cols),
        })),
      };
    },
  };
}

/** Índice do período Rx. O mesmo relógio do FT8 (15 s) e do FT4 (7,5 s). */
export function rxPeriodIndex(ms: number, mode: DigMode): number {
  return periodAt(ms, mode).index;
}
