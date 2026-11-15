/**
 * Máquina de estado da tela Modos Digitais (FT8 / FT4).
 * Não decodifica áudio, não gera a portadora e não chaveia o rádio.
 * O modem LDPC fica de fora: as listas só recebem linhas se um modem futuro entregar.
 */

export type DigMode = "FT8" | "FT4";
export type TxId = 1 | 2 | 3 | 4 | 5 | 6;
export type DecodeDepth = "fast" | "normal" | "deep";
export type Priority = "last" | "signal" | "distance";
export type ListMode = "off" | "include" | "exclude";
export type FhMode = "off" | "fox" | "hound";
export type PaletteId = "cyan" | "amber" | "mix";
export type Ink = "cyan" | "amber" | "green" | "red";
export type SplitPref = "none" | "rig" | "fake";
export type SpecialOp = "none" | "field" | "roundup" | "wwdigi" | "navhf" | "euvhf" | "fox" | "superfox" | "hound";

export type DialFreq = {
  id: string;
  band: string;
  mode: DigMode;
  hz: number;
  provisional: boolean;
  region1: boolean;
};

export type DecodeRow = {
  id: string;
  utc: string;
  db: number;
  dt: number;
  hz: number;
  message: string;
  even: boolean;
  dxcc?: string;
  continent?: string;
  lotw?: boolean;
  state?: string;
  distanceKm?: number;
};

export type LocalQso = {
  at: string;
  call: string;
  grid: string;
  report: string;
  band: string;
  mode: DigMode;
};

export type TxMsgs = Record<TxId, string>;

export type DigState = {
  mode: DigMode;
  myCall: string;
  myGrid: string;
  region: 1 | 2 | 3;
  dxCall: string;
  dxGrid: string;
  report: string;
  tx: TxMsgs;
  next: TxId;
  autoSeq: boolean;
  autoCq: boolean;
  autoCall: boolean;
  enable: boolean;
  tune: boolean;
  pounce: boolean;
  monitor: boolean;
  holdTx: boolean;
  txEven: boolean;
  txEvenLocked: boolean;
  cqOnly: boolean;
  fh: FhMode;
  decode: DecodeDepth;
  rxHz: number;
  txHz: number;
  rxWidth: number;
  rows: DecodeRow[];
  seenCalls: string[];
  seenBand: string[];
  finishPeriod: number | null;
  lastPeriod: number | null;
  filterOn: boolean;
  newCall: boolean;
  newDxcc: boolean;
  newBand: boolean;
  workedBand: boolean;
  continents: string;
  lotwOnly: boolean;
  prefixMode: ListMode;
  prefixes: string;
  cqTargets: string;
  stateMode: ListMode;
  states: string;
  ignore: string;
  ignorePermanent: string;
  alertNewCall: boolean;
  alertNewDxcc: boolean;
  alertList: string;
  alerts: string[];
  minSignal: number;
  priority: Priority;
  treat73: boolean;
  bandHop: string;
  modeSwitch: boolean;
  autoCqN: number;
  autoCallN: number;
  switchLeft: number;
  callFirst: boolean;
  bestSp: boolean;
  watchdogMin: number;
  customWd: boolean;
  wdFt8: number;
  wdFt4: number;
  wdLeftSec: number;
  wdPending: boolean;
  autoIgnore: boolean;
  graphStart: number;
  graphBins: number;
  graphPalette: PaletteId;
  graphAvg: number;
  graphFlatten: boolean;
  graphGain: number;
  graphZero: number;
  graphSpec: number;
  txPower: number;
  splitPref: SplitPref;
  pollSec: number;
  macros: string;
  udpHost: string;
  udpPort: string;
  acceptUdp: false;
  psk: boolean;
  txDelay: number;
  special: SpecialOp;
  toneX: 1 | 2 | 4;
  colorCq: Ink;
  colorNew: Ink;
  colorWorked: Ink;
  clearOnBand: boolean;
  dxccAll: boolean;
  highlightDx: boolean;
  alwaysAnswer: boolean;
  noAllTxt: boolean;
  noFoxLog: boolean;
  freqs: DialFreq[];
  log: LocalQso[];
  lastText: string;
  note: "" | "hound" | "nocall" | "wd" | "ptt";
  /** Sempre zero: não há medidor de áudio ligado a esta tela. */
  audioRx: 0;
};

export type DigAction =
  | { type: "autoCq" }
  | { type: "autoCall" }
  | { type: "toggleEnable"; periodIndex: number }
  | { type: "stop"; periodIndex: number }
  | { type: "halt" }
  | { type: "tune" }
  | { type: "pounce" }
  | { type: "monitor" }
  | { type: "erase" }
  | { type: "hold" }
  | { type: "even" }
  | { type: "evenLock" }
  | { type: "cqOnly" }
  | { type: "fh" }
  | { type: "decode"; depth: DecodeDepth }
  | { type: "mode"; mode: DigMode }
  | { type: "next"; tx: TxId }
  | { type: "txText"; tx: TxId; text: string }
  | { type: "rr73" }
  | { type: "generate" }
  | { type: "dx"; call?: string; grid?: string; report?: string }
  | { type: "double"; row: DecodeRow }
  | { type: "graph"; hz: number; moveTx: boolean }
  | { type: "period"; index: number; even: boolean; band: string }
  | { type: "wd" }
  | { type: "note"; note: DigState["note"] }
  | { type: "last"; text: string }
  | { type: "log"; at: string; band: string }
  | { type: "freq"; id: string; mhz: string }
  | { type: "resetFreqs" }
  | { type: "clearIgnore" }
  | { type: "heard"; rows: DecodeRow[] }
  | { type: "syncRows"; rows: DecodeRow[] }
  | { type: "patch"; patch: DigPatch };

