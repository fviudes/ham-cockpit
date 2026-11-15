/** Tempos do período FT8/FT4 medidos no comportamento do WSJT-Z. Não é cópia daquele fonte. */

export type SlotMode = "FT8" | "FT4";

export type SlotTiming = {
  period: number;
  pttLead: number;
  toneAt: number;
  tone: number;
  txEnd: number;
  pttTail: number;
  symbols: number;
  samplesPerSymbol: number;
};

export function slotTiming(mode: SlotMode): SlotTiming {
  if (mode === "FT4") {
    return {
      period: 7.5,
      pttLead: 0.02,
      toneAt: 0.3,
      tone: 5.04,
      txEnd: 6.04,
      pttTail: 0.2,
      symbols: 105,
      samplesPerSymbol: 576,
    };
  }
  return {
    period: 15,
    pttLead: 0.2,
    toneAt: 0.5,
    tone: 12.64,
    txEnd: 13.64,
    pttTail: 0.2,
    symbols: 79,
    samplesPerSymbol: 1920,
  };
}

export function playbackPlan(mode: SlotMode) {
  const slot = slotTiming(mode);
  // O aplay começa junto com o PTT, no instante 0 do período.
  // O arquivo traz o silêncio até o tom (0,5 s no FT8) e não é cortado depois.
  const leadSilence = slot.toneAt;
  const trailSilence = slot.txEnd - (slot.toneAt + slot.tone);
  return {
    ...slot,
    leadSilence,
    trailSilence,
    pttDrop: slot.txEnd + slot.pttTail,
    toneSamples: slot.symbols * slot.samplesPerSymbol,
  };
}

/** Bytes em 48 kHz do arquivo inteiro: silêncio, tom (×4 a partir de 12 kHz) e cauda. */
export function playbackBytes(mode: SlotMode) {
  const plan = playbackPlan(mode);
  const lead = Math.round(plan.leadSilence * 48_000) * 2;
  const tone = plan.toneSamples * 8;
  const trail = Math.round(plan.trailSilence * 48_000) * 2;
  return { lead, tone, trail, total: lead + tone + trail };
}

export function utcIntoPeriod(nowMs: number, period: number): { index: number; elapsed: number; even: boolean } {
  const d = new Date(nowMs);
  const sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  const index = Math.floor(sec / period);
  const elapsed = sec - index * period;
  return { index, elapsed, even: index % 2 === 0 };
}

/** Início UTC do próximo período com a paridade pedida. Relógio de quem chama. */
export function nextTxSlot(nowMs: number, mode: SlotMode, even: boolean): number {
  const period = slotTiming(mode).period;
  const mark = utcIntoPeriod(nowMs, period);
  if (mark.even === even && mark.elapsed < 0.2) return nowMs - mark.elapsed * 1000;
  let index = mark.index + 1;
  if ((index % 2 === 0) !== even) index += 1;
  const currentStart = nowMs - mark.elapsed * 1000;
  return currentStart + (index - mark.index) * period * 1000;
}
