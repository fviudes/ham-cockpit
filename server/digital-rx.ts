/**
 * Escuta de FT8/FT4 no servidor. O estado fica aqui: sair da página não para o arecord.
 * A cascata agrupada e as linhas decodificadas também ficam aqui.
 * Desabilitar para a captura, apaga a cascata e devolve frequência e modo. Não chaveia PTT.
 */
import type { DigMode } from "../client/src/console/digital-modes-model";
import { periodAt } from "../client/src/console/digital-modes-model";
import { spectrumPeak } from "../client/src/console/digital-spectrum";
import {
  chunkStart,
  pcmDbfs,
  pcmLevel,
  periodAt12k,
  periodSeconds,
  rowsFromDecode,
  trimChunks,
  type PcmChunk,
} from "../client/src/console/digital-pcm";
import { decodeSlot } from "./digital-decode";
import { DIGITAL_DATA_MODE, enableRigCommands, parseRigFreq, parseRigMode, restoreRigCommands, tuneRigCommand, type RigSnap } from "./digital-rx-plan";
import { withSerialScopeQuiet } from "./civ-scope-tap";
import { hubRigctl } from "./hamlib-hub";
import { beginDigitalCapture, endDigitalCapture, setRadioPcmSink } from "./radio-audio";
import { createFallLog, WF_COLS, WF_END_HZ, WF_FFT, WF_HOP, WF_SAMPLE_RATE, WF_START_HZ, type FallPayload } from "../shared/digital-waterfall";

const PORT = 4532;
const HOST = "127.0.0.1";

export type RxRow = {
  id: string;
  utc: string;
  db: number;
  dt: number;
  hz: number;
  message: string;
  even: boolean;
};

export type RxSnapshot = {
  ok: boolean;
  enabled: boolean;
  mode: DigMode;
  hz: number;
  band: string;
  dialId: string;
  dataMode: string;
  phase: "off" | "on" | "none" | "busy";
  level: number;
  dbfs: number;
  decode: { ran: boolean; count: number } | null;
  rows: RxRow[];
  error?: string;
};

type Session = {
  enabled: boolean;
  mode: DigMode;
  hz: number;
  band: string;
  dialId: string;
  dataMode: string;
  phase: RxSnapshot["phase"];
  level: number;
  dbfs: number;
  decode: { ran: boolean; count: number } | null;
  rows: RxRow[];
  saved: RigSnap | null;
};

const session: Session = {
  enabled: false,
  mode: "FT8",
  hz: 0,
  band: "",
  dialId: "",
  dataMode: "",
  phase: "off",
  level: 0,
  dbfs: -120,
  decode: null,
  rows: [],
  saved: null,
};

let chunks: PcmChunk[] = [];
let lastIndex: number | null = null;
let decoding = false;
let pending: { pcm: Int16Array; mode: DigMode; startMs: number; even: boolean } | null = null;
let tail: Promise<unknown> = Promise.resolve();
const fall = createFallLog();
const hop = new Int16Array(WF_HOP);
let hopFill = 0;
let frameStart = 0;
let frameOpen = false;
type FrameJob = { pcm: Int16Array; at: number; index: number };
const frameJobs: FrameJob[] = [];
let fftRunning = false;

function resetHop() {
  hopFill = 0;
  frameOpen = false;
  frameJobs.length = 0;
}

function resetAudio() {
  chunks = [];
  lastIndex = null;
  pending = null;
  resetHop();
}

function enqueueFrame(pcm: Int16Array, at: number, index: number) {
  if (frameJobs.length > 4) frameJobs.shift();
  frameJobs.push({ pcm, at, index });
  if (fftRunning) return;
  fftRunning = true;
  setImmediate(drainFrames);
}

function drainFrames() {
  const job = frameJobs.shift();
  if (!job || !session.enabled) {
    fftRunning = false;
    if (session.enabled && frameJobs.length) {
      fftRunning = true;
      setImmediate(drainFrames);
    }
    return;
  }
  try {
    const peaks = spectrumPeak(job.pcm, WF_SAMPLE_RATE, WF_START_HZ, WF_END_HZ, WF_COLS);
    if (session.enabled) fall.push(peaks, job.at, job.index);
  } catch {
    /* a próxima faixa segue */
  }
  if (session.enabled && frameJobs.length) setImmediate(drainFrames);
  else fftRunning = false;
}

function feedHop(pcm: Int16Array, t0: number) {
  const mode = session.mode;
  for (let i = 0; i < pcm.length; i++) {
    if (!frameOpen) {
      frameStart = t0 + (i / WF_SAMPLE_RATE) * 1000;
      frameOpen = true;
    }
    hop[hopFill++] = pcm[i] ?? 0;
    if (hopFill < WF_HOP) continue;
    const at = frameStart + (WF_HOP / WF_SAMPLE_RATE) * 1000;
    const frame = new Int16Array(WF_FFT);
    frame.set(hop);
    hopFill = 0;
    frameOpen = false;
    enqueueFrame(frame, at, periodAt(at, mode).index);
  }
}

