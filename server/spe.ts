/**
 * SPE Expert 1.3K/1.5K/2K-FA — protocolo nativo + ser2net telnet(rfc2217).
 *
 * Host → amp: 0x55×3 | CNT | DATA… | CHK
 * Status ← amp: 0xAA×3 | 0x43 | 67 CSV | chk0 chk1 | sep | CR LF
 *
 * YAML (servidor que funciona, 115200):
 *   accepter: telnet(rfc2217),tcp,<bind>,<port>
 *   connector: serialdev,…,115200n81,local
 *   kickolduser: true
 *
 * Power-on: RFC2217 SET-CONTROL DTR/RTS (pulso low→high).
 * ampctld -m 401 Beta fica parado — só o caminho nativo usa a porta.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SER2NET_ACC_BAUD } from "../shared/const";
import { attachRfc2217, type Rfc2217Socket } from "./rfc2217";
import { loadSer2net } from "./ser2net-store";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/spe";
const SER2NET_CTL = "/opt/ham-cockpit/bin/ser2net-ctl";
/** Marca do bundle: o processo no lab tem que ser este cliente, não o que parava no ECONNRESET. */
const SPE_BUILD = "spe-off-unwait";
const POLL_MS = 700;
const BAUD = 115200;
const STATUS_WAIT_MS = 1500;
/**
 * Leitura sem bytes do amp. Três polls (700 ms) e a espera acaba.
 * Não usa socket.setTimeout: o poll de STATUS escreveria no socket e
 * renovaria um idle timer, e a fila continuaria achando que há comunicação.
 */
const SILENCE_MS = 2_500;
/** A UART fica muda enquanto a Expert liga. Isso não segura a fila. */
const WAKE_GRACE_MS = 12_000;

export type SpePhase = "idle" | "connecting" | "ready" | "error";
export type SpePwr = "L" | "M" | "H";

export type SpeSnap = {
  ok: boolean;
  port: string;
  baud: number;
  autoConnect: boolean;
  connected: boolean;
  hardware: boolean;
  phase: SpePhase;
  error: string;
  model: string;
  operate: boolean;
  tx: boolean;
  bank: "A" | "B" | "x";
  pout: number;
  pwr: SpePwr;
  swrAtu: number;
  swrAnt: number;
  vpa: number;
  ipa: number;
  band: string;
  ant: number;
  input: number;
  temp: number;
  alarm: string;
  warning: string;
  ledAl: boolean;
  ledTune: boolean;
  ledOn: boolean;
  lastRx: string;
  lastTxHex: string;
  transport: "rfc2217";
  folder: string;
  build: string;
};

type Saved = { autoConnect: boolean };

const CMD_BYTE: Record<string, number> = {
  input: 0x01,
  "band-": 0x02,
  "band+": 0x03,
  antenna: 0x04,
  ant: 0x04,
  "l-": 0x05,
  "l+": 0x06,
  "c-": 0x07,
  "c+": 0x08,
  tune: 0x09,
  tuner: 0x09,
  off: 0x0a,
  pwr: 0x0b,
  power: 0x0b,
  disp: 0x0c,
  display: 0x0c,
  op: 0x0d,
  operate: 0x0d,
  op1: 0x0d,
  op0: 0x0d,
  cat: 0x0e,
  nav: 0x0f,
  left: 0x0f,
  right: 0x10,
  set: 0x11,
  status: 0x90,
};

const BANDS = ["160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m", "4m"] as const;

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "spe");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "spe.json");
}

function writeAtomic(file: string, body: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, file);
}

function loadSaved(): Saved {
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as Partial<Saved>;
    return { autoConnect: raw.autoConnect !== false };
  } catch {
    return { autoConnect: true };
  }
}

function persist() {
  writeAtomic(jsonPath(), `${JSON.stringify({ autoConnect: saved.autoConnect }, null, 2)}\n`);
}

function hostPacket(data: Buffer): Buffer {
  let chk = 0;
  for (let i = 0; i < data.length; i++) chk = (chk + (data[i] || 0)) & 0xff;
  const out = Buffer.alloc(4 + data.length + 1);
  out[0] = 0x55;
  out[1] = 0x55;
  out[2] = 0x55;
  out[3] = data.length;
  data.copy(out, 4);
  out[4 + data.length] = chk;
  return out;
}

