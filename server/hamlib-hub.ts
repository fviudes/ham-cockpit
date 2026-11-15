/**
 * Hamlib Hub — ponto central de CAT entre o console e os equipamentos do catálogo.
 * Icom LAN UDP é tratado em server/icom-lan.ts (TCP 45002 → rigctld).
 * Flex/Metis nativos ainda não; sobe/consulta via rigctld quando o plano estiver pronto.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Socket } from "node:net";
import {
  EQUIPMENT_CATALOG,
  formatRigctldCommand,
  getEquipment,
  listHamlibReady,
  normalizeCivAddr,
  planHamlib,
  type EquipmentBinding,
  type EquipmentMaker,
  type HamlibPlan,
} from "../shared/equipment";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/equipment";

export type HubBindingRow = EquipmentBinding & {
  id: string;
  label?: string;
  enabled: boolean;
};

export type HubSnapshot = {
  ok: boolean;
  folder: string;
  catalogCount: number;
  hamlibReadyCount: number;
  bindings: HubBindingRow[];
  plans: Array<HamlibPlan & { bindingId: string; command: string }>;
  error?: string;
};

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "equipment");
  mkdirSync(local, { recursive: true });
  return local;
}

function bindingsPath() {
  return join(dataDir(), "bindings.json");
}

function writeAtomic(file: string, body: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, file);
}

let bindings: HubBindingRow[] = [];

function load() {
  try {
    const raw = JSON.parse(readFileSync(bindingsPath(), "utf8")) as { bindings?: unknown };
    if (!Array.isArray(raw.bindings)) {
      bindings = [];
      return;
    }
    bindings = raw.bindings.map((b) => sanitizeBinding(b as Partial<HubBindingRow>)).filter(Boolean) as HubBindingRow[];
  } catch {
    bindings = [];
  }
}

function persist() {
  writeAtomic(bindingsPath(), `${JSON.stringify({ bindings }, null, 2)}\n`);
}

function newId() {
  return Math.random().toString(16).slice(2, 10);
}

function sanitizeBinding(raw: Partial<HubBindingRow>): HubBindingRow | null {
  const equipmentId = String(raw.equipmentId || "").trim();
  if (!equipmentId || !getEquipment(equipmentId)) return null;
  return {
    id: String(raw.id || newId()),
    equipmentId,
    connectionKind: raw.connectionKind || "usb-serial",
    host: raw.host ? String(raw.host).trim() : undefined,
    ports: raw.ports,
    ser2netPort: raw.ser2netPort != null ? Number(raw.ser2netPort) : undefined,
    baud: raw.baud != null ? Number(raw.baud) : undefined,
    civAddr: raw.civAddr ? String(raw.civAddr).trim() : undefined,
    username: raw.username ? String(raw.username) : undefined,
    password: raw.password ? String(raw.password) : undefined,
    hamlibListenPort: raw.hamlibListenPort != null ? Number(raw.hamlibListenPort) : undefined,
    label: raw.label ? String(raw.label).trim() : undefined,
    enabled: raw.enabled !== false,
  };
}

load();

function buildPlans() {
  return bindings
    .filter((b) => b.enabled)
    .map((b) => {
      const plan = planHamlib(b);
      if (!plan) return null;
      return {
        ...plan,
        bindingId: b.id,
        command: formatRigctldCommand(plan),
      };
    })
    .filter(Boolean) as Array<HamlibPlan & { bindingId: string; command: string }>;
}

export function hubCatalog(maker?: EquipmentMaker) {
  const list = maker ? EQUIPMENT_CATALOG.filter((e) => e.maker === maker) : EQUIPMENT_CATALOG;
  return {
    ok: true,
    makers: Array.from(new Set(EQUIPMENT_CATALOG.map((e) => e.maker))),
    hamlibReady: listHamlibReady().map((e) => e.id),
    equipment: list,
  };
}

export function hubStatus(): HubSnapshot {
  return {
    ok: true,
    folder: dataDir(),
    catalogCount: EQUIPMENT_CATALOG.length,
    hamlibReadyCount: listHamlibReady().length,
    bindings,
    plans: buildPlans(),
  };
}

export function hubSaveBindings(body: { bindings?: unknown }): HubSnapshot {
  if (Array.isArray(body.bindings)) {
    bindings = body.bindings.map((b) => sanitizeBinding(b as Partial<HubBindingRow>)).filter(Boolean) as HubBindingRow[];
    persist();
  }
  return hubStatus();
}

export function hubUpsertBinding(raw: Partial<HubBindingRow>): HubSnapshot {
  const next = sanitizeBinding(raw);
  if (!next) {
    const snap = hubStatus();
    snap.ok = false;
    snap.error = "equipmentId inválido ou ausente no catálogo";
    return snap;
  }
  const idx = bindings.findIndex((b) => b.id === next.id);
  if (idx >= 0) bindings[idx] = { ...bindings[idx], ...next, id: bindings[idx]!.id };
  else bindings.push(next);
  persist();
  return hubStatus();
}

export function hubRemoveBinding(id: string): HubSnapshot {
  bindings = bindings.filter((b) => b.id !== id);
  persist();
  return hubStatus();
}

export function hubPlanOne(raw: Partial<EquipmentBinding>): {
  ok: boolean;
  plan: HamlibPlan | null;
  command?: string;
  error?: string;
} {
  const equipmentId = String(raw.equipmentId || "").trim();
  if (!equipmentId || !getEquipment(equipmentId)) {
    return { ok: false, plan: null, error: "equipmentId inválido" };
  }
  const plan = planHamlib({
    equipmentId,
    connectionKind: raw.connectionKind || "usb-serial",
    host: raw.host,
    ports: raw.ports,
    ser2netPort: raw.ser2netPort,
    baud: raw.baud,
    civAddr: raw.civAddr,
    hamlibListenPort: raw.hamlibListenPort,
  });
  if (!plan) return { ok: false, plan: null, error: "falha ao montar plano" };
  return { ok: plan.ready, plan, command: formatRigctldCommand(plan), error: plan.deferReason };
}

type RigReply = { ok: boolean; reply: string; error?: string };

type RigJob = {
  command: string;
  timeoutMs: number;
  resolve: (value: RigReply) => void;
  settled: boolean;
  /** Escuta de FT8: passa na frente do S-meter. */
  priority: boolean;
  /** Poll interrompido antes de ir ao ar. Não escreve no socket. */
  drop: boolean;
};

