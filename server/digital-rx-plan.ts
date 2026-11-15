/**
 * Modo DATA do IC-705 no Hamlib 4.x (rig 3085).
 * Medido na porta 4532: `M PKTUSB 0` e o `m` devolve PKTUSB.
 * USB-D e DIGU não mudam o que o `m` lê.
 */
export const DIGITAL_DATA_MODE = "PKTUSB";

export type RigSnap = { hz: number; mode: string; width: number };

export function parseRigFreq(reply: string): number | null {
  for (const raw of reply.split(/\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("RPRT")) continue;
    if (!/^\d+(?:\.\d+)?$/.test(line)) continue;
    const hz = Math.round(Number(line));
    if (hz >= 100_000 && hz <= 500_000_000) return hz;
  }
  return null;
}

export function parseRigMode(reply: string): { mode: string; width: number } | null {
  const lines = reply
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("RPRT"));
  const mode = (lines[0] || "").toUpperCase();
  if (!/^[A-Z0-9+-]{2,12}$/.test(mode)) return null;
  const width = Number(lines[1] ?? "0");
  return { mode, width: Number.isFinite(width) && width >= 0 ? Math.round(width) : 0 };
}

export function enableRigCommands(hz: number): string[] {
  return [`M ${DIGITAL_DATA_MODE} 0`, `F ${Math.round(hz)}`];
}

export function tuneRigCommand(hz: number): string {
  return `F ${Math.round(hz)}`;
}

export function restoreRigCommands(saved: RigSnap): string[] {
  return [`F ${Math.round(saved.hz)}`, `M ${saved.mode} ${saved.width}`];
}
