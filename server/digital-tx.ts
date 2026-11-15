/**
 * Um ciclo de TX digital: PTT no rigctld, áudio no codec USB, PTT solta no fim.
 * O tom sai do ftx-encode (ft8_lib MIT). Sem o binário, não chaveia.
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pickAlsaCapture, pickAlsaPlayback } from "../shared/pc-audio";
import { nextTxSlot, playbackBytes, playbackPlan, type SlotMode } from "../shared/digital-slot";
import { DIGITAL_DATA_MODE, parseRigMode } from "./digital-rx-plan";
import { hubRigctl } from "./hamlib-hub";
import { holdRadioCapture } from "./radio-audio";

export type TxPhase = "idle" | "wait" | "ptt" | "audio" | "done" | "error" | "halt";

export type TxSnapshot = {
  phase: TxPhase;
  message: string;
  mode: SlotMode | "";
  ptt: boolean;
  error: string;
  startInMs: number;
};

type Job = {
  mode: SlotMode;
  message: string;
  audioHz: number;
  even: boolean;
  port: number;
  level: number;
  play: Buffer;
  phase: TxPhase;
  ptt: boolean;
  error: string;
  startAt: number;
  gen: number;
};

let job: Job | null = null;
let generation = 0;
let haltedGen = -1;
let player: ChildProcess | null = null;

function cancelled(gen: number): boolean {
  return gen !== generation || haltedGen === gen;
}

function encodeBin(): string {
  return process.env.FTX_ENCODE || "/opt/ham-cockpit/bin/ftx-encode";
}

export function txSnapshot(): TxSnapshot {
  if (!job) return { phase: "idle", message: "", mode: "", ptt: false, error: "", startInMs: 0 };
  return {
    phase: job.phase,
    message: job.message,
    mode: job.mode,
    ptt: job.ptt,
    error: job.error,
    startInMs: Math.max(0, job.startAt - Date.now()),
  };
}

function sleepUntil(at: number, gen: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (cancelled(gen) || Date.now() >= at) {
        resolve();
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

function arecordLive(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("pgrep", ["-x", "arecord"], (err) => resolve(!err));
  });
}

async function waitCaptureClear(limitMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    if (!(await arecordLive())) return;
    await new Promise((r) => setTimeout(r, 60));
  }
}

function listCards(): Promise<string> {
  return new Promise((resolve) => {
    execFile("arecord", ["-l"], (err, stdout) => resolve(err ? "" : String(stdout || "")));
  });
}

function listPlayback(): Promise<string> {
  return new Promise((resolve) => {
    execFile("aplay", ["-l"], (err, stdout) => resolve(err ? "" : String(stdout || "")));
  });
}

function upsample4(pcm: Buffer, level: number): Buffer {
  const n = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(n * 4 * 2);
  const gain = Math.max(0.05, Math.min(0.9, level));
  const clip = (v: number) => (v < -32767 ? -32767 : v > 32767 ? 32767 : v);
  for (let i = 0; i < n; i++) {
    const a = Math.round(pcm.readInt16LE(i * 2) * gain);
    const next = i + 1 < n ? pcm.readInt16LE((i + 1) * 2) : pcm.readInt16LE(i * 2);
    const b = Math.round(next * gain);
    const o = i * 4;
    out.writeInt16LE(clip(a), (o + 0) * 2);
    out.writeInt16LE(clip(Math.round((a * 3 + b) / 4)), (o + 1) * 2);
    out.writeInt16LE(clip(Math.round((a + b) / 2)), (o + 2) * 2);
    out.writeInt16LE(clip(Math.round((a + b * 3) / 4)), (o + 3) * 2);
  }
  return out;
}

function buildPlayback(mode: SlotMode, tone12: Buffer, level: number): Buffer {
  const bytes = playbackBytes(mode);
  const tone = upsample4(tone12, level);
  if (tone.length !== bytes.tone) throw new Error(`tom ${tone.length}`);
  const lead = Buffer.alloc(bytes.lead);
  const trail = Buffer.alloc(bytes.trail);
  return Buffer.concat([lead, tone, trail]);
}

function waveHead(mode: SlotMode, pcm: Buffer): string {
  const lead = playbackBytes(mode).lead;
  let silent = lead > 0;
  for (let i = 0; i < lead && i < pcm.length; i++) {
    if (pcm[i] !== 0) {
      silent = false;
      break;
    }
  }
  const end = Math.min(pcm.length, lead + 48_000);
  let tone = false;
  for (let i = lead; i + 1 < end; i += 2) {
    if (pcm.readInt16LE(i) !== 0) {
      tone = true;
      break;
    }
  }
  const sec = (lead / 96_000).toFixed(1);
  return silent && tone ? `silêncio ${sec} s e tom inteiro` : "tom cortado";
}

async function encodeTone(mode: SlotMode, hz: number, message: string): Promise<Buffer> {
  const bin = encodeBin();
  if (!existsSync(bin)) throw new Error("no-modem");
  const dir = await mkdtemp(path.join(tmpdir(), "hc-ftx-"));
  const out = path.join(dir, "tone.s16");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, [mode, String(Math.round(hz)), message, out], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      child.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || "encode"));
      });
    });
    const pcm = await readFile(out);
    const want = playbackPlan(mode).toneSamples * 2;
    if (pcm.length !== want) throw new Error(`amostras ${pcm.length}`);
    return pcm;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function playRaw(device: string, pcm: Buffer, timeoutMs: number, gen: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("aplay", ["-D", device, "-f", "S16_LE", "-r", "48000", "-c", "1", "-t", "raw", "-q"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    player = child;
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (player === child) player = null;
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (player === child) player = null;
      if (cancelled(gen) || code === 0) resolve();
      else reject(new Error(Buffer.concat(err).toString("utf8").trim() || `aplay ${code}`));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(pcm);
  });
}

async function playbackDevice(): Promise<string> {
  const capList = await listCards();
  const cap = pickAlsaCapture(capList);
  const hit = pickAlsaPlayback(await listPlayback(), cap) ?? cap;
  if (!hit) throw new Error("no-device");
  return `plughw:${hit.card},${hit.device}`;
}

async function ensurePktUsb(port: number): Promise<void> {
  const m = await hubRigctl(port, "m", "127.0.0.1", PTT_TIMEOUT_MS, true);
  const parsed = parseRigMode(m.reply || "");
  if (parsed?.mode === DIGITAL_DATA_MODE) return;
  const set = await hubRigctl(port, `M ${DIGITAL_DATA_MODE} 0`, "127.0.0.1", PTT_TIMEOUT_MS, true);
  if (!set.ok) throw new Error(set.error || "data-mode");
}

async function playOnCodec(device: string, pcm: Buffer, timeoutMs: number, gen: number) {
  console.log(`[digital] aplay ${device} ${pcm.length} bytes`);
  try {
    await playRaw(device, pcm, timeoutMs, gen);
  } catch (err) {
    const last = err instanceof Error ? err.message : String(err);
    console.log(`[digital] aplay ${device} falhou: ${last}`);
    if (cancelled(gen)) return;
    const hw = device.replace("plughw:", "hw:");
    if (hw === device) throw err instanceof Error ? err : new Error(last);
    console.log(`[digital] aplay ${hw} ${pcm.length} bytes`);
    await playRaw(hw, pcm, timeoutMs, gen);
  }
}

/** PTT e leitura de PTT passam na frente da fila do Hamlib e esperam o CI-V (o poll do waterfall não segura). */
const PTT_TIMEOUT_MS = 2500;

