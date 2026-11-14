import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { resolvePrimaryRoute, sendPrimaryCmd } from "./radio-cmd";
import { useEasedNumber, useSmoothedSmeter } from "./smeter-motion";
import { BANDS, formatVfo, MODES, radioCardTitle, sMeterLabel, useConsole } from "./state";
import { Chip, ConsoleSelect, Lcd, PanelTitle } from "./widgets";

const AGC = ["OFF", "FAST", "MID", "SLOW"] as const;
const PRE = ["OFF", "ON1", "ON2"] as const;

export function VfoPanel() {
  const { s, setS, setFreq, tx, pushLog } = useConsole();
  const bleReady = s.ic705.phase === "ready" && s.ic705.ble;
  const route = resolvePrimaryRoute(s.radios.items, { bleReady });
  const liveCat = route.live;
  const sShown = useSmoothedSmeter(liveCat, s.smeter);
  const sm = sMeterLabel(sShown);
  const activeHz = s.vfo === "B" ? s.freqB : s.freq;
  const activeMode = s.vfo === "B" ? s.modeB : s.mode;
  const bandId = bandOf(activeHz);
  const primaryRadio = s.radios.items.find((r) => r.primary);
  const panelRadio = route.radio || s.radios.items.find((r) => r.connected) || primaryRadio;
  const radioTitle = radioCardTitle(panelRadio, tx("radioFallback"));
  const filterVal = s.nr && s.nb ? "nrnb" : s.nr ? "nr" : s.nb ? "nb" : "off";
  const transportLabel =
    route.transport === "ble"
      ? "BLE CAT"
      : route.transport === "lan"
        ? "LAN CI-V"
        : route.transport === "hamlib"
          ? "Hamlib"
          : tx("bleTransport");

  const send = (action: Parameters<typeof sendPrimaryCmd>[1]) => {
    void sendPrimaryCmd(s.radios.items, action, {
      bleReady,
      hamlibPort: s.wlg.hamlibPort || 4532,
    });
  };

  const applyFreq = (which: "A" | "B", hz: number) => {
    const next = Math.max(100_000, hz);
    if (which === "A") setFreq(next);
    else setS((p) => ({ ...p, freqB: next }));
    if (s.vfo === which) send({ type: "setFreq", hz: next });
    if (s.wlg.publishCat && s.wavelog.running && s.vfo === which) {
      pushLog("WLOG", `CAT ${next} ${which === "B" ? s.modeB : s.mode} → ${s.wlg.radioName}`);
    }
  };

  const selectVfo = (which: "A" | "B") => {
    if (s.vfo === which) return;
    setS((p) => ({ ...p, vfo: which }));
    send({ type: "setVfo", vfo: which });
    send({ type: "setFreq", hz: which === "B" ? s.freqB : s.freq });
    send({ type: "setMode", mode: which === "B" ? s.modeB : s.mode });
  };

  const applyPtt = (on: boolean) => {
    setS((p) => ({
      ...p,
      ptt: on,
      po: liveCat ? p.po : on ? 7.2 : 0,
      swr: liveCat ? p.swr : on ? (p.lextel.connected && p.lextel.swr >= 1 ? p.lextel.swr : 1.12) : 1,
    }));
    pushLog("CIV", on ? "PTT ON" : "PTT OFF");
    send({ type: "setPtt", on });
  };

  const applyMode = (mode: (typeof MODES)[number]) => {
    if (s.vfo === "B") setS((p) => ({ ...p, modeB: mode }));
    else setS((p) => ({ ...p, mode }));
    send({ type: "setMode", mode });
    if (s.wlg.publishCat && s.wavelog.running) {
      pushLog("WLOG", `CAT ${activeHz} ${mode} → ${s.wlg.radioName}`);
    }
  };

  const applyFilter = (v: string) => {
    const nr = v === "nr" || v === "nrnb";
    const nb = v === "nb" || v === "nrnb";
    setS((p) => ({ ...p, nr, nb }));
    send({ type: "setNr", on: nr });
    send({ type: "setNb", on: nb });
  };

  const applyPre = (v: (typeof PRE)[number]) => {
    setS((p) => ({ ...p, pre: v }));
    send({ type: "setPre", pre: v });
  };

  const applyAtt = (on: boolean) => {
    setS((p) => ({ ...p, att: on }));
    send({ type: "setAtt", on });
  };

  const applyAgc = (v: (typeof AGC)[number]) => {
    setS((p) => ({ ...p, agc: v }));
    send({ type: "setAgc", agc: v });
  };

  const applyPower = (on: boolean) => {
    setS((p) => ({
      ...p,
      power: on,
      // Standby: força RX e zera Po local até o poll voltar.
      ...(on ? {} : { ptt: false, po: 0 }),
    }));
    pushLog("CIV", on ? "POWER ON" : "STANDBY");
    send({ type: "setPower", on });
  };

  return (
    <div className="relative overflow-hidden">
      {/* Mesmas classes do título "MMDVM Painel" (PanelTitle). */}
      <PanelTitle>{radioTitle}</PanelTitle>
      <Lcd className="min-w-0">
        <div className="mb-3 flex items-center justify-between border-b border-[#0c2236] pb-3">
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-bold ${
              s.ptt ? "bg-[#ef4444]/20 text-[#f87171]" : "bg-[#10b981]/20 text-[#34d399]"
            }`}
          >
            {s.ptt ? tx("tx") : tx("rx")}
          </span>
          <span className="text-[11px] text-[#8ea0b3]">{liveCat ? transportLabel : tx("bleTransport")}</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-[#0c2236]">
          <div className="pr-2.5">
            <VfoFace
              label="VFO A"
              hz={s.freq}
              mode={s.mode}
              active={s.vfo === "A"}
              status={s.ptt && (s.split ? false : s.vfo === "A") ? tx("tx") : tx("rx")}
              isTx={s.ptt && (s.split ? false : s.vfo === "A")}
              roe={s.ptt && s.vfo === "A" ? s.swr || 1.12 : undefined}
              roeLabel={tx("lextelSwr")}
              onSelect={() => selectVfo("A")}
              selectLabel={tx("selectVfoA")}
              onStep={(d) => applyFreq("A", s.freq + d)}
              upLabel={`${tx("freqUp")} VFO A`}
              downLabel={`${tx("freqDown")} VFO A`}
            />
          </div>
          <div className="pl-2.5">
            <VfoFace
              label="VFO B"
              hz={s.freqB}
              mode={s.modeB}
              active={s.vfo === "B"}
              status={s.ptt && (s.split ? true : s.vfo === "B") ? tx("tx") : tx("rx")}
              isTx={s.ptt && (s.split ? true : s.vfo === "B")}
              roe={s.ptt && s.vfo === "B" ? s.swr || 1.12 : undefined}
              roeLabel={tx("lextelSwr")}
              onSelect={() => selectVfo("B")}
              selectLabel={tx("selectVfoB")}
              onStep={(d) => applyFreq("B", s.freqB + d)}
              upLabel={`${tx("freqUp")} VFO B`}
              downLabel={`${tx("freqDown")} VFO B`}
            />
          </div>
        </div>
      </Lcd>

      <Ic705Meter
        txOn={s.ptt}
        sValue={sShown}
        po={s.po || 0}
        sLabel={sm}
        poLabel={tx("meterPo")}
        sName={tx("meterS")}
      />

      <div className="mt-3 flex flex-wrap gap-1">
        <FilterPill on={s.nr}>{tx("nr")}</FilterPill>
        <FilterPill on={s.nb}>{tx("nb")}</FilterPill>
        <FilterPill on={s.pre !== "OFF"}>PRE {s.pre}</FilterPill>
        <FilterPill on={s.att}>ATT {s.att ? "ON" : "OFF"}</FilterPill>
        <FilterPill on={s.agc !== "OFF"}>AGC {s.agc}</FilterPill>
        <FilterPill on={s.split}>SPLIT</FilterPill>
        <FilterPill on={s.power}>{s.power ? "PWR" : "STBY"}</FilterPill>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Drop
          label={tx("band")}
          value={bandId}
          onChange={(v) => applyFreq(s.vfo, BANDS.find((b) => b.id === v)?.hz ?? activeHz)}
        >
          {BANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id}
            </option>
          ))}
        </Drop>
        <Drop label={tx("filter")} value={filterVal} onChange={applyFilter}>
          <option value="off">{tx("filterOff")}</option>
          <option value="nr">{tx("nr")}</option>
          <option value="nb">{tx("nb")}</option>
          <option value="nrnb">{tx("filterNrNb")}</option>
        </Drop>
        <Drop label="PRE" value={s.pre} onChange={(v) => applyPre(v as (typeof PRE)[number])}>
          {PRE.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Drop>
        <Drop label="ATT" value={s.att ? "ON" : "OFF"} onChange={(v) => applyAtt(v === "ON")}>
          <option value="OFF">OFF</option>
          <option value="ON">ON</option>
        </Drop>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Drop label={tx("mode")} value={activeMode} onChange={(v) => applyMode(v as (typeof MODES)[number])}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Drop>
        <Drop label="AGC" value={s.agc} onChange={(v) => applyAgc(v as (typeof AGC)[number])}>
          {AGC.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Drop>
        <div className="col-span-2 flex items-end gap-1.5">
          <Chip
            tone={s.power ? "ok" : "amber"}
            active
            onClick={() => applyPower(!s.power)}
            disabled={!panelRadio && !(s.ic705.ble && s.ic705.phase === "ready")}
          >
            {s.power ? tx("powerOn") : tx("powerOff")}
          </Chip>
          <Chip tone={s.ptt ? "danger" : "ok"} active onClick={() => applyPtt(!s.ptt)} disabled={!s.power}>
            {s.ptt ? tx("pttOn") : tx("pttOff")}
          </Chip>
        </div>
      </div>
    </div>
  );
}

function bandOf(hz: number) {
  return BANDS.reduce((best, b) => (Math.abs(b.hz - hz) < Math.abs(best.hz - hz) ? b : best)).id;
}

function VfoFace({
  label,
  hz,
  mode,
  active,
  status,
  isTx,
  roe,
  roeLabel,
  onSelect,
  selectLabel,
  onStep,
  upLabel,
  downLabel,
}: {
  label: string;
  hz: number;
  mode: string;
  active: boolean;
  status: string;
  isTx: boolean;
  roe?: number;
  roeLabel: string;
  onSelect: () => void;
  selectLabel: string;
  onStep: (delta: number) => void;
  upLabel: string;
  downLabel: string;
}) {
  const { tx } = useConsole();
  const freqRef = useRef<HTMLDivElement>(null);
  const v = formatVfo(hz);
  const band = bandOf(hz);
  const roeTone =
    roe == null ? "" : roe >= 2 ? "text-[#f87171]" : roe >= 1.5 ? "text-[#ffb300]" : "text-[#34d399]";

  useEffect(() => {
    const el = freqRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      const dir = e.deltaY < 0 ? 1 : -1;
      const step = e.shiftKey ? 10_000 : e.ctrlKey || e.altKey || e.metaKey ? 100 : 1_000;
      onStep(dir * step);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onSelect, onStep]);

  return (
    <div
      className={`min-w-0 rounded-md px-1 py-0.5 ${
        active ? "bg-[#4fc3f7]/10 ring-1 ring-[#4fc3f7]/45" : "opacity-55"
      }`}
    >
      <div className="flex items-stretch justify-between gap-1">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          aria-pressed={active}
          aria-label={selectLabel}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-semibold tracking-[0.18em] uppercase">
            <span className={active ? "text-[#7ee0ff]" : "text-[#4fc3f7]/70"}>{label}</span>
            <span className={isTx ? "text-[#f87171]" : "text-[#34d399]"}>{status}</span>
          </div>
          <div
            ref={freqRef}
            title={tx("freqWheel")}
            className={`flex cursor-ns-resize items-end gap-0.5 leading-none ${active ? "text-[#7ee0ff]" : "text-[#4fc3f7]"}`}
            style={active ? { textShadow: "0 0 10px rgba(126,224,255,0.35)" } : undefined}
          >
            <span className="text-3xl font-semibold tracking-tight md:text-4xl">{v.int}</span>
            <span className="pb-0.5 text-3xl font-semibold md:text-4xl">.{v.khz}</span>
            <span className="pb-1 text-lg tracking-widest text-[#4fc3f7]/80">.{v.hz}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-[#0c2236] pt-1.5 text-[10px] tracking-[0.16em] uppercase">
            {roe != null ? (
              <>
                <span className="text-[#8ea0b3]">{roeLabel}</span>
                <span className={`font-['IBM_Plex_Mono'] text-sm font-semibold tracking-normal ${roeTone}`}>
                  {roe.toFixed(2)}
                </span>
                <span className="font-semibold text-[#ffb300]">{mode}</span>
              </>
            ) : (
              <>
                <span className="text-[#8ea0b3]">MHz</span>
                <span className="text-[#4fc3f7]">{band}</span>
                <span className="font-semibold text-[#ffb300]">{mode}</span>
              </>
            )}
          </div>
        </button>
        <div className="flex shrink-0 flex-col justify-center gap-0.5">
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md border border-[rgba(79,195,247,0.25)] text-[#4fc3f7] hover:bg-[#4fc3f7]/10"
            onClick={(e) => {
              e.stopPropagation();
              onStep(1000);
            }}
            aria-label={upLabel}
          >
            <ChevronUp size={14} />
          </button>
          <span className="text-center font-['IBM_Plex_Mono'] text-[8px] text-[#8ea0b3]">1 kHz</span>
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md border border-[rgba(79,195,247,0.25)] text-[#4fc3f7] hover:bg-[#4fc3f7]/10"
            onClick={(e) => {
              e.stopPropagation();
              onStep(-1000);
            }}
            aria-label={downLabel}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

const METER_SEGS = 36;

function sMeterFill(s: number) {
  if (s <= 9) return Math.max(0, Math.min(1, (s / 9) * 0.6));
  return Math.min(1, 0.6 + (Math.min(60, (s - 9) * 20) / 60) * 0.4);
}

function poSegColor(i: number, n: number) {
  const t = n <= 1 ? 0 : i / (n - 1);
  if (t < 0.52) return "#22c55e";
  if (t < 0.78) return "#eab308";
  return "#ef4444";
}

const S9_AT = sMeterFill(9);

function sSegColor(i: number) {
  const t = METER_SEGS <= 1 ? 0 : i / (METER_SEGS - 1);
  return t <= S9_AT ? "#4fc3f7" : "#ef4444";
}

function markSeg(at: number) {
  if (at <= 0) return 0;
  if (at >= 1) return METER_SEGS - 1;
  return Math.max(0, Math.round(at * METER_SEGS) - 1);
}

const S_MARKS = [1, 3, 5, 7, 9].map((s) => ({ label: String(s), at: sMeterFill(s) })).concat([
  { label: "+20", at: sMeterFill(10) },
  { label: "+40", at: sMeterFill(11) },
  { label: "+60", at: 1 },
]);

const PO_MARKS = [0, 2.5, 5, 7.5, 10].map((w) => ({ label: String(w), at: w / 10 }));

function Ic705Meter({
  txOn,
  sValue,
  po,
  sLabel,
  poLabel,
  sName,
}: {
  txOn: boolean;
  sValue: number;
  po: number;
  sLabel: { main: string; sub: string; dbm: number };
  poLabel: string;
  sName: string;
}) {
  const poFill = useEasedNumber(txOn ? Math.max(0, Math.min(1, po / 10)) : 0);
  const fill = txOn ? poFill : sMeterFill(sValue);
  const lit = Math.round(fill * METER_SEGS);
  const marks = txOn ? PO_MARKS : S_MARKS;
  const bySeg = new Map(marks.map((m) => [markSeg(m.at), m.label]));
  return (
    <div className="mt-3 rounded-lg border border-[#143048] bg-[#03080d] px-2.5 py-2">
      <div className="mb-1.5 flex items-end justify-between">
        <span className="font-['IBM_Plex_Mono'] text-[10px] font-semibold tracking-[0.18em] text-[#8ea0b3] uppercase">
          {txOn ? poLabel : sName}
        </span>
        {txOn ? (
          <span className="font-['IBM_Plex_Mono'] text-xs font-semibold text-[#86efac]">{po.toFixed(1)} W</span>
        ) : (
          <span className="font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7]">
            {sLabel.main}
            <span className="ml-1 text-[#ef4444]">{sLabel.sub}</span>
            <span className="ml-2 text-[#8ea0b3]">{sLabel.dbm} dBm</span>
          </span>
        )}
      </div>
      <div className="flex h-[18px] items-end gap-[2px]">
        {Array.from({ length: METER_SEGS }, (_, i) => {
          const on = i < lit;
          const color = txOn ? poSegColor(i, METER_SEGS) : sSegColor(i);
          const idle = txOn ? "#0d1c28" : color === "#ef4444" ? "#3a1518" : "#0d2a3c";
          return (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-[1px]"
              style={{
                height: bySeg.has(i) ? "100%" : "70%",
                background: on ? color : idle,
                boxShadow: on ? `0 0 5px ${color}` : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="relative mt-0.5 flex h-3.5 gap-[2px]">
        {Array.from({ length: METER_SEGS }, (_, i) => {
          const label = bySeg.get(i);
          const pin =
            i === 0 ? "left-0" : i === METER_SEGS - 1 ? "right-0 left-auto" : "left-1/2 -translate-x-1/2";
          const over = !txOn && i / Math.max(1, METER_SEGS - 1) > S9_AT;
          return (
            <span key={i} className="relative min-w-0 flex-1">
              {label ? (
                <span
                  className={`absolute top-0 whitespace-nowrap font-['IBM_Plex_Mono'] text-[8px] tracking-wide ${
                    over ? "text-[#ef4444]" : "text-[#5d7184]"
                  } ${pin}`}
                >
                  {label}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-['IBM_Plex_Mono'] text-[10px] font-semibold ${
        on ? "bg-[#4fc3f7] text-[#071018]" : "border border-white/10 bg-transparent text-[#5d7184]"
      }`}
    >
      {children}
    </span>
  );
}

export function Drop({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[9px] font-medium tracking-wide text-[#8ea0b3] uppercase">{label}</span>
      <ConsoleSelect className="h-8 px-2 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </ConsoleSelect>
    </label>
  );
}