export type DigPatch = Partial<
  Pick<
    DigState,
    | "myCall"
    | "myGrid"
    | "region"
    | "filterOn"
    | "newCall"
    | "newDxcc"
    | "newBand"
    | "workedBand"
    | "continents"
    | "lotwOnly"
    | "prefixMode"
    | "prefixes"
    | "cqTargets"
    | "stateMode"
    | "states"
    | "ignore"
    | "ignorePermanent"
    | "alertNewCall"
    | "alertNewDxcc"
    | "alertList"
    | "minSignal"
    | "priority"
    | "treat73"
    | "bandHop"
    | "modeSwitch"
    | "autoCqN"
    | "autoCallN"
    | "switchLeft"
    | "callFirst"
    | "bestSp"
    | "watchdogMin"
    | "customWd"
    | "wdFt8"
    | "wdFt4"
    | "autoIgnore"
    | "graphStart"
    | "graphBins"
    | "graphPalette"
    | "graphAvg"
    | "graphFlatten"
    | "graphGain"
    | "graphZero"
    | "graphSpec"
    | "txPower"
    | "splitPref"
    | "pollSec"
    | "macros"
    | "udpHost"
    | "udpPort"
    | "psk"
    | "txDelay"
    | "special"
    | "toneX"
    | "colorCq"
    | "colorNew"
    | "colorWorked"
    | "clearOnBand"
    | "dxccAll"
    | "highlightDx"
    | "alwaysAnswer"
    | "noAllTxt"
    | "noFoxLog"
    | "rxHz"
    | "txHz"
    | "rxWidth"
    | "holdTx"
    | "monitor"
    | "cqOnly"
    | "txEven"
    | "txEvenLocked"
  >
>;

const STORE_VERSION = 1;

function dial(band: string, mode: DigMode, mhz: string, provisional = false, region1 = false): DialFreq {
  const hz = Math.round(Number(mhz) * 1_000_000);
  return { id: `${mode}-${band}-${mhz}`, band, mode, hz, provisional, region1 };
}

/** Lista padrão do WSJT-X já conferida no estudo. Sem 60 m e sem 70 cm. */
export function defaultFreqs(): DialFreq[] {
  return [
    dial("160 m", "FT8", "1.840"),
    dial("80 m", "FT8", "3.573"),
    dial("40 m", "FT8", "7.074"),
    dial("30 m", "FT8", "10.136"),
    dial("20 m", "FT8", "14.074"),
    dial("17 m", "FT8", "18.100"),
    dial("15 m", "FT8", "21.074"),
    dial("12 m", "FT8", "24.915"),
    dial("10 m", "FT8", "28.074"),
    dial("6 m", "FT8", "50.313"),
    dial("6 m", "FT8", "50.323"),
    dial("4 m", "FT8", "70.154", false, true),
    dial("2 m", "FT8", "144.174"),
    dial("80 m", "FT4", "3.575", true),
    dial("40 m", "FT4", "7.0475", true),
    dial("30 m", "FT4", "10.140", true),
    dial("20 m", "FT4", "14.080", true),
    dial("17 m", "FT4", "18.104", true),
    dial("15 m", "FT4", "21.140"),
    dial("12 m", "FT4", "24.919", true),
    dial("10 m", "FT4", "28.180"),
    dial("6 m", "FT4", "50.318", true),
    dial("2 m", "FT4", "144.170"),
  ];
}

export function dialsForMode(freqs: DialFreq[], mode: DigMode): DialFreq[] {
  return freqs.filter((f) => f.mode === mode);
}

/** Dial do modo na banda. Se houver dois (6 m), fica o mais perto do VFO. */
export function dialForBand(freqs: DialFreq[], mode: DigMode, band: string, nearHz = 0): DialFreq | null {
  const rows = dialsForMode(freqs, mode).filter((d) => d.band === band);
  if (!rows.length) return null;
  return rows.reduce((a, b) => (Math.abs(a.hz - nearHz) <= Math.abs(b.hz - nearHz) ? a : b));
}

/** Rótulo do botão. A segunda frequência da mesma banda leva o MHz. */
export function bandChipLabel(dial: DialFreq, all: DialFreq[]): string {
  const twin = all.some((d) => d.band === dial.band && d.id !== dial.id);
  if (!twin) return dial.band;
  const mhz = dial.hz / 1_000_000;
  const digits = dial.hz % 1000 === 0 ? 3 : 4;
  return `${dial.band} ${mhz.toFixed(digits).replace(".", ",")}`;
}

export function formatDialMhz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  return (hz / 1_000_000).toFixed(hz % 1000 === 0 ? 3 : 4);
}

export function formatVfoMhz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  return (hz / 1_000_000).toFixed(6);
}

const BANDS: [number, number, string][] = [
  [1_800_000, 2_000_000, "160 m"],
  [3_500_000, 4_000_000, "80 m"],
  [5_300_000, 5_500_000, "60 m"],
  [7_000_000, 7_300_000, "40 m"],
  [10_100_000, 10_150_000, "30 m"],
  [14_000_000, 14_350_000, "20 m"],
  [18_068_000, 18_168_000, "17 m"],
  [21_000_000, 21_450_000, "15 m"],
  [24_890_000, 24_990_000, "12 m"],
  [28_000_000, 29_700_000, "10 m"],
  [50_000_000, 54_000_000, "6 m"],
  [70_000_000, 70_500_000, "4 m"],
  [144_000_000, 148_000_000, "2 m"],
  [420_000_000, 450_000_000, "70 cm"],
];

export function bandOfHz(hz: number): string {
  for (const [lo, hi, name] of BANDS) {
    if (hz >= lo && hz <= hi) return name;
  }
  return "—";
}

