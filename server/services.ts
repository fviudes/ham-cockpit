import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SERVICE_IDS, type ServiceId } from "../shared/const";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/services";
const HELPER = "/opt/ham-cockpit/bin/station-svc";

export type ServiceRow = {
  id: ServiceId;
  autostart: boolean;
  running: boolean;
  unit: string;
  /** Tem botão Ligar/Desligar no console. */
  power: boolean;
};

export type ServicesSnapshot = {
  ok: boolean;
  folder: string;
  items: ServiceRow[];
  error: string;
};

type BootMap = Record<ServiceId, boolean>;

const UNITS: Record<ServiceId, string> = {
  ser2net: "ser2net.service",
  wavelog: "wavelog.service",
  db: "wavelog-db",
  wlg: "waveloggate.service",
  mmdvm: "mmdvmhost.service",
  radio: "",
  spe: "ampctld@spe.service",
  hamplus: "",
  palstar: "",
  ldg: "",
  lp100a: "",
  acom: "",
  lextel: "",
  wifi: "ham-cockpit-ap.service",
  bluetooth: "bluetooth.service",
  dhcp: "",
  web: "ham-cockpit.service",
};

/** Serviços com unit/container gerenciado pelo helper station-svc. */
const HELPER_IDS = new Set<ServiceId>(SERVICE_IDS.filter((id) => UNITS[id]));

/** Ligar/Desligar manual (além do início automático). */
const POWER_IDS = new Set<ServiceId>(["ser2net", "wavelog", "db", "wlg", "mmdvm", "spe", "bluetooth", "radio", "lextel", "ldg", "lp100a"]);

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "services");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "boot.json");
}

function allOn(): BootMap {
  return Object.fromEntries(SERVICE_IDS.map((id) => [id, true])) as BootMap;
}

function loadBoot(): BootMap {
  const base = allOn();
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as Partial<BootMap>;
    for (const id of SERVICE_IDS) {
      if (typeof raw[id] === "boolean") base[id] = raw[id] as boolean;
    }
  } catch {
    /* defaults: all autostart */
  }
  return base;
}

let boot = loadBoot();
let bootTried = false;

function persist() {
  const tmp = `${jsonPath()}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(boot, null, 2)}\n`, "utf8");
  renameSync(tmp, jsonPath());
}

export function isServiceAutostart(id: ServiceId): boolean {
  return boot[id] !== false;
}

/** Ligar Wavelog/MariaDB/MMDVM: no máximo um por vez (Pi 3 trava com tudo em paralelo). */
let heavyChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = heavyChain.then(fn, fn);
  heavyChain = run.catch(() => undefined);
  return run;
}

function helperTimeout(cmd: string, id: ServiceId): number {
  if (cmd === "start" || cmd === "stop") {
    if (id === "wavelog" || id === "db") return 240_000;
    if (id === "mmdvm") return 120_000;
    return 40_000;
  }
  return 10_000;
}

async function helper(cmd: string, id: ServiceId): Promise<string> {
  if (!existsSync(HELPER)) return "";
  try {
    const { stdout } = await execFileAsync("sudo", ["-n", HELPER, cmd, id], {
      timeout: helperTimeout(cmd, id),
      windowsHide: true,
    });
    if (cmd === "start" || cmd === "stop") stateCache = null;
    return String(stdout || "").trim();
  } catch {
    return "";
  }
}

// ── Estado de todas as units em UM spawn (sudo station-svc is-active-all) ─────────────
let stateCache: { at: number; map: Record<string, string> } | null = null;
let stateInflight: Promise<Record<string, string>> | null = null;

async function unitStates(fresh = false): Promise<Record<string, string>> {
  if (!fresh && stateCache && Date.now() - stateCache.at < 2500) return stateCache.map;
  if (stateInflight) return stateInflight;
  stateInflight = (async () => {
    const map: Record<string, string> = {};
    if (existsSync(HELPER)) {
      try {
        const { stdout } = await execFileAsync("sudo", ["-n", HELPER, "is-active-all"], {
          timeout: 12_000,
          windowsHide: true,
        });
        for (const line of String(stdout).split(/\r?\n/)) {
          const m = line.match(/^(\w+)=(\S+)/);
          if (m) map[m[1]] = m[2];
        }
      } catch {
        /* helper indisponível: tudo inativo */
      }
    }
    stateCache = { at: Date.now(), map };
    return map;
  })().finally(() => {
    stateInflight = null;
  });
  return stateInflight;
}

async function probeRunning(id: ServiceId, states: Record<string, string>): Promise<boolean> {
  if (id === "web") return true;
  if (id === "lextel") {
    try {
      const { lextelStatus } = await import("./lextel");
      const st = lextelStatus();
      return Boolean(st.connected || st.phase === "streaming" || st.phase === "connecting");
    } catch {
      return false;
    }
  }
  if (process.platform === "linux" && UNITS[id]) {
    return states[id] === "active";
  }
  return false;
}

export async function servicesStatus(): Promise<ServicesSnapshot> {
  const states = process.platform === "linux" ? await unitStates() : {};
  const running = await Promise.all(SERVICE_IDS.map((id) => probeRunning(id, states)));
  return {
    ok: true,
    folder: dataDir(),
    items: SERVICE_IDS.map((id, i) => ({
      id,
      autostart: boot[id] !== false,
      running: Boolean(running[i]),
      unit: UNITS[id],
      power: POWER_IDS.has(id),
    })),
    error: "",
  };
}

