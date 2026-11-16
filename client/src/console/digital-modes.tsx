import { Save } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  compactStepMs,
  compactStripes,
  stickToBottom,
  stripeFromJson,
  trimStripes,
  viewNorm,
  WF_COMPACT,
  WF_ROW_PX,
  type FallPayload,
  type FallStripe,
} from "@shared/digital-waterfall";
import { expireConsoleSession } from "./console-auth";
import { useConsole } from "./state";
import {
  currentLayoutUser,
  DIGITAL_LAYOUT_MIN_H,
  defaultDigitalTiles,
  loadDigitalLayout,
  saveDigitalLayout,
  tilesEqual as digitalTilesEqual,
  type DigitalTile,
  type DigitalTileId,
} from "./digital-layout";
import { PanelBoard } from "./panel-board";
import { Chip, ConsoleInput, ConsoleSelect, Field, GhostBtn, PageHead, PanelTitle, PrimaryBtn } from "./widgets";
import { digTx, type DigKey } from "./digital-modes-copy";
import { graphView, useDigitalListen, type ListenPhase } from "./digital-listen";
import { onDigitalTx, publishDigitalTx, releaseDigitalTx, setDigitalTxPage } from "./digital-tx";
import {
  DIGITAL_STORE_KEY,
  alertHits,
  bandChipLabel,
  bandOfHz,
  candidates,
  dialForBand,
  dialsForMode,
  digReducer,
  formatDialMhz,
  formatVfoMhz,
  applyLiveContact,
  fromPrefs,
  rememberContact,
  hopBands,
  leftRows,
  localPhase,
  macroPreview,
  nowIndex,
  periodAt,
  pickCandidate,
  plannedText,
  rightRows,
  rowInk,
  toPrefs,
  utcClock,
  type DigAction,
  type DigPatch,
  type DecodeRow,
  type DigState,
  type Ink,
  type PaletteId,
  type TxId,
} from "./digital-modes-model";

type RxSnap = {
  ok?: boolean;
  enabled?: boolean;
  mode?: "FT8" | "FT4";
  hz?: number;
  band?: string;
  dialId?: string;
  phase?: ListenPhase;
  level?: number;
  dbfs?: number;
  decode?: { ran: boolean; count: number } | null;
  rows?: DecodeRow[];
};

const INK: Record<Ink, string> = {
  cyan: "text-[#4fc3f7]",
  amber: "text-[#ffb300]",
  green: "text-[#34d399]",
  red: "text-[#f87171]",
};

/** Shell do tile no grid — mesmo padrão do painel RF (só PanelTitle + corpo; chrome fica no PanelBoard). */
function DigLayoutTile({
  title,
  children,
  scroll,
}: {
  title: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <PanelTitle>{title}</PanelTitle>
      <div
        className={
          scroll
            ? "min-h-0 flex-1 overflow-auto"
            : "flex h-0 min-h-0 flex-1 flex-col overflow-hidden"
        }
      >
        {children}
      </div>
    </div>
  );
}

type Tab = "tx" | "filter" | "prefix" | "states" | "ignore" | "alerts" | "others";
const SET_TABS = ["general", "radio", "audio", "macros", "reporting", "frequencies", "colors", "advanced", "z"] as const;
type SetTab = (typeof SET_TABS)[number];

function loadState(): DigState {
  try {
    return applyLiveContact(fromPrefs(JSON.parse(localStorage.getItem(DIGITAL_STORE_KEY) || "null")));
  } catch {
    return applyLiveContact(fromPrefs(null));
  }
}

