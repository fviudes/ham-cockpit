/**
 * Escala UI do S-meter (Ham Cockpit):
 * - 0..9  = S0..S9
 * - 9..12 = S9..S9+60 dB (passo 1 na UI = +20 dB; rótulo usa (s-9)*20)
 *
 * CI-V IC-705 cmd 0x15/0x02: BCD 4 dígitos (2 bytes) —
 * 0000=S0, 0120=S9, 0241=S9+60 (calibração Icom).
 * Sempre decodificar os 2 bytes BCD; o byte baixo sozinho comprime a escala
 * (ex.: 0140 → 0x40=64 em vez de 140 → mostra ~S5 no lugar de S9+10).
 */

export const IC705_SMETER_S9 = 120;
export const IC705_SMETER_S9_PLUS_60 = 241;

/** Dois bytes BCD big-endian do frame 15 02 → valor cru 0..241. */
export function bcdMeterRaw(hi: number, lo: number): number {
  return (
    ((hi >> 4) & 0x0f) * 1000 +
    (hi & 0x0f) * 100 +
    ((lo >> 4) & 0x0f) * 10 +
    (lo & 0x0f)
  );
}

/** Valor cru CI-V (0..241) → escala UI 0..12. */
export function civRawToUiSMeter(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= IC705_SMETER_S9) return (n / IC705_SMETER_S9) * 9;
  const span = IC705_SMETER_S9_PLUS_60 - IC705_SMETER_S9;
  return 9 + ((Math.min(IC705_SMETER_S9_PLUS_60, n) - IC705_SMETER_S9) / span) * 3;
}

/**
 * Hamlib RIG_LEVEL_STRENGTH: dB relativo a S9 (tip. −54…+60).
 * Mesma escala UI 0..12.
 */
export function hamlibStrengthToUiSMeter(dbRelS9: number): number {
  if (!Number.isFinite(dbRelS9)) return 0;
  if (dbRelS9 <= 0) return Math.max(0, Math.min(9, 9 + dbRelS9 / 6));
  return Math.min(12, 9 + Math.min(60, dbRelS9) / 20);
}

/**
 * CI-V/Hamlib: uma STRENGTH por vez; o intervalo evita rajada que vira “ocupado”.
 * ~20 Hz equilibra fluidez e carga no CI-V/Hamlib.
 */
export const SMETER_POLL_MS = Math.round(1000 / 20);

/** Desenho do ponteiro e da barra: ~20 quadros por segundo. */
export const SMETER_FRAME_MS = Math.round(1000 / 20);

/** CI-V enviado (BLE): aguarda a resposta antes de outro pedido. */
export const SMETER_INFLIGHT_MS = 33;
/** Fila CI-V / Hamlib ocupada ou transporte indisponível. */
export const SMETER_BUSY_MS = 50;

/**
 * Espera até disparar a leitura seguinte.
 * Nível de Hamlib/LAN dispara na hora; BLE no ar espera SMETER_INFLIGHT_MS.
 */
export function nextSmeterWaitMs(result: number | null | false): number {
  if (typeof result === "number") return SMETER_POLL_MS;
  if (result === false) return SMETER_INFLIGHT_MS;
  return SMETER_BUSY_MS;
}

/** Subida: resposta visível em ~50 ms sem salto de quadro. */
export const SMETER_TAU_ATTACK_MS = 55;
/** Descida: um pouco mais lenta que a subida para não tremer em ruído. */
export const SMETER_TAU_DECAY_MS = 78;
/** Legado nos testes que citam uma única τ. */
export const SMETER_TAU_MS = SMETER_TAU_ATTACK_MS;
/** Quadro atrasado não percorre a curva inteira. */
export const SMETER_DT_CAP_MS = 40;

/** Um passo da curva EMA; subida mais rápida que a descida. */
export function stepSmeter(shown: number, target: number, dtMs: number): number {
  if (!Number.isFinite(shown)) return Number.isFinite(target) ? target : 0;
  if (!Number.isFinite(target)) return shown;
  const dt = Math.min(SMETER_DT_CAP_MS, Math.max(0, dtMs));
  if (dt <= 0) return shown;
  const rising = target > shown + 1e-6;
  const tau = rising ? SMETER_TAU_ATTACK_MS : SMETER_TAU_DECAY_MS;
  const k = 1 - Math.exp(-dt / tau);
  const next = shown + (target - shown) * k;
  return Math.abs(next - target) < 0.01 ? target : next;
}

export function smeterTickOpen(inFlight: boolean): boolean {
  return !inFlight;
}

/** Uma leitura por vez. O segundo tick, com a primeira ainda no ar, não chama `poll`. */
export async function runSmeterPoll(
  gate: { busy: boolean },
  poll: () => Promise<number | null>,
): Promise<number | null> {
  if (!smeterTickOpen(gate.busy)) return null;
  gate.busy = true;
  try {
    return await poll();
  } finally {
    gate.busy = false;
  }
}

/** Primeira linha numérica do rigctld (`-12` + `RPRT 0`). Zero é S9, não “sem leitura”. */
export function parseHamlibStrength(reply: string): number | null {
  for (const line of String(reply || "").split(/\n/)) {
    const text = line.trim();
    if (!text || /^RPRT\b/i.test(text)) continue;
    const n = Number.parseFloat(text);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
