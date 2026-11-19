/** Um único monitor de áudio no PC: rádio (codec USB) ou MMDVM (decodificado na estação). */

export type PcMonitorSource = "radio" | "mmdvm";

let active: PcMonitorSource | null = null;
const listeners = new Set<() => void>();

export function getPcMonitor(): PcMonitorSource | null {
  return active;
}

export function setPcMonitor(next: PcMonitorSource | null): void {
  if (active === next) return;
  active = next;
  listeners.forEach((fn) => fn());
}

export function subscribePcMonitor(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}