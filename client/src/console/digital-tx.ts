import { shouldHaltTx, type DigMode, type TxId } from "./digital-modes-model";

export type TxDone = { ok: boolean; message: string; error: string; slot: TxId };

export type TxLive = {
  armed: boolean;
  /** Sobe a cada Enable TX e a cada duplo clique. Congela a mensagem daquele clique. */
  armId: number;
  slot: TxId;
  mode: DigMode;
  even: boolean;
  message: string;
  audioHz: number;
  port: number;
  level: number;
};

const idle: TxLive = {
  armed: false,
  armId: 0,
  slot: 6,
  mode: "FT8",
  even: false,
  message: "",
  audioHz: 1500,
  port: 4532,
  level: 0.5,
};

let live: TxLive = { ...idle };
let pageOpen = false;
let stopUser = false;
let running = false;
let haltSent = false;

const phaseFns = new Set<(phase: string) => void>();
const doneFns = new Set<(info: TxDone) => void>();

function emitPhase(phase: string) {
  for (const fn of phaseFns) fn(phase);
}

function emitDone(info: TxDone) {
  for (const fn of doneFns) fn(info);
}

async function postHalt() {
  if (!shouldHaltTx("user", "audio")) return;
  if (haltSent) return;
  haltSent = true;
  try {
    await fetch("/api/digital/halt", { method: "POST", credentials: "same-origin" });
  } catch {
    /* o ciclo no ar também solta o PTT */
  }
}

/** O botão desligou: corta agora e solta o PTT. */
export function releaseDigitalTx() {
  stopUser = true;
  live = { ...live, armed: false };
  void postHalt();
}

export function publishDigitalTx(next: TxLive) {
  const wasArmed = live.armed;
  const level = next.level > 0 ? next.level : 0.5;
  live = { ...next, message: next.message.trim(), level };
  if (!live.armed) {
    if (wasArmed) releaseDigitalTx();
    return;
  }
  stopUser = false;
  haltSent = false;
  ensureLoop();
}

/** Sair da página não pede halt. O ciclo já aceito termina com o áudio. */
export function setDigitalTxPage(open: boolean) {
  pageOpen = open;
  if (live.armed && live.message) ensureLoop();
}

export function onDigitalTx(onPhase: (phase: string) => void, onDone: (info: TxDone) => void) {
  phaseFns.add(onPhase);
  doneFns.add(onDone);
  return () => {
    phaseFns.delete(onPhase);
    doneFns.delete(onDone);
  };
}

function ensureLoop() {
  if (running || stopUser || !live.armed || !live.message) return;
  running = true;
  void runLoop().finally(() => {
    running = false;
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Novo Enable TX ou duplo clique antes do áudio: troca a mensagem que ainda não saiu. */
function rearmed(snap: TxLive) {
  return live.armed && live.armId !== snap.armId;
}

async function waitUnlessUser(ms: number, snap: TxLive) {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    if (stopUser || rearmed(snap)) return false;
    await wait(Math.min(200, end - Date.now()));
  }
  return !stopUser && !rearmed(snap);
}

async function oneCycle(snap: TxLive): Promise<TxDone> {
  const fail = (error: string): TxDone => ({ ok: false, message: snap.message, error, slot: snap.slot });
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch("/api/digital/tx", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: snap.mode,
        message: snap.message,
        audioHz: snap.audioHz,
        even: snap.even,
        port: snap.port,
        level: snap.level > 0 ? snap.level : 0.5,
      }),
    });
  } catch {
    return fail("rede");
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; startInMs?: number; error?: string; message?: string } | null;
  if (stopUser) return fail("halt");
  if (!res.ok || !body?.ok) return fail(body?.error || "tx");
  const spent = performance.now() - t0;
  const remain = (body.startInMs ?? 0) - spent;
  if (!(await waitUnlessUser(remain, snap))) return fail(stopUser ? "halt" : "rearm");
  for (let i = 0; i < 160 && !stopUser; i++) {
    await wait(400);
    if (stopUser) return fail("halt");
    const status = (await fetch("/api/digital/tx", { credentials: "same-origin" })
      .then((r) => r.json())
      .catch(() => null)) as { phase?: string; message?: string; error?: string } | null;
    const phase = status?.phase || "";
    if (phase) emitPhase(phase);
    if (phase === "wait" && rearmed(snap)) return fail("rearm");
    if (phase === "done" || phase === "error" || phase === "halt") {
      return {
        ok: phase === "done",
        message: status?.message || body.message || snap.message,
        error: phase === "done" ? "" : status?.error || phase,
        slot: snap.slot,
      };
    }
  }
  return fail("tempo");
}

async function runLoop() {
  while (!stopUser && live.armed && live.message) {
    const snap = { ...live };
    const result = await oneCycle(snap);
    if (stopUser || !live.armed) return;
    if (result.error === "ocupado") {
      await wait(400);
      continue;
    }
    if (result.error === "rearm") continue;
    emitDone(result);
    if (!result.ok) {
      await wait(1000);
      continue;
    }
    // O React publica o próximo Tx (armId) depois do emitDone. Sem esta pausa o laço lê o texto velho.
    await wait(120);
    if (stopUser || !live.armed) return;
    if (snap.slot === 6 && result.ok) {
      if (shouldHaltTx("cycle6", "done")) releaseDigitalTx();
      return;
    }
  }
}