function DigTabsPanel({
  tab,
  setTab,
  t,
  state,
  dispatch,
  nowTx,
  alerts,
  hop,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  t: (k: DigKey) => string;
  state: DigState;
  dispatch: (a: DigAction) => void;
  nowTx: TxId | null;
  alerts: DecodeRow[];
  hop: string[] | null;
}) {
  return (
    <>
<div className="mb-3 flex gap-1 overflow-x-auto">
            <Chip active={tab === "tx"} onClick={() => setTab("tx")}>
              Tx1–Tx6
            </Chip>
            <Chip active={tab === "filter"} onClick={() => setTab("filter")}>
              {t("tabFilter")}
            </Chip>
            <Chip active={tab === "prefix"} onClick={() => setTab("prefix")}>
              {t("tabPrefix")}
            </Chip>
            <Chip active={tab === "states"} onClick={() => setTab("states")}>
              {t("tabStates")}
            </Chip>
            <Chip active={tab === "ignore"} onClick={() => setTab("ignore")}>
              {t("tabIgnore")}
            </Chip>
            <Chip active={tab === "alerts"} onClick={() => setTab("alerts")}>
              {t("tabAlerts")}
            </Chip>
            <Chip active={tab === "others"} onClick={() => setTab("others")}>
              {t("tabOthers")}
            </Chip>
          </div>
          {tab === "tx" ? (
            <div>
              <div className="mb-1 grid grid-cols-[32px_28px_minmax(0,1fr)] gap-1 text-[10px] tracking-wide text-[#5d7184] uppercase">
                <span>{t("next")}</span>
                <span>{t("now")}</span>
                <span>Tx</span>
              </div>
              {([1, 2, 3, 4, 5, 6] as TxId[]).map((n) => (
                <div
                  key={n}
                  className="mb-0.5 grid grid-cols-[32px_28px_minmax(0,1fr)] items-center gap-1"
                  onDoubleClick={() => n === 5 && dispatch({ type: "rr73" })}
                >
                  <label className="flex items-center gap-1 text-[11px] text-[#8ea0b3]">
                    <input type="radio" name="dig-next" checked={state.next === n} onChange={() => dispatch({ type: "next", tx: n })} />
                    {n}
                  </label>
                  <span className={`text-[11px] ${nowTx === n ? "text-[#ffb300]" : "text-[#5d7184]"}`}>{nowTx === n ? "●" : "○"}</span>
                  <ConsoleInput
                    className="h-8 font-['IBM_Plex_Mono'] text-xs"
                    aria-label={`Tx${n}`}
                    value={state.tx[n]}
                    onChange={(e) => dispatch({ type: "txText", tx: n, text: e.target.value })}
                  />
                </div>
              ))}
              <p className="mt-2 text-[11px] text-[#5d7184]">{t("rrHint")}</p>
            </div>
          ) : null}
          {tab === "filter" ? (
            <div className="grid gap-2">
              <p className="text-[11px] text-[#8ea0b3]">{t("filterNote")}</p>
              <p className="text-[11px] text-[#8ea0b3]">{t("dxccNote")}</p>
              <Toggle on={state.filterOn} label={t("filterOn")} onClick={() => patch(dispatch, { filterOn: !state.filterOn })} />
              <Toggle on={state.newCall} label={t("newCall")} onClick={() => patch(dispatch, { newCall: !state.newCall })} />
              <Toggle on={state.newDxcc} label={t("newDxcc")} onClick={() => patch(dispatch, { newDxcc: !state.newDxcc })} />
              <Toggle on={state.newBand} label={t("newBand")} onClick={() => patch(dispatch, { newBand: !state.newBand })} />
              <Toggle on={state.workedBand} label={t("workedBand")} onClick={() => patch(dispatch, { workedBand: !state.workedBand })} />
              <Toggle on={state.lotwOnly} label={t("lotw")} onClick={() => patch(dispatch, { lotwOnly: !state.lotwOnly })} />
              <Field label={t("continents")}>
                <ConsoleInput value={state.continents} onChange={(e) => patch(dispatch, { continents: e.target.value })} />
              </Field>
            </div>
          ) : null}
          {tab === "prefix" ? (
            <div className="grid gap-2">
              <ModeSelect label={t("prefixes")} value={state.prefixMode} t={t} onChange={(prefixMode) => patch(dispatch, { prefixMode })} />
              <ConsoleInput value={state.prefixes} onChange={(e) => patch(dispatch, { prefixes: e.target.value })} placeholder="20m:SP,SQ" />
              <p className="text-[11px] text-[#5d7184]">{t("prefixHint")}</p>
              <Field label={t("cqTargets")}>
                <ConsoleInput value={state.cqTargets} onChange={(e) => patch(dispatch, { cqTargets: e.target.value })} />
              </Field>
            </div>
          ) : null}
          {tab === "states" ? (
            <div className="grid gap-2">
              <ModeSelect label={t("states")} value={state.stateMode} t={t} onChange={(stateMode) => patch(dispatch, { stateMode })} />
              <ConsoleInput value={state.states} onChange={(e) => patch(dispatch, { states: e.target.value })} />
            </div>
          ) : null}
          {tab === "ignore" ? (
            <div className="grid gap-2">
              <Field label={t("ignoreTemp")}>
                <textarea
                  className="min-h-28 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 py-2 font-['IBM_Plex_Mono'] text-sm text-[#e8eef4] outline-none focus:border-[#4fc3f7]"
                  value={state.ignore}
                  onChange={(e) => patch(dispatch, { ignore: e.target.value })}
                />
              </Field>
              <p className="text-[11px] text-[#5d7184]">{t("ignoreHint")}</p>
              <GhostBtn onClick={() => dispatch({ type: "clearIgnore" })}>{t("ignoreClear")}</GhostBtn>
            </div>
          ) : null}
          {tab === "alerts" ? (
            <div className="grid gap-2">
              <Toggle on={state.alertNewCall} label={t("newCall")} onClick={() => patch(dispatch, { alertNewCall: !state.alertNewCall })} />
              <Toggle on={state.alertNewDxcc} label={t("newDxcc")} onClick={() => patch(dispatch, { alertNewDxcc: !state.alertNewDxcc })} />
              <Field label={t("alertList")}>
                <ConsoleInput value={state.alertList} onChange={(e) => patch(dispatch, { alertList: e.target.value })} />
              </Field>
              <p className="text-[11px] text-[#8ea0b3]">
                {t("alertLog")}: {alerts.length ? alerts.map((a) => a.message).join(" · ") : t("alertEmpty")}
              </p>
            </div>
          ) : null}
          {tab === "others" ? (
            <div className="grid gap-2">
              <Field label={t("bandHop")}>
                <textarea
                  className="min-h-20 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 py-2 font-['IBM_Plex_Mono'] text-sm text-[#e8eef4] outline-none focus:border-[#4fc3f7]"
                  value={state.bandHop}
                  placeholder="12:20m,40m"
                  onChange={(e) => patch(dispatch, { bandHop: e.target.value })}
                />
              </Field>
              <p className="text-[11px] text-[#5d7184]">{t("bandHopHint")}</p>
              {hop ? (
                <p className="text-sm text-[#ffb300]">
                  {t("hopNow")}: {hop.join(", ")}. {t("hopStay")}
                </p>
              ) : null}
              <Toggle on={state.modeSwitch} label={t("modeSwitch")} onClick={() => patch(dispatch, { modeSwitch: !state.modeSwitch })} />
              <div className="flex flex-wrap gap-3">
                <Mini label={t("autoCqN")}>
                  <Num value={state.autoCqN} onChange={(n) => patch(dispatch, { autoCqN: n })} />
                </Mini>
                <Mini label={t("autoCallN")}>
                  <Num value={state.autoCallN} onChange={(n) => patch(dispatch, { autoCallN: n })} />
                </Mini>
                <Readout k="#" v={String(state.switchLeft)} />
              </div>
              <Toggle on={state.treat73} label={t("treat73")} onClick={() => patch(dispatch, { treat73: !state.treat73 })} />
              <Mini label={t("minSignal")}>
                <Num value={state.minSignal} onChange={(n) => patch(dispatch, { minSignal: n })} />
              </Mini>
              <Field label={t("priority")}>
                <ConsoleSelect value={state.priority} onChange={(e) => patch(dispatch, { priority: e.target.value as DigState["priority"] })}>
                  <option value="last">{t("priLast")}</option>
                  <option value="signal">{t("priSignal")}</option>
                  <option value="distance">{t("priDistance")}</option>
                </ConsoleSelect>
              </Field>
              <Toggle on={state.callFirst} label={t("callFirst")} onClick={() => patch(dispatch, { callFirst: !state.callFirst })} />
            </div>
          ) : null}
    </>
  );
}

function DigControlsPanel({
  state,
  dispatch,
  t,
  period,
  band,
  fhLabel,
  setLogWarn,
  setLogOpen,
}: {
  state: DigState;
  dispatch: (a: DigAction) => void;
  t: (k: DigKey) => string;
  period: ReturnType<typeof periodAt>;
  band: string;
  fhLabel: string;
  setLogWarn: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
}) {
  return (
    <>
<div className="flex flex-wrap gap-1.5">
            <Toggle on={state.autoCq} label={t("autoCq")} title={t("airShort")} tone="amber" onClick={() => dispatch({ type: "autoCq" })} />
            <Toggle on={state.autoCall} label={t("autoCall")} title={t("airShort")} tone="amber" onClick={() => dispatch({ type: "autoCall" })} />
            <Toggle on={state.holdTx} label={t("hold")} title={t("holdHint")} onClick={() => dispatch({ type: "hold" })} />
            <Toggle
              on={state.txEven}
              locked={state.txEvenLocked}
              lockedWord={t("locked")}
              label={t("even")}
              title={t("evenHint")}
              onClick={() => dispatch({ type: "even" })}
              onDoubleClick={() => dispatch({ type: "evenLock" })}
            />
            <Field label={t("call")}>
              <ConsoleInput className="h-8 font-['IBM_Plex_Mono']" value={state.dxCall} onChange={(e) => dispatch({ type: "dx", call: e.target.value })} />
            </Field>
            <Field label={t("grid")}>
              <ConsoleInput className="h-8 font-['IBM_Plex_Mono']" value={state.dxGrid} onChange={(e) => dispatch({ type: "dx", grid: e.target.value })} />
            </Field>
            <Toggle on={state.fh !== "off"} label={`${t("fh")} ${fhLabel}`} onClick={() => dispatch({ type: "fh" })} />
            <Toggle on={state.cqOnly} label={t("cqOnly")} onClick={() => dispatch({ type: "cqOnly" })} />
            {state.mode === "FT4" ? <Toggle on={state.bestSp} label={t("best")} onClick={() => patch(dispatch, { bestSp: !state.bestSp })} /> : null}
            <GhostBtn
              onClick={() => {
                if (!state.dxCall.trim()) {
                  setLogWarn(true);
                  setLogOpen(true);
                  return;
                }
                setLogWarn(false);
                dispatch({ type: "log", at: new Date().toISOString(), band });
                setLogOpen(true);
              }}
            >
              {t("logQso")}
            </GhostBtn>
            <GhostBtn onClick={() => dispatch({ type: "stop", periodIndex: period.index })}>{t("stop")}</GhostBtn>
            <Toggle on={state.monitor} label={t("monitor")} onClick={() => dispatch({ type: "monitor" })} />
            <GhostBtn
              onClick={() => {
                dispatch({ type: "erase" });
                void fetch("/api/digital/rx", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ op: "clear" }),
                });
              }}
            >
              {t("erase")}
            </GhostBtn>
            <div className="flex flex-wrap gap-1">
              <span className="self-center text-[10px] tracking-wide text-[#5d7184] uppercase">{t("decode")}</span>
              <Chip active={state.decode === "fast"} onClick={() => dispatch({ type: "decode", depth: "fast" })}>
                {t("fast")}
              </Chip>
              <Chip active={state.decode === "normal"} onClick={() => dispatch({ type: "decode", depth: "normal" })}>
                {t("normal")}
              </Chip>
              <Chip active={state.decode === "deep"} onClick={() => dispatch({ type: "decode", depth: "deep" })}>
                {t("deep")}
              </Chip>
            </div>
            <Toggle
              on={state.enable}
              label={t("enable")}
              title={t("airShort")}
              tone="amber"
              onClick={() => {
                if (state.enable) releaseDigitalTx();
                dispatch({ type: "toggleEnable", periodIndex: period.index });
              }}
            />
            <button
              type="button"
              onClick={() => {
                releaseDigitalTx();
                dispatch({ type: "halt" });
              }}
              className="h-8 rounded-md border border-[#ef4444]/50 px-2.5 text-[11px] font-semibold text-[#f87171] hover:bg-[#ef4444]/10"
            >
              {t("halt")}
            </button>
            <Toggle on={state.tune} label={t("tune")} title={t("tuneHint")} tone="amber" onClick={() => dispatch({ type: "tune" })} />
            <Toggle on={state.pounce} label={t("pounce")} title={t("airShort")} tone="amber" onClick={() => dispatch({ type: "pounce" })} />
            <GhostBtn onClick={() => dispatch({ type: "generate" })}>{t("gen")}</GhostBtn>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[#5d7184]">{t("genHint")}</p>

    </>
  );
}

