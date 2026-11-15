import type { ScopeSweep } from "./icom-scope";

/**
 * Pacote JSON do rigctld 4.6 (`spectra[].data` em hexadecimal).
 * O Hamlib monta as bordas; aqui só separamos o sweep para o card.
 */
export function sweepFromHamlib(packet: string): ScopeSweep | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packet);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const spectra = (parsed as { spectra?: unknown }).spectra;
  if (!Array.isArray(spectra) || !spectra.length) return null;
  const row = spectra[0];
  if (!row || typeof row !== "object") return null;
  const spec = row as {
    data?: unknown;
    type?: unknown;
    lowFreq?: unknown;
    highFreq?: unknown;
    centerFreq?: unknown;
    span?: unknown;
  };
  const bins = hexBins(String(spec.data || ""));
  if (!bins) return null;
  const low = Number(spec.lowFreq) || 0;
  const high = Number(spec.highFreq) || 0;
  const center = Number(spec.centerFreq) || 0;
  const span = Number(spec.span) || 0;
  const edged = low > 0 && high > low;
  return {
    startHz: edged ? low : Math.max(0, center - span / 2),
    endHz: edged ? high : center + span / 2,
    mode: String(spec.type || "").toUpperCase() === "CENTER" ? 0 : 1,
    bins,
    oor: false,
  };
}

function hexBins(hex: string): Uint8Array | null {
  const text = hex.trim();
  if (text.length < 2 || text.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(text)) return null;
  const bins = new Uint8Array(text.length / 2);
  for (let i = 0; i < bins.length; i++) bins[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bins;
}
