/**
 * Ponteiro e barra no mesmo passo. O intervalo não reinicia quando chega
 * outra amostra: só o alvo muda, e a curva continua de onde estava.
 */
import { useEffect, useRef, useState } from "react";
import { SMETER_FRAME_MS, stepSmeter } from "@shared/smeter";
import { subscribeSmeter } from "./smeter-bus";

export function useEasedNumber(target: number): number {
  const targetRef = useRef(target);
  targetRef.current = target;
  const shown = useRef(target);
  const [value, setValue] = useState(target);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const dest = targetRef.current;
      const next = reduce ? dest : stepSmeter(shown.current, dest, dt);
      if (Math.abs(next - shown.current) < 1e-4) return;
      shown.current = next;
      setValue(next);
    }, SMETER_FRAME_MS);
    return () => window.clearInterval(id);
  }, []);

  return value;
}

/** Amostra rápida do barramento quando o rádio está vivo; senão, o valor de reserva. */
export function useSmoothedSmeter(live: boolean, fallback: number): number {
  const [raw, setRaw] = useState<number | null>(null);
  useEffect(() => {
    if (!live) {
      setRaw(null);
      return;
    }
    return subscribeSmeter((value) => setRaw(value));
  }, [live]);
  const target = live && raw != null ? raw : fallback;
  return useEasedNumber(target);
}
