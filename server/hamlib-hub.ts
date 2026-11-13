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
};

type RigLane = {
  host: string;
  port: number;
  sock: Socket | null;
  buf: string;
  lines: string[];
  queue: RigJob[];
  pumping: boolean;
  current: RigJob | null;
  idle: ReturnType<typeof setTimeout> | null;
  hard: ReturnType<typeof setTimeout> | null;
  caller: ReturnType<typeof setTimeout> | null;
  txnDone: (() => void) | null;
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
      idle: null,
      hard: null,
      caller: null,
      txnDone: null,
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

function settle(job: RigJob, value: RigReply) {
  if (job.settled) return;
  job.settled = true;
  job.resolve(value);
}

function classifyReply(text: string): RigReply {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bad = lines.find((l) => /^RPRT\s+-\d+/.test(l));
  if (bad) return { ok: false, reply: lines.join("\n"), error: bad };
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
  lane.lines = [];
  lane.buf = "";
  if (job && value) settle(job, value);
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

function armIdle(lane: RigLane) {
  if (lane.idle) clearTimeout(lane.idle);
  lane.idle = setTimeout(() => {
    lane.idle = null;
    if (!lane.current || !lane.lines.length) return;
    finishTxn(lane, classifyReply(lane.lines.join("\n")));
  }, 60);
}

function onLaneData(lane: RigLane, chunk: string) {
  lane.buf += chunk;
  if (!lane.current) {
    if (lane.buf.length > 4096) lane.buf = "";
    return;
  }
  pullLines(lane);
  if (lane.lines.some((l) => l.startsWith("RPRT"))) {
    finishTxn(lane, classifyReply(lane.lines.join("\n")));
    return;
  }
  if (lane.lines.length) armIdle(lane);
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
  lane.lines = [];
  lane.buf = "";
  try {
    await ensureSock(lane);
  } catch (err) {
    settle(job, { ok: false, reply: "", error: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (!lane.sock) {
    settle(job, { ok: false, reply: "", error: "sem socket" });
    return;
  }
  await new Promise<void>((done) => {
    lane.txnDone = done;
    lane.current = job;
    lane.caller = setTimeout(() => {
      lane.caller = null;
      settle(job, { ok: false, reply: "", error: "timeout" });
    }, job.timeoutMs);
    // Não abre outro TCP enquanto o rigctld não devolve a linha. O poll que
    // chega no meio recebe "ocupado" em vez de empilhar CLOSE-WAIT.
    lane.hard = setTimeout(() => {
      lane.hard = null;
      dropSock(lane);
      finishTxn(lane, job.settled ? null : { ok: false, reply: "", error: "timeout" });
    }, Math.max(job.timeoutMs, 8000));
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
  timeoutMs = 2500,
): Promise<RigReply> {
  const cmd = command.trim().endsWith("\n") ? command.trim() : `${command.trim()}\n`;
  const lane = laneFor(host, listenPort);
  return new Promise((resolve) => {
    if (isPollCommand(cmd) && (lane.current || lane.queue.length > 0)) {
      resolve({ ok: false, reply: "", error: "ocupado" });
      return;
    }
    if (!isPollCommand(cmd) && lane.queue.length >= 4) {
      resolve({ ok: false, reply: "", error: "fila cheia" });
      return;
    }
    lane.queue.push({ command: cmd, timeoutMs, resolve, settled: false });
    pump(lane);
  });
}