export function utcClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function periodAt(ms: number, mode: DigMode): { period: number; index: number; elapsed: number; even: boolean; label: string } {
  const d = new Date(ms);
  const sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  const period = mode === "FT8" ? 15 : 7.5;
  const index = Math.floor(sec / period);
  const elapsed = sec - index * period;
  const trim = (n: number) => {
    const s = n.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };
  return { period, index, elapsed, even: index % 2 === 0, label: `${trim(elapsed)}/${trim(period)}` };
}

export function graphEnd(start: number, bins: number): number {
  const span = Math.max(400, 1600 * Math.max(1, Math.round(bins)));
  return start + span;
}

function emptyTx(): TxMsgs {
  return { 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" };
}

export function createDigState(): DigState {
  const s: DigState = {
    mode: "FT8",
    myCall: "",
    myGrid: "",
    region: 2,
    dxCall: "",
    dxGrid: "",
    report: "",
    tx: emptyTx(),
    next: 6,
    autoSeq: false,
    autoCq: false,
    autoCall: false,
    enable: false,
    tune: false,
    pounce: false,
    monitor: true,
    holdTx: false,
    txEven: false,
    txEvenLocked: false,
    cqOnly: false,
    fh: "off",
    decode: "normal",
    rxHz: 1500,
    txHz: 1500,
    rxWidth: 10,
    rows: [],
    seenCalls: [],
    seenBand: [],
    finishPeriod: null,
    lastPeriod: null,
    filterOn: false,
    newCall: false,
    newDxcc: false,
    newBand: false,
    workedBand: false,
    continents: "",
    lotwOnly: false,
    prefixMode: "off",
    prefixes: "",
    cqTargets: "",
    stateMode: "off",
    states: "",
    ignore: "",
    ignorePermanent: "",
    alertNewCall: false,
    alertNewDxcc: false,
    alertList: "",
    alerts: [],
    minSignal: -30,
    priority: "last",
    treat73: false,
    bandHop: "",
    modeSwitch: false,
    autoCqN: 5,
    autoCallN: 5,
    switchLeft: 5,
    callFirst: false,
    bestSp: false,
    watchdogMin: 6,
    customWd: false,
    wdFt8: 3,
    wdFt4: 2,
    wdLeftSec: 6 * 60,
    wdPending: false,
    autoIgnore: false,
    graphStart: 100,
    graphBins: 2,
    graphPalette: "cyan",
    graphAvg: 1,
    graphFlatten: false,
    graphGain: 0,
    graphZero: 0,
    graphSpec: 30,
    txPower: 0,
    splitPref: "none",
    pollSec: 2,
    macros: "",
    udpHost: "",
    udpPort: "2333",
    acceptUdp: false,
    psk: false,
    txDelay: 0.2,
    special: "none",
    toneX: 1,
    colorCq: "cyan",
    colorNew: "amber",
    colorWorked: "red",
    clearOnBand: false,
    dxccAll: false,
    highlightDx: true,
    alwaysAnswer: false,
    noAllTxt: true,
    noFoxLog: false,
    freqs: defaultFreqs(),
    log: [],
    lastText: "",
    note: "",
    audioRx: 0,
  };
  return s;
}

export function wdLimitSec(s: Pick<DigState, "customWd" | "mode" | "wdFt4" | "wdFt8" | "watchdogMin">): number {
  const min = s.customWd ? (s.mode === "FT4" ? s.wdFt4 : s.wdFt8) : s.watchdogMin;
  return Math.max(1, Math.round(min)) * 60;
}

function joinMsg(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(" ");
}

export function standardMessages(myCall: string, myGrid: string, dxCall: string, _dxGrid: string, report: string): TxMsgs {
  const me = myCall.trim().toUpperCase();
  const g = myGrid.trim().toUpperCase();
  const dx = dxCall.trim().toUpperCase();
  const rep = report.trim().replace(/^R/i, "");
  return {
    1: joinMsg(["CQ", me, g]),
    2: joinMsg([dx, me, g]),
    3: joinMsg([dx, me, rep]),
    4: joinMsg([dx, me, rep ? `R${rep}` : ""]),
    5: joinMsg([dx, me, "RRR"]),
    6: joinMsg([dx, me, "73"]),
  };
}

export function formatReport(db: number): string {
  if (!Number.isFinite(db)) return "";
  const n = Math.round(db);
  return n > 0 ? `+${n}` : String(n);
}

const GRID_RE = /^[A-R]{2}\d{2}([A-X]{2})?$/;

export function isGrid(token: string): boolean {
  return GRID_RE.test(token.trim().toUpperCase());
}

export function isCall(token: string): boolean {
  const t = token.trim().toUpperCase();
  if (!t || t === "CQ" || t === "RRR" || t === "RR73" || t === "73") return false;
  if (isGrid(t)) return false;
  if (!/^[A-Z0-9]+(?:\/[A-Z0-9]+)?$/.test(t)) return false;
  if (!/\d/.test(t)) return false;
  return t.replace(/\/.*$/, "").length >= 3;
}

export function parseDx(message: string, myCall: string): { call: string; grid: string } {
  const tokens = message.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const calls: string[] = [];
  let grid = "";
  for (const t of tokens) {
    if (isGrid(t)) {
      grid = t;
      continue;
    }
    if (isCall(t)) calls.push(t);
  }
  const me = myCall.trim().toUpperCase();
  const cq = tokens[0] === "CQ";
  let call = "";
  if (cq) call = calls[calls.length - 1] || "";
  else if (me && calls[0] === me && calls[1]) call = calls[1];
  else if (calls.length >= 2) call = calls[1];
  else call = calls[0] || "";
  return { call, grid };
}

export function isCqMessage(message: string, treat73: boolean): boolean {
  const tokens = message.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens[0] === "CQ") return true;
  if (!treat73) return false;
  const last = tokens[tokens.length - 1] || "";
  return last === "73" || last === "RR73";
}

export function directedTo(message: string, myCall: string): boolean {
  const me = myCall.trim().toUpperCase();
  if (!me) return false;
  const first = message.trim().toUpperCase().split(/\s+/)[0] || "";
  return first === me;
}