type RigPower = "on" | "off" | "unknown";

type RigLane = {
  host: string;
  port: number;
  sock: Socket | null;
  buf: string;
  lines: string[];
  queue: RigJob[];
  pumping: boolean;
  current: RigJob | null;
  power: RigPower;
  idle: ReturnType<typeof setTimeout> | null;
  hard: ReturnType<typeof setTimeout> | null;
  caller: ReturnType<typeof setTimeout> | null;
  txnDone: (() => void) | null;
  /** Resposta do comando anterior ainda não trouxe RPRT. Não abre outro TCP. */
  skip: boolean;
  /** Comandos da escuta esperando este socket. Encurta a espera de um poll. */
  priorityWaiting: number;
  /** Quando o comando atual tomou a faixa. */
  currentSince: number;
};

const lanes = new Map<string, RigLane>();

function laneFor(host: string, port: number): RigLane {
  const key = `${host}:${port}`;
  let lane = lanes.get(key);
  if (!lane) {
    lane = {
      host,
      port,
      sock: null,
      buf: "",
      lines: [],
      queue: [],
      pumping: false,
      current: null,
      power: "unknown",
      idle: null,
      hard: null,
      caller: null,
      txnDone: null,
      skip: false,
      priorityWaiting: 0,
      currentSince: 0,
    };
    lanes.set(key, lane);
  }
  return lane;
}

/** Leitura (poll). Escrita (F/M/T/V/set) entra na fila mesmo com um poll em curso. */
function isPollCommand(command: string) {
  const c = command.trim();
  if (c.startsWith("\\get_") || c.startsWith("get_")) return true;
  return c === "f" || c === "m" || c === "t" || c === "v" || c === "s" || c === "l";
}

function isSmeterPoll(command: string) {
  return /^\\?get_level\s+strength\b/i.test(command.trim());
}

/** f/m/t são o chip. O poll de 60 Hz não pode ficar com o único lugar da fila. */
function isChipRead(command: string) {
  const c = command.trim();
  return c === "f" || c === "m" || c === "t";
}

/**
 * O S-meter só entra com a faixa livre. f/m/t e a escrita não ficam atrás
 * de um STRENGTH: o poll sai na hora. Um comando não espera prazo de 6–8 s.
 */