function bandLabel(code: string): string {
  const n = Number.parseInt(code, 10);
  if (!Number.isFinite(n) || n < 0 || n >= BANDS.length) return code || "—";
  return BANDS[n]!;
}

function numField(s: string | undefined): number {
  if (s == null) return NaN;
  return Number.parseFloat(String(s).replace(/^\s+/, "").trim());
}

function parseStatusCsv(payload: string): boolean {
  // ",13K,S,R,A,1,05,1t,0r,L,0000, 0.00, 0.00, 0.0, 0.0, 25,000,000,N,N,"
  const parts = payload.split(",");
  const f = parts[0] === "" ? parts.slice(1) : parts;
  if (f.length < 19) return false;
  const model = (f[0] || "").trim();
  if (!/^\d{2}K$/.test(model) && model !== "15K") return false;

  // 0=ID 1=S/O 2=R/T 3=bank 4=input 5=band 6=txAnt 7=rxAnt
  // 8=pwr 9=pout 10=swrAtu 11=swrAnt 12=vpa 13=ipa 14=temp 17=warn 18=alarm
  const state = (f[1] || "").trim().toUpperCase();
  const ptt = (f[2] || "").trim().toUpperCase();
  const bankRaw = (f[3] || "A").trim();
  const input = Number.parseInt(f[4] || "1", 10);
  const band = bandLabel((f[5] || "").trim());
  const txAnt = (f[6] || "1").trim();
  const ant = Number.parseInt(txAnt[0] || "1", 10) || 1;
  const pwrCh = (f[8] || "L").trim().toUpperCase();
  const pout = Number.parseInt((f[9] || "0").trim(), 10);
  const swrAtu = numField(f[10]);
  const swrAnt = numField(f[11]);
  const vpa = numField(f[12]);
  const ipa = numField(f[13]);
  const temp = Number.parseInt((f[14] || "0").trim(), 10);
  const warning = (f[17] || "N").trim().toUpperCase();
  const alarm = (f[18] || "N").trim().toUpperCase();

  live.model = model;
  live.operate = state === "O";
  live.tx = ptt === "T";
  live.bank = bankRaw === "B" ? "B" : bankRaw === "x" ? "x" : "A";
  live.input = input === 2 ? 2 : 1;
  live.band = band;
  live.ant = ant >= 1 && ant <= 6 ? ant : 1;
  live.pwr = pwrCh === "M" || pwrCh === "H" ? pwrCh : "L";
  live.pout = Number.isFinite(pout) && pout >= 0 ? pout : 0;
  live.swrAtu = Number.isFinite(swrAtu) && swrAtu > 0 ? Math.round(swrAtu * 100) / 100 : 1;
  live.swrAnt = Number.isFinite(swrAnt) && swrAnt > 0 ? Math.round(swrAnt * 100) / 100 : 1;
  live.vpa = Number.isFinite(vpa) ? Math.round(vpa * 10) / 10 : 0;
  live.ipa = Number.isFinite(ipa) ? Math.round(ipa * 10) / 10 : 0;
  live.temp = Number.isFinite(temp) ? temp : 0;
  live.warning = warning === "N" ? "" : warning;
  live.alarm = alarm === "N" ? "" : alarm;
  live.ledAl = Boolean(live.alarm);
  live.ledTune = /t/i.test(txAnt.slice(1));
  live.ledOn = true;
  live.hardware = true;
  heardHardware = true;
  wakeUntil = 0;
  live.phase = "ready";
  live.error = "";
  live.lastRx = payload.slice(0, 96);
  statusEpoch += 1;
  return true;
}

function consumeRx() {
  for (;;) {
    const sync = rx.indexOf(0xaa);
    if (sync < 0) {
      if (rx.length > 512) rx = rx.subarray(rx.length - 16);
      return;
    }
    if (sync > 0) rx = rx.subarray(sync);
    if (rx.length < 4) return;
    if (rx[0] !== 0xaa || rx[1] !== 0xaa || rx[2] !== 0xaa) {
      rx = rx.subarray(1);
      continue;
    }
    const cnt = rx[3]!;
    if (cnt === 0x43) {
      if (rx.length < 76) return;
      parseStatusCsv(rx.subarray(4, 4 + 67).toString("latin1"));
      rx = rx.subarray(76);
      continue;
    }
    if (cnt === 0x01) {
      if (rx.length < 6) return;
      rx = rx.subarray(6);
      continue;
    }
    const frameLen = 4 + cnt + 1;
    if (rx.length < frameLen) return;
    rx = rx.subarray(frameLen);
  }
}