function rigPtt(port: number, command: string) {
  return hubRigctl(port, command, "127.0.0.1", PTT_TIMEOUT_MS, true);
}

async function setPtt(port: number, on: boolean) {
  const reply = await rigPtt(port, `T ${on ? 1 : 0}`);
  console.log(`[digital] PTT ${on ? 1 : 0} porta ${port} ok=${reply.ok} ${reply.error || ""}`.trim());
  if (!reply.ok) throw new Error(reply.error || "ptt");
}

function pttBit(reply: string): string {
  return (
    reply
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s === "0" || s === "1") || ""
  );
}

/** O IC-705 às vezes executa o PTT e o rigctld responde RPRT -5. A leitura `t` decide. */
async function readPtt(port: number): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const reply = await rigPtt(port, "t");
    const bit = pttBit(reply.reply || "");
    if (bit) return bit;
    await new Promise((r) => setTimeout(r, 250));
  }
  return "";
}

async function readPttOnce(port: number): Promise<string> {
  const reply = await rigPtt(port, "t");
  return pttBit(reply.reply || "");
}

/** Um T 1. Se o CI-V não confirmar, não manda outro chaveamento. */
async function raisePtt(port: number) {
  try {
    await setPtt(port, true);
    return;
  } catch (err) {
    const bit = await readPttOnce(port);
    if (bit === "1") {
      console.log(`[digital] PTT 1 porta ${port} leitura t=1`);
      return;
    }
    try {
      await setPtt(port, false);
    } catch {
      /* uma soltura; sem novo T 1 */
    }
    throw err instanceof Error ? err : new Error("ptt");
  }
}