function listTokens(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function ignored(s: DigState, call: string): boolean {
  const bag = new Set([...listTokens(s.ignore), ...listTokens(s.ignorePermanent)]);
  return bag.has(call.toUpperCase());
}

function workedOnBand(s: DigState, call: string, band: string): boolean {
  return s.log.some((q) => q.call.toUpperCase() === call.toUpperCase() && q.band === band);
}

function prefixRules(text: string, band: string): { okBand: boolean; token: string }[] {
  const bandKey = band.replace(/\s+/g, "").toUpperCase();
  const out: { okBand: boolean; token: string }[] = [];
  for (const line of text.split(/\n+/)) {
    const raw = line.trim();
    if (!raw) continue;
    const m = raw.match(/^(\d+\s*m)\s*:\s*(.+)$/i);
    if (m) {
      const lineBand = m[1]!.replace(/\s+/g, "").toUpperCase();
      const okBand = lineBand === bandKey;
      for (const token of m[2]!.split(",")) {
        const t = token.trim();
        if (t) out.push({ okBand, token: t });
      }
    } else {
      for (const token of raw.split(",")) {
        const t = token.trim();
        if (t) out.push({ okBand: true, token: t });
      }
    }
  }
  return out;
}

function prefixHit(call: string, dxcc: string | undefined, token: string): boolean {
  if (token.startsWith("+")) {
    const name = token.slice(1).trim().toUpperCase();
    return Boolean(dxcc) && dxcc!.trim().toUpperCase() === name;
  }
  return call.toUpperCase().startsWith(token.toUpperCase());
}

function listPass(mode: ListMode, hits: boolean, anyRule: boolean): boolean {
  if (mode === "off" || !anyRule) return true;
  if (mode === "include") return hits;
  return !hits;
}

export function callRejected(call: string): boolean {
  if (!call) return true;
  if (call.toUpperCase().endsWith("/R")) return true;
  return !isCall(call);
}

export function passesFilter(row: DecodeRow, s: DigState, band: string): boolean {
  const dx = parseDx(row.message, s.myCall);
  if (callRejected(dx.call)) return false;
  if (ignored(s, dx.call)) return false;
  if (s.alwaysAnswer && directedTo(row.message, s.myCall)) return true;
  if (s.filterOn && row.db < s.minSignal) return false;
  if (!s.filterOn) return true;
  if (s.newCall && s.seenCalls.includes(dx.call)) return false;
  if (s.newBand && s.seenBand.includes(`${band}:${dx.call}`)) return false;
  if (s.newDxcc) {
    if (!row.dxcc) return false;
    if (s.seenCalls.includes(`dxcc:${row.dxcc}`)) return false;
  }
  if (s.lotwOnly && row.lotw !== true) return false;
  if (s.workedBand && workedOnBand(s, dx.call, band)) return false;
  const continents = listTokens(s.continents);
  if (continents.length) {
    if (!row.continent || !continents.includes(row.continent.toUpperCase())) return false;
  }
  const rules = prefixRules(s.prefixes, band).filter((r) => r.okBand);
  const hit = rules.some((r) => prefixHit(dx.call, row.dxcc, r.token));
  if (!listPass(s.prefixMode, hit, rules.length > 0)) return false;
  const states = listTokens(s.states);
  const stateHit = Boolean(row.state) && states.includes(row.state!.toUpperCase());
  if (s.stateMode === "include" && states.length && !stateHit) return false;
  if (s.stateMode === "exclude" && stateHit) return false;
  const targets = listTokens(s.cqTargets);
  if (targets.length && row.message.trim().toUpperCase().startsWith("CQ")) {
    const tokens = row.message.trim().toUpperCase().split(/\s+/);
    const directed = tokens.slice(1).some((t) => targets.includes(t) && !isCall(t) && !isGrid(t));
    const plain = tokens[1] && (isCall(tokens[1]) || isGrid(tokens[1]));
    if (!plain && !directed) return false;
  }
  return true;
}

export function leftRows(s: DigState, band: string): DecodeRow[] {
  const rows = s.rows.filter((row) => {
    if (s.cqOnly && !isCqMessage(row.message, s.treat73)) return false;
    if (s.filterOn && !passesFilter(row, s, band)) return false;
    return true;
  });
  if (s.priority === "signal") return [...rows].sort((a, b) => b.db - a.db);
  if (s.priority === "distance") {
    return [...rows].sort((a, b) => {
      const da = typeof a.distanceKm === "number" ? a.distanceKm : Number.POSITIVE_INFINITY;
      const db = typeof b.distanceKm === "number" ? b.distanceKm : Number.POSITIVE_INFINITY;
      return db - da;
    });
  }
  return rows;
}

export function rightRows(s: DigState): DecodeRow[] {
  return s.rows.filter((row) => Math.abs(row.hz - s.rxHz) <= s.rxWidth || directedTo(row.message, s.myCall));
}

export function candidates(s: DigState, band: string): DecodeRow[] {
  return s.rows.filter((row) => {
    if (!passesFilter(row, s, band)) return false;
    if ((s.autoCall || s.cqOnly) && !isCqMessage(row.message, s.treat73)) return false;
    return true;
  });
}

export function pickCandidate(rows: DecodeRow[], priority: Priority): DecodeRow | null {
  if (!rows.length) return null;
  if (priority === "signal") return [...rows].sort((a, b) => b.db - a.db)[0]!;
  if (priority === "distance") {
    const withD = rows.filter((r) => typeof r.distanceKm === "number");
    if (!withD.length) return rows[rows.length - 1]!;
    return [...withD].sort((a, b) => b.distanceKm! - a.distanceKm!)[0]!;
  }
  return rows[rows.length - 1]!;
}

export function alertHits(row: DecodeRow, s: DigState): boolean {
  const dx = parseDx(row.message, s.myCall);
  if (!dx.call) return false;
  if (s.alertNewCall && !s.seenCalls.includes(dx.call)) return true;
  if (s.alertNewDxcc && row.dxcc && !s.seenCalls.includes(`dxcc:${row.dxcc}`)) return true;
  const custom = listTokens(s.alertList);
  return custom.some((t) => dx.call.includes(t) || dx.call.startsWith(t));
}

function clampHz(n: number): number {
  if (!Number.isFinite(n)) return 1500;
  return Math.max(0, Math.min(5000, Math.round(n)));
}

function applyRow(s: DigState, row: DecodeRow, answer: boolean): DigState {
  if (s.fh === "hound" && s.mode === "FT8" && !row.even) return { ...s, note: "hound" };
  const dx = parseDx(row.message, s.myCall);
  if (!dx.call) return { ...s, note: "nocall" };
  const report = formatReport(row.db);
  const hold = s.holdTx || s.fh === "fox";
  return {
    ...s,
    dxCall: dx.call,
    dxGrid: dx.grid,
    report,
    tx: standardMessages(s.myCall, s.myGrid, dx.call, dx.grid, report),
    rxHz: clampHz(row.hz),
    txHz: hold ? s.txHz : clampHz(row.hz),
    txEven: s.txEvenLocked ? s.txEven : !row.even,
    holdTx: s.fh === "fox" ? true : s.holdTx,
    next: answer ? 2 : s.next,
    note: "",
  };
}

function haltState(s: DigState): DigState {
  return {
    ...s,
    autoCq: false,
    autoCall: false,
    enable: false,
    tune: false,
    pounce: false,
    finishPeriod: null,
    wdPending: false,
    wdLeftSec: wdLimitSec(s),
  };
}

function armed(s: DigState): boolean {
  return s.enable || s.autoCq || s.autoCall || s.tune || s.finishPeriod != null;
}

export function localPhase(s: DigState, even: boolean): "rx" | "tx" | "tune" | "finish" {
  if (s.tune) return "tune";
  if (s.finishPeriod != null) return "finish";
  if ((s.enable || s.autoCq || s.autoCall) && even === s.txEven) return "tx";
  return "rx";
}

/** Auto CQ deixa o seletor em Tx6. O texto de CQ continua o Tx1. */
export function plannedText(s: DigState): string {
  if (s.tune) return "Tune";
  if (s.autoCq && s.next === 6) return s.tx[1];
  return s.tx[s.next];
}

export function nowIndex(s: DigState, even: boolean): TxId | null {
  const phase = localPhase(s, even);
  if (phase === "rx" || phase === "tune") return null;
  if (s.autoCq && s.next === 6) return 1;
  return s.next;
}

export function macroPreview(macros: string, dxCall: string): string {
  const dx = dxCall.trim().toUpperCase();
  return macros.replaceAll("$DXCALL", dx).replaceAll("$DX", dx);
}

export function hopBands(text: string, utcHour: number): string[] | null {
  for (const line of text.split(/\n+/)) {
    const m = line.trim().match(/^(\d{1,2})\s*:\s*(.+)$/);
    if (!m) continue;
    if (Number(m[1]) % 24 !== utcHour) continue;
    const bands = m[2]!.split(",").map((b) => b.trim()).filter(Boolean);
    return bands.length ? bands : null;
  }
  return null;
}

export function rowInk(row: DecodeRow, s: DigState, band: string): Ink | null {
  const dx = parseDx(row.message, s.myCall);
  if (dx.call && workedOnBand(s, dx.call, band)) return s.colorWorked;
  if (row.dxcc && s.newDxcc && !s.seenCalls.includes(`dxcc:${row.dxcc}`)) return s.colorNew;
  if (row.message.trim().toUpperCase().startsWith("CQ")) return s.colorCq;
  return null;
}

function rememberRows(s: DigState, band: string): DigState {
  const seenCalls = new Set(s.seenCalls);
  const seenBand = new Set(s.seenBand);
  for (const row of s.rows) {
    const call = parseDx(row.message, s.myCall).call;
    if (!call) continue;
    seenCalls.add(call);
    seenBand.add(`${band}:${call}`);
    if (row.dxcc) seenCalls.add(`dxcc:${row.dxcc}`);
  }
  return { ...s, seenCalls: Array.from(seenCalls), seenBand: Array.from(seenBand) };
}

function pounceRow(s: DigState): DecodeRow | null {
  const want = s.dxCall.trim().toUpperCase();
  if (!want) return null;
  const hits = s.rows.filter((row) => {
    const dx = parseDx(row.message, s.myCall);
    if (dx.call !== want) return false;
    return isCqMessage(row.message, true);
  });
  return pickCandidate(hits, s.priority);
}

export function digReducer(state: DigState, action: DigAction): DigState {
  switch (action.type) {
    case "autoCq": {
      if (state.autoCq) {
        return { ...state, autoCq: false, note: "" };
      }
      return {
        ...state,
        autoCq: true,
        autoCall: false,
        next: 6,
        autoSeq: true,
        txEven: state.txEvenLocked ? state.txEven : true,
        finishPeriod: null,
        note: "",
      };
    }
    case "autoCall": {
      if (state.autoCall) return { ...state, autoCall: false, note: "" };
      return {
        ...state,
        autoCall: true,
        autoCq: false,
        cqOnly: true,
        filterOn: true,
        workedBand: true,
        finishPeriod: null,
        note: "",
      };
    }
    case "toggleEnable": {
      if (state.enable) return { ...state, enable: false, finishPeriod: action.periodIndex };
      return { ...state, enable: true, finishPeriod: null, note: "" };
    }
    case "stop": {
      const was = state.enable || state.autoCq || state.autoCall || state.tune;
      return {
        ...state,
        enable: false,
        autoCq: false,
        autoCall: false,
        tune: false,
        finishPeriod: was ? action.periodIndex : state.finishPeriod,
      };
    }
    case "halt":
      return { ...haltState(state), note: "" };
    case "tune":
      return state.tune ? { ...state, tune: false } : { ...state, tune: true, note: "" };
    case "pounce":
      return { ...state, pounce: !state.pounce };
    case "monitor":
      return { ...state, monitor: !state.monitor };
    case "erase":
      return { ...state, rows: [], lastText: "", alerts: [] };
    case "hold":
      return { ...state, holdTx: !state.holdTx };
    case "even":
      return { ...state, txEven: !state.txEven };
    case "evenLock":
      return { ...state, txEvenLocked: !state.txEvenLocked };
    case "cqOnly":
      return { ...state, cqOnly: !state.cqOnly };
    case "fh": {
      const order: FhMode[] = ["off", "fox", "hound"];
      const fh = order[(order.indexOf(state.fh) + 1) % order.length]!;
      return { ...state, fh, holdTx: fh === "fox" ? true : state.holdTx };
    }
    case "decode":
      return { ...state, decode: action.depth };
    case "mode":
      return { ...state, mode: action.mode, wdLeftSec: wdLimitSec({ ...state, mode: action.mode }), bestSp: action.mode === "FT4" ? state.bestSp : false };
    case "next":
      return { ...state, next: action.tx };
    case "txText":
      return { ...state, tx: { ...state.tx, [action.tx]: action.text } };
    case "rr73": {
      const cur = state.tx[5];
      const next = cur.includes("RR73") ? cur.replace("RR73", "RRR") : cur.includes("RRR") ? cur.replace("RRR", "RR73") : cur;
      return { ...state, tx: { ...state.tx, 5: next } };
    }
    case "generate":
      return {
        ...state,
        tx: standardMessages(state.myCall, state.myGrid, state.dxCall, state.dxGrid, state.report),
      };
    case "dx":
      return {
        ...state,
        dxCall: action.call != null ? action.call.toUpperCase() : state.dxCall,
        dxGrid: action.grid != null ? action.grid.toUpperCase() : state.dxGrid,
        report: action.report != null ? action.report : state.report,
      };
    case "double":
      return applyRow(state, action.row, true);
    case "graph":
      return {
        ...state,
        rxHz: clampHz(action.hz),
        txHz: action.moveTx && !state.holdTx ? clampHz(action.hz) : state.txHz,
      };
    case "period": {
      if (state.lastPeriod == null) return { ...state, lastPeriod: action.index };
      if (state.lastPeriod === action.index) return state;
      let n = state;
      if (n.wdPending) {
        const call = n.dxCall.trim().toUpperCase();
        n = haltState(n);
        if (n.autoIgnore && call) {
          const lines = n.ignore.split("\n").map((l) => l.trim()).filter(Boolean);
          if (!lines.some((l) => l.toUpperCase() === call)) lines.push(call);
          n = { ...n, ignore: lines.join("\n"), autoIgnore: state.autoIgnore };
        }
        n = { ...n, note: "wd", autoIgnore: state.autoIgnore };
      }
      if (n.finishPeriod != null && n.finishPeriod !== action.index) n = { ...n, finishPeriod: null };
      if (n.modeSwitch && (n.autoCq || n.autoCall) && n.switchLeft > 0) {
        const left = n.switchLeft - 1;
        if (left <= 0) {
          if (n.autoCq) {
            n = { ...n, autoCq: false, autoCall: true, cqOnly: true, filterOn: true, workedBand: true, switchLeft: Math.max(1, n.autoCallN) };
          } else {
            n = {
              ...n,
              autoCall: false,
              autoCq: true,
              next: 6,
              autoSeq: true,
              txEven: n.txEvenLocked ? n.txEven : true,
              switchLeft: Math.max(1, n.autoCqN),
            };
          }
        } else n = { ...n, switchLeft: left };
      }
      if (n.pounce) {
        const hit = pounceRow(n);
        if (hit) {
          n = applyRow(n, hit, true);
          n = { ...n, pounce: false, enable: true, autoCq: false, finishPeriod: null };
        }
      } else if (n.autoCall && action.even === n.txEven && !n.dxCall.trim()) {
        const pick = pickCandidate(candidates(n, action.band), n.priority);
        if (pick) n = applyRow(n, pick, true);
      } else if (n.autoCq && n.callFirst && !n.dxCall.trim()) {
        const replies = n.rows.filter((row) => directedTo(row.message, n.myCall));
        const pick = replies[0];
        if (pick) n = applyRow(n, pick, true);
      }
      n = rememberRows(n, action.band);
      return { ...n, lastPeriod: action.index };
    }
    case "wd": {
      if (state.pounce || state.autoCq) return state;
      const limit = wdLimitSec(state);
      if (!armed(state)) return state.wdLeftSec === limit && !state.wdPending ? state : { ...state, wdLeftSec: limit, wdPending: false };
      if (state.wdLeftSec <= 1) return { ...state, wdLeftSec: 0, wdPending: true };
      return { ...state, wdLeftSec: state.wdLeftSec - 1 };
    }
    case "note":
      return { ...state, note: action.note };
    case "last":
      return state.lastText === action.text ? state : { ...state, lastText: action.text };
    case "log": {
      const call = state.dxCall.trim().toUpperCase();
      if (!call) return state;
      const entry: LocalQso = {
        at: action.at,
        call,
        grid: state.dxGrid.trim().toUpperCase(),
        report: state.report.trim(),
        band: action.band,
        mode: state.mode,
      };
      return { ...state, log: [entry, ...state.log].slice(0, 200) };
    }
    case "freq": {
      const mhz = Number(action.mhz.trim().replace(",", "."));
      if (!Number.isFinite(mhz) || mhz <= 0) return state;
      const hz = Math.round(mhz * 1_000_000);
      return { ...state, freqs: state.freqs.map((f) => (f.id === action.id ? { ...f, hz } : f)) };
    }
    case "resetFreqs":
      return { ...state, freqs: defaultFreqs() };
    case "clearIgnore":
      return { ...state, ignore: "" };
    case "heard": {
      const fresh = action.rows.filter((row) => row.message.trim() && !row.message.startsWith("Error ["));
      if (!fresh.length) return state;
      return { ...state, rows: [...state.rows, ...fresh].slice(-300) };
    }
    case "syncRows": {
      const rows = action.rows.filter((row) => row.message.trim()).slice(-300);
      if (rows.length === state.rows.length && rows.every((row, i) => row.id === state.rows[i]?.id)) return state;
      return { ...state, rows };
    }
    case "patch": {
      const next = { ...state, ...action.patch, acceptUdp: false as const, audioRx: 0 as const, rows: state.rows };
      if (action.patch.watchdogMin != null || action.patch.customWd != null || action.patch.wdFt8 != null || action.patch.wdFt4 != null) {
        next.wdLeftSec = wdLimitSec(next);
      }
      if (action.patch.modeSwitch) next.switchLeft = next.autoCall ? next.autoCallN : next.autoCqN;
      return next;
    }
    default:
      return state;
  }
}

/** Linhas de teste ou de um modem futuro. A tela não chama isto. */
export function withRows(s: DigState, rows: DecodeRow[]): DigState {
  return { ...s, rows };
}

const PREF_KEYS = [
  "mode",
  "myCall",
  "myGrid",
  "region",
  "dxCall",
  "dxGrid",
  "report",
  "tx",
  "next",
  "autoSeq",
  "monitor",
  "holdTx",
  "txEven",
  "txEvenLocked",
  "cqOnly",
  "fh",
  "decode",
  "rxHz",
  "txHz",
  "rxWidth",
  "filterOn",
  "newCall",
  "newDxcc",
  "newBand",
  "workedBand",
  "continents",
  "lotwOnly",
  "prefixMode",
  "prefixes",
  "cqTargets",
  "stateMode",
  "states",
  "ignore",
  "ignorePermanent",
  "alertNewCall",
  "alertNewDxcc",
  "alertList",
  "minSignal",
  "priority",
  "treat73",
  "bandHop",
  "modeSwitch",
  "autoCqN",
  "autoCallN",
  "switchLeft",
  "callFirst",
  "bestSp",
  "watchdogMin",
  "customWd",
  "wdFt8",
  "wdFt4",
  "autoIgnore",
  "graphStart",
  "graphBins",
  "graphPalette",
  "graphAvg",
  "graphFlatten",
  "graphGain",
  "graphZero",
  "graphSpec",
  "txPower",
  "splitPref",
  "pollSec",
  "macros",
  "udpHost",
  "udpPort",
  "psk",
  "txDelay",
  "special",
  "toneX",
  "colorCq",
  "colorNew",
  "colorWorked",
  "clearOnBand",
  "dxccAll",
  "highlightDx",
  "alwaysAnswer",
  "noAllTxt",
  "noFoxLog",
  "freqs",
  "log",
] as const;

export function toPrefs(s: DigState): Record<string, unknown> {
  const out: Record<string, unknown> = { v: STORE_VERSION };
  for (const key of PREF_KEYS) out[key] = s[key];
  return out;
}

function asMode(v: unknown): DigMode | null {
  return v === "FT8" || v === "FT4" ? v : null;
}

function asTx(v: unknown): TxMsgs | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const tx = emptyTx();
  for (const n of [1, 2, 3, 4, 5, 6] as TxId[]) {
    if (typeof o[n] !== "string" && typeof o[String(n)] !== "string") return null;
    tx[n] = String(o[n] ?? o[String(n)] ?? "");
  }
  return tx;
}