let saved = loadSaved();
try {
  if (!existsSync(jsonPath())) persist();
} catch {
  /* pasta ainda não gravável */
}
let live: Omit<SpeSnap, "ok" | "folder" | "baud" | "transport"> = {
  port: "",
  autoConnect: saved.autoConnect,
  connected: false,
  hardware: false,
  phase: "idle",
  error: "",
  model: "13K",
  operate: false,
  tx: false,
  bank: "A",
  pout: 0,
  pwr: "L",
  swrAtu: 1,
  swrAnt: 1,
  vpa: 0,
  ipa: 0,
  band: "20m",
  ant: 1,
  input: 1,
  temp: 0,
  alarm: "",
  warning: "",
  ledAl: false,
  ledTune: false,
  ledOn: false,
  lastRx: "",
  lastTxHex: "",
};

let sock: net.Socket | null = null;
let rfc: Rfc2217Socket | null = null;
let rx = Buffer.alloc(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let chain = Promise.resolve();
let statusEpoch = 0;
let yamlEnsured = false;
/** Ligado enquanto a sessão deve voltar sozinha. speDisconnect desliga. */
let wantLink = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 800;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRxAt = 0;
/** Sobe quando a sessão cai, para o waitStatus devolver a fila. */
let linkGen = 0;
/** Invalida um TCP que ainda não fez attach (disconnect no meio do connect). */
let sessionGen = 0;
/** Silêncio antes do primeiro STATUS, só durante o boot do wake. */
let wakeUntil = 0;
/** STATUS válido nesta sessão. Silêncio depois disso é a linear desligada. */
let heardHardware = false;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function snap(): SpeSnap {
  return { ok: true, ...live, baud: BAUD, transport: "rfc2217", folder: dataDir(), build: SPE_BUILD };
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Fora do enqueue: chamar speConnect daqui de dentro travaria a fila. */
function scheduleReconnect() {
  if (!wantLink || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!wantLink) return;
    if (sock && !sock.destroyed && live.connected) {
      reconnectDelay = 800;
      return;
    }
    void speConnect().catch(() => undefined);
  }, reconnectDelay);
  reconnectTimer.unref?.();
  reconnectDelay = Math.min(8_000, Math.round(reconnectDelay * 1.5));
}

function clearSilence() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function armSilence(ms = SILENCE_MS) {
  clearSilence();
  silenceTimer = setTimeout(onSilence, ms);
  silenceTimer.unref?.();
}

function noteRx() {
  lastRxAt = Date.now();
  if (sock && !sock.destroyed) armSilence(SILENCE_MS);
}

/**
 * A linear desligou, o socket morreu ou a leitura ficou muda.
 * Sai de "connecting" / aguardando. Não agenda reconnect: isso
 * reabria o TCP, não vinha STATUS e a UI ficava em "…" para sempre.
 */
function settleDown(error: "" | "nocomm") {
  wantLink = false;
  clearReconnect();
  clearSilence();
  wakeUntil = 0;
  heardHardware = false;
  linkGen += 1;
  sessionGen += 1;
  dropSock();
  live.connected = false;
  live.hardware = false;
  live.phase = "idle";
  live.error = error;
  live.tx = false;
  live.operate = false;
  live.pout = 0;
  live.ipa = 0;
  live.vpa = 0;
  live.swrAtu = 1;
  live.swrAnt = 1;
  live.ledOn = false;
  live.ledAl = false;
  live.ledTune = false;
  if (!error) {
    live.lastTxHex = "";
    live.lastRx = "";
  }
}