export function rigCommandAdmission(
  command: string,
  laneBusy: boolean,
  queueLength: number,
  power: RigPower = "unknown",
  priority = false,
  currentCommand = "",
): "ok" | "ocupado" | "fila cheia" {
  if (!priority && power === "off" && isPollCommand(command)) return "ocupado";
  // Um STRENGTH espera a vez atrás de f/m. Outro STRENGTH no ar, ou a fila
  // já com alguém, é pulado — senão o poll de 60 Hz segura o Habilitar FT8.
  if (!priority && isSmeterPoll(command)) {
    // Um f na fila não pode engolir o dB: o ponteiro caía para umas quatro
    // amostras por minuto. Outro STRENGTH no ar é que não entra.
    if (laneBusy && isSmeterPoll(currentCommand)) return "ocupado";
    return "ok";
  }
  if (!priority && isChipRead(command)) {
    if (queueLength >= 2) return "ocupado";
    return "ok";
  }
  if (!priority && isPollCommand(command) && (laneBusy || queueLength > 0)) {
    if (queueLength > 0) return "ocupado";
  }
  if (!isPollCommand(command) && queueLength >= 4) return "fila cheia";
  return "ok";
}

export function rewriteIc705PowerOn(
  command: string,
  radio?: { hamlibModel?: number; equipmentId?: string; civAddr?: string } | null,
): string {
  const c = command.trim();
  if (!/^\\set_powerstat\s+1$/i.test(c)) return command;
  if (!radio) return command;
  if (radio.hamlibModel !== 3085 && radio.equipmentId !== "icom-ic-705") return command;
  // 705 em standby não acorda por set_powerstat: o Hamlib consulta e estoura o prazo.
  const addr = (normalizeCivAddr(radio.civAddr) || "0xA4").slice(2);
  return `\\send_raw icom 0xFE:0xFE:0x${addr}:0xE0:0x18:0x01:0xFD`;
}

function isRigWake(command: string): boolean {
  const c = command.trim();
  if (/^\\set_powerstat\s+1$/i.test(c)) return true;
  return /\\send_raw\b/i.test(c) && /0x18:0x01\b/i.test(c);
}

function rememberPower(lane: RigLane, command: string, value: RigReply) {
  const c = command.trim();
  if (/^\\get_powerstat\b/i.test(c)) {
    if (!value.ok) return;
    const line =
      value.reply
        .split("\n")
        .map((s) => s.trim())
        .find((s) => s && !s.startsWith("RPRT")) || "";
    if (line === "1" || /^on$/i.test(line)) lane.power = "on";
    else if (line === "0" || line === "2" || /off|standby/i.test(line)) lane.power = "off";
    return;
  }
  if (!value.ok) return;
  if (/^\\set_powerstat\s+0$/i.test(c)) lane.power = "off";
  else if (/^\\set_powerstat\s+1$/i.test(c)) lane.power = "on";
  else if (/\\send_raw\b/i.test(c) && /0x18:0x00\b/i.test(c)) lane.power = "off";
  else if (/\\send_raw\b/i.test(c) && /0x18:0x02\b/i.test(c)) lane.power = "off";
  else if (/\\send_raw\b/i.test(c) && /0x18:0x01\b/i.test(c)) lane.power = "on";
}

function releaseQueuedPolls(lane: RigLane) {
  if (!lane.queue.length) return;
  const keep: RigJob[] = [];
  for (const job of lane.queue) {
    if (isPollCommand(job.command)) settle(job, { ok: false, reply: "", error: "ocupado" });
    else keep.push(job);
  }
  lane.queue = keep;
}

/** O S-meter sai da fila. f/m/t que já esperam ficam, na mesma ordem. */
function releaseQueuedMeters(lane: RigLane) {
  if (!lane.queue.length) return;
  const keep: RigJob[] = [];
  for (const job of lane.queue) {
    if (isSmeterPoll(job.command)) settle(job, { ok: false, reply: "", error: "ocupado" });
    else keep.push(job);
  }
  lane.queue = keep;
}

/**
 * A escuta não espera um poll que já estourou o prazo nem a resposta atrasada
 * dele. Um poll ainda no ar (CI-V em curso) termina no mesmo socket.
 */
