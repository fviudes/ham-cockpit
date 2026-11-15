/**
 * Quadro CI-V 0x27 0x00 do scope Icom (IC-705, IC-7300 e o mesmo formato nos demais).
 * A 1ª divisão traz modo, frequências e “fora da faixa”. As seguintes trazem a amplitude (0–160).
 * No USB o rádio parte em 11 divisões; na WLAN manda o sweep inteiro numa divisão.
 */

export type ScopeSweep = {
  startHz: number;
  endHz: number;
  mode: number;
  bins: Uint8Array;
  oor: boolean;
};

const BINS = 475;

export function isScopeWaveform(frame: Uint8Array): boolean {
  return (
    frame.length >= 8 &&
    frame[0] === 0xfe &&
    frame[1] === 0xfe &&
    frame[4] === 0x27 &&
    frame[5] === 0x00 &&
    frame[frame.length - 1] === 0xfd
  );
}

/** Bytes depois do comando 0x27, começando no subcomando 0x00. */
export function scopePayload(frame: Uint8Array): Uint8Array | null {
  if (!isScopeWaveform(frame)) return null;
  return frame.subarray(5, frame.length - 1);
}

function bcdByte(n: number): number {
  return ((n >> 4) & 0x0f) * 10 + (n & 0x0f);
}

/** Cinco bytes BCD, nibble baixo primeiro, como a frequência de operação Icom. */
export function bcdHz(data: Uint8Array, off: number): number {
  let hz = 0;
  let mul = 1;
  for (let i = 0; i < 5; i++) {
    const byte = data[off + i] ?? 0;
    hz += (byte & 0x0f) * mul;
    mul *= 10;
    hz += ((byte >> 4) & 0x0f) * mul;
    mul *= 10;
  }
  return hz;
}

type Header = { startHz: number; endHz: number; mode: number };

export class ScopeAssembler {
  private bins = new Uint8Array(BINS);
  private filled = 0;
  private expect = 1;
  private header: Header | null = null;

  reset() {
    this.filled = 0;
    this.expect = 1;
    this.header = null;
  }

  push(data: Uint8Array): ScopeSweep | null {
    if (data.length < 4 || data[0] !== 0x00) return null;
    const seq = bcdByte(data[2] ?? 0);
    const seqMax = bcdByte(data[3] ?? 0);
    if (seq < 1 || seqMax < 1) return null;

    if (seq === 1) {
      if (data.length < 16) return null;
      const mode = data[4] ?? 0;
      const left = bcdHz(data, 5);
      const right = bcdHz(data, 10);
      const oor = data[15] === 0x01;
      this.filled = 0;
      this.expect = 2;
      this.header = edges(mode, left, right);
      if (oor) {
        this.reset();
        return null;
      }
      if (data.length > 16) this.take(data, 16);
      if (seqMax === 1 || this.filled >= BINS) return this.finish();
      return null;
    }

    if (!this.header || seq !== this.expect) {
      this.reset();
      return null;
    }
    this.take(data, 4);
    this.expect = seq + 1;
    if (seq >= seqMax || this.filled >= BINS) return this.finish();
    return null;
  }

  private take(data: Uint8Array, offset: number) {
    const n = Math.min(data.length - offset, BINS - this.filled);
    if (n <= 0) return;
    this.bins.set(data.subarray(offset, offset + n), this.filled);
    this.filled += n;
  }

  private finish(): ScopeSweep | null {
    const header = this.header;
    const n = this.filled;
    if (!header || n < 1) {
      this.reset();
      return null;
    }
    const bins = this.bins.slice(0, n);
    this.reset();
    return { ...header, bins, oor: false };
  }
}

/** Modo 0 é centro + span. Os demais (fixo e scroll) mandam as duas bordas. */
function edges(mode: number, left: number, right: number): Header {
  if (mode === 0x00) {
    const half = right / 2;
    return { mode, startHz: Math.max(0, left - half), endHz: left + half };
  }
  const startHz = Math.min(left, right);
  const endHz = Math.max(left, right);
  return { mode, startHz, endHz };
}