function onSilence() {
  silenceTimer = null;
  if (!sock || sock.destroyed) return;
  const quietFor = Date.now() - lastRxAt;
  if (quietFor < SILENCE_MS) {
    armSilence(SILENCE_MS - quietFor);
    return;
  }
  // Boot do wake: ainda não houve STATUS. Não tratar como desligamento.
  if (Date.now() < wakeUntil && !heardHardware) {
    armSilence(Math.max(200, wakeUntil - Date.now()));
    return;
  }
  settleDown("nocomm");
}

function noteDown(msg: string) {
  live.connected = false;
  live.hardware = false;
  live.ledOn = false;
  if (msg) live.error = msg;
  linkGen += 1;
  if (wantLink) {
    live.phase = "connecting";
    scheduleReconnect();
    return;
  }
  if (live.phase !== "idle") live.phase = "error";
}

/** Socket que já estava de pé caiu (close, ECONNRESET, EPIPE). */
function onLinkLost() {
  linkGen += 1;
  live.connected = false;
  live.hardware = false;
  live.ledOn = false;
  live.tx = false;
  const booting = Date.now() < wakeUntil && !heardHardware && wantLink;
  if (booting) {
    live.phase = "connecting";
    live.error = "";
    clearSilence();
    scheduleReconnect();
    return;
  }
  wantLink = false;
  clearReconnect();
  clearSilence();
  wakeUntil = 0;
  heardHardware = false;
  live.phase = "idle";
  live.error = "nocomm";
  live.operate = false;
  live.pout = 0;
  live.ipa = 0;
  live.vpa = 0;
  live.swrAtu = 1;
  live.swrAnt = 1;
  live.ledAl = false;
  live.ledTune = false;
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function dropSock() {
  stopPoll();
  clearSilence();
  rx = Buffer.alloc(0);
  const r = rfc;
  rfc = null;
  sock = null;
  if (r) r.destroy();
}

async function resolveEndpoint(): Promise<{ host: string; port: number } | null> {
  const cfg = await loadSer2net();
  const svc = cfg.services.find((x) => x.device === "spe");
  if (!svc) return null;
  return { host: cfg.bind || "127.0.0.1", port: svc.tcpPort };
}

/**
 * `sudo` ignora SIGTERM enquanto o filho vive, e o timeout do execFile então
 * nunca libera o `enqueue`. SIGKILL no grupo do processo sempre encerra a espera.
 */
function sudoBounded(args: string[], ms: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const child = spawn("sudo", ["-n", ...args], { detached: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      const pid = child.pid;
      if (pid) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          /* já saiu */
        }
      }
      finish();
    }, ms);
    child.once("error", finish);
    child.once("close", finish);
  });
}

/**
 * Confere o baud. Não grava o YAML: saveSer2net recarrega o ser2net inteiro
 * e derruba o CI-V na 4002 junto com a SPE. O contrato (4001 RFC2217, 4002 TCP)
 * fica no instalador.
 */
async function ensureSpeRfc2217Yaml(): Promise<void> {
  if (yamlEnsured) return;
  yamlEnsured = true;
  const cfg = await loadSer2net();
  const baud = SER2NET_ACC_BAUD.spe;
  const spe = cfg.services.find((s) => s.device === "spe");
  if (spe && spe.baud !== baud) live.error = "baud";
}

async function stopAmpctld(): Promise<void> {
  if (process.platform !== "linux" || !existsSync(SER2NET_CTL)) return;
  // quiet-amp só desliga ampctld@spe. "stop" no ser2net-ctl, sem o filtro,
  // é systemctl stop ser2net e derruba o rádio (4002) junto com a SPE.
  await sudoBounded([SER2NET_CTL, "quiet-amp"], 4_000);
}

function writePacket(data: Buffer): boolean {
  if (!rfc || !sock || sock.destroyed) return false;
  const pkt = hostPacket(data);
  live.lastTxHex = pkt.toString("hex");
  return rfc.writeBinary(pkt);
}

function requestStatus() {
  writePacket(Buffer.from([0x90]));
}

async function waitStatus(prevEpoch: number, ms = STATUS_WAIT_MS, gen = linkGen): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (linkGen !== gen) return false;
    if (!sock || sock.destroyed || !rfc) return false;
    if (statusEpoch !== prevEpoch && live.hardware) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return linkGen === gen && statusEpoch !== prevEpoch && live.hardware;
}

