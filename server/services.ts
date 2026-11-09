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
  wlg: "waveloggate.service",
  radio: "",
  spe: "ampctld@spe.service",
  hamplus: "",
  palstar: "",
  ldg: "",
  acom: "",
  lextel: "",
  wifi: "ham-cockpit-ap.service",
  bluetooth: "bluetooth.service",
  dhcp: "",
  web: "ham-cockpit.service",
};

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

async function helper(cmd: string, id: ServiceId): Promise<string> {
  if (!existsSync(HELPER)) return "";
  try {
    const { stdout } = await execFileAsync("sudo", ["-n", HELPER, cmd, id], {
      timeout: 8_000,
      windowsHide: true,
    });
    return String(stdout || "").trim();
  } catch {
    return "";
  }
}

async function probeRunning(id: ServiceId): Promise<boolean> {
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
    return (await helper("is-active", id)) === "active";
  }
  return false;
}

export async function servicesStatus(): Promise<ServicesSnapshot> {
  const running = await Promise.all(SERVICE_IDS.map((id) => probeRunning(id)));
  return {
    ok: true,
    folder: dataDir(),
    items: SERVICE_IDS.map((id, i) => ({
      id,
      autostart: boot[id] !== false,
      running: Boolean(running[i]),
      unit: UNITS[id],
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
  if (process.platform === "linux" && UNITS[sid]) {
    const out = await helper(autostart ? "enable" : "disable", sid);
    if (!out && existsSync(HELPER) && sid === "web" && !autostart) {
      /* helper may be missing in dev */
    }
  }
  return servicesStatus();
}

export async function servicesApplyBoot(): Promise<void> {
  if (bootTried) return;
  bootTried = true;
  persist();
  if (boot.wavelog) {
    const { wavelogUp } = await import("./wavelog-status");
    void wavelogUp().catch(() => undefined);
  }
  if (boot.wlg) {
    const { wlgUp } = await import("./wlg-status");
    void wlgUp().catch(() => undefined);
  }
  if (boot.lextel) {
    const { lextelAutoConnect } = await import("./lextel");
    void lextelAutoConnect().catch(() => undefined);
  }
}
