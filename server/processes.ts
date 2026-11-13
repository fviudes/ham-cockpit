import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { isConsoleUnit, validServiceUnit } from "../shared/process-unit";

const execFileAsync = promisify(execFile);

/**
 * Privilégio igual ao das outras ações de serviço: `sudo -n /opt/ham-cockpit/bin/station-svc`
 * (sudoers do usuário hamcockpit). O helper só aceita list-running, stop-unit e restart-unit
 * com nome validado — não é um shell.
 * Sem o helper, no Linux, cai em `systemctl` direto (só funciona se o processo já for root).
 * Fora do Linux a lista fica vazia: nenhum processo é inventado.
 */
const HELPER = "/opt/ham-cockpit/bin/station-svc";

const NOT_LINUX = "Este host não é Linux. O systemd não está disponível e nenhum serviço foi listado.";
const LINUX_ONLY = "Parar e reiniciar só funcionam na estação Linux.";

export type ProcessUnit = {
  unit: string;
  active: string;
  sub: string;
  description: string;
};

export type ProcessList = {
  ok: boolean;
  available: boolean;
  items: ProcessUnit[];
  error: string;
};

export type ProcessAction = {
  ok: boolean;
  unit: string;
  action: string;
  error: string;
};

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function cleanErr(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  const raw = (asText(e?.stderr) || asText(e?.message) || "falha").replace(/\s+/g, " ").trim();
  return raw.slice(0, 300) || "falha";
}

async function run(file: string, args: string[], timeout: number): Promise<string> {
  const { stdout } = await execFileAsync(file, args, {
    timeout,
    windowsHide: true,
    maxBuffer: 1_048_576,
  });
  return asText(stdout);
}

async function listRunningRaw(): Promise<string> {
  if (existsSync(HELPER)) return run("sudo", ["-n", HELPER, "list-running"], 12_000);
  return run("systemctl", ["list-units", "--type=service", "--state=running", "--no-pager", "--output=json"], 12_000);
}

function parseUnits(raw: string): ProcessUnit[] {
  const start = raw.indexOf("[");
  if (start < 0) throw new Error("resposta do systemctl sem JSON");
  const data: unknown = JSON.parse(raw.slice(start));
  if (!Array.isArray(data)) throw new Error("resposta do systemctl inválida");
  const items: ProcessUnit[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { unit?: unknown; active?: unknown; sub?: unknown; description?: unknown };
    const unit = typeof rec.unit === "string" ? rec.unit : "";
    if (!validServiceUnit(unit)) continue;
    const active = typeof rec.active === "string" ? rec.active : "";
    const sub = typeof rec.sub === "string" ? rec.sub : "";
    if (active === "inactive" || active === "failed" || sub === "dead" || sub === "failed" || sub === "exited") continue;
    const description = typeof rec.description === "string" ? rec.description.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    items.push({ unit, active: active || "active", sub: sub || "running", description });
  }
  items.sort((a, b) => a.unit.localeCompare(b.unit));
  return items;
}

export async function processesList(): Promise<ProcessList> {
  if (process.platform !== "linux") {
    return { ok: true, available: false, items: [], error: NOT_LINUX };
  }
  try {
    return { ok: true, available: true, items: parseUnits(await listRunningRaw()), error: "" };
  } catch (err) {
    return { ok: false, available: true, items: [], error: cleanErr(err) };
  }
}

export async function processesAction(unit: string, action: string): Promise<ProcessAction> {
  const act = action === "stop" || action === "restart" ? action : "";
  if (!act) return { ok: false, unit, action, error: "Ação inválida." };
  if (!validServiceUnit(unit)) return { ok: false, unit, action: act, error: "Nome de serviço inválido." };
  if (process.platform !== "linux") return { ok: false, unit, action: act, error: LINUX_ONLY };
  const timeout = isConsoleUnit(unit) && act === "restart" ? 8_000 : 45_000;
  try {
    if (existsSync(HELPER)) {
      await run("sudo", ["-n", HELPER, act === "stop" ? "stop-unit" : "restart-unit", unit], timeout);
    } else if (act === "stop") {
      await run("systemctl", ["stop", "--", unit], timeout);
    } else if (isConsoleUnit(unit)) {
      await run("systemctl", ["restart", "--no-block", "--", unit], timeout);
    } else {
      await run("systemctl", ["restart", "--", unit], timeout);
    }
    return { ok: true, unit, action: act, error: "" };
  } catch (err) {
    return { ok: false, unit, action: act, error: cleanErr(err) };
  }
}