function startPoll() {
  stopPoll();
  const tick = () => {
    if (!sock || sock.destroyed) return;
    requestStatus();
  };
  tick();
  pollTimer = setInterval(tick, POLL_MS);
  pollTimer.unref?.();
}

function attachSock(s: net.Socket, host: string, port: number) {
  dropSock();
  sock = s;
  rx = Buffer.alloc(0);
  live.port = `${host}:${port}`;
  live.connected = true;
  live.hardware = false;
  live.phase = "connecting";
  live.error = "";
  live.ledOn = false;
  heardHardware = false;
  lastRxAt = Date.now();
  rfc = attachRfc2217(s, (app) => {
    noteRx();
    rx = Buffer.concat([rx, app]);
    consumeRx();
  });
  s.on("error", () => {
    if (sock !== s) return;
    dropSock();
    onLinkLost();
  });
  s.on("close", () => {
    if (sock !== s) return;
    sock = null;
    rfc = null;
    stopPoll();
    clearSilence();
    onLinkLost();
  });
  armSilence(SILENCE_MS);
  // Linhas altas após connect (amp já ligada) + poll STATUS
  rfc.setRts(true);
  rfc.setDtr(true);
  reconnectDelay = 800;
  clearReconnect();
  startPoll();
}

export function speStatus(): SpeSnap {
  return snap();
}

export async function spePeek(): Promise<SpeSnap> {
  return snap();
}

export async function speSave(body: Record<string, unknown>): Promise<SpeSnap> {
  if (typeof body.autoConnect === "boolean") {
    saved.autoConnect = body.autoConnect;
    if (!body.autoConnect) {
      wantLink = false;
      clearReconnect();
    } else if (!sock || sock.destroyed) {
      wantLink = true;
      reconnectDelay = 800;
      scheduleReconnect();
    }
  }
  persist();
  live.autoConnect = saved.autoConnect;
  return snap();
}

/** Já dentro da fila. speConnect() daqui travaria o enqueue. */
async function connectInside(): Promise<SpeSnap> {
  wantLink = true;
  // Socket já aberto (ainda sem STATUS) não é motivo para derrubar de novo.
  // Quem precisa de uma sessão nova (o ligar) fecha antes de chegar aqui.
  if (sock && !sock.destroyed && live.connected) {
    reconnectDelay = 800;
    clearReconnect();
    return snap();
  }
  if (sock) {
    dropSock();
    live.connected = false;
  }
  const gen = ++sessionGen;
  live.error = "";
  live.phase = "connecting";
  live.hardware = false;
  live.ledOn = false;
  live.autoConnect = saved.autoConnect;
  await stopAmpctld();
  if (gen !== sessionGen || !wantLink) return snap();
  try {
    await ensureSpeRfc2217Yaml();
  } catch {
    /* leitura do yaml falhou; ainda tenta a 4001, sem recarregar o ser2net */
  }
  const ep = await resolveEndpoint();
  if (!ep) {
    noteDown("noport");
    return snap();
  }
  if (gen !== sessionGen || !wantLink) return snap();
  live.port = `${ep.host}:${ep.port}`;
  return await new Promise<SpeSnap>((resolve) => {
    const s = new net.Socket();
    let settled = false;
    const finish = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      if (gen !== sessionGen || !wantLink) {
        try {
          s.destroy();
        } catch {
          /* ignore */
        }
        resolve(snap());
        return;
      }
      if (!ok) {
        try {
          s.destroy();
        } catch {
          /* ignore */
        }
        noteDown(error || "timeout");
        resolve(snap());
        return;
      }
      attachSock(s, ep.host, ep.port);
      resolve(snap());
    };
    const timer = setTimeout(() => finish(false, "timeout"), 3000);
    s.once("error", (err) => {
      clearTimeout(timer);
      finish(false, err.message);
    });
    s.connect(ep.port, ep.host, () => {
      clearTimeout(timer);
      finish(true);
    });
  });
}

export async function speConnect(): Promise<SpeSnap> {
  return enqueue(() => connectInside());
}

export async function speDisconnect(): Promise<SpeSnap> {
  settleDown("");
  return snap();
}

