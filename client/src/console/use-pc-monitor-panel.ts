import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { I18nKey } from "./i18n";
import { PcAudioPlayer, type PcAudioStart } from "./pc-audio";
import { getPcMonitor, setPcMonitor, subscribePcMonitor, type PcMonitorSource } from "./pc-monitor-bus";
import { readPcVolume } from "@shared/pc-audio";

function hintFor(result: PcAudioStart, source: PcMonitorSource): I18nKey {
  if (!result.ok) {
    if (result.reason === "cancelled") return "pcAudioOff";
    if (result.reason === "auth") return "pcAudioAuth";
    if (result.reason === "busy") return "pcAudioBusy";
    if (result.reason === "no-decoder") return "pcMonitorMmdvmNoDecoder";
    return "pcAudioNone";
  }
  return source === "mmdvm" ? "pcMonitorMmdvmMode" : "pcMonitorRadioMode";
}

/** Monitor de áudio exclusivo no card do Painel (rádio ou MMDVM). */
export function usePcMonitorPanel(source: PcMonitorSource) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<I18nKey>(source === "mmdvm" ? "pcMonitorMmdvmMode" : "pcMonitorRadioMode");
  const playerRef = useRef<PcAudioPlayer | null>(null);
  if (!playerRef.current) {
    let vol = 6;
    try {
      vol = readPcVolume(localStorage.getItem("hc-pc-audio-vol"));
    } catch {
      /* padrão */
    }
    playerRef.current = new PcAudioPlayer(vol, source);
  }

  const active = useSyncExternalStore(subscribePcMonitor, getPcMonitor, getPcMonitor);
  const on = active === source;

  useEffect(() => () => playerRef.current?.stop(), []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (active !== source) {
      player.stop();
      setHint(source === "mmdvm" ? "pcMonitorMmdvmMode" : "pcMonitorRadioMode");
    }
  }, [active, source]);

  const toggle = useCallback(async () => {
    const player = playerRef.current;
    if (!player || busy) return;
    if (on) {
      player.stop();
      setPcMonitor(null);
      setHint("pcMonitorOff");
      return;
    }
    setBusy(true);
    setHint("pcAudioWait");
    try {
      const result = await player.start();
      if (!result.ok) {
        if (getPcMonitor() === null || getPcMonitor() === source) setPcMonitor(null);
        setHint(hintFor(result, source));
        return;
      }
      setPcMonitor(source);
      setHint(hintFor(result, source));
    } catch {
      setPcMonitor(null);
      setHint(source === "mmdvm" ? "pcMonitorMmdvmNoDecoder" : "pcAudioNone");
    } finally {
      setBusy(false);
    }
  }, [busy, on, source]);

  return { on, busy, hint, toggle };
}