function releaseSlowMeter(lane: RigLane) {
  const job = lane.current;
  if (!job || !isSmeterPoll(job.command)) return;
  const age = lane.currentSince ? Date.now() - lane.currentSince : 0;
  // O dB do IC-705 chegou em ~260 ms. Soltar antes disso devolve ocupado e o ponteiro para.
  if (!job.settled && age < 500) return;
  preemptStalePoll(lane);
}

function preemptStalePoll(lane: RigLane) {
  const job = lane.current;
  // Solta o poll que já respondeu, no mesmo socket. Fechar o TCP deixa o
  // rigctld em CLOSE-WAIT, a 4012 cai e o próximo comando abre outro cliente.
  // STRENGTH sai na hora: não fica na frente do Habilitar FT8.
  const meter = Boolean(job && isSmeterPoll(job.command));
  // Escrita e preempt soltam qualquer poll no mesmo socket. Esperar o prazo
  // de 6 s é o que deixava o FT8 e o chip atrasados.
  if (job && isPollCommand(job.command)) {
    const written = Boolean(lane.txnDone);
    job.drop = true;
    if (!job.settled) settle(job, { ok: false, reply: "", error: meter ? "ocupado" : "timeout" });
    if (written && !lane.skip) lane.skip = true;
    finishTxn(lane, null);
  }
}

export function noteRigPower(host: string, port: number, power: RigPower) {
  laneFor(host, port).power = power;
}

function settle(job: RigJob, value: RigReply) {
  if (job.settled) return;
  job.settled = true;
  job.resolve(value);
}

function classifyReply(text: string): RigReply {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bad = lines.find((l) => /^RPRT\s+-\d+/.test(l));
  if (bad) {
    // -5 é o timeout do Hamlib. No IC-705, -11 também é prazo estourado, não um modo.
    const code = Number(bad.slice(4).trim());
    if (code === -5 || code === -11) return { ok: false, reply: lines.join("\n"), error: "timeout" };
    return { ok: false, reply: lines.join("\n"), error: bad };
  }
  if (!lines.length) return { ok: false, reply: "", error: "resposta vazia" };
  return { ok: true, reply: lines.join("\n") };
}

function clearLaneTimers(lane: RigLane) {
  if (lane.idle) clearTimeout(lane.idle);
  if (lane.hard) clearTimeout(lane.hard);
  if (lane.caller) clearTimeout(lane.caller);
  lane.idle = null;
  lane.hard = null;
  lane.caller = null;
}

function finishTxn(lane: RigLane, value: RigReply | null) {
  const done = lane.txnDone;
  if (!done && !lane.current) return;
  const job = lane.current;
  clearLaneTimers(lane);
  lane.txnDone = null;
  lane.current = null;
  lane.currentSince = 0;
  lane.lines = [];
  lane.buf = "";
  if (job && value) {
    rememberPower(lane, job.command, value);
    settle(job, value);
    if (value.ok) {
      const c = job.command.trim();
      if (c === "f" || c === "m" || c === "t") {
        console.log(`civ ${c.split(/\s+/)[0]} ${value.reply.split("\n")[0]}`);
      }
    }
  }
  if (done) done();
}

function dropSock(lane: RigLane) {
  const sock = lane.sock;
  lane.sock = null;
  if (!sock) return;
  sock.removeAllListeners();
  try {
    sock.destroy();
  } catch {
    /* */
  }
}

function pullLines(lane: RigLane) {
  while (true) {
    const i = lane.buf.indexOf("\n");
    if (i < 0) break;
    const line = lane.buf.slice(0, i).replace(/\r$/, "").trim();
    lane.buf = lane.buf.slice(i + 1);
    if (line) lane.lines.push(line);
  }
}

