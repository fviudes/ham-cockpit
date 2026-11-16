/**
 * Quadro CI-V 0x27 0x00 do scope Icom.
 * O Hamlib (icom_parse_spectrum_frame) e o guia do IC-7760 usam o mesmo miolo,
 * depois do subcomando 00: Main/Sub, divisão atual, total, modo, frequências, fora da faixa.
 * No USB o 705/7300 parte em 11 divisões de 475 pontos (0–160). O 7760 parte em 15 e manda 689 pontos (0–200).
 * Na LAN o sweep inteiro vem numa divisão. O scope Sub não entra neste card.
 */

/** Onde a estação escuta o CI-V da serial para desviar o espectro. O rigctld disca esta porta, não o ser2net. */
export const CIV_SCOPE_TAP_HOST = "127.0.0.1";
export const CIV_SCOPE_TAP_PORT = 4012;

/** Rádios cujo CI-V empurra o 27 00. A rede e o Bluetooth só entram quando o catálogo tem esse enlace. */
const SCOPE_SERIAL = new Set([
  "icom-ic-705",
  "icom-ic-7300",
  "icom-ic-7300mk2",
  "icom-ic-7610",
  "icom-ic-9700",
  "icom-ic-905",
  "icom-ic-7760",
]);
const SCOPE_LAN = new Set([
  "icom-ic-705",
  "icom-ic-7300mk2",
  "icom-ic-7610",
  "icom-ic-9700",
  "icom-ic-905",
  "icom-ic-7760",
]);
const SCOPE_BT = new Set(["icom-ic-705"]);

export type CivScopeLink = "serial" | "lan" | "bluetooth";

export function civScopeOn(equipmentId: string | undefined, link: CivScopeLink): boolean {
  const id = equipmentId || "";
  if (link === "bluetooth") return SCOPE_BT.has(id);
  if (link === "lan") return SCOPE_LAN.has(id);
  return SCOPE_SERIAL.has(id);
}

export function civAddrByte(text: string): number | null {
  const match = String(text || "").trim().match(/^0x([0-9a-fA-F]{2})$/);
  if (!match) return null;
  return Number.parseInt(match[1]!, 16);
}

/**
 * Manual CI-V do IC-705, comando 27 14.
 * Dado 0000 pede o modo centro: o quadro passa a acompanhar o VFO.
 * 0001 seria borda fixa. Cada par de dígitos é um byte, como os outros 27 1x.
 */
export function scopeCenterFrame(to: number): Uint8Array {
  return Uint8Array.from([0xfe, 0xfe, to & 0xff, 0xe0, 0x27, 0x14, 0x00, 0x00, 0xfd]);
}

/** Passos de largura do scope Icom (Hamlib `spectrum_spans`), em Hz totais. */
export const SCOPE_SPAN_STEPS_HZ = [5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000] as const;

/**
 * Largura padrão do card e do comando 27 15: 200 kHz (±100 kHz em torno do VFO).
 * Hamlib 4.6.5: 5, 10, 20, 50, 100, 200, 500 e 1000 kHz — não há 300 kHz.
 */
export const SCOPE_SPAN_HZ = 200_000;

export function normalizeScopeSpan(spanHz: number): number {
  const n = Math.round(spanHz);
  return (SCOPE_SPAN_STEPS_HZ as readonly number[]).includes(n) ? n : SCOPE_SPAN_HZ;
}

/**
 * Comando 27 15, como o Hamlib 4.6.5 manda em icom.c (`RIG_LEVEL_SPECTRUM_SPAN`).
 * O IC-705 não é RIG_TARGETABLE_SPECTRUM, então o primeiro dado é o VFO 0.
 * Os cinco bytes seguintes são o BCD da metade do span (valor ±).
 */
export function scopeSpanData(spanHz: number = SCOPE_SPAN_HZ): number[] {
  const half = normalizeScopeSpan(spanHz) / 2;
  return [0x27, 0x15, 0x00, ...bcd5(half)];
}

export function scopeSpanFrame(to: number, spanHz: number = SCOPE_SPAN_HZ): Uint8Array {
  return Uint8Array.from([0xfe, 0xfe, to & 0xff, 0xe0, ...scopeSpanData(spanHz), 0xfd]);
}

