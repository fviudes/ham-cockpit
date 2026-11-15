export type HzEdge = { startHz: number; endHz: number };

/** Metade da janela do card: 150 kHz para cada lado da linha do VFO. */
export const WATERFALL_HALF_HZ = 150_000;

/**
 * A linha do VFO fica no centro. A vista é sempre tune ± 150 kHz,
 * mesmo quando o scope do rádio é mais largo.
 */
export function centeredSpan(edge: HzEdge, tuneHz: number): HzEdge {
  const center = tuneHz > 0 ? tuneHz : (edge.startHz + edge.endHz) / 2;
  return { startHz: center - WATERFALL_HALF_HZ, endHz: center + WATERFALL_HALF_HZ };
}

/** O quadro do rádio não cobre a janela de ±150 kHz. */
export function scopeMissesView(edge: HzEdge, tuneHz: number): boolean {
  if (!(edge.endHz > edge.startHz)) return false;
  const view = centeredSpan(edge, tuneHz);
  return edge.startHz > view.startHz + 1_000 || edge.endHz < view.endHz - 1_000;
}

/**
 * O VFO saiu do meio do quadro. O scope precisa acompanhar
 * para o próximo 27 00 cobrir a frequência que entrou na vista.
 */
export function scopeOffCenter(edge: HzEdge, tuneHz: number): boolean {
  if (!(tuneHz > 0) || !(edge.endHz > edge.startHz)) return false;
  const mid = (edge.startHz + edge.endHz) / 2;
  const span = edge.endHz - edge.startHz;
  return Math.abs(tuneHz - mid) > Math.max(1_000, span * 0.04);
}

/** Amostra o bin da frequência. Fora do scope não há ponto. */
export function sampleAt(bins: Uint8Array, data: HzEdge, hz: number): number | null {
  if (bins.length < 1 || data.endHz <= data.startHz) return null;
  if (hz < data.startHz || hz > data.endHz) return null;
  const t = (hz - data.startHz) / (data.endHz - data.startHz);
  const i = Math.min(bins.length - 1, Math.max(0, Math.floor(t * (bins.length - 1))));
  return bins[i] ?? 0;
}

/** Marcas que cabem na barra, sem encostar nas bordas. */
export function freqTicks(view: HzEdge, plotPx: number): number[] {
  const span = view.endHz - view.startHz;
  if (span <= 0 || plotPx < 48) return [];
  const maxTicks = Math.max(2, Math.floor(plotPx / 64));
  const rough = span / maxTicks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((c) => c >= rough) ?? rough;
  const start = Math.ceil((view.startHz + step * 0.25) / step) * step;
  const out: number[] = [];
  for (let hz = start; hz < view.endHz - step * 0.25; hz += step) out.push(Math.round(hz));
  return out;
}

export function mhzLabel(hz: number): string {
  return (hz / 1_000_000).toFixed(3);
}

/**
 * Hz sob o clique. x e canvasW são px de layout do canvas.
 * A escala de tempo (gutter à direita) fica fora da faixa útil e não sintoniza.
 */
export function hzAtClick(x: number, canvasW: number, view: HzEdge, gutter = 36): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(canvasW) || !Number.isFinite(gutter) || gutter < 0) return null;
  const plotW = canvasW - gutter;
  if (plotW <= 0 || !(view.endHz > view.startHz)) return null;
  if (x < 0 || x >= plotW) return null;
  return view.startHz + (x / plotW) * (view.endHz - view.startHz);
}

/** Clique sintoniza o kHz inteiro mais próximo, com piso de 100 kHz. */
export function clickedTuneHz(hz: number): number {
  return Math.max(100_000, Math.round(hz / 1000) * 1000);
}

/** No máximo 30 quadros por segundo. */
export const FRAME_MS = 1000 / 30;

const DEFAULT_SWEEP_MS = 250;

/**
 * Pixels que a cachoeira desce nesse intervalo.
 * Com o quadro padrão (1000/30 ms), é o passo de um quadro a 30 FPS:
 * uma varredura percorre exatamente a altura de uma linha.
 */
export function scrollPxPerFrame(intervalMs: number, rowPx: number, frameMs = FRAME_MS): number {
  if (!(intervalMs > 0) || !(rowPx > 0) || !(frameMs > 0)) return 0;
  return (rowPx * frameMs) / intervalMs;
}

/** Intervalo médio entre as varreduras recentes. Sem amostra, cerca de 4 por segundo. */
export function sweepIntervalMs(newestFirst: readonly number[]): number {
  if (newestFirst.length < 2) return DEFAULT_SWEEP_MS;
  const n = Math.min(newestFirst.length - 1, 12);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const dt = newestFirst[i]! - newestFirst[i + 1]!;
    if (dt > 20 && dt < 5000) {
      sum += dt;
      count++;
    }
  }
  return count > 0 ? sum / count : DEFAULT_SWEEP_MS;
}

/** Segura o intervalo se a variação for pequena, para a escala não esticar a cada varredura. */
export function holdSweepInterval(previous: number, measured: number): number {
  if (!(measured > 0)) return previous > 0 ? previous : DEFAULT_SWEEP_MS;
  if (!(previous > 0)) return measured;
  if (Math.abs(measured - previous) / previous < 0.15) return previous;
  return measured;
}

export type FallBand = { index: number; y0: number; y1: number };

/**
 * Faixas da cachoeira, da mais nova para a mais antiga.
 * A linha que acabou de chegar cresce a partir do topo; o histórico desce
 * `scrollPxPerFrame` pixels por quadro, sem esperar o próximo 27 00.
 */
export function waterfallBands(
  timesNewestFirst: readonly number[],
  intervalMs: number,
  rowPx: number,
  now: number,
  heightPx: number,
): FallBand[] {
  if (!timesNewestFirst.length || !(intervalMs > 0) || !(rowPx > 0) || !(heightPx > 0)) return [];
  const bands: FallBand[] = [];
  let y0 = 0;
  for (let i = 0; i < timesNewestFirst.length; i++) {
    const age = now - timesNewestFirst[i]!;
    const y1 = scrollPxPerFrame(intervalMs, rowPx, Math.max(0, age));
    if (y1 > y0 && y0 < heightPx) bands.push({ index: i, y0, y1: Math.min(heightPx, y1) });
    y0 = Math.max(y0, y1);
    if (y0 >= heightPx) break;
  }
  return bands;
}

export function timeMarks(rowCount: number, secPerRow: number, height: number): { y: number; label: string }[] {
  if (height < 8) return [];
  const marks: { y: number; label: string }[] = [{ y: 0, label: "0" }];
  if (rowCount < 2 || secPerRow <= 0) return marks;
  const total = (rowCount - 1) * secPerRow;
  for (let sec = 5; sec <= total + 0.05; sec += 5) {
    const y = (sec / total) * height;
    if (y > height - 10) break;
    marks.push({ y, label: `-${sec}s` });
  }
  return marks;
}