function asFreqs(v: unknown): DialFreq[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const out: DialFreq[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const mode = asMode(o.mode);
    const hz = typeof o.hz === "number" ? Math.round(o.hz) : NaN;
    if (!mode || !Number.isFinite(hz) || hz <= 0) continue;
    if (typeof o.band !== "string" || typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      band: o.band,
      mode,
      hz,
      provisional: o.provisional === true,
      region1: o.region1 === true,
    });
  }
  return out.length ? out.slice(0, 40) : null;
}

export function fromPrefs(raw: unknown, licenseCall = ""): DigState {
  const base = createDigState();
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (k: string, fallback: string) => (typeof o[k] === "string" ? (o[k] as string) : fallback);
  const bool = (k: string, fallback: boolean) => (typeof o[k] === "boolean" ? (o[k] as boolean) : fallback);
  const num = (k: string, fallback: number) => (typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : fallback);
  base.mode = asMode(o.mode) ?? base.mode;
  base.myCall = str("myCall", licenseCall).toUpperCase();
  base.myGrid = str("myGrid", "");
  base.region = o.region === 1 || o.region === 2 || o.region === 3 ? o.region : 2;
  base.dxCall = str("dxCall", "");
  base.dxGrid = str("dxGrid", "");
  base.report = str("report", "");
  base.tx = asTx(o.tx) ?? base.tx;
  base.next = ([1, 2, 3, 4, 5, 6] as TxId[]).includes(o.next as TxId) ? (o.next as TxId) : 6;
  base.monitor = bool("monitor", true);
  base.holdTx = bool("holdTx", false);
  base.txEven = bool("txEven", false);
  base.txEvenLocked = bool("txEvenLocked", false);
  base.cqOnly = bool("cqOnly", false);
  base.fh = o.fh === "fox" || o.fh === "hound" ? o.fh : "off";
  base.decode = o.decode === "fast" || o.decode === "deep" ? o.decode : "normal";
  base.rxHz = clampHz(num("rxHz", 1500));
  base.txHz = clampHz(num("txHz", 1500));
  base.rxWidth = Math.max(5, Math.min(500, Math.round(num("rxWidth", 10))));
  base.filterOn = bool("filterOn", false);
  base.newCall = bool("newCall", false);
  base.newDxcc = bool("newDxcc", false);
  base.newBand = bool("newBand", false);
  base.workedBand = bool("workedBand", false);
  base.continents = str("continents", "");
  base.lotwOnly = bool("lotwOnly", false);
  base.prefixMode = o.prefixMode === "include" || o.prefixMode === "exclude" ? o.prefixMode : "off";
  base.prefixes = str("prefixes", "");
  base.cqTargets = str("cqTargets", "");
  base.stateMode = o.stateMode === "include" || o.stateMode === "exclude" ? o.stateMode : "off";
  base.states = str("states", "");
  base.ignore = str("ignore", "");
  base.ignorePermanent = str("ignorePermanent", "");
  base.alertNewCall = bool("alertNewCall", false);
  base.alertNewDxcc = bool("alertNewDxcc", false);
  base.alertList = str("alertList", "");
  base.minSignal = Math.max(-50, Math.min(50, Math.round(num("minSignal", -30))));
  base.priority = o.priority === "signal" || o.priority === "distance" ? o.priority : "last";
  base.treat73 = bool("treat73", false);
  base.bandHop = str("bandHop", "");
  base.modeSwitch = bool("modeSwitch", false);
  base.autoCqN = Math.max(0, Math.round(num("autoCqN", 5)));
  base.autoCallN = Math.max(0, Math.round(num("autoCallN", 5)));
  base.switchLeft = Math.max(0, Math.round(num("switchLeft", base.autoCqN)));
  base.callFirst = bool("callFirst", false);
  base.bestSp = bool("bestSp", false);
  base.watchdogMin = Math.max(1, Math.round(num("watchdogMin", 6)));
  base.customWd = bool("customWd", false);
  base.wdFt8 = Math.max(1, Math.round(num("wdFt8", 3)));
  base.wdFt4 = Math.max(1, Math.round(num("wdFt4", 2)));
  base.autoIgnore = bool("autoIgnore", false);
  base.graphStart = Math.max(0, Math.min(5000, Math.round(num("graphStart", 100))));
  base.graphBins = Math.max(1, Math.min(16, Math.round(num("graphBins", 2))));
  base.graphPalette = o.graphPalette === "amber" || o.graphPalette === "mix" ? o.graphPalette : "cyan";
  base.graphAvg = Math.max(1, Math.min(99, Math.round(num("graphAvg", 1))));
  base.graphFlatten = bool("graphFlatten", false);
  base.graphGain = num("graphGain", 0);
  base.graphZero = num("graphZero", 0);
  base.graphSpec = Math.max(0, Math.min(100, Math.round(num("graphSpec", 30))));
  base.txPower = Math.max(0, Math.min(100, Math.round(num("txPower", 0))));
  base.splitPref = o.splitPref === "rig" || o.splitPref === "fake" ? o.splitPref : "none";
  base.pollSec = Math.max(1, Math.min(10, Math.round(num("pollSec", 2))));
  base.macros = str("macros", "").slice(0, 400);
  base.udpHost = str("udpHost", "");
  base.udpPort = str("udpPort", "2333");
  base.psk = bool("psk", false);
  base.txDelay = num("txDelay", 0.2);
  base.special =
    o.special === "field" || o.special === "roundup" || o.special === "wwdigi" || o.special === "navhf" || o.special === "euvhf" || o.special === "fox" || o.special === "superfox" || o.special === "hound"
      ? o.special
      : "none";
  base.toneX = o.toneX === 2 || o.toneX === 4 ? o.toneX : 1;
  base.colorCq = ink(o.colorCq, "cyan");
  base.colorNew = ink(o.colorNew, "amber");
  base.colorWorked = ink(o.colorWorked, "red");
  base.clearOnBand = bool("clearOnBand", false);
  base.dxccAll = bool("dxccAll", false);
  base.highlightDx = bool("highlightDx", true);
  base.alwaysAnswer = bool("alwaysAnswer", false);
  base.noAllTxt = bool("noAllTxt", true);
  base.noFoxLog = bool("noFoxLog", false);
  base.freqs = asFreqs(o.freqs) ?? defaultFreqs();
  base.log = asLog(o.log);
  base.autoCq = false;
  base.autoCall = false;
  base.enable = false;
  base.tune = false;
  base.pounce = false;
  base.rows = [];
  base.seenCalls = [];
  base.seenBand = [];
  base.acceptUdp = false;
  base.audioRx = 0;
  base.finishPeriod = null;
  base.wdPending = false;
  base.lastPeriod = null;
  base.note = "";
  base.lastText = "";
  base.alerts = [];
  base.wdLeftSec = wdLimitSec(base);
  if (!base.myCall && licenseCall) base.myCall = licenseCall.trim().toUpperCase();
  return base;
}

function ink(v: unknown, fallback: Ink): Ink {
  return v === "cyan" || v === "amber" || v === "green" || v === "red" ? v : fallback;
}

function asLog(v: unknown): LocalQso[] {
  if (!Array.isArray(v)) return [];
  const out: LocalQso[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.call !== "string" || !o.call) continue;
    const mode = asMode(o.mode) ?? "FT8";
    out.push({
      at: typeof o.at === "string" ? o.at : "",
      call: o.call.toUpperCase(),
      grid: typeof o.grid === "string" ? o.grid : "",
      report: typeof o.report === "string" ? o.report : "",
      band: typeof o.band === "string" ? o.band : "",
      mode,
    });
  }
  return out.slice(0, 200);
}

export const DIGITAL_STORE_KEY = "hamcockpit.digital";
