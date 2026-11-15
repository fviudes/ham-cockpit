/**
 * Ponteiro e barra no mesmo passo. Cada quadro pinta a partir do último
 * dB; uma amostra nova só troca o alvo, sem reiniciar a curva.
 */
import { useEffect, useRef, useState } from "react";
import { stepSmeter } from "@shared/smeter";
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
    let frame = 0;
    const paint = (now: number) => {
      const dt = now - last;
      last = now;
      const dest = targetRef.current;
      const next = reduce ? dest : stepSmeter(shown.current, dest, dt);
      if (Math.abs(next - shown.current) >= 1e-4) {
        shown.current = next;
        setValue(next);
      }
      frame = window.requestAnimationFrame(paint);
    };
    frame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(frame);
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