/** `f` e `m` já vieram completos. Este rigctld às vezes segura o RPRT depois da leitura. */
function readLinesReady(command: string, lines: string[]): boolean {
  const c = command.trim();
  const body = lines.filter((l) => !l.startsWith("RPRT"));
  if (c === "f") return body.some((l) => /^\d+(?:\.\d+)?$/.test(l));
  if (c === "m") {
    const hasMode = body.some((l) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(l));
    const hasWidth = body.some((l) => /^\d+$/.test(l));
    return hasMode && hasWidth;
  }
  // O painel lê o PTT em todo ciclo. Esperar o RPRT segurava a faixa por
  // até 6 s e o S-meter caía para umas quatro amostras por minuto.
  if (c === "t") return body.some((l) => l === "0" || l === "1");
  if (/^\\?get_powerstat\b/i.test(c)) return body.some((l) => /^(0|1|2|on|off|standby)$/i.test(l));
  // O rigctld manda o dB e segura o RPRT. Sem isto o STRENGTH fica até o
  // prazo na faixa e o ponteiro não anda, mesmo com f e m respondendo.
  if (isSmeterPoll(c)) return body.some((l) => /^-?\d+(?:\.\d+)?$/.test(l));
  return false;
}

function onLaneData(lane: RigLane, chunk: string) {
  lane.buf += chunk;
  if (lane.skip || lane.current) pullLines(lane);
  if (lane.skip) {
    if (lane.lines.some((l) => l.startsWith("RPRT"))) {
      lane.skip = false;
      lane.buf = "";
      lane.lines = [];
    }
    return;
  }
  if (!lane.current) {
    if (lane.buf.length > 4096) lane.buf = "";
    return;
  }
  if (lane.lines.some((l) => l.startsWith("RPRT"))) {
    finishTxn(lane, classifyReply(lane.lines.join("\n")));
    return;
  }
  const job = lane.current;
  if (!job.settled && readLinesReady(job.command, lane.lines)) {
    const reply = lane.lines.filter((l) => !l.startsWith("RPRT")).join("\n");
    const rprtSeen = lane.lines.some((l) => l.startsWith("RPRT"));
    settle(job, { ok: true, reply });
    // O RPRT no mesmo pacote já foi lido. Marcar skip aqui apagava essa
    // linha no finishTxn e o próximo comando (o S-meter) ficava até 4 s
    // esperando um RPRT que não vinha mais. A faixa ficava ocupada.
    lane.skip = !rprtSeen;
    finishTxn(lane, null);
  }
}