function snapshot(error?: string): RxSnapshot {
  return {
    ok: !error,
    enabled: session.enabled,
    mode: session.mode,
    hz: session.hz,
    band: session.band,
    dialId: session.dialId,
    dataMode: session.dataMode,
    phase: session.phase,
    level: session.level,
    dbfs: session.dbfs,
    decode: session.decode,
    rows: session.rows,
    error,
  };
}

export function digitalRxSnapshot(): RxSnapshot {
  return snapshot();
}

async function rig(command: string) {
  let last: { ok: boolean; reply: string; error?: string } = { ok: false, reply: "", error: "ocupado" };
  const deadline = Date.now() + 18_000;
  for (let i = 0; i < 8; i++) {
    last = await hubRigctl(PORT, command, HOST, 900, true);
    if (last.ok) return last;
    if (last.error !== "ocupado" && last.error !== "timeout" && last.error !== "fila cheia") return last;
    if (Date.now() >= deadline) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  return last;
}

async function pauseRig() {
  await new Promise((r) => setTimeout(r, 400));
}

async function readSnap(): Promise<{ snap: RigSnap | null; error: string }> {
  const freq = await rig("f");
  if (!freq.ok) return { snap: null, error: freq.error || "rádio" };
  await pauseRig();
  const mode = await rig("m");
  if (!mode.ok) return { snap: null, error: mode.error || "rádio" };
  const hz = parseRigFreq(freq.reply);
  const parsed = parseRigMode(mode.reply);
  if (hz == null || !parsed) return { snap: null, error: "rádio" };
  return { snap: { hz, mode: parsed.mode, width: parsed.width }, error: "" };
}

async function restore(saved: RigSnap) {
  const [freq, mode] = restoreRigCommands(saved);
  const f = await rig(freq!);
  const m = await rig(mode!);
  return f.ok && m.ok;
}

function remember(mode: DigMode, hz: number, band: string, dialId: string) {
  session.mode = mode;
  session.hz = hz;
  session.band = band.slice(0, 24);
  session.dialId = dialId.slice(0, 80);
}

function validHz(hz: number): boolean {
  return Number.isFinite(hz) && hz >= 100_000 && hz <= 500_000_000;
}

async function applyTune(mode: DigMode, hz: number, band: string, dialId: string): Promise<RxSnapshot> {
  if (!session.enabled) return snapshot();
  return withSerialScopeQuiet(() => tuneNow(mode, hz, band, dialId));
}

async function tuneNow(mode: DigMode, hz: number, band: string, dialId: string): Promise<RxSnapshot> {
  const cmd = tuneRigCommand(hz);
  const out = await rig(cmd);
  if (!out.ok) return snapshot(out.error || "frequência");
  remember(mode, hz, band, dialId);
  resetAudio();
  console.log(`[digital] dial ${mode} ${hz} Hz`);
  return snapshot();
}

async function enable(mode: DigMode, hz: number, band: string, dialId: string): Promise<RxSnapshot> {
  if (session.enabled) return applyTune(mode, hz, band, dialId);
  return withSerialScopeQuiet(() => enableNow(mode, hz, band, dialId));
}

async function enableNow(mode: DigMode, hz: number, band: string, dialId: string): Promise<RxSnapshot> {
  const read = await readSnap();
  const saved = read.snap;
  if (!saved) {
    console.log(`[digital] escuta não abriu: ${read.error}`);
    return snapshot(read.error);
  }
  const [setMode, setFreq] = enableRigCommands(hz);
  const modeOut = await rig(setMode!);
  if (!modeOut.ok) {
    console.log(`[digital] escuta não abriu: ${modeOut.error || "modo"}`);
    return snapshot(modeOut.error || "modo");
  }
  await pauseRig();
  const freqOut = await rig(setFreq!);
  if (!freqOut.ok) {
    await restore(saved);
    console.log(`[digital] escuta não abriu: ${freqOut.error || "frequência"}`);
    return snapshot(freqOut.error || "frequência");
  }
  await pauseRig();
  const check = await rig("m");
  if (!check.ok) {
    await restore(saved);
    console.log(`[digital] escuta não abriu: ${check.error || "modo"}`);
    return snapshot(check.error || "modo");
  }
  const measured = parseRigMode(check.reply);
  if (!measured || measured.mode !== DIGITAL_DATA_MODE) {
    await restore(saved);
    const got = measured?.mode || "modo";
    console.log(`[digital] modo medido ${got}`);
    return snapshot(got);
  }
  session.saved = saved;
  session.enabled = true;
  session.dataMode = measured.mode;
  remember(mode, hz, band, dialId);
  resetAudio();
  fall.clear();
  const cap = await beginDigitalCapture();
  session.phase = cap === "on" ? "on" : cap === "busy" ? "busy" : "none";
  session.level = 0;
  session.dbfs = -120;
  console.log(`[digital] escuta on ${mode} ${hz} Hz ${measured.mode} guardou ${saved.hz} ${saved.mode}`);
  return snapshot();
}

async function disable(): Promise<RxSnapshot> {
  return withSerialScopeQuiet(() => disableNow());
}

async function disableNow(): Promise<RxSnapshot> {
  const saved = session.saved;
  session.enabled = false;
  session.phase = "off";
  session.dataMode = "";
  session.saved = null;
  session.level = 0;
  session.dbfs = -120;
  endDigitalCapture();
  resetAudio();
  fall.clear();
  if (!saved) {
    console.log("[digital] escuta off");
    return snapshot();
  }
  const ok = await restore(saved);
  console.log(`[digital] escuta off restaura ${saved.hz} ${saved.mode} ok=${ok}`);
  return ok ? snapshot() : snapshot("restaurar");
}

function clearRows(): RxSnapshot {
  session.rows = [];
  session.decode = null;
  return snapshot();
}

export function digitalWaterfallSince(after: number): FallPayload {
  return fall.payload(Number.isFinite(after) ? after : 0);
}

export function digitalRxCommand(body: { op?: string; mode?: string; hz?: number; band?: string; dialId?: string; n?: number }): Promise<RxSnapshot> {
  const run = tail.then(() => runCommand(body), () => runCommand(body));
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runCommand(body: { op?: string; mode?: string; hz?: number; band?: string; dialId?: string; n?: number }): Promise<RxSnapshot> {
  if (body.op === "disable") return disable();
  if (body.op === "clear") return clearRows();
  if (body.op === "navg") {
    fall.setAvg(Number(body.n));
    return snapshot();
  }
  const mode: DigMode = body.mode === "FT4" ? "FT4" : "FT8";
  const hz = Math.round(Number(body.hz));
  if (!validHz(hz)) return snapshot("frequência");
  const band = String(body.band || "").slice(0, 24);
  const dialId = String(body.dialId || "").slice(0, 80);
  if (body.op === "tune") return applyTune(mode, hz, band, dialId);
  if (body.op === "enable") return enable(mode, hz, band, dialId);
  return snapshot("comando");
}

function onPcm(chunk: Buffer) {
  if (!session.enabled || session.phase === "off") return;
  const bytes = chunk.length - (chunk.length % 2);
  if (bytes < 2) return;
  const pcm = new Int16Array(bytes / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = chunk.readInt16LE(i * 2);
  const now = Date.now();
  if (session.phase !== "on") session.phase = "on";
  session.dbfs = pcmDbfs(pcm);
  session.level = pcmLevel(pcm);
  const t0 = chunkStart(now, pcm.length);
  chunks.push({ t0, pcm });
  const kept = trimChunks(chunks, now);
  if (kept.length !== chunks.length) chunks = kept;
  feedHop(pcm, t0);
  const mode = session.mode;
  const mark = periodAt(now, mode);
  if (lastIndex == null) {
    lastIndex = mark.index;
    return;
  }
  if (lastIndex === mark.index) return;
  const currentStart = now - mark.elapsed * 1000;
  const startMs = currentStart - periodSeconds(mode) * 1000;
  const even = lastIndex % 2 === 0;
  lastIndex = mark.index;
  const slot = periodAt12k(chunks, startMs, mode);
  if (!slot) return;
  pending = { pcm: slot, mode, startMs, even };
  void pump();
}

async function pump() {
  if (decoding || !pending) return;
  const job = pending;
  pending = null;
  decoding = true;
  try {
    const pcm = Buffer.from(job.pcm.buffer, job.pcm.byteOffset, job.pcm.byteLength);
    const out = await decodeSlot(job.mode, pcm);
    if (!session.enabled) return;
    const rows = out.ran ? rowsFromDecode(out.lines, job.startMs, job.even) : [];
    if (rows.length) session.rows = [...session.rows, ...rows].slice(-300);
    session.decode = { ran: out.ran, count: rows.length };
    if (rows.length) console.log(`[digital] decode ${rows.length}`);
  } catch {
    if (session.enabled) session.decode = { ran: false, count: 0 };
  } finally {
    decoding = false;
    if (session.enabled && pending) void pump();
  }
}

setRadioPcmSink(onPcm);
