import { ChevronDown, ChevronUp, Maximize2, Minimize2, Plus, Save } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { I18nKey } from "./i18n";
import { PanelBoard } from "./panel-board";
import {
  TILE_IDS,
  addTile,
  currentLayoutUser,
  defaultTiles,
  loadLayout,
  removeTile,
  saveLayout,
  tilesEqual,
  type PanelTile,
  type TileId,
} from "./panel-layout";
import { formatWatts, useConsole, type Station } from "./state";
import { NextionViz } from "./nextion-panel";
import { Drop, VfoPanel } from "./vfo-panel";
import { Chip, GhostBtn, Lcd, Led, PageHead, PanelTitle, PrimaryBtn } from "./widgets";

const TILE_LABEL: Record<TileId, I18nKey> = {
  vfo: "panelVfo",
  nextion: "panelNextion",
  spe: "spe",
  palstar: "palstar",
  hamplus: "hamplus",
  acom: "acom",
  lextel: "lextel",
  ldg: "ldg",
  lp100a: "lp100a",
};

export function RadioPage() {
  const { s, tx } = useConsole();
  const user = currentLayoutUser();
  const [tiles, setTiles] = useState<PanelTile[]>(defaultTiles);
  const [saved, setSaved] = useState<PanelTile[]>(defaultTiles);
  const [busy, setBusy] = useState(false);
  const [fs, setFs] = useState(false);
  const [picker, setPicker] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void loadLayout(user).then((next) => {
      if (!live) return;
      const withNx = next.some((t) => t.id === "nextion") ? next : addTile(next, "nextion");
      setTiles(withNx);
      setSaved(withNx);
    });
    return () => {
      live = false;
    };
  }, [user]);

  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker]);

  useEffect(() => {
    if (!fs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const d = document as Document & { webkitExitFullscreen?: () => void };
        if (document.fullscreenElement && document.exitFullscreen) void document.exitFullscreen();
        else d.webkitExitFullscreen?.();
        setFs(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fs]);

  const togglePageFs = async () => {
    const el = pageRef.current;
    if (!el) return;
    if (fs) {
      const d = document as Document & { webkitExitFullscreen?: () => void };
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          d.webkitExitFullscreen?.();
        }
      } else {
        d.webkitExitFullscreen?.();
      }
      setFs(false);
      return;
    }
    setFs(true);
    try {
      const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => void };
      if (el.requestFullscreen) await el.requestFullscreen();
      else anyEl.webkitRequestFullscreen?.();
    } catch {
      /* overlay covers the platform */
    }
  };

  const accessories: { id: TileId; node: ReactNode }[] = [
    { id: "spe", node: <SpeViz /> },
    { id: "palstar", node: <PalstarViz s={s} /> },
    { id: "ldg", node: <LdgViz /> },
    { id: "lp100a", node: <Lp100aViz s={s} tx={tx} /> },
    { id: "hamplus", node: <HamplusViz /> },
    { id: "acom", node: <AcomViz s={s} tx={tx} /> },
    { id: "lextel", node: <LextelViz s={s} tx={tx} /> },
  ];
  const shown = tiles.map((t) => t.id);
  const available = TILE_IDS.filter((id) => !shown.includes(id));
  const dirty = !tilesEqual(tiles, saved);

  const addDevice = (id: TileId) => {
    setTiles((cur) => addTile(cur, id));
    if (available.length <= 1) setPicker(false);
  };

  const persist = async () => {
    setBusy(true);
    try {
      const next = await saveLayout(user, tiles);
      setTiles(next);
      setSaved(next);
      toast.success(tx("layoutSaved"));
    } catch {
      toast.error(tx("layoutSaveFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={pageRef}
      className={
        fs
          ? document.fullscreenElement === pageRef.current
            ? "console-page-fs relative h-full min-h-full overflow-auto bg-[#071018] px-3 py-4 md:px-5"
            : "console-page-fs fixed inset-0 z-[100] overflow-auto bg-[#071018] px-3 py-4 md:px-5"
          : "relative"
      }
    >
      <PageHead
        kicker={tx("radio")}
        title={tx("radioTitle")}
        logo
        aside={
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <GhostBtn onClick={() => setPicker(true)}>
                <span className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  {tx("panelAdd")}
                </span>
              </GhostBtn>
              <GhostBtn onClick={() => void togglePageFs()}>
                <span className="inline-flex items-center gap-2">
                  {fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {fs ? tx("layoutRestore") : tx("layoutMaximize")}
                </span>
              </GhostBtn>
              <PrimaryBtn disabled={busy || !dirty} onClick={() => void persist()}>
                <span className="inline-flex items-center gap-2">
                  <Save size={16} />
                  {tx("saveLayout")}
                </span>
              </PrimaryBtn>
            </div>
            <p className="max-w-xs text-right text-[11px] leading-snug text-[#5d7184]">{tx("layoutHint")}</p>
          </div>
        }
      />

      <PanelBoard
        tiles={tiles}
        shown={shown}
        onChange={setTiles}
        onRemove={(id) => setTiles((cur) => removeTile(cur, id))}
        render={(id) => {
          if (id === "vfo") return <VfoPanel />;
          if (id === "nextion") return <NextionViz />;
          return accessories.find((a) => a.id === id)?.node ?? null;
        }}
      />

      {picker ? (
        <div
          className={`${fs ? "absolute" : "fixed"} inset-0 z-[130] grid place-items-center bg-black/60 px-4`}
          onClick={() => setPicker(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-add-title"
            className="w-full max-w-md rounded-2xl border border-[rgba(79,195,247,0.2)] bg-[#0b1520] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="panel-add-title" className="font-['Space_Grotesk'] text-lg font-semibold text-white">
              {tx("panelAddTitle")}
            </p>
            <p className="mt-1 mb-4 text-sm leading-relaxed text-[#8ea0b3]">{tx("panelAddHelp")}</p>
            {available.length === 0 ? (
              <p className="text-sm text-[#ffb300]">{tx("panelAddNone")}</p>
            ) : (
              <div className="grid gap-2">
                {available.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="flex h-11 items-center justify-between rounded-md border border-[rgba(79,195,247,0.18)] px-3 text-left text-sm text-[#c5d4e0] hover:border-[#4fc3f7] hover:bg-[#4fc3f7]/10 hover:text-white"
                    onClick={() => addDevice(id)}
                  >
                    <span>{tx(TILE_LABEL[id])}</span>
                    <Plus size={16} className="text-[#4fc3f7]" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <GhostBtn onClick={() => setPicker(false)}>{tx("cancelEdit")}</GhostBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LcdCell({
  k,
  v,
  tone,
  ink,
}: {
  k: string;
  v: string;
  tone?: "green" | "red" | "amber";
  ink?: boolean;
}) {
  const color = ink
    ? "text-[#e8eef4]"
    : tone === "green"
      ? "text-[#34d399]"
      : tone === "red"
        ? "text-[#f87171]"
        : tone === "amber"
          ? "text-[#ffb300]"
          : "text-[#4fc3f7]";
  return (
    <div>
      <p className="text-[9px] tracking-wide text-[#5d7184]">{k}</p>
      <p className={`text-sm font-semibold ${color}`}>{v}</p>
    </div>
  );
}

function LedBar({ value, max, tone }: { value: number; max: number; tone: "red" | "amber" }) {
  const n = 16;
  const lit = Math.max(0, Math.min(n, Math.round((value / max) * n)));
  const on = tone === "red" ? "bg-[#f87171]" : "bg-[#ffb300]";
  return (
    <div className="flex h-2.5 gap-px">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`flex-1 rounded-sm ${i < lit ? on : "bg-[#1c2a32]"}`} />
      ))}
    </div>
  );
}

const SPE_PWR: Record<"L" | "M" | "H", string> = { L: "Low", M: "Mid", H: "High" };

function SpeViz() {
  const { s, setS, pushLog, tx } = useConsole();
  const a = s.spe;
  const speState =
    a.hardware && a.connected
      ? ""
      : a.phase === "connecting"
        ? tx("speWait")
        : a.error === "nocomm"
          ? tx("speNoComm")
          : tx("speOff");
  const cmd = async (c: string) => {
    try {
      const r = await fetch("/api/spe/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: c }),
      });
      const j = (await r.json()) as Record<string, unknown>;
      setS((p) => ({
        ...p,
        spe: {
          ...p.spe,
          connected: Boolean(j.connected),
          hardware: Boolean(j.hardware),
          phase:
            j.phase === "idle" || j.phase === "connecting" || j.phase === "ready" || j.phase === "error"
              ? j.phase
              : p.spe.phase,
          operate: Boolean(j.operate),
          tx: Boolean(j.tx),
          pout: Number.isFinite(Number(j.pout)) ? Number(j.pout) : p.spe.pout,
          pwr: j.pwr === "L" || j.pwr === "M" || j.pwr === "H" ? j.pwr : p.spe.pwr,
          swrAtu: Number.isFinite(Number(j.swrAtu)) ? Number(j.swrAtu) : p.spe.swrAtu,
          swrAnt: Number.isFinite(Number(j.swrAnt)) ? Number(j.swrAnt) : p.spe.swrAnt,
          vpa: Number.isFinite(Number(j.vpa)) ? Number(j.vpa) : p.spe.vpa,
          ipa: Number.isFinite(Number(j.ipa)) ? Number(j.ipa) : p.spe.ipa,
          band: typeof j.band === "string" && j.band ? j.band : p.spe.band,
          ant: Number.isFinite(Number(j.ant)) ? Number(j.ant) : p.spe.ant,
          ledOn: Boolean(j.ledOn ?? j.connected),
          lastTxHex: typeof j.lastTxHex === "string" ? j.lastTxHex : p.spe.lastTxHex,
          lastRx: typeof j.lastRx === "string" ? j.lastRx : p.spe.lastRx,
          error: typeof j.error === "string" ? j.error : p.spe.error,
        },
      }));
      const hex = typeof j.lastTxHex === "string" ? j.lastTxHex : "";
      pushLog("SPE", hex ? `${c} · TX ${hex}` : c);
    } catch (err) {
      toast.error(String(err));
    }
  };
  return (
    <div>
      <PanelTitle>SPE Expert {a.model || "1.3K"}-FA</PanelTitle>
      {speState ? <p className="mb-2 text-[11px] text-[#8ea0b3]">{speState}</p> : null}
      <Lcd>
        <div className="mb-2 flex items-center justify-between border-b border-[#0c2236] pb-2">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#4fc3f7]">{a.model || "13K"}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${a.operate ? "bg-[#10b981]/20 text-[#34d399]" : "text-[#8ea0b3]"}`}>
            {a.operate ? "OPERATE" : "STBY"}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${a.tx ? "bg-[#ef4444] text-white" : "text-[#8ea0b3]"}`}>
            {a.tx ? "TX" : "RX"}
          </span>
        </div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-[9px] text-[#5d7184]">RF OUT</p>
            <p className="text-3xl font-semibold text-[#ffb300]">
              {a.pout}
              <span className="ml-1 text-sm">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-[#5d7184]">PWR</p>
            <p className="text-xl font-semibold text-[#4fc3f7]">{SPE_PWR[a.pwr]}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 border-t border-[#0c2236] pt-2">
          <LcdCell k="SWR ATU" v={a.swrAtu.toFixed(2)} />
          <LcdCell k="SWR ANT" v={a.swrAnt.toFixed(2)} />
          <LcdCell k="BAND" v={a.band} ink />
          <LcdCell k="ANT" v={String(a.ant)} ink />
        </div>
      </Lcd>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Chip tone="ok" active={a.ledOn && a.hardware} onClick={() => void cmd(a.hardware ? "off" : "on")}>
          {a.hardware ? "Power On" : "Wake"}
        </Chip>
        <Chip onClick={() => void cmd("pwr")}>PWR {SPE_PWR[a.pwr]}</Chip>
        <Chip tone="amber" active={a.operate} onClick={() => void cmd(a.operate ? "op0" : "op1")}>
          {a.operate ? "Oper" : "StdBy"}
        </Chip>
      </div>
    </div>
  );
}

function LdgViz() {
  const { s, setS, tx, pushLog } = useConsole();
  const d = s.ldg;
  const matchLabel =
    d.match === "T" ? tx("ldgMatchT") : d.match === "M" ? tx("ldgMatchM") : d.match === "F" ? tx("ldgMatchF") : "—";
  const cmd = async (c: string) => {
    if (c === "mem" || c === "full") toast.message(tx("ldgNeedRf"));
    try {
      const r = await fetch("/api/ldg/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: c }),
      });
      const j = (await r.json()) as Record<string, unknown>;
      setS((p) => ({
        ...p,
        ldg: {
          ...p.ldg,
          ant: j.ant === 2 ? 2 : j.ant === 1 ? 1 : p.ldg.ant,
          mode: j.mode === "MANUAL" || j.mode === "BYPASS" || j.mode === "AUTO" ? j.mode : p.ldg.mode,
          match: j.match === "T" || j.match === "M" || j.match === "F" || j.match === "" ? j.match : p.ldg.match,
          tuning: Boolean(j.tuning),
          fwd: Number.isFinite(Number(j.fwd)) ? Number(j.fwd) : p.ldg.fwd,
          ref: Number.isFinite(Number(j.ref)) ? Number(j.ref) : p.ldg.ref,
          swr: Number.isFinite(Number(j.swr)) ? Number(j.swr) : p.ldg.swr,
        },
      }));
      pushLog("LDG", c);
    } catch (err) {
      toast.error(String(err));
    }
  };
  return (
    <div>
      <PanelTitle>LDG {d.label}</PanelTitle>
      <Lcd>
        <div className="mb-2 flex items-center justify-between border-b border-[#0c2236] pb-2">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#4fc3f7]">{d.label}</span>
          <span className="text-[10px] text-[#8ea0b3]">{d.tuning ? tx("ldgTuning") : d.mode}</span>
          <span className="rounded bg-[#4fc3f7]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#4fc3f7]">
            ANT {d.ant}
          </span>
        </div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-[9px] text-[#5d7184]">{tx("ldgFwd")}</p>
            <p className="text-3xl font-semibold text-[#ffb300]">
              {formatWatts(d.fwd)}
              <span className="ml-1 text-sm">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-[#5d7184]">{tx("ldgMatch")}</p>
            <p className={`text-lg font-semibold ${d.match === "F" ? "text-[#f87171]" : "text-[#34d399]"}`}>{matchLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LcdCell k={tx("lextelSwr")} v={d.swr.toFixed(2)} tone="amber" />
          <LcdCell k={tx("ldgRef")} v={`${formatWatts(d.ref)} W`} tone="red" />
        </div>
      </Lcd>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip tone="amber" active={d.tuning} onClick={() => void cmd("mem")}>
          {tx("ldgMemTune")}
        </Chip>
        <Chip active={d.mode === "BYPASS"} onClick={() => void cmd("bypass")}>
          {tx("ldgBypass")}
        </Chip>
        <Chip active={d.mode === "AUTO"} onClick={() => void cmd("auto")}>
          {tx("ldgAuto")}
        </Chip>
        <Chip onClick={() => void cmd("ant")}>
          {tx("ldgAnt")} {d.ant}
        </Chip>
      </div>
    </div>
  );
}

function PalstarViz({ s }: { s: Station }) {
  const p = s.palstar;
  return (
    <>
      <PanelTitle>Palstar AT-AUTO</PanelTitle>
      <Lcd>
        <div className="mb-2 flex items-center justify-between border-b border-[#0c2236] pb-2">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#4fc3f7]">AT-AUTO</span>
          <span className="text-[10px] text-[#8ea0b3]">{p.mode}</span>
          <span className="rounded bg-[#4fc3f7]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#4fc3f7]">{p.ant}</span>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-3">
          <LcdCell k="FWD W" v={String(p.fwd)} />
          <LcdCell k="REF W" v={String(p.ref)} tone="red" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <LcdCell k="SWR" v={p.swr.toFixed(1)} tone="amber" />
          <LcdCell k="L" v={String(p.l)} ink />
          <LcdCell k="C" v={String(p.c)} ink />
        </div>
      </Lcd>
      <div className="mt-3 flex justify-around">
        <Led on={p.tune} tone="amber" label="Tune" />
        <Led on={p.match} tone="green" label="Match" />
        <Led on={p.mode === "BYPASS"} tone="cyan" label="Bypass" />
      </div>
    </>
  );
}

function HamplusViz() {
  const { s, setS, tx } = useConsole();
  const h = s.hamplus;
  const bump = (delta: number) => {
    setS((p) => ({ ...p, hamplus: { ...p.hamplus, deg: (p.hamplus.deg + delta + 360) % 360 } }));
  };
  return (
    <div>
      <PanelTitle>Hamplus AS-603WL</PanelTitle>
      <div className="mb-3 flex justify-around rounded-lg border border-[#0c2236] bg-[#041018] py-3">
        <Led on={h.pwr} tone="green" label="Power" />
        <Led on={h.send} tone="red" label="Send" />
        <Led on={h.split} tone="amber" label="Split" />
      </div>

      <div className="mb-3 flex items-stretch gap-2">
        <Lcd className="min-w-0 flex-1">
          <p className="text-center text-[9px] font-semibold tracking-[0.2em] text-[#f87171]/70">{tx("azimuth")}</p>
          <p
            className="text-center text-4xl font-semibold tabular-nums tracking-[0.18em] text-[#ef4444]"
            style={{ textShadow: "0 0 12px rgba(239,68,68,0.45)" }}
          >
            {String(h.deg).padStart(3, "0")}
          </p>
        </Lcd>
        <div className="flex shrink-0 flex-col justify-center gap-1">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md border border-[rgba(239,68,68,0.35)] text-[#f87171] hover:bg-[#ef4444]/10"
            onClick={() => bump(5)}
            aria-label={tx("azimuthUp")}
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md border border-[rgba(239,68,68,0.35)] text-[#f87171] hover:bg-[#ef4444]/10"
            onClick={() => bump(-5)}
            aria-label={tx("azimuthDown")}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Drop
          label={tx("hamplusAnt")}
          value={String(h.ant)}
          onChange={(v) => setS((p) => ({ ...p, hamplus: { ...p.hamplus, ant: Number(v) } }))}
        >
          {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              ANT {n}
            </option>
          ))}
        </Drop>
        <Drop
          label={tx("hamplusRadio")}
          value={String(h.radio)}
          onChange={(v) => setS((p) => ({ ...p, hamplus: { ...p.hamplus, radio: Number(v) } }))}
        >
          {Array.from({ length: 3 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {tx("hamplusRadio")} {n}
            </option>
          ))}
        </Drop>
        <Drop
          label={tx("rotor")}
          value={String(h.rotor)}
          onChange={(v) => setS((p) => ({ ...p, hamplus: { ...p.hamplus, rotor: Number(v) === 2 ? 2 : 1 } }))}
        >
          <option value="1">
            {tx("rotor")} 1
          </option>
          <option value="2">
            {tx("rotor")} 2
          </option>
        </Drop>
      </div>
    </div>
  );
}

function AcomViz({ s, tx }: { s: Station; tx: (k: I18nKey) => string }) {
  const a = s.acom;
  return (
    <>
      <PanelTitle>ACOM {tx("acomTitle")}</PanelTitle>
      <Lcd>
        <div className="mb-2 flex items-center justify-between border-b border-[#0c2236] pb-2">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#4fc3f7]">2000A</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${a.operate ? "bg-[#10b981]/20 text-[#34d399]" : "text-[#8ea0b3]"}`}>
            {a.operate ? tx("acomOperate") : tx("acomStby")}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${a.tx ? "bg-[#ef4444] text-white" : "text-[#8ea0b3]"}`}>
            {a.tx ? "TX" : "RX"}
          </span>
        </div>
        <div className="mb-2">
          <p className="mb-0.5 text-[9px] text-[#5d7184]">FWD W</p>
          <LedBar value={a.fwd} max={1500} tone="red" />
          <p className="mt-0.5 text-sm font-semibold text-[#f87171]">{a.fwd} W</p>
        </div>
        <div className="mb-2">
          <p className="mb-0.5 text-[9px] text-[#5d7184]">RFL W</p>
          <LedBar value={a.ref} max={150} tone="amber" />
        </div>
        <div className="grid grid-cols-4 gap-2 border-t border-[#0c2236] pt-2">
          <LcdCell k="HV" v={a.hv ? String(a.hv) : "—"} tone="green" />
          <LcdCell k="TEMP" v={`${a.temp}°`} tone="red" />
          <LcdCell k="BAND" v={a.band} ink />
          <LcdCell k="ANT" v={String(a.ant)} ink />
        </div>
      </Lcd>
    </>
  );
}

function LextelViz({ s, tx }: { s: Station; tx: (k: I18nKey) => string }) {
  const d = s.lextel;
  return (
    <>
      <PanelTitle>Lextel MS-2000</PanelTitle>
      <Lcd>
        <div className="mb-2 flex items-center justify-between border-b border-[#0c2236] pb-2">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#4fc3f7]">MS-2000</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              d.connected ? "bg-[#10b981]/20 text-[#34d399]" : "text-[#8ea0b3]"
            }`}
          >
            {d.connected ? tx("connected") : tx("disconnected")}
          </span>
        </div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-[9px] text-[#5d7184]">{tx("lextelPep")}</p>
            <p className="text-3xl font-semibold text-[#ffb300]">
              {formatWatts(d.pep)}
              <span className="ml-1 text-sm">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-[#5d7184]">{tx("lextelAvg")}</p>
            <p className="text-xl font-semibold text-[#4fc3f7]">
              {formatWatts(d.avg)}
              <span className="ml-1 text-xs">W</span>
            </p>
          </div>
        </div>
        <div className="mb-2">
          <LedBar value={d.pep} max={2000} tone="red" />
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-[#0c2236] pt-2">
          <LcdCell k={tx("lextelSwr")} v={d.swr.toFixed(2)} tone={d.swr >= 2 ? "red" : "amber"} />
          <LcdCell k={tx("lextelVdc")} v={d.vdc ? `${d.vdc.toFixed(1)} V` : "—"} tone="green" />
          <LcdCell k="SWR/REF" v={String(d.ref)} tone="red" />
        </div>
      </Lcd>
    </>
  );
}

function Lp100aViz({ s, tx }: { s: Station; tx: (k: I18nKey) => string }) {
  const d = s.lp100a;
  const barMax = d.range === "LOW" ? 25 : d.range === "MID" ? 250 : 2500;
  return (
    <>
      <PanelTitle>TelePost LP-100A</PanelTitle>
      <Lcd>
        <div className="mb-2 flex items-center justify-between border-b border-[#0c2236] pb-2">
          <span className="text-[10px] font-semibold tracking-[0.2em] text-[#4fc3f7]">LP-100A</span>
          <span className="text-[10px] text-[#8ea0b3]">{d.meter}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${d.tx ? "bg-[#ef4444] text-white" : "text-[#8ea0b3]"}`}>
            {d.tx ? "TX" : "RX"}
          </span>
        </div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-[9px] text-[#5d7184]">{tx("lp100aFwd")}</p>
            <p className="text-3xl font-semibold text-[#ffb300]">
              {formatWatts(d.fwd)}
              <span className="ml-1 text-sm">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-[#5d7184]">{tx("lextelSwr")}</p>
            <p className={`text-lg font-semibold ${d.swr >= 2 ? "text-[#f87171]" : "text-[#34d399]"}`}>{d.swr.toFixed(2)}</p>
          </div>
        </div>
        <div className="mb-2">
          <LedBar value={d.fwd} max={barMax} tone="red" />
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-[#0c2236] pt-2">
          <LcdCell k={tx("lp100aZ")} v={`${d.z.toFixed(0)} Ω`} tone="green" />
          <LcdCell k={tx("lp100aPhase")} v={`${d.phaseDeg.toFixed(0)}°`} ink />
          <LcdCell k={tx("lp100aDbm")} v={d.dbm.toFixed(1)} tone="amber" />
        </div>
      </Lcd>
    </>
  );
}
