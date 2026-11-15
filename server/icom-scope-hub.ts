/** Quadros 0x27 0x00 tirados do CI-V da rede antes de chegarem ao rigctld. */

type Listener = (frame: Uint8Array) => void;

const listeners = new Set<Listener>();

export function publishScopeFrame(frame: Uint8Array) {
  for (const fn of listeners) fn(frame);
}

export function subscribeScopeFrame(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
