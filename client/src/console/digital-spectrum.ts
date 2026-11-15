/** Espectro do PCM de recepção. Sem amostras, o chamador não pede coluna. */

function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const even = i + k;
        const odd = even + half;
        const tRe = wRe * re[odd]! - wIm * im[odd]!;
        const tIm = wRe * im[odd]! + wIm * re[odd]!;
        re[odd] = re[even]! - tRe;
        im[odd] = im[even]! - tIm;
        re[even] = re[even]! + tRe;
        im[even] = im[even]! + tIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

function fftMag(time: Float32Array): Float32Array {
  const n = time.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  re.set(time);
  fftInPlace(re, im);
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i]!, im[i]!);
  return mag;
}

function percentile(values: Float32Array, p: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx] ?? -120;
}

/** Pico linear de cada coluna. Zero se o bloco não for uma FFT. */
export function spectrumPeak(
  pcm: Int16Array,
  sampleRate: number,
  startHz: number,
  endHz: number,
  columns: number,
): Float32Array {
  const n = pcm.length;
  const cols = new Float32Array(Math.max(1, columns));
  if (n < 16 || (n & (n - 1)) !== 0) return cols;
  const time = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    time[i] = ((pcm[i] ?? 0) / 32768) * w;
  }
  const mag = fftMag(time);
  const span = Math.max(1, endHz - startHz);
  for (let c = 0; c < cols.length; c++) {
    const hz0 = startHz + (span * c) / cols.length;
    const hz1 = startHz + (span * (c + 1)) / cols.length;
    const i0 = Math.max(1, Math.floor((hz0 * n) / sampleRate));
    const i1 = Math.min(mag.length - 1, Math.ceil((hz1 * n) / sampleRate));
    let peak = 0;
    for (let i = i0; i <= i1; i++) if (mag[i]! > peak) peak = mag[i]!;
    cols[c] = peak;
  }
  return cols;
}

/**
 * Colunas 0..1 entre startHz e endHz. Silêncio digital (PCM zerado) fica em zero.
 * O piso acompanha o ruído do trecho para a cascata mostrar o áudio que chegou.
 */
export function spectrumColumns(
  pcm: Int16Array,
  sampleRate: number,
  startHz: number,
  endHz: number,
  columns: number,
  gainDb = 0,
  zeroDb = 0,
  flatten = false,
  spec = 30,
): Float32Array {
  const n = pcm.length;
  const cols = new Float32Array(Math.max(1, columns));
  const peak = spectrumPeak(pcm, sampleRate, startHz, endHz, columns);
  if (n < 16 || (n & (n - 1)) !== 0) return cols;
  const db = new Float32Array(cols.length);
  let loud = -240;
  for (let c = 0; c < cols.length; c++) {
    const value = 20 * Math.log10((peak[c] ?? 0) / (n / 2) + 1e-12) + gainDb;
    db[c] = value;
    if (value > loud) loud = value;
  }
  if (loud < -110) return cols;
  const range = Math.max(12, spec);
  const floor = (flatten ? percentile(db, 0.55) : loud - range) + zeroDb;
  for (let c = 0; c < cols.length; c++) {
    const norm = (db[c]! - floor) / range;
    cols[c] = norm < 0 ? 0 : norm > 1 ? 1 : norm;
  }
  return cols;
}

export function peakColumnHz(cols: Float32Array, startHz: number, endHz: number): number {
  let peak = 0;
  let at = 0;
  for (let i = 0; i < cols.length; i++) {
    if (cols[i]! > peak) {
      peak = cols[i]!;
      at = i;
    }
  }
  if (peak <= 0) return startHz;
  return startHz + ((at + 0.5) / cols.length) * (endHz - startHz);
}