export function DigitalPage() {
  const { s, tx, lang, license, setFreq, setS } = useConsole();
  const t = (key: DigKey) => digTx(lang, key);
  const [state, dispatch] = useReducer(digReducer, undefined, loadState);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("tx");
  const [settings, setSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SetTab>("general");
  const [logOpen, setLogOpen] = useState(false);
  const [logWarn, setLogWarn] = useState(false);
  const [level, setLevel] = useState(0);
  const [dbfs, setDbfs] = useState(-120);
  const specRef = useRef<Float32Array | null>(null);
  const ready = useRef(false);
  const seeded = useRef(false);
  const [txHold, setTxHold] = useState(false);
  const [txPhase, setTxPhase] = useState("");
  const [txSent, setTxSent] = useState("");
  const [rxOn, setRxOn] = useState(false);
  const [rxPhase, setRxPhase] = useState<ListenPhase>("off");
  const [rxBusy, setRxBusy] = useState(false);
  const [rxError, setRxError] = useState("");
  const [dialId, setDialId] = useState("");
  const [stripes, setStripes] = useState<FallStripe[]>([]);
  const [fallGen, setFallGen] = useState(0);
  const rxPending = useRef(false);
  const layoutUser = currentLayoutUser();
  const [layoutTiles, setLayoutTiles] = useState<DigitalTile[]>(defaultDigitalTiles);
  const [layoutSaved, setLayoutSaved] = useState<DigitalTile[]>(defaultDigitalTiles);
  const [layoutBusy, setLayoutBusy] = useState(false);

  const vfo = s.vfo === "B" ? "B" : "A";
  const hz = vfo === "B" ? s.freqB : s.freq;
  const otherHz = vfo === "B" ? s.freq : s.freqB;
  const radioMode = vfo === "B" ? s.modeB : s.mode;
  const band = bandOfHz(hz);
  const radioOn = s.radios.items.some((r) => r.connected) || s.ic705.phase === "ready";
  const period = periodAt(now, state.mode);
  const phase = localPhase(state, period.even);
  const planned = plannedText(state);
  const nowTx = nowIndex(state, period.even);
  const left = leftRows(state, band);
  const right = rightRows(state);
  const picks = candidates(state, band);
  const pick = pickCandidate(picks, state.priority);
  const hop = hopBands(state.bandHop, new Date(now).getUTCHours());
  const alerts = state.rows.filter((row) => alertHits(row, state));
  const dials = dialsForMode(state.freqs, state.mode);
  const span = graphView(state.graphStart, state.graphBins, state.graphGain, state.graphZero, state.graphFlatten, state.graphSpec);

  useDigitalListen({
    enabled: rxOn && !txHold,
    mode: state.mode,
    graph: span,
    specRef,
    spectrumOnly: true,
    meterOnly: true,
    onLevel: (next, db) => {
      setLevel(next);
      setDbfs(db);
    },
    onPhase: () => undefined,
    onRows: () => undefined,
    onDecode: () => undefined,
  });

  const stateRef = useRef(state);
  stateRef.current = state;
  const applyRx = (snap: RxSnap) => {
    const on = Boolean(snap.enabled);
    setRxOn(on);
    if (on) setRxError("");
    const phase: ListenPhase = snap.phase === "on" || snap.phase === "busy" || snap.phase === "none" || snap.phase === "auth" ? snap.phase : "off";
    setRxPhase(phase);
    if (Array.isArray(snap.rows)) dispatch({ type: "syncRows", rows: snap.rows });
    if (!rxPending.current && on && (snap.mode === "FT8" || snap.mode === "FT4") && snap.mode !== stateRef.current.mode) {
      dispatch({ type: "mode", mode: snap.mode });
    }
    if (!rxPending.current && on && snap.dialId) setDialId(snap.dialId);
  };
  const applyRef = useRef(applyRx);
  applyRef.current = applyRx;

  const postRx = async (body: { op: string; mode?: DigState["mode"]; hz?: number; band?: string; dialId?: string }) => {
    rxPending.current = true;
    setRxBusy(true);
    setRxError("");
    try {
      const res = await fetch("/api/digital/rx", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        expireConsoleSession();
        return;
      }
      const snap = (await res.json().catch(() => null)) as RxSnap | null;
      if (!snap) {
        setRxError(t("ft8Fail"));
        return;
      }
      applyRef.current(snap);
      if (snap.ok === false) setRxError(t("ft8Fail"));
    } catch {
      setRxError(t("ft8Fail"));
    } finally {
      rxPending.current = false;
      setRxBusy(false);
    }
  };

  const txLevel = state.txPower > 0 ? Math.min(0.95, Math.max(0.25, state.txPower / 100)) : 0.65;

  useEffect(() => {
    let live = true;
    void loadDigitalLayout(layoutUser).then((next) => {
      if (!live) return;
      setLayoutTiles(next);
      setLayoutSaved(next);
    });
    return () => {
      live = false;
    };
  }, [layoutUser]);

  useEffect(() => {
    rememberContact(state);
  }, [state]);

  useEffect(() => {
    setDigitalTxPage(true);
    return () => setDigitalTxPage(false);
  }, []);

  useEffect(() => {
    publishDigitalTx({
      armed: state.enable && Boolean(planned.trim()) && planned.trim().toUpperCase() !== "TUNE",
      armId: state.armId,
      slot: state.next,
      mode: state.mode,
      even: state.txEven,
      message: planned.trim(),
      audioHz: state.txHz,
      port: s.wlg.hamlibPort || 4532,
      level: txLevel,
    });
  }, [state.enable, state.armId, state.next, state.mode, state.txEven, planned, state.txHz, txLevel, s.wlg.hamlibPort]);

  useEffect(() => {
    return onDigitalTx(
      (phase) => {
        setTxPhase(phase);
        setTxHold(phase === "wait" || phase === "audio" || phase === "ptt");
      },
      (info) => {
        setTxHold(false);
        setTxSent(info.message);
        setTxPhase(info.ok ? "done" : info.error || "error");
        if (!info.ok) return;
        dispatch({ type: "last", text: info.message });
        dispatch({ type: "txSent" });
      },
    );
  }, []);

  useEffect(() => {
    if (!state.monitor) dispatch({ type: "patch", patch: { monitor: true } });
  }, []);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const res = await fetch("/api/digital/rx", { credentials: "same-origin" });
        if (res.status === 401) {
          expireConsoleSession();
          return;
        }
        if (!res.ok || stop) return;
        const snap = (await res.json()) as RxSnap;
        if (!stop) applyRef.current(snap);
      } catch {
        /* a leitura seguinte tenta de novo */
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/digital/rx", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "navg", n: state.graphAvg }),
      signal: ctrl.signal,
    }).catch(() => undefined);
    return () => ctrl.abort();
  }, [state.graphAvg]);

  useEffect(() => {
    let stop = false;
    let after = 0;
    let gen = 0;
    let busy = false;
    const pull = async () => {
      if (busy || stop) return;
      busy = true;
      let restart = false;
      try {
        const res = await fetch(`/api/digital/waterfall?after=${after}`, { credentials: "same-origin" });
        if (res.status === 401) {
          expireConsoleSession();
          return;
        }
        if (!res.ok || stop) return;
        const body = (await res.json()) as FallPayload;
        if (stop || !body || !Array.isArray(body.stripes)) return;
        if (gen !== 0 && body.gen !== gen) {
          gen = 0;
          after = 0;
          setStripes([]);
          setFallGen(body.gen);
          restart = true;
        } else {
          gen = body.gen;
          setFallGen(body.gen);
          const fresh = body.stripes.map((row) => stripeFromJson(row)).filter((row): row is FallStripe => row != null);
          if (after === 0) {
            if (fresh.length) setStripes(trimStripes(fresh, Date.now()));
          } else if (fresh.length) setStripes((prev) => trimStripes([...prev, ...fresh], Date.now()));
          const last = body.stripes[body.stripes.length - 1];
          if (last && Number.isFinite(last.seq)) after = last.seq;
        }
      } catch {
        /* a leitura seguinte tenta de novo */
      } finally {
        busy = false;
        if (restart && !stop) void pull();
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 400);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    tick();
    const id = window.setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: "wd" }), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    dispatch({ type: "period", index: period.index, even: period.even, band });
  }, [period.index, period.even, band]);

  useEffect(() => {
    if (phase === "rx") return;
    dispatch({ type: "last", text: planned });
  }, [phase, planned]);

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      return;
    }
    try {
      localStorage.setItem(DIGITAL_STORE_KEY, JSON.stringify(toPrefs(state)));
    } catch {
      /* navegador sem espaço ou modo privado */
    }
  }, [state]);

  useEffect(() => {
    if (seeded.current) return;
    const call = license?.callsign?.trim().toUpperCase();
    if (!call) return;
    seeded.current = true;
    if (!state.myCall) dispatch({ type: "patch", patch: { myCall: call } });
  }, [license, state.myCall]);

  const note =
    state.note === "hound" ? t("houndNote") : state.note === "nocall" ? t("nocallNote") : state.note === "wd" ? t("wdNote") : state.note === "ptt" ? t("pttNotSent") : "";
  const statusWord = !state.monitor && phase === "rx" ? t("monitorOff") : phase === "tune" ? "Tune" : phase === "tx" || phase === "finish" ? t("tx") : t("receiving");
  const wdText = state.wdPending ? t("wdDone") : state.pounce || state.autoCq ? t("wdPaused") : clockSec(state.wdLeftSec);
  const fhLabel = state.fh === "fox" ? t("fox") : state.fh === "hound" ? t("hound") : "—";
  const picked =
    dials.find((d) => d.id === dialId) ??
    dialForBand(state.freqs, state.mode, band, hz) ??
    dials.find((d) => d.band === "20 m") ??
    dials[0] ??
    null;
  const selectValue = picked?.id ?? "";
  const selectMode = (mode: DigState["mode"]) => {
    dispatch({ type: "mode", mode });
    const next =
      dialForBand(state.freqs, mode, picked?.band || band, picked?.hz ?? hz) ??
      dialsForMode(state.freqs, mode).find((d) => d.band === "20 m") ??
      dialsForMode(state.freqs, mode)[0];
    if (next) setDialId(next.id);
    if (rxOn && next) void postRx({ op: "tune", mode, hz: next.hz, band: next.band, dialId: next.id });
  };
  const selectDial = (id: string) => {
    const next = dials.find((d) => d.id === id);
    if (!next) return;
    setDialId(next.id);
    if (rxOn) void postRx({ op: "tune", mode: state.mode, hz: next.hz, band: next.band, dialId: next.id });
  };
  const toggleRx = () => {
    if (rxBusy) return;
    if (rxOn) {
      void postRx({ op: "disable" });
      return;
    }
    if (!picked) return;
    void postRx({ op: "enable", mode: state.mode, hz: picked.hz, band: picked.band, dialId: picked.id });
  };
  const listenWord = rxPhase === "on" ? t("listenOn") : rxPhase === "busy" ? t("listenBusy") : rxPhase === "auth" ? t("listenAuth") : rxPhase === "none" ? t("listenNone") : t("listenOff");
  const layoutDirty = !digitalTilesEqual(layoutTiles, layoutSaved);
  const persistLayout = async () => {
    setLayoutBusy(true);
    try {
      const next = await saveDigitalLayout(layoutUser, layoutTiles);
      setLayoutTiles(next);
      setLayoutSaved(next);
      toast.success(tx("layoutSaved"));
    } catch {
      toast.error(tx("layoutSaveFail"));
    } finally {
      setLayoutBusy(false);
    }
  };

  const renderLayoutTile = (id: string): ReactNode => {
    const key = id as DigitalTileId;
    if (key === "status") {
      return (
        <DigLayoutTile title={t("tileStation")} scroll>
          <div className="flex flex-wrap items-center gap-3 font-['IBM_Plex_Mono'] text-[11px]">
            <Readout k={t("vfoHint")} v={`${band} · ${formatVfoMhz(hz)} MHz · ${radioMode} · VFO ${vfo}`} />
            {s.split ? <Readout k={t("splitOn")} v={formatVfoMhz(otherHz)} tone="green" /> : <Readout k={t("splitOff")} v="—" />}
            <Readout k="UTC" v={utcClock(now)} tone="amber" />
            <div className="flex items-center gap-1">
              <ConsoleSelect aria-label={t("band")} className="h-8 w-44" value={selectValue} onChange={(e) => selectDial(e.target.value)}>
                {dials.map((d) => (
                  <option key={d.id} value={d.id}>
                    {bandChipLabel(d, dials)}
                  </option>
                ))}
              </ConsoleSelect>
              <Chip active={state.mode === "FT8"} onClick={() => selectMode("FT8")}>
                {t("modeFt8")}
              </Chip>
              <Chip active={state.mode === "FT4"} onClick={() => selectMode("FT4")}>
                {t("modeFt4")}
              </Chip>
            </div>
            <div className="min-w-[160px]">
              <p className="text-[10px] tracking-wide text-[#5d7184] uppercase">{t("rxAudio")}</p>
              <Meter level={level} />
              <p className="mt-1 text-[10px] text-[#8ea0b3]">{Number.isFinite(dbfs) ? `${dbfs.toFixed(0)} dBFS` : "—"}</p>
            </div>
            <Readout k={t("rxAudio")} v={listenWord} tone={rxPhase === "on" ? "green" : undefined} />
          </div>
          {rxError ? <p className="mt-1 text-[11px] text-[#f87171]">{rxError}</p> : null}
        </DigLayoutTile>
      );
    }
    if (key === "waterfall") {
      return (
        <DigLayoutTile title={t("tileWaterfall")}>
          <div className="mb-2 flex shrink-0 flex-wrap items-end gap-3">
            <Mini label={t("start")}>
              <Num value={state.graphStart} onChange={(n) => dispatch({ type: "patch", patch: { graphStart: n } })} />
            </Mini>
            <Mini label={t("bins")}>
              <Num value={state.graphBins} onChange={(n) => dispatch({ type: "patch", patch: { graphBins: n } })} />
            </Mini>
            <Mini label={t("navg")}>
              <Num value={state.graphAvg} onChange={(n) => dispatch({ type: "patch", patch: { graphAvg: n } })} />
            </Mini>
            <Mini label={t("palette")}>
              <ConsoleSelect
                className="h-8"
                value={state.graphPalette}
                onChange={(e) => dispatch({ type: "patch", patch: { graphPalette: e.target.value as DigState["graphPalette"] } })}
              >
                <option value="cyan">{t("palCyan")}</option>
                <option value="amber">{t("palAmber")}</option>
                <option value="mix">{t("palMix")}</option>
              </ConsoleSelect>
            </Mini>
            <Toggle on={state.graphFlatten} label={t("flatten")} onClick={() => dispatch({ type: "patch", patch: { graphFlatten: !state.graphFlatten } })} />
            <Mini label={t("gain")}>
              <Num value={state.graphGain} onChange={(n) => dispatch({ type: "patch", patch: { graphGain: n } })} />
            </Mini>
            <Mini label={t("zero")}>
              <Num value={state.graphZero} onChange={(n) => dispatch({ type: "patch", patch: { graphZero: n } })} />
            </Mini>
            <Mini label={t("spec")}>
              <Num value={state.graphSpec} onChange={(n) => dispatch({ type: "patch", patch: { graphSpec: n } })} />
            </Mini>
            <Mini label="Rx">
              <Num value={state.rxHz} onChange={(n) => dispatch({ type: "graph", hz: n, moveTx: false })} />
            </Mini>
            <Mini label="Tx">
              <Num value={state.txHz} onChange={(n) => dispatch({ type: "patch", patch: { txHz: n } })} />
            </Mini>
          </div>
          <Waterfall
            fill
            stripes={stripes}
            revision={fallGen}
            start={span.start}
            end={span.end}
            gain={state.graphGain}
            zero={state.graphZero}
            flatten={state.graphFlatten}
            spec={state.graphSpec}
            palette={state.graphPalette}
            rx={state.rxHz}
            tx={state.txHz}
            emptyLabel={rxOn && stripes.length === 0 ? t("waterfallWait") : t("waterfallEmpty")}
            onPick={(hzPick) => dispatch({ type: "graph", hz: hzPick, moveTx: !state.holdTx })}
          />
        </DigLayoutTile>
      );
    }
    if (key === "bandActivity") {
      return (
        <DigLayoutTile title={t("bandActivity")}>
          <DecodeTable
            fill
            rows={left}
            empty={t("emptyBand")}
            labels={{ utc: t("colUtc"), db: t("colDb"), dt: t("colDt"), hz: t("colHz"), msg: t("colMsg") }}
            ink={(row) => rowInk(row, state, band)}
            highlight={state.highlightDx ? state.dxCall : ""}
            onRow={(row) => dispatch({ type: "double", row })}
            follow
          />
          <p className="mt-2 shrink-0 text-[11px] text-[#8ea0b3]">
            {t("candidates")}: {pick ? pick.message : t("none")} · {picks.length}
          </p>
        </DigLayoutTile>
      );
    }
    if (key === "rxFreq") {
      return (
        <DigLayoutTile title={t("rxFreq")}>
          <label className="mb-2 flex shrink-0 items-center gap-2 text-[11px] text-[#8ea0b3]">
            {t("rxWidth")}
            <ConsoleInput
              className="h-8 w-16 font-['IBM_Plex_Mono']"
              inputMode="numeric"
              value={String(state.rxWidth)}
              onChange={(e) => dispatch({ type: "patch", patch: { rxWidth: Number(e.target.value) || 0 } })}
            />
          </label>
          <DecodeTable
            fill
            rows={right}
            empty={t("emptyRx")}
            labels={{ utc: t("colUtc"), db: t("colDb"), dt: t("colDt"), hz: t("colHz"), msg: t("colMsg") }}
            ink={(row) => rowInk(row, state, band)}
            highlight={state.highlightDx ? state.dxCall : ""}
            onRow={(row) => dispatch({ type: "double", row })}
            compact
          />
        </DigLayoutTile>
      );
    }
    if (key === "tabs") {
      return (
        <DigLayoutTile title={t("tileTabs")} scroll>
          <DigTabsPanel tab={tab} setTab={setTab} t={t} state={state} dispatch={dispatch} nowTx={nowTx} alerts={alerts} hop={hop} />
        </DigLayoutTile>
      );
    }
    if (key === "controls") {
      return (
        <DigLayoutTile title={t("tileControls")} scroll>
          <DigControlsPanel state={state} dispatch={dispatch} t={t} period={period} band={band} fhLabel={fhLabel} setLogWarn={setLogWarn} setLogOpen={setLogOpen} />
        </DigLayoutTile>
      );
    }
    if (key === "footer") {
      return (
        <DigLayoutTile title={t("tileFooter")} scroll>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-['IBM_Plex_Mono'] text-[11px]">
            <span className={phase === "rx" ? "text-[#4fc3f7]" : "text-[#ffb300]"}>{statusWord}</span>
            <span className="text-[#8ea0b3]">{state.mode}</span>
            {(phase === "tx" || phase === "finish" || phase === "tune") && planned ? (
              <span className="text-[#e8eef4]">
                {t("localSeq")}: {planned}
              </span>
            ) : null}
            <span className="text-[#8ea0b3]">
              {t("last")}: {state.lastText || "—"}
            </span>
            <span className="text-[#8ea0b3]">
              {t("decodes")}: {state.rows.length}
            </span>
            {txSent || txPhase ? (
              <span className="text-[#ffb300]">
                {t("txDone")}: {txSent || "—"} {txPhase ? `· ${txPhase}` : ""}
              </span>
            ) : null}
            <span className="flex min-w-[132px] items-center gap-2 text-[#c5d4e0]">
              <span className="inline-block w-[4.25rem] shrink-0 text-right font-['IBM_Plex_Mono'] text-[11px] tabular-nums tracking-tight">
                {period.label}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#101c28]">
                <span className="block h-full bg-[#4fc3f7]" style={{ width: `${Math.min(100, (period.elapsed / period.period) * 100)}%` }} />
              </span>
            </span>
            <span className="text-[#8ea0b3]">
              {t("wd")} {wdText}
            </span>
            <label className="flex items-center gap-2 text-[#8ea0b3]">
              {t("txAudio")} {state.txPower}%
              <input
                type="range"
                min={0}
                max={100}
                value={state.txPower}
                aria-label={t("txPower")}
                onChange={(e) => patch(dispatch, { txPower: Number(e.target.value) })}
              />
            </label>
          </div>
          {note ? <p className="mt-2 text-[11px] text-[#ffb300]">{note}</p> : null}
        </DigLayoutTile>
      );
    }
    return null;
  };

  return (
    <div>
      <PageHead
        kicker={tx("digital")}
        title={tx("digitalTitle")}
        aside={
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              aria-pressed={rxOn}
              disabled={rxBusy}
              onClick={toggleRx}
              className={`inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-semibold transition-colors disabled:opacity-40 ${
                rxOn
                  ? "border-[#ffb300] text-[#ffb300] hover:bg-[#ffb300]/10"
                  : "border-[rgba(79,195,247,0.28)] text-[#4fc3f7] hover:bg-[#4fc3f7]/10"
              }`}
            >
              {rxOn ? t("ft8Off") : t("ft8On")}
            </button>
            <GhostBtn onClick={() => setSettings(true)}>{t("settings")}</GhostBtn>
            <PrimaryBtn disabled={layoutBusy || !layoutDirty} onClick={() => void persistLayout()}>
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
        tiles={layoutTiles}
        shown={layoutTiles.map((tile) => tile.id)}
        onChange={setLayoutTiles}
        render={renderLayoutTile}
        fillFitTile
        minH={DIGITAL_LAYOUT_MIN_H}
        compactTile
      />


      {settings ? (
        <Dialog title={t("settingsTitle")} onClose={() => setSettings(false)} closeLabel={t("close")}>
          <p className="mb-3 text-[11px] text-[#5d7184]">{t("savedLocal")}</p>
          <div className="mb-3 flex gap-1 overflow-x-auto">
            {SET_TABS.map((id) => (
              <Chip key={id} active={settingsTab === id} onClick={() => setSettingsTab(id)}>
                {t(SET_LABEL[id])}
              </Chip>
            ))}
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {settingsTab === "general" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("myCall")}>
                  <ConsoleInput value={state.myCall} onChange={(e) => patch(dispatch, { myCall: e.target.value.toUpperCase() })} />
                </Field>
                <Field label={t("myGrid")}>
                  <ConsoleInput value={state.myGrid} onChange={(e) => patch(dispatch, { myGrid: e.target.value.toUpperCase() })} />
                </Field>
                <Field label={t("region")}>
                  <ConsoleSelect value={String(state.region)} onChange={(e) => patch(dispatch, { region: Number(e.target.value) as 1 | 2 | 3 })}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </ConsoleSelect>
                </Field>
                <Field label={t("watchdog")}>
                  <Num value={state.watchdogMin} onChange={(n) => patch(dispatch, { watchdogMin: n })} />
                </Field>
                <Toggle on={state.customWd} label={t("customWd")} onClick={() => patch(dispatch, { customWd: !state.customWd })} />
                <Field label="FT8">
                  <Num value={state.wdFt8} onChange={(n) => patch(dispatch, { wdFt8: n })} />
                </Field>
                <Field label="FT4">
                  <Num value={state.wdFt4} onChange={(n) => patch(dispatch, { wdFt4: n })} />
                </Field>
              </div>
            ) : null}
            {settingsTab === "radio" ? (
              <div className="grid gap-3">
                <p className="text-sm text-[#c5d4e0]">{t("radioNote")}</p>
                <Readout k={t("vfoHint")} v={`${formatVfoMhz(hz)} MHz · ${radioMode} · VFO ${vfo}`} />
                <Readout k={t("splitLive")} v={s.split ? t("splitOn") : t("splitOff")} />
                <Field label={t("splitPref")}>
                  <ConsoleSelect value={state.splitPref} onChange={(e) => patch(dispatch, { splitPref: e.target.value as DigState["splitPref"] })}>
                    <option value="none">{t("splitNone")}</option>
                    <option value="rig">{t("splitRig")}</option>
                    <option value="fake">{t("splitFake")}</option>
                  </ConsoleSelect>
                </Field>
                <Field label={t("poll")}>
                  <Num value={state.pollSec} onChange={(n) => patch(dispatch, { pollSec: n })} />
                </Field>
                <p className="text-sm text-[#8ea0b3]">{radioOn ? t("catLive") : t("catIdle")}</p>
                <div className="flex gap-2">
                  <GhostBtn onClick={() => dispatch({ type: "note", note: "" })}>{t("testCat")}</GhostBtn>
                  <GhostBtn onClick={() => dispatch({ type: "note", note: "ptt" })}>{t("testPtt")}</GhostBtn>
                </div>
                {state.note === "ptt" ? <p className="text-sm text-[#ffb300]">{t("pttNotSent")}</p> : null}
              </div>
            ) : null}
            {settingsTab === "audio" ? (
              <div className="grid gap-3">
                <p className="text-sm leading-relaxed text-[#c5d4e0]">{t("audioNote")}</p>
                <Readout k={t("rxAudio")} v={rxPhase === "on" ? `${dbfs.toFixed(0)} dBFS` : listenWord} />
                <Field label={t("txPower")}>
                  <Num value={state.txPower} onChange={(n) => patch(dispatch, { txPower: n })} />
                </Field>
                <p className="text-[11px] text-[#5d7184]">{t("txPowerHint")}</p>
              </div>
            ) : null}
            {settingsTab === "macros" ? (
              <div className="grid gap-3">
                <p className="text-[11px] text-[#5d7184]">{t("macroHint")}</p>
                <textarea
                  className="min-h-28 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 py-2 font-['IBM_Plex_Mono'] text-sm text-[#e8eef4] outline-none focus:border-[#4fc3f7]"
                  value={state.macros}
                  onChange={(e) => patch(dispatch, { macros: e.target.value })}
                />
                <p className="font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7]">
                  {t("macroPreview")}: {macroPreview(state.macros, state.dxCall) || "—"}
                </p>
              </div>
            ) : null}
            {settingsTab === "reporting" ? (
              <div className="grid gap-3">
                <Field label={t("udpHost")}>
                  <ConsoleInput value={state.udpHost} onChange={(e) => patch(dispatch, { udpHost: e.target.value })} />
                </Field>
                <Field label={t("udpPort")}>
                  <ConsoleInput value={state.udpPort} onChange={(e) => patch(dispatch, { udpPort: e.target.value })} />
                </Field>
                <Toggle on={false} label={t("acceptUdp")} title={t("acceptUdpHint")} onClick={() => undefined} />
                <p className="text-[11px] text-[#5d7184]">{t("acceptUdpHint")}</p>
                <Toggle on={state.psk} label={t("psk")} onClick={() => patch(dispatch, { psk: !state.psk })} />
                <p className="text-[11px] text-[#5d7184]">{t("pskHint")}</p>
                <p className="text-sm text-[#8ea0b3]">
                  {t("logTitle")}: {state.log.length}
                </p>
              </div>
            ) : null}
            {settingsTab === "frequencies" ? (
              <div>
                <div className="mb-3">
                  <GhostBtn onClick={() => dispatch({ type: "resetFreqs" })}>{t("resetFreq")}</GhostBtn>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
                      <tr>
                        <th className="py-1 pr-3">{t("vfoHint")}</th>
                        <th className="py-1 pr-3">FT</th>
                        <th className="py-1 pr-3">MHz</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {state.freqs.map((f) => (
                        <tr key={f.id} className="border-t border-[rgba(79,195,247,0.08)]">
                          <td className="py-1 pr-3 text-[#c5d4e0]">{f.band}</td>
                          <td className="py-1 pr-3 font-['IBM_Plex_Mono'] text-[#4fc3f7]">{f.mode}</td>
                          <td className="py-1 pr-3">
                            <ConsoleInput
                              className="h-8 w-28 font-['IBM_Plex_Mono']"
                              defaultValue={formatDialMhz(f.hz)}
                              key={`${f.id}-${f.hz}`}
                              onBlur={(e) => dispatch({ type: "freq", id: f.id, mhz: e.target.value })}
                            />
                          </td>
                          <td className="py-1 text-[11px] text-[#ffb300]">
                            {f.provisional ? t("provisional") : ""}
                            {f.region1 ? ` ${t("region1")}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {settingsTab === "colors" ? (
              <div className="grid gap-3">
                <p className="text-[11px] text-[#5d7184]">{t("colorHint")}</p>
                <InkSelect label={t("colorCq")} value={state.colorCq} t={t} onChange={(colorCq) => patch(dispatch, { colorCq })} />
                <InkSelect label={t("colorNew")} value={state.colorNew} t={t} onChange={(colorNew) => patch(dispatch, { colorNew })} />
                <InkSelect label={t("colorWorked")} value={state.colorWorked} t={t} onChange={(colorWorked) => patch(dispatch, { colorWorked })} />
              </div>
            ) : null}
            {settingsTab === "advanced" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("txDelay")}>
                  <Num value={state.txDelay} onChange={(n) => patch(dispatch, { txDelay: n })} />
                </Field>
                <Field label={t("special")}>
                  <ConsoleSelect value={state.special} onChange={(e) => patch(dispatch, { special: e.target.value as DigState["special"] })}>
                    <option value="none">{t("specNone")}</option>
                    <option value="field">{t("fieldDay")}</option>
                    <option value="roundup">{t("roundup")}</option>
                    <option value="wwdigi">{t("wwdigi")}</option>
                    <option value="navhf">{t("navhf")}</option>
                    <option value="euvhf">{t("euvhf")}</option>
                    <option value="fox">{t("fox")}</option>
                    <option value="superfox">{t("superfox")}</option>
                    <option value="hound">{t("hound")}</option>
                  </ConsoleSelect>
                </Field>
                <Field label={t("toneSpace")}>
                  <ConsoleSelect value={String(state.toneX)} onChange={(e) => patch(dispatch, { toneX: Number(e.target.value) as 1 | 2 | 4 })}>
                    <option value="1">×1</option>
                    <option value="2">×2</option>
                    <option value="4">×4</option>
                  </ConsoleSelect>
                </Field>
              </div>
            ) : null}
            {settingsTab === "z" ? (
              <div className="grid gap-3">
                <p className="text-sm leading-relaxed text-[#c5d4e0]">{t("qrzNote")}</p>
                <Toggle on={state.autoIgnore} label={t("autoIgnore")} onClick={() => patch(dispatch, { autoIgnore: !state.autoIgnore })} />
                <Field label={t("ignorePermanent")}>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 py-2 font-['IBM_Plex_Mono'] text-sm text-[#e8eef4] outline-none focus:border-[#4fc3f7]"
                    value={state.ignorePermanent}
                    onChange={(e) => patch(dispatch, { ignorePermanent: e.target.value })}
                  />
                </Field>
                <Toggle on={state.clearOnBand} label={t("clearRx")} onClick={() => patch(dispatch, { clearOnBand: !state.clearOnBand })} />
                <Toggle on={state.dxccAll} label={t("dxccAll")} onClick={() => patch(dispatch, { dxccAll: !state.dxccAll })} />
                <Toggle on={state.highlightDx} label={t("highlightDx")} onClick={() => patch(dispatch, { highlightDx: !state.highlightDx })} />
                <Toggle on={state.alwaysAnswer} label={t("alwaysAnswer")} onClick={() => patch(dispatch, { alwaysAnswer: !state.alwaysAnswer })} />
                <Toggle on={state.noAllTxt} label={t("noAllTxt")} onClick={() => patch(dispatch, { noAllTxt: !state.noAllTxt })} />
                <Toggle on={state.noFoxLog} label={t("noFoxLog")} onClick={() => patch(dispatch, { noFoxLog: !state.noFoxLog })} />
              </div>
            ) : null}
          </div>
        </Dialog>
      ) : null}

      {logOpen ? (
        <Dialog title={t("logTitle")} onClose={() => setLogOpen(false)} closeLabel={t("close")}>
          <p className="mb-3 text-sm text-[#ffb300]">{t("logAir")}</p>
          {logWarn ? <p className="mb-3 text-sm text-[#f87171]">{t("logNeed")}</p> : null}
          {state.log.length === 0 ? (
            <p className="text-sm text-[#8ea0b3]">{t("logEmpty")}</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto font-['IBM_Plex_Mono'] text-xs text-[#c5d4e0]">
              {state.log.map((q, i) => (
                <li key={`${q.at}-${q.call}-${i}`}>
                  {q.at.slice(11, 19)} {q.mode} {q.band} {q.call} {q.grid} {q.report}
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      ) : null}
    </div>
  );
}

const SET_LABEL: Record<SetTab, DigKey> = {
  general: "general",
  radio: "radio",
  audio: "audio",
  macros: "macros",
  reporting: "reporting",
  frequencies: "frequencies",
  colors: "colors",
  advanced: "advanced",
  z: "zTab",
};

function patch(dispatch: (a: DigAction) => void, body: DigPatch) {
  dispatch({ type: "patch", patch: body });
}

function clockSec(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Readout({ k, v, tone }: { k: string; v: string; tone?: "amber" | "green" }) {
  const color = tone === "green" ? "text-[#34d399]" : tone === "amber" ? "text-[#ffb300]" : "text-[#e8eef4]";
  return (
    <div>
      <p className="text-[10px] tracking-wide text-[#5d7184] uppercase">{k}</p>
      <p className={`text-[11px] font-semibold ${color}`}>{v}</p>
    </div>
  );
}

function Meter({ level }: { level: number }) {
  const bars = Math.round(Math.max(0, Math.min(1, level)) * 12);
  return (
    <div className="mt-1 flex h-2 gap-px" aria-label={String(bars)}>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className={`h-2 flex-1 rounded-sm ${i < bars ? "bg-[#4fc3f7]" : "bg-[#1c2a32]"}`} />
      ))}
    </div>
  );
}

function Mini({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] tracking-wide text-[#5d7184] uppercase">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <ConsoleInput
      className="h-8 w-20 font-['IBM_Plex_Mono']"
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(e) => {
        const n = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function Toggle({
  on,
  label,
  onClick,
  onDoubleClick,
  title,
  locked,
  lockedWord,
  tone = "cyan",
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  onDoubleClick?: () => void;
  title?: string;
  locked?: boolean;
  lockedWord?: string;
  tone?: "cyan" | "amber";
}) {
  const active = tone === "amber" ? "border-[#ffb300] bg-[#ffb300] text-[#071018]" : "border-[#4fc3f7] bg-[#4fc3f7] text-[#071018]";
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`h-8 rounded-md border px-2.5 text-left text-[11px] font-semibold ${
        locked ? "border-[#f87171] text-[#f87171]" : on ? active : "border-[rgba(79,195,247,0.22)] text-[#c5d4e0] hover:border-[#4fc3f7]"
      }`}
    >
      {label}
      {locked && lockedWord ? ` · ${lockedWord}` : ""}
    </button>
  );
}

function ModeSelect({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: DigState["prefixMode"];
  onChange: (v: DigState["prefixMode"]) => void;
  t: (key: DigKey) => string;
}) {
  return (
    <Field label={label}>
      <ConsoleSelect value={value} onChange={(e) => onChange(e.target.value as DigState["prefixMode"])}>
        <option value="off">{t("off")}</option>
        <option value="include">{t("include")}</option>
        <option value="exclude">{t("exclude")}</option>
      </ConsoleSelect>
    </Field>
  );
}

function InkSelect({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: Ink;
  onChange: (v: Ink) => void;
  t: (key: DigKey) => string;
}) {
  return (
    <Field label={label}>
      <ConsoleSelect value={value} onChange={(e) => onChange(e.target.value as Ink)}>
        <option value="cyan">{t("palCyan")}</option>
        <option value="amber">{t("palAmber")}</option>
        <option value="green">OK</option>
        <option value="red">TX</option>
      </ConsoleSelect>
    </Field>
  );
}

function DecodeTable({
  rows,
  empty,
  labels,
  ink,
  highlight,
  onRow,
  compact,
  follow,
  fill,
}: {
  rows: DecodeRow[];
  empty: string;
  labels: { utc: string; db: string; dt: string; hz: string; msg: string };
  ink: (row: DecodeRow) => Ink | null;
  highlight: string;
  onRow: (row: DecodeRow) => void;
  compact?: boolean;
  follow?: boolean;
  fill?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    if (!follow) return;
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [follow, rows]);
  return (
    <div
      ref={scroller}
      data-band-activity={follow ? "1" : undefined}
      onScroll={(e) => {
        if (!follow) return;
        const el = e.currentTarget;
        stick.current = stickToBottom(el.scrollTop, el.scrollHeight, el.clientHeight);
      }}
      className={`overflow-auto rounded-md border border-[rgba(79,195,247,0.12)] bg-[#071018] ${
        fill ? "h-0 min-h-0 flex-1" : compact ? "max-h-52" : "max-h-64"
      }`}
    >
      <table className="w-full border-collapse text-left font-['IBM_Plex_Mono'] text-[11px]">
        <thead className="sticky top-0 bg-[#0b1520] text-[10px] tracking-wide text-[#ffb300] uppercase">
          <tr>
            <th className="px-2 py-1">{labels.utc}</th>
            <th className="px-2 py-1">{labels.db}</th>
            <th className="px-2 py-1">{labels.dt}</th>
            <th className="px-2 py-1">{labels.hz}</th>
            <th className="px-2 py-1">{labels.msg}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-[#5d7184]">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const tone = ink(row);
              const hit = highlight && row.message.toUpperCase().includes(highlight.toUpperCase());
              return (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-t border-[rgba(79,195,247,0.06)] hover:bg-[#4fc3f7]/10 ${tone ? INK[tone] : "text-[#c5d4e0]"} ${hit ? "bg-[#ffb300]/10" : ""}`}
                  onDoubleClick={() => onRow(row)}
                >
                  <td className="px-2 py-1">{row.utc}</td>
                  <td className="px-2 py-1">{row.db}</td>
                  <td className="px-2 py-1">{row.dt.toFixed(1)}</td>
                  <td className="px-2 py-1">{row.hz}</td>
                  <td className="px-2 py-1">{row.message}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function spectrumInk(norm: number, palette: PaletteId): [number, number, number] {
  const n = norm < 0 ? 0 : norm > 1 ? 1 : norm;
  if (palette === "amber") return [30 + n * 220, 18 + n * 140, 8];
  if (palette === "mix") return [8 + n * 200, 28 + n * 110, 24 + n * 40];
  return [4, 16 + n * 150, 26 + n * 214];
}

function Waterfall({
  stripes,
  revision,
  start,
  end,
  gain,
  zero,
  flatten,
  spec,
  palette,
  rx,
  tx,
  emptyLabel,
  onPick,
  fill,
}: {
  stripes: FallStripe[];
  revision: number;
  start: number;
  end: number;
  gain: number;
  zero: number;
  flatten: boolean;
  spec: number;
  palette: PaletteId;
  rx: number;
  tx: number;
  emptyLabel: string;
  onPick: (hz: number) => void;
  fill?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<() => void>(() => undefined);
  const rows = useMemo(() => compactStripes(stripes), [stripes]);
  const cycles = rows.reduce((n, row) => n + row.cuts.length, 0);
  const stepMs = useMemo(() => compactStepMs(stripes), [stripes]);

  useLayoutEffect(() => {
    const box = scroller.current;
    const paint = () => {
      const view = scroller.current;
      const node = canvas.current;
      const scale = scaleRef.current;
        if (!view || !node) return;
        const box = view.getBoundingClientRect();
        const w = Math.max(1, Math.floor(view.clientWidth || box.width || 320));
        const h = Math.max(1, Math.floor(view.clientHeight || box.height || 256));
      node.width = w;
      node.height = h;
      const ctx = node.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#03080d";
      ctx.fillRect(0, 0, w, h);
      const n = rows.length;
      const maxRows = Math.min(n, Math.max(1, Math.ceil(h / WF_ROW_PX)));
      if (n) {
        const img = ctx.createImageData(w, h);
        const data = img.data;
        const viewArgs = { startHz: start, endHz: end, gain, zero, flatten, spec };
        const lines: number[] = [];
        for (let i = 0; i < maxRows; i++) {
          const stripe = rows[n - 1 - i];
          if (!stripe) continue;
          const norm = viewNorm(stripe.cols, viewArgs, w);
          const yTop = i * WF_ROW_PX;
          const y0 = Math.max(0, Math.floor(yTop));
          const y1 = Math.min(h, Math.ceil(yTop + WF_ROW_PX));
          for (let py = y0; py < y1; py++) {
            for (let x = 0; x < w; x++) {
              const [r, g, b] = spectrumInk(norm[x] ?? 0, palette);
              const p = (py * w + x) * 4;
              data[p] = r;
              data[p + 1] = g;
              data[p + 2] = b;
              data[p + 3] = 255;
            }
          }
          for (const cut of stripe.cuts) lines.push(yTop + cut * WF_ROW_PX);
        }
        for (const cy0 of lines) {
          const py = Math.round(cy0);
          if (py < 0 || py >= h) continue;
          for (let x = 0; x < w; x++) {
            const p = (py * w + x) * 4;
            data[p] = 255;
            data[p + 1] = 179;
            data[p + 2] = 0;
            data[p + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      }
      const spanHz = Math.max(1, end - start);
      const mark = (hz: number, color: string) => {
        if (hz < start || hz > end) return;
        const x = ((hz - start) / spanHz) * w;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      };
      mark(rx, palette === "amber" ? "#ffb300" : "#4fc3f7");
      mark(tx, "#ffb300");
      if (!n) {
        ctx.fillStyle = "#5d7184";
        ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
        ctx.fillText(emptyLabel, 8, 18);
      }
      if (!scale) return;
      scale.width = w;
      scale.height = 18;
      const axis = scale.getContext("2d");
      if (!axis) return;
      axis.fillStyle = "#03080d";
      axis.fillRect(0, 0, w, 18);
      axis.strokeStyle = "rgba(79,195,247,0.2)";
      axis.fillStyle = "#5d7184";
      axis.font = "11px IBM Plex Mono, ui-monospace, monospace";
      for (let i = 0; i <= 6; i++) {
        const x = (w * i) / 6;
        axis.beginPath();
        axis.moveTo(x, 0);
        axis.lineTo(x, 6);
        axis.stroke();
        const markHz = Math.round(start + (spanHz * i) / 6);
        axis.fillText(String(markHz), Math.min(w - 40, Math.max(2, x + 2)), 16);
      }
    };
    paintRef.current = paint;
    paint();
    const obs = new ResizeObserver(() => paintRef.current());
    if (box) obs.observe(box);
    return () => obs.disconnect();
  }, [rows, revision, start, end, gain, zero, flatten, spec, palette, rx, tx, emptyLabel, fill]);

  return (
    <div className={fill ? "flex h-0 min-h-0 flex-1 flex-col" : undefined}>
      <div
        ref={scroller}
        data-waterfall="1"
        data-stripes={rows.length}
        data-cycles={cycles}
        data-compact={WF_COMPACT}
        data-step-ms={stepMs ?? ""}
        className={
          fill
            ? "relative min-h-[120px] flex-1 overflow-hidden rounded-md border border-[rgba(79,195,247,0.14)] bg-[#03080d]"
            : "h-64 overflow-hidden rounded-md border border-[rgba(79,195,247,0.14)] bg-[#03080d]"
        }
      >
        <canvas
          ref={canvas}
          className={fill ? "absolute inset-0 block h-full w-full" : "block h-64 w-full"}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const hz = start + ((e.clientX - rect.left) / Math.max(1, rect.width)) * Math.max(1, end - start);
            onPick(hz);
          }}
        />
      </div>
      <canvas ref={scaleRef} className="mt-1 h-[18px] w-full" />
    </div>
  );
}

function Dialog({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[140] grid place-items-center bg-black/60 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-[rgba(79,195,247,0.2)] bg-[#0b1520] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-['Space_Grotesk'] text-lg font-semibold text-white">{title}</h2>
          <GhostBtn onClick={onClose}>{closeLabel}</GhostBtn>
        </div>
        {children}
      </div>
    </div>
  );
}
