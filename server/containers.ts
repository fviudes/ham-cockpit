import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { allowedDockerContainer } from "../shared/docker-container";

const execFileAsync = promisify(execFile);

const HELPER = "/opt/ham-cockpit/bin/station-svc";

const NOT_LINUX = "Este host não é Linux. Docker não está disponível aqui.";
const LINUX_ONLY = "Parar, reiniciar e editar limites só funcionam na estação Linux.";
const MIN_MEM_MIB = 64;
const MAX_MEM_MIB = 4096;
const MIN_CPUS = 0.1;
const MAX_CPUS = 4;

export type ContainerRow = {
  name: string;
  image: string;
  state: string;
  memLimitBytes: number | null;
  cpusLimit: number | null;
  memUsageBytes: number | null;
  cpuPct: number | null;
};

export type ContainerList = {
  ok: boolean;
  available: boolean;
  items: ContainerRow[];
  error: string;
};

export type ContainerAction = {
  ok: boolean;
  name: string;
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
    maxBuffer: 2_097_152,
  });
  return asText(stdout);
}

function finiteNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s || s === "-" || s === "[not set]") return null;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseRows(raw: string): ContainerRow[] {
  const start = raw.indexOf("[");
  if (start < 0) throw new Error("resposta do station-svc sem JSON");
  const data: unknown = JSON.parse(raw.slice(start));
  if (!Array.isArray(data)) throw new Error("resposta inválida");
  const items: ContainerRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    if (!allowedDockerContainer(name)) continue;
    const image = typeof rec.image === "string" ? rec.image.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    const state = typeof rec.state === "string" ? rec.state : "";
    const memLimitRaw = finiteNum(rec.memLimitBytes);
    const cpusLimitRaw = finiteNum(rec.cpusLimit);
    const memUsageRaw = finiteNum(rec.memUsageBytes);
    const cpuPctRaw = finiteNum(rec.cpuPct);
    items.push({
      name,
      image,
      state,
      memLimitBytes: memLimitRaw != null && memLimitRaw > 0 ? Math.round(memLimitRaw) : null,
      cpusLimit: cpusLimitRaw != null && cpusLimitRaw > 0 ? Math.round(cpusLimitRaw * 100) / 100 : null,
      memUsageBytes: memUsageRaw != null && memUsageRaw >= 0 ? Math.round(memUsageRaw) : null,
      cpuPct: cpuPctRaw != null ? Math.round(cpuPctRaw * 10) / 10 : null,
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

/** Testável: parse do JSON de list-containers. */
export function parseContainerListJson(raw: string): ContainerRow[] {
  return parseRows(raw);
}

async function listRaw(): Promise<string> {
  if (existsSync(HELPER)) return run("sudo", ["-n", HELPER, "list-containers"], 20_000);
  throw new Error("station-svc ausente");
}

export async function containersList(): Promise<ContainerList> {
  if (process.platform !== "linux") {
    return { ok: true, available: false, items: [], error: NOT_LINUX };
  }
  if (!existsSync(HELPER)) {
    return { ok: true, available: false, items: [], error: "Helper station-svc não instalado neste host." };
  }
  try {
    return { ok: true, available: true, items: parseRows(await listRaw()), error: "" };
  } catch (err) {
    return { ok: false, available: true, items: [], error: cleanErr(err) };
  }
}

function parseLimits(body: { memoryMiB?: unknown; cpus?: unknown }): { memMiB: number; cpus: number } | { error: string } {
  const memMiB = finiteNum(body.memoryMiB);
  const cpus = finiteNum(body.cpus);
  if (memMiB == null || cpus == null) return { error: "Memória ou CPUs inválidas." };
  if (memMiB < MIN_MEM_MIB || memMiB > MAX_MEM_MIB) {
    return { error: `Memória deve ficar entre ${MIN_MEM_MIB} e ${MAX_MEM_MIB} MiB.` };
  }
  if (cpus < MIN_CPUS || cpus > MAX_CPUS) {
    return { error: `CPUs devem ficar entre ${MIN_CPUS} e ${MAX_CPUS}.` };
  }
  return { memMiB: Math.round(memMiB), cpus: Math.round(cpus * 100) / 100 };
}

export async function containersAction(
  name: string,
  action: string,
  limits?: { memoryMiB?: unknown; cpus?: unknown },
): Promise<ContainerAction> {
  const act =
    action === "stop" || action === "restart" || action === "set-limits" ? action : "";
  if (!act) return { ok: false, name, action, error: "Ação inválida." };
  if (!allowedDockerContainer(name)) return { ok: false, name, action: act, error: "Contêiner fora da lista permitida." };
  if (process.platform !== "linux") return { ok: false, name, action: act, error: LINUX_ONLY };
  if (!existsSync(HELPER)) {
    return { ok: false, name, action: act, error: "Helper station-svc não instalado neste host." };
  }
  try {
    if (act === "set-limits") {
      const parsed = parseLimits(limits ?? {});
      if ("error" in parsed) return { ok: false, name, action: act, error: parsed.error };
      await run(
        "sudo",
        ["-n", HELPER, "container-set-limits", name, String(parsed.memMiB), String(parsed.cpus)],
        45_000,
      );
    } else if (act === "stop") {
      await run("sudo", ["-n", HELPER, "container-stop", name], 45_000);
    } else {
      await run("sudo", ["-n", HELPER, "container-restart", name], 90_000);
    }
    return { ok: true, name, action: act, error: "" };
  } catch (err) {
    return { ok: false, name, action: act, error: cleanErr(err) };
  }
}