export async function servicesSetAutostart(id: string, autostart: boolean): Promise<ServicesSnapshot> {
  if (!SERVICE_IDS.includes(id as ServiceId)) {
    return { ...(await servicesStatus()), ok: false, error: "serviço desconhecido" };
  }
  const sid = id as ServiceId;
  boot[sid] = Boolean(autostart);
  persist();
  if (process.platform === "linux" && HELPER_IDS.has(sid)) {
    await helper(autostart ? "enable" : "disable", sid);
    if (sid !== "web") {
      await serialize(() => helper(autostart ? "start" : "stop", sid));
    }
  }
  if (sid === "radio" && autostart) {
    const { radiosResumeIcomLan } = await import("./radios");
    void radiosResumeIcomLan().catch(() => undefined);
  }
  if (sid === "radio" && !autostart) {
    const { radiosDisconnect, radiosStatus } = await import("./radios");
    const snap = await radiosStatus();
    const primary = snap.radios.find((r) => r.primary) || snap.radios[0];
    if (primary?.connected) void radiosDisconnect(primary.id).catch(() => undefined);
  }
  return servicesStatus();
}

/** Liga/desliga agora, sem mexer no início automático. */
export async function servicesPower(id: string, on: boolean): Promise<ServicesSnapshot> {
  if (!SERVICE_IDS.includes(id as ServiceId) || !POWER_IDS.has(id as ServiceId)) {
    return { ...(await servicesStatus()), ok: false, error: "serviço sem Ligar/Desligar" };
  }
  const sid = id as ServiceId;
  try {
    if (HELPER_IDS.has(sid)) {
      if (process.platform !== "linux" || !existsSync(HELPER)) {
        return { ...(await servicesStatus()), ok: false, error: "disponível só no Ubuntu da estação" };
      }
      const out = await serialize(() => helper(on ? "start" : "stop", sid));
      if (!out) {
        const states = await unitStates(true);
        const now = states[sid] === "active";
        if (now !== on) {
          return { ...(await servicesStatus()), ok: false, error: `falha ao ${on ? "ligar" : "desligar"} ${sid}` };
        }
      }
    } else if (sid === "radio") {
      if (on) {
        const { radiosResumeIcomLan } = await import("./radios");
        await radiosResumeIcomLan();
      } else {
        const { radiosDisconnect, radiosStatus } = await import("./radios");
        const snap = await radiosStatus();
        const primary = snap.radios.find((r) => r.primary) || snap.radios[0];
        if (primary?.connected) await radiosDisconnect(primary.id);
      }
    } else if (sid === "lextel") {
      const m = await import("./lextel");
      if (on) await m.lextelAutoConnect();
      else await m.lextelDisconnect();
    } else if (sid === "ldg") {
      const m = await import("./ldg");
      if (on) await m.ldgConnect();
      else await m.ldgDisconnect();
    } else if (sid === "lp100a") {
      const m = await import("./lp100a");
      if (on) await m.lp100aConnect();
      else await m.lp100aDisconnect();
    }
  } catch (err) {
    return { ...(await servicesStatus()), ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  stateCache = null;
  return servicesStatus();
}

const BOOT_UNIT_IDS: ServiceId[] = ["ser2net", "db", "wavelog", "wlg", "mmdvm", "spe", "bluetooth"];

/**
 * Reconcilia o que o início automático promete com o estado real (rede de segurança do systemd).
 * Sequencial (um serviço por vez) e em 3 passes — antes era tudo em paralelo e sem retry.
 */
async function reconcileBoot(first: boolean): Promise<void> {
  if (process.platform !== "linux" || !existsSync(HELPER)) return;
  const states = await unitStates(true);
  for (const id of BOOT_UNIT_IDS) {
    const st = states[id] || "inactive";
    if (boot[id]) {
      if (first) await helper("enable", id);
      if (st === "inactive" || st === "failed") {
        await serialize(() => helper("start", id));
      }
    } else if (first && (st === "active" || st === "activating")) {
      await serialize(() => helper("stop", id));
    }
  }
  if (first && boot.wifi) await helper("enable", "wifi");
}

async function reconcileDevices(): Promise<void> {
  if (boot.radio) {
    try {
      const { radiosResumeIcomLan, radiosStatus } = await import("./radios");
      const snap = await radiosStatus();
      const primary = snap.radios.find((r) => r.primary);
      if (!primary?.connected) await radiosResumeIcomLan();
    } catch {
      /* sem rádio LAN configurado */
    }
  }
  if (boot.lextel) {
    const { lextelAutoConnect } = await import("./lextel");
    void lextelAutoConnect().catch(() => undefined);
  }
  if (boot.ldg) {
    const { ldgConnect, ldgStatus } = await import("./ldg");
    const st = ldgStatus();
    if (st.autoConnect && st.port && !st.connected) void ldgConnect().catch(() => undefined);
  }
  if (boot.lp100a) {
    const { lp100aConnect, lp100aStatus } = await import("./lp100a");
    const st = lp100aStatus();
    if (st.autoConnect && st.port && !st.connected) void lp100aConnect().catch(() => undefined);
  }
}

export async function servicesApplyBoot(): Promise<void> {
  if (bootTried) return;
  bootTried = true;
  persist();
  // Passes em 20 s, 90 s e 240 s após o console subir; depois disso só o systemd.
  const passes = [20_000, 70_000, 150_000];
  let elapsed = 0;
  passes.forEach((delay, i) => {
    elapsed += delay;
    setTimeout(() => {
      void (async () => {
        try {
          await reconcileBoot(i === 0);
          await reconcileDevices();
        } catch {
          /* próxima passada tenta de novo */
        }
      })();
    }, elapsed).unref?.();
  });
}
