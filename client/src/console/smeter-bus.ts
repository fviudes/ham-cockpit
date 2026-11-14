/** Amostras do S-meter. O ponteiro assina aqui; o restante do header não re-renderiza a 25 Hz. */
type Listener = (reading: number) => void;

const listeners = new Set<Listener>();

export function publishSmeter(reading: number) {
  if (!Number.isFinite(reading)) return;
  for (const fn of listeners) fn(reading);
}

export function subscribeSmeter(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
