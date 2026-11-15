import { ScopeAssembler, type ScopeSweep } from "@shared/icom-scope";

type Listener = (sweep: ScopeSweep) => void;

const listeners = new Set<Listener>();
const assembler = new ScopeAssembler();

export function publishScopeChunk(data: Uint8Array) {
  const sweep = assembler.push(data);
  if (!sweep) return;
  for (const fn of listeners) fn(sweep);
}

export function subscribeScope(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
