import type { DecodeRow, DigMode } from "./digital-modes-model";

export const CAPTURE_RATE = 48_000;
export const DECODE_RATE = 12_000;

export type PcmChunk = { t0: number; pcm: Int16Array };

export type DecodeLine = { db: number; dt: number; hz: number; message: string };

/** Amostras de 12 kHz de um período: FT8 15 s → 180000; FT4 7,5 s → 90000. */
export function periodSamples(mode: DigMode): number {
  return mode === "FT8" ? 180_000 : 90_000;
}

export function periodSeconds(mode: DigMode): number {
  return mode === "FT8" ? 15 : 7.5;
}

export function chunkStart(nowMs: number, samples: number, rate = CAPTURE_RATE): number {
  return nowMs - (samples / rate) * 1000;
}

export function trimChunks(chunks: PcmChunk[], nowMs: number, keepMs = 22_000): PcmChunk[] {
  const cut = nowMs - keepMs;
  return chunks.filter((c) => c.t0 + (c.pcm.length / CAPTURE_RATE) * 1000 >= cut);
}

/**
 * Monta o período em 12 kHz (média de 4 amostras de 48 kHz).
 * Devolve null quando a escuta não cobriu a maior parte do período.
 */
export function periodAt12k(chunks: PcmChunk[], startMs: number, mode: DigMode): Int16Array | null {
  const n = periodSamples(mode);
  const sum = new Float64Array(n);
  const count = new Uint16Array(n);
  let covered = 0;
  for (const chunk of chunks) {
    const pcm = chunk.pcm;
    const base = Math.round(((chunk.t0 - startMs) * CAPTURE_RATE) / 1000);
    for (let i = 0; i + 3 < pcm.length; i += 4) {
      const src = base + i;
      if (src < 0) continue;
      const idx = src >> 2;
      if (idx >= n) continue;
      const avg = ((pcm[i] ?? 0) + (pcm[i + 1] ?? 0) + (pcm[i + 2] ?? 0) + (pcm[i + 3] ?? 0)) / 4;
      if (count[idx] === 0) covered++;
      sum[idx] += avg;
      count[idx]++;
    }
  }
  if (covered < n * 0.7) return null;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    if (!count[i]) continue;
    const v = Math.round(sum[i]! / count[i]!);
    out[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
  }
  return out;
}

export function pcmDbfs(pcm: Int16Array): number {
  if (!pcm.length) return -120;
  let acc = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = (pcm[i] ?? 0) / 32768;
    acc += v * v;
  }
  return 20 * Math.log10(Math.sqrt(acc / pcm.length) + 1e-12);
}

export function pcmLevel(pcm: Int16Array): number {
  const db = pcmDbfs(pcm);
  const norm = (db + 55) / 40;
  return norm < 0 ? 0 : norm > 1 ? 1 : norm;
}

export function utcStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function rowsFromDecode(lines: DecodeLine[], startMs: number, even: boolean): DecodeRow[] {
  const utc = utcStamp(startMs);
  const out: DecodeRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const message = line.message.trim();
    if (!message || message.startsWith("Error [")) continue;
    out.push({
      id: `${utc}-${Math.round(line.hz)}-${i}-${message}`,
      utc,
      db: Math.round(line.db),
      dt: line.dt,
      hz: Math.round(line.hz),
      message,
      even,
    });
  }
  return out;
}