/** Power-on Expert via RFC2217 (DTR/RTS), não via tecla 0x0B. */
export async function spePowerOn(): Promise<SpeSnap> {
  return enqueue(async () => {
    const talking = Boolean(sock && !sock.destroyed && rfc && live.connected && live.hardware);
    if (talking) return snap();
    // Sessão muda ou caída: fecha, abre o RFC2217 de novo e manda o wake.
    // Sem o close, o ligar escrevia no mesmo socket e parecia no-op.
    wakeUntil = Date.now() + WAKE_GRACE_MS;
    heardHardware = false;
    if (sock) {
      dropSock();
      live.connected = false;
    }
    live.tx = false;
    live.operate = false;
    live.pout = 0;
    live.ipa = 0;
    live.vpa = 0;
    live.ledOn = false;
    const up = await connectInside();
    if (!up.connected || !rfc) return up;
    const prev = statusEpoch;
    const gen = linkGen;
    live.error = "";
    await rfc.pulseWake(1000);
    if (linkGen !== gen || !rfc || !sock || sock.destroyed) {
      const again = await connectInside();
      if (!again.connected || !rfc) return again;
      await rfc.pulseWake(1000);
    }
    requestStatus();
    live.lastTxHex = "rfc2217:RTS/DTR wake";
    // A fila só espera este corte. O poll e o silêncio terminam o boot.
    await waitStatus(prev, 500, linkGen);
    if (!live.hardware && live.connected) live.phase = "connecting";
    live.ledOn = live.hardware;
    return snap();
  });
}

export async function speCmd(cmd: string): Promise<SpeSnap> {
  const key = String(cmd || "")
    .trim()
    .toLowerCase();
  if (key === "on" || key === "poweron" || key === "wake") return spePowerOn();

  return enqueue(async () => {
    if (key === "off") {
      const gen = linkGen;
      const prev = statusEpoch;
      wakeUntil = 0;
      if (rfc && sock && !sock.destroyed) {
        writePacket(Buffer.from([0x0a]));
        rfc.setDtr(false);
        rfc.setRts(false);
        await waitStatus(prev, 350, gen);
      }
      settleDown("");
      return snap();
    }

    if (!live.connected || !rfc) {
      const up = await connectInside();
      if (!up.connected) return up;
    }

    if (key === "op1" && live.operate) {
      requestStatus();
      await waitStatus(statusEpoch, 600, linkGen);
      return snap();
    }
    if (key === "op0" && !live.operate) {
      requestStatus();
      await waitStatus(statusEpoch, 600, linkGen);
      return snap();
    }

    const code = CMD_BYTE[key];
    if (code == null) {
      live.error = "cmd";
      return snap();
    }

    const prevPwr = live.pwr;
    const prevOp = live.operate;
    const prev = statusEpoch;
    const gen = linkGen;
    const ok = writePacket(Buffer.from([code]));
    if (!ok) {
      settleDown("nocomm");
      return snap();
    }

    // Espera ACK/STATUS antes de devolver o snap (UI precisa de pwr/swr/operate atualizados)
    await new Promise((r) => setTimeout(r, 100));
    if (linkGen !== gen) return snap();
    requestStatus();
    await waitStatus(prev, STATUS_WAIT_MS, gen);

    // PWR cicla L→M→H: se ainda igual, mais um poll. A queda da sessão solta a fila.
    if (key === "pwr" || key === "power") {
      for (let i = 0; i < 6 && live.pwr === prevPwr && linkGen === gen; i++) {
        await new Promise((r) => setTimeout(r, 150));
        if (linkGen !== gen) break;
        const e = statusEpoch;
        requestStatus();
        await waitStatus(e, 500, gen);
      }
    }
    if (key === "op1" || key === "op0" || key === "op" || key === "operate") {
      for (let i = 0; i < 4 && live.operate === prevOp && linkGen === gen; i++) {
        await new Promise((r) => setTimeout(r, 120));
        if (linkGen !== gen) break;
        const e = statusEpoch;
        requestStatus();
        await waitStatus(e, 400, gen);
      }
    }

    return snap();
  });
}

// autoConnect no boot e depois de um restart do Node: a sessão volta sozinha.
if (saved.autoConnect) {
  wantLink = true;
  scheduleReconnect();
}
