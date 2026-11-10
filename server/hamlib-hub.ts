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

/** Cliente mínimo do protocolo Hamlib NET (rigctld). */
export async function hubRigctl(
  listenPort: number,
  command: string,
  host = "127.0.0.1",
  timeoutMs = 2500,
): Promise<{ ok: boolean; reply: string; error?: string }> {
  const cmd = command.trim().endsWith("\n") ? command.trim() : `${command.trim()}\n`;
  return new Promise((resolve) => {
    const sock = new Socket();
    let buf = "";
    let done = false;
    const finish = (ok: boolean, reply: string, error?: string) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        /* */
      }
      resolve({ ok, reply, error });
    };
    const timer = setTimeout(() => finish(false, buf, "timeout"), timeoutMs);
    sock.connect(listenPort, host, () => {
      sock.write(cmd);
    });
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes("\n")) {
        clearTimeout(timer);
        finish(true, buf.trim());
      }
    });
    sock.on("error", (err) => {
      clearTimeout(timer);
      finish(false, "", err.message);
    });
    sock.on("close", () => {
      clearTimeout(timer);
      if (!done) finish(buf.length > 0, buf.trim(), buf ? undefined : "conexão fechada");
    });
  });
}
