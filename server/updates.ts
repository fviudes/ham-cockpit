import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { APP_VERSION, UPDATE_REPO } from "../shared/brand";
import { UPDATE_IDS, type UpdateId } from "../shared/const";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = join(ROOT, "deploy", "station", "versions.json");

function helperPath() {
  for (const p of ["/opt/ham-cockpit/bin/station-upd", "/opt/cat-bridge/bin/station-upd"]) {
    if (existsSync(p)) return p;
  }
  return "/opt/ham-cockpit/bin/station-upd";
}

function appCurrent(): string {
  for (const p of [join("/opt/ham-cockpit", "VERSION"), join("/opt/cat-bridge", "VERSION"), join(ROOT, "VERSION")]) {
    try {
      if (!existsSync(p)) continue;
      const v = readFileSync(p, "utf8").trim().replace(/^v/i, "");
      if (v) return v;
    } catch {
      /* ignore */
    }
  }
  try {
    const j = JSON.parse(readFileSync(join(ROOT, "update", "version.json"), "utf8")) as { version?: string };
    if (j.version) return String(j.version).replace(/^v/i, "");
  } catch {
    /* ignore */
  }
  return APP_VERSION;
}

export type UpdateItem = {
  id: UpdateId;
  current: string;
  available: string;
  updatable: boolean;
  applying: boolean;
  error: string;
  note: string;
};

export type UpdatesSnapshot = {
  ok: boolean;
  os: string;
  pending: number;
  items: UpdateItem[];
  error: string;
};

type Shipped = {
  app: string;
  os: string;
  osAvailable: string;
  ser2net: string;
  hamlib: string;
  wavelog: string;
  wlg: string;
};

const applying = new Set<UpdateId>();

function loadShipped(): Shipped {
  const fallback: Shipped = {
    app: APP_VERSION,
    os: "Ubuntu Server 24.04 LTS",
    osAvailable: "Ubuntu Server 24.04 LTS",
    ser2net: "4.3.13",
    hamlib: "4.5.5",
    wavelog: "1.9.4",
    wlg: "1.0.0",
  };
  try {
    const raw = JSON.parse(readFileSync(SHIPPED, "utf8")) as Partial<Shipped>;
    return { ...fallback, ...raw };
  } catch {
    return fallback;
  }
}

function wlgShipped(): string {
  const p = join(ROOT, "deploy", "wavelog-gate", "VERSION");
  try {
    if (existsSync(p)) return readFileSync(p, "utf8").trim() || "1.0.0";
  } catch {
    /* ignore */
  }
  return loadShipped().wlg;
}

function nums(v: string): number[] {
  return String(v || "")
    .replace(/^[^\d]+/, "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => Number(n) || 0);
}

function newer(available: string, current: string): boolean {
  if (!available || !current || available === current || available === "—") return false;
  if (/pacotes/i.test(available)) return true;
  const a = nums(available);
  const b = nums(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function item(id: UpdateId, current: string, available: string, note = "", error = ""): UpdateItem {
  const cur = current || "—";
  const avail = available || cur;
  return {
    id,
    current: cur,
    available: avail,
    updatable: newer(avail, cur),
    applying: applying.has(id),
    error,
    note,
  };
}

async function githubTag(repo: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4500);
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: ctrl.signal,
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Ham-Cockpit/0.1.04" },
    });
    clearTimeout(t);
    if (!r.ok) return "";
    const j = (await r.json()) as { tag_name?: string; name?: string };
    return String(j.tag_name || j.name || "").replace(/^v/i, "").trim();
  } catch {
    return "";
  }
}