async function dropPtt(port: number) {
  let last = "ptt";
  for (let i = 0; i < 3; i++) {
    try {
      await setPtt(port, false);
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    if ((await readPtt(port)) === "0") {
      console.log(`[digital] PTT leitura t=0`);
      return;
    }
  }
  throw new Error(last);
}

/** Solta o arecord e só devolve o instante do slot se o codec já estiver livre. */
async function codecReady(slot: number, mode: SlotMode, even: boolean, gen: number): Promise<number> {
  holdRadioCapture(true);
  let target = slot;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleepUntil(target - 2000, gen);
    if (cancelled(gen)) throw new Error("halt");
    holdRadioCapture(true);
    await waitCaptureClear(1500);
    if (await arecordLive()) {
      console.log("[digital] arecord ainda vivo; o período seguinte leva a onda inteira");
      target = nextTxSlot(target + 1000, mode, even);
      continue;
    }
    await sleepUntil(target, gen);
    if (cancelled(gen)) throw new Error("halt");
    const late = Date.now() - target;
    if (late > 80) {
      console.log(`[digital] slot perdido por ${late} ms; não corta a onda`);
      target = nextTxSlot(Date.now() + 200, mode, even);
      continue;
    }
    return target;
  }
  throw new Error("codec ocupado");
}

async function run(current: Job) {
  const gen = current.gen;
  let keyed = false;
  try {
    const play = current.play;
    const plan = playbackPlan(current.mode);
    const device = await playbackDevice();
    if (cancelled(gen)) throw new Error("halt");
    current.phase = "wait";
    console.log(`[digital] TX ${current.mode} "${current.message}" onda ${play.length} bytes ${waveHead(current.mode, play)}`);
    const slot = await codecReady(current.startAt, current.mode, current.even, gen);
    current.startAt = slot;
    if (cancelled(gen)) throw new Error("halt");
    await ensurePktUsb(current.port);
    if (cancelled(gen)) throw new Error("halt");
    current.phase = "ptt";
    await raisePtt(current.port);
    keyed = true;
    current.ptt = true;
    if (cancelled(gen)) throw new Error("halt");
    current.phase = "audio";
    await playOnCodec(device, play, Math.ceil(plan.txEnd * 1000) + 4000, gen);
    if (cancelled(gen)) throw new Error("halt");
    await sleepUntil(slot + plan.pttDrop * 1000, gen);
    if (cancelled(gen)) throw new Error("halt");
    current.phase = "done";
    console.log(`[digital] TX concluído "${current.message}"`);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (current.gen === generation) {
      current.phase = cancelled(gen) || text === "halt" ? "halt" : "error";
      current.error = text === "halt" ? "" : text;
    }
    console.log(`[digital] TX ${text === "halt" ? "halt" : "error"} ${text === "halt" ? "" : text}`.trim());
  } finally {
    if (generation !== gen) return;
    if (player) {
      player.kill("SIGTERM");
      player = null;
    }
    if (keyed) {
      try {
        await dropPtt(current.port);
      } catch (err) {
        current.error = current.error || (err instanceof Error ? err.message : String(err));
        if (current.phase === "done") current.phase = "error";
      }
      current.ptt = false;
    }
    holdRadioCapture(false);
  }
}

export async function scheduleDigitalTx(input: {
  mode: SlotMode;
  message: string;
  audioHz: number;
  even: boolean;
  port: number;
  level: number;
}): Promise<{ ok: boolean; error?: string; startInMs?: number; message?: string }> {
  const message = input.message.trim().replace(/\s+/g, " ");
  if (!message || message.length > 40) return { ok: false, error: "mensagem" };
  if (job && (job.phase === "ptt" || job.phase === "audio")) return { ok: false, error: "ocupado" };
  if (!existsSync(encodeBin())) return { ok: false, error: "no-modem" };
  const audioHz = Number.isFinite(input.audioHz) ? Math.max(200, Math.min(3000, input.audioHz)) : 1500;
  const port = Number.isFinite(input.port) && input.port > 0 ? Math.round(input.port) : 4532;
  const level = Number.isFinite(input.level) ? input.level : 0.5;
  let play: Buffer;
  try {
    play = buildPlayback(input.mode, await encodeTone(input.mode, audioHz, message), level);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    return { ok: false, error: text || "encode" };
  }
  if (job && (job.phase === "ptt" || job.phase === "audio")) return { ok: false, error: "ocupado" };
  generation += 1;
  const gen = generation;
  haltedGen = -1;
  const slot = nextTxSlot(Date.now(), input.mode, input.even);
  job = {
    mode: input.mode,
    message,
    audioHz,
    even: input.even,
    port,
    level,
    play,
    phase: "wait",
    ptt: false,
    error: "",
    startAt: slot,
    gen,
  };
  void run(job);
  return { ok: true, startInMs: Math.max(0, slot - Date.now()), message };
}

export async function haltDigitalTx() {
  const gen = generation;
  haltedGen = gen;
  if (player && job?.gen === gen) {
    player.kill("SIGTERM");
    player = null;
  }
  if (!job || job.gen !== gen) return;
  const keyed = job.ptt;
  const port = job.port;
  if (job.phase === "wait" || job.phase === "ptt" || job.phase === "audio") job.phase = "halt";
  if (!keyed) return;
  try {
    await rigPtt(port, "T 0");
  } catch {
    /* o finally do ciclo também solta */
  }
  if (generation !== gen || job?.gen !== gen) return;
  job.ptt = false;
}
