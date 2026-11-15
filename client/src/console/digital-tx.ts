import { useEffect, useRef } from "react";
import type { DigMode } from "./digital-modes-model";

export type TxDone = { ok: boolean; message: string; error: string };

/** Um ciclo. O relógio do período é o do Pi; aqui só se espera a folga que ele devolveu. */
export function useDigitalTx(opts: {
  armed: boolean;
  mode: DigMode;
  even: boolean;
  message: string;
  audioHz: number;
  port: number;
  level: number;
  onCapture: (on: boolean) => void;
  onDone: (info: TxDone) => void;
  onPhase: (phase: string) => void;
}) {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    if (!opts.armed || !opts.message.trim()) return;
    let stopped = false;
    const timers: number[] = [];
    const later = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, Math.max(0, ms));
        timers.push(id);
      });

    void (async () => {
      const t0 = performance.now();
      let res: Response;
      try {
        res = await fetch("/api/digital/tx", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: ref.current.mode,
            message: ref.current.message.trim(),
            audioHz: ref.current.audioHz,
            even: ref.current.even,
            port: ref.current.port,
            level: ref.current.level,
          }),
        });
      } catch {
        if (!stopped) ref.current.onDone({ ok: false, message: ref.current.message, error: "rede" });
        return;
      }
      const body = (await res.json().catch(() => null)) as { ok?: boolean; startInMs?: number; error?: string; message?: string } | null;
      if (stopped) return;
      if (!res.ok || !body?.ok) {
        ref.current.onDone({ ok: false, message: ref.current.message, error: body?.error || "tx" });
        return;
      }
      ref.current.onCapture(false);
      const spent = performance.now() - t0;
      const remain = (body.startInMs ?? 0) - spent;
      await later(remain);
      if (stopped) return;
      for (let i = 0; i < 160 && !stopped; i++) {
        await later(400);
        if (stopped) return;
        const snap = (await fetch("/api/digital/tx", { credentials: "same-origin" })
          .then((r) => r.json())
          .catch(() => null)) as { phase?: string; message?: string; error?: string } | null;
        const phase = snap?.phase || "";
        ref.current.onPhase(phase);
        if (phase === "done" || phase === "error" || phase === "halt") {
          ref.current.onCapture(true);
          ref.current.onDone({
            ok: phase === "done",
            message: snap?.message || body.message || ref.current.message,
            error: snap?.error || "",
          });
          return;
        }
      }
      if (!stopped) {
        ref.current.onCapture(true);
        ref.current.onDone({ ok: false, message: ref.current.message, error: "tempo" });
      }
    })();

    return () => {
      stopped = true;
      for (const id of timers) window.clearTimeout(id);
      ref.current.onCapture(true);
      void fetch("/api/digital/halt", { method: "POST", credentials: "same-origin" });
    };
  }, [opts.armed, opts.message]);
}