async function waitSkip(lane: RigLane, job: RigJob) {
  const start = Date.now();
  while (lane.skip && lane.sock && !lane.sock.destroyed) {
    if (job.drop || lane.current !== job) return;
    const limit = 120;
    if (Date.now() - start > limit) {
      // O RPRT não veio. Segue no mesmo socket: outro TCP enche o rigctld
      // e a resposta antiga não drena.
      lane.skip = false;
      lane.buf = "";
      lane.lines = [];
      return;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
}

function ensureSock(lane: RigLane): Promise<void> {
  if (lane.sock && !lane.sock.destroyed) return Promise.resolve();
  dropSock(lane);
  return new Promise((resolve, reject) => {
    const sock = new Socket();
    let opened = false;
    const fail = (err: Error) => {
      if (opened) return;
      opened = true;
      clearTimeout(timer);
      sock.removeAllListeners();
      sock.destroy();
      if (lane.sock === sock) lane.sock = null;
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error("timeout na conexão")), 2000);
    sock.on("error", (err) => {
      if (!opened) fail(err);
      else if (lane.current) finishTxn(lane, { ok: false, reply: "", error: err.message });
      else if (lane.sock === sock) lane.sock = null;
    });
    sock.on("close", () => {
      if (lane.sock === sock) lane.sock = null;
      if (lane.current) finishTxn(lane, { ok: false, reply: lane.lines.join("\n"), error: "conexão fechada" });
    });
    sock.setEncoding("utf8");
    sock.setNoDelay(true);
    sock.on("data", (chunk: string | Buffer) => onLaneData(lane, chunk.toString()));
    sock.connect(lane.port, lane.host, () => {
      if (opened) return;
      opened = true;
      clearTimeout(timer);
      lane.sock = sock;
      resolve();
    });
  });
}

async function runJob(lane: RigLane, job: RigJob) {
  // Marca a leitura no ar antes do TCP. O próximo poll (S-meter a 60 Hz)
  // vê a faixa ocupada e não entra na fila enquanto esta não fechar.
  lane.current = job;
  lane.currentSince = Date.now();
  await waitSkip(lane, job);
  if (job.drop || job.settled) {
    if (lane.current === job) {
      lane.current = null;
      lane.currentSince = 0;
    }
    settle(job, { ok: false, reply: "", error: "ocupado" });
    return;
  }
  lane.lines = [];
  lane.buf = "";
  try {
    await ensureSock(lane);
  } catch (err) {
    if (lane.current === job) lane.current = null;
    settle(job, { ok: false, reply: "", error: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (!lane.sock) {
    if (lane.current === job) lane.current = null;
    settle(job, { ok: false, reply: "", error: "sem socket" });
    return;
  }
  await new Promise<void>((done) => {
    lane.txnDone = done;
    lane.current = job;
    lane.currentSince = Date.now();
    // O prazo começa quando o comando sai. Antes disso a espera do RPRT
    // velho cancelava o f e o chip ficava vermelho sem ter falado com o rádio.
    lane.caller = setTimeout(() => {
      lane.caller = null;
      if (lane.current !== job) return;
      settle(job, { ok: false, reply: "", error: "timeout" });
      lane.skip = true;
      finishTxn(lane, null);
    }, job.timeoutMs);
    lane.hard = setTimeout(() => {
      lane.hard = null;
      // Fechar o TCP aqui deixa o rigctld em CLOSE-WAIT com o CI-V ainda no ar
      // e o próximo comando abre outro socket. Espera o RPRT no mesmo socket.
      lane.skip = true;
      finishTxn(lane, job.settled ? null : { ok: false, reply: "", error: "timeout" });
    }, job.timeoutMs + 200);
    lane.sock!.write(job.command);
  });
}

function pump(lane: RigLane) {
  if (lane.pumping) return;
  lane.pumping = true;
  void (async () => {
    try {
      while (lane.queue.length) {
        const job = lane.queue.shift();
        if (!job) break;
        await runJob(lane, job);
      }
    } finally {
      lane.pumping = false;
      if (lane.queue.length) pump(lane);
    }
  })();
}

/**
 * Uma fila por host:porta. Só existe um socket para o rigctld;
 * o próximo comando espera o anterior fechar a resposta.
 */
export function hubRigctl(
  listenPort: number,
  command: string,
  host = "127.0.0.1",
  timeoutMs = 900,
  preempt = false,
): Promise<RigReply> {
  const cmd = command.trim().endsWith("\n") ? command.trim() : `${command.trim()}\n`;
  const lane = laneFor(host, listenPort);
  return new Promise((resolve) => {
    // A escuta digital lê e grava com o painel no ar. Sem isto o poll da UI
    // ocupa o único lugar da fila e o enable volta "ocupado" sem falar com o rádio.
    if (preempt || !isPollCommand(cmd)) releaseQueuedPolls(lane);
    if (preempt) preemptStalePoll(lane);
    else if (isChipRead(cmd)) releaseSlowMeter(lane);
    if (isRigWake(cmd)) {
      releaseQueuedPolls(lane);
      if (lane.current && isPollCommand(lane.current.command)) {
        const job = lane.current;
        job.drop = true;
        dropSock(lane);
        finishTxn(lane, job.settled ? null : { ok: false, reply: "", error: "ocupado" });
      }
    }
    if (!preempt && isSmeterPoll(cmd)) {
      const meterNow = Boolean(lane.current && isSmeterPoll(lane.current.command));
      const meterWait = lane.queue.some((job) => isSmeterPoll(job.command));
      if (meterNow || meterWait) {
        resolve({ ok: false, reply: "", error: "ocupado" });
        return;
      }
    }
    const admission = rigCommandAdmission(
      cmd,
      Boolean(lane.current),
      isSmeterPoll(cmd) ? 0 : lane.queue.length,
      lane.power,
      preempt,
      lane.current?.command ?? "",
    );
    if (admission === "ocupado") {
      resolve({ ok: false, reply: "", error: "ocupado" });
      return;
    }
    if (admission === "fila cheia") {
      resolve({ ok: false, reply: "", error: "fila cheia" });
      return;
    }
    if (preempt) lane.priorityWaiting += 1;
    const job: RigJob = {
      command: cmd,
      timeoutMs,
      settled: false,
      priority: preempt,
      drop: false,
      resolve: (value) => {
        if (preempt) lane.priorityWaiting = Math.max(0, lane.priorityWaiting - 1);
        resolve(value);
      },
    };
    // O dB é o próximo, na frente de f/m/t que só estavam esperando.
    if (!preempt && isSmeterPoll(cmd)) lane.queue.unshift(job);
    else lane.queue.push(job);
    pump(lane);
  });
}
