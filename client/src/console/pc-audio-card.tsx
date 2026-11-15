import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { I18nKey } from "@/console/i18n";
import { useConsole } from "@/console/state";
import { PcAudioPlayer, type PcAudioStart } from "@/console/pc-audio";
import { readPcVolume, stepPcVolume } from "@shared/pc-audio";

const VOL_KEY = "hc-pc-audio-vol";
const SCALE = ["0", "3", "5", "7", "9"] as const;

function readVolume(): number {
  try {
    return readPcVolume(localStorage.getItem(VOL_KEY));
  } catch {
    return 6;
  }
}

function hintFor(result: PcAudioStart): I18nKey {
  if (!result.ok) {
    if (result.reason === "cancelled") return "pcAudioOff";
    if (result.reason === "auth") return "pcAudioAuth";
    if (result.reason === "busy") return "pcAudioBusy";
    return "pcAudioNone";
  }
  return "pcAudioStation";
}

/** Card do menu superior: liga o áudio do rádio numa saída deste computador. */
export function PcAudioCard() {
  const { tx } = useConsole();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(readVolume);
  const [hint, setHint] = useState<I18nKey>("pcAudioOff");
  const barRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [barW, setBarW] = useState(0);
  const playerRef = useRef<PcAudioPlayer | null>(null);
  if (!playerRef.current) playerRef.current = new PcAudioPlayer(readVolume());

  useEffect(() => {
    const player = playerRef.current;
    player?.setVolume(volume);
    player?.setMuted(muted);
    try {
      localStorage.setItem(VOL_KEY, String(volume));
    } catch {
      /* volume só nesta sessão */
    }
  }, [volume, muted]);

  useLayoutEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const sync = () => setBarW(btn.offsetWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(btn);
    return () => ro.disconnect();
  }, [on, busy]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setVolume((current) => stepPcVolume(current, event.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => () => playerRef.current?.stop(), []);

  async function toggle() {
    const player = playerRef.current;
    if (!player || busy) return;
    if (on) {
      player.stop();
      setOn(false);
      setHint("pcAudioOff");
      return;
    }
    setBusy(true);
    setHint("pcAudioWait");
    try {
      const result = await player.start();
      if (!result.ok) {
        setOn(false);
        setHint(hintFor(result));
        return;
      }
      setOn(true);
      setHint(hintFor(result));
    } catch {
      setOn(false);
      setHint("pcAudioNone");
    } finally {
      setBusy(false);
    }
  }

  const fill = muted ? 0 : (volume / 9) * 100;

  return (
    <div className="col-start-2 row-span-2 flex h-full min-h-0 w-fit shrink-0 flex-col justify-start rounded-md border border-[rgba(79,195,247,0.28)] bg-[#0b1520] px-1.5 pt-1">
      <div className="flex w-fit flex-col items-start gap-0.5">
        <button
          ref={btnRef}
          type="button"
          aria-pressed={on}
          title={tx(hint)}
          disabled={busy}
          onClick={() => void toggle()}
          className={`w-fit rounded border px-1.5 py-0.5 font-['IBM_Plex_Mono'] text-[10px] leading-none font-semibold ${
            on
              ? "border-emerald-400 bg-emerald-500/25 text-emerald-300"
              : "border-[rgba(79,195,247,0.4)] text-[#c5d4e0] hover:border-[#4fc3f7]"
          }`}
        >
          {tx("pcAudio")}
        </button>
        <button
          type="button"
          aria-pressed={muted}
          title={muted ? tx("pcAudioSound") : tx("pcAudioMute")}
          onClick={(event) => {
            event.stopPropagation();
            setMuted((value) => !value);
          }}
          className={`grid size-4 place-items-center rounded border ${
            muted
              ? "border-amber-400 bg-amber-500/20 text-amber-300"
              : "border-[rgba(79,195,247,0.35)] text-[#8ea0b3] hover:text-[#d7f3ff]"
          }`}
        >
          {muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
        </button>
        <div
          ref={barRef}
          title={tx("pcAudioWheel")}
          className="cursor-ns-resize"
          style={{ width: barW || undefined }}
        >
          <div className="h-1.5 overflow-hidden rounded-full border border-[rgba(79,195,247,0.35)] bg-[#071018]">
            <div className={`h-full ${on ? "bg-emerald-400" : "bg-[#4fc3f7]"}`} style={{ width: `${fill}%` }} />
          </div>
          <div className="mt-0.5 flex justify-between font-['IBM_Plex_Mono'] text-[7px] leading-none text-[#8ea0b3]">
            {SCALE.map((mark, index) => (
              <span key={`${mark}-${index}`}>{mark}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