/** 27 10 liga o scope. 27 11 liga a saída do 27 00. Desliga na ordem inversa. */
export function scopeSwitchFrames(to: number, on: boolean): Uint8Array[] {
  const steps = on
    ? [
        [0x27, 0x10, 0x01],
        [0x27, 0x11, 0x01],
      ]
    : [
        [0x27, 0x11, 0x00],
        [0x27, 0x10, 0x00],
      ];
  return steps.map((body) => Uint8Array.from([0xfe, 0xfe, to & 0xff, 0xe0, ...body, 0xfd]));
}

/** Sem quadro do rádio por este tempo, o scope foi esquecido ou a sessão caiu. */
export const SCOPE_WAKE_MS = 2000;

/** Primeiro byte depois de um vão sem resposta. `upSince` vale quando ainda não chegou nada nesta sessão. */
export function scopeRadioWoke(lastRxAt: number, upSince: number, now: number, wakeMs = SCOPE_WAKE_MS): boolean {
  const since = lastRxAt > 0 ? lastRxAt : upSince;
  return since > 0 && now - since >= wakeMs;
}

/** O 27 10/11 saiu, mas o 27 00 não voltou. Frequência CI-V nesse vão pede outro liga. */
export function scopeOutputStale(lastScopeAt: number, armedAt: number, now: number, wakeMs = SCOPE_WAKE_MS): boolean {
  return now - lastScopeAt >= wakeMs && now - armedAt >= wakeMs;
}

/**
 * Resposta de frequência que o rádio já manda (comando 00 ou 03, destino E0).
 * Não é comando novo: só reconhece o quadro que atravessa o tap.
 */
export function isCivFrequencyReply(buf: Uint8Array): boolean {
  for (let i = 0; i + 10 < buf.length; i++) {
    if (buf[i] !== 0xfe || buf[i + 1] !== 0xfe || buf[i + 2] !== 0xe0) continue;
    const cmd = buf[i + 4] ?? 0;
    if (cmd !== 0x00 && cmd !== 0x03) continue;
    const end = Math.min(buf.length, i + 16);
    for (let j = i + 10; j < end; j++) {
      if (buf[j] === 0xfd) return true;
    }
  }
  return false;
}

export type ScopeSweep = {
  startHz: number;
  endHz: number;
  mode: number;
  bins: Uint8Array;
  oor: boolean;
};

const BINS = 689;

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

/** Cinco bytes BCD, nibble baixo primeiro. O inverso de bcdHz. */
function bcd5(hz: number): number[] {
  const out: number[] = [];
  let f = Math.max(0, Math.floor(hz));
  for (let i = 0; i < 5; i++) {
    const lo = f % 10;
    f = Math.floor(f / 10);
    const hi = f % 10;
    f = Math.floor(f / 10);
    out.push((hi << 4) | lo);
  }
  return out;
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
    if (data[1] === 0x01) return null;
    const seq = bcdByte(data[2] ?? 0);
    const seqMax = bcdByte(data[3] ?? 0);
    if (seq < 1 || seqMax < 1) return null;

    if (seq === 1) {
      if (data.length < 16) return null;
      const mode = data[4] ?? 0;
      const left = scopeEdgeHz(data, 5);
      const right = scopeEdgeHz(data, 10);
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

/**
 * O byte de 1 GHz com nibble F marca frequência negativa (scope abaixo de 0 Hz).
 * O Hamlib tira esse nibble antes do BCD.
 */
export function scopeEdgeHz(data: Uint8Array, off: number): number {
  const sign = data[off + 4] ?? 0;
  if ((sign & 0xf0) !== 0xf0) return bcdHz(data, off);
  const copy = data.slice(off, off + 5);
  copy[4] = sign & 0x0f;
  return -bcdHz(copy, 0);
}

/** Modo 0 manda o centro e o span de um lado (±). Os demais mandam as duas bordas. */
function edges(mode: number, left: number, right: number): Header {
  if (mode === 0x00) {
    return { mode, startHz: left - right, endHz: left + right };
  }
  const startHz = Math.min(left, right);
  const endHz = Math.max(left, right);
  return { mode, startHz, endHz };
}
