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