async function githubAppVersion(): Promise<string> {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "Ham-Cockpit/0.1.04" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://raw.githubusercontent.com/${UPDATE_REPO}/main/update/version.json`, {
      signal: ctrl.signal,
      headers,
    });
    clearTimeout(t);
    if (r.ok) {
      const j = (await r.json()) as { version?: string };
      return String(j.version || "").replace(/^v/i, "").trim();
    }
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/contents/update?ref=main`, { headers });
    if (!r.ok) return "";
    const list = (await r.json()) as { name?: string }[];
    const vers = list
      .map((x) =>
        String(x.name || "")
          .replace(/\.(json|tgz|tar\.gz)$/i, "")
          .replace(/^ham-cockpit-?/i, "")
          .replace(/^v/i, ""),
      )
      .filter((n) => /^\d+\.\d+/.test(n));
    vers.sort((a, b) => {
      if (newer(a, b)) return 1;
      if (newer(b, a)) return -1;
      return 0;
    });
    return vers[vers.length - 1] || "";
  } catch {
    return "";
  }
}

async function helper(cmd: string, id = ""): Promise<UpdatesSnapshot | null> {
  const bin = helperPath();
  if (process.platform !== "linux" || !existsSync(bin)) return null;
  try {
    const args = id ? [cmd, id] : [cmd];
    const { stdout } = await execFileAsync("sudo", ["-n", bin, ...args], {
      timeout: cmd === "apply" || cmd === "refresh" ? 180_000 : 20_000,
      windowsHide: true,
      maxBuffer: 2_000_000,
    });
    const parsed = JSON.parse(String(stdout || "").trim() || "{}") as {
      ok?: boolean;
      os?: string;
      items?: Partial<UpdateItem>[];
      error?: string;
    };
    if (!Array.isArray(parsed.items)) return null;
    const byId = new Map(parsed.items.map((row) => [row.id as UpdateId, row]));
    const items = UPDATE_IDS.map((id) => {
      const hit = byId.get(id);
      if (id === "app" && !hit) {
        const cur = appCurrent();
        return item("app", cur, cur, `github.com/${UPDATE_REPO}/update`);
      }
      return item(
        id,
        String(hit?.current || (id === "app" ? appCurrent() : "")),
        String(hit?.available || hit?.current || (id === "app" ? appCurrent() : "")),
        String(hit?.note || (id === "app" ? `github.com/${UPDATE_REPO}/update` : "")),
        String(hit?.error || ""),
      );
    });
    return snapshot(items, String(parsed.os || ""), parsed.ok !== false, String(parsed.error || ""));
  } catch (err) {
    return snapshot(baseline().items, loadShipped().os, false, String(err));
  }
}

function snapshot(items: UpdateItem[], os: string, ok = true, error = ""): UpdatesSnapshot {
  return {
    ok,
    os,
    pending: items.filter((row) => row.updatable).length,
    items: items.map((row) => ({ ...row, applying: applying.has(row.id) })),
    error,
  };
}

function baseline(): UpdatesSnapshot {
  const s = loadShipped();
  const wlg = wlgShipped();
  const app = appCurrent() || s.app;
  const items = [
    item("app", app, app, `github.com/${UPDATE_REPO}/update`),
    item("os", s.os, s.osAvailable, "Ubuntu Server"),
    item("ser2net", s.ser2net, s.ser2net, "apt ser2net"),
    item("hamlib", s.hamlib, s.hamlib, "apt libhamlib-utils"),
    item("wavelog", s.wavelog, s.wavelog, "docker ghcr.io/wavelog/wavelog"),
    item("wlg", wlg, wlg, "WaveLogGate headless"),
  ];
  return snapshot(items, s.os);
}

async function overlayRemote(base: UpdatesSnapshot): Promise<UpdatesSnapshot> {
  const [app, ser2net, hamlib, wavelog, wlg] = await Promise.all([
    githubAppVersion(),
    githubTag("cminyard/ser2net"),
    githubTag("Hamlib/Hamlib"),
    githubTag("wavelog/wavelog"),
    githubTag("wavelog/WaveLogGate"),
  ]);
  const next = base.items.map((row) => {
    if (row.id === "app" && app) return item(row.id, row.current, app, row.note, row.error);
    if (row.id === "ser2net" && ser2net) return item(row.id, row.current, ser2net, row.note, row.error);
    if (row.id === "hamlib" && hamlib) return item(row.id, row.current, hamlib, row.note, row.error);
    if (row.id === "wavelog" && wavelog) return item(row.id, row.current, wavelog, row.note, row.error);
    if (row.id === "wlg" && wlg) return item(row.id, row.current, wlg, row.note, row.error);
    return row;
  });
  return snapshot(next, base.os, base.ok, base.error);
}

let cache: { at: number; snap: UpdatesSnapshot } | null = null;

export async function updatesStatus(force = false): Promise<UpdatesSnapshot> {
  if (!force && cache && Date.now() - cache.at < 60_000) {
    return snapshot(cache.snap.items, cache.snap.os, cache.snap.ok, cache.snap.error);
  }
  const live = await helper("check");
  const base = live ?? baseline();
  const snap = await overlayRemote(base);
  cache = { at: Date.now(), snap };
  return snap;
}

export async function updatesRefresh(): Promise<UpdatesSnapshot> {
  cache = null;
  const live = await helper("refresh");
  const snap = await overlayRemote(live ?? baseline());
  cache = { at: Date.now(), snap };
  return snap;
}

export async function updatesApply(id: string): Promise<UpdatesSnapshot> {
  if (!UPDATE_IDS.includes(id as UpdateId)) {
    const cur = await updatesStatus();
    return { ...cur, ok: false, error: "componente desconhecido" };
  }
  const sid = id as UpdateId;
  if (process.platform !== "linux" || !existsSync(helperPath())) {
    const cur = await updatesStatus();
    return {
      ...cur,
      ok: false,
      error: "O aplicativo roda no Ubuntu Server da estação. Neste host só a verificação está disponível.",
    };
  }
  applying.add(sid);
  try {
    cache = null;
    const live = await helper("apply", sid);
    const snap = await overlayRemote(live ?? (await updatesStatus(true)));
    cache = { at: Date.now(), snap };
    return snap;
  } catch (err) {
    const cur = await updatesStatus(true);
    return { ...cur, ok: false, error: String(err) };
  } finally {
    applying.delete(sid);
  }
}
