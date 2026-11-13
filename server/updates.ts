import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { APP_VERSION, UPDATE_REPO } from "../shared/brand";
import { UPDATE_IDS, type UpdateId } from "../shared/const";
import { cleanVersion, compareVersion, isNewerVersion } from "../shared/version";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = join(ROOT, "deploy", "station", "versions.json");

function helperPath() {
  for (const p of ["/opt/ham-cockpit/bin/station-upd", "/opt/cat-bridge/bin/station-upd"]) {
    if (existsSync(p)) return p;
  }
  return "/opt/ham-cockpit/bin/station-upd";
}

/**
 * Versão instalada neste host (arquivo VERSION do pacote em execução).
 * Nunca usa update/version.json — esse arquivo é o catálogo OTA (nova versão).
 */
function appCurrent(): string {
  const candidates = [
    join("/opt/ham-cockpit", "VERSION"),
    join("/opt/cat-bridge", "VERSION"),
    join(ROOT, "VERSION"),
  ];
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      const v = cleanVersion(readFileSync(p, "utf8"));
      if (v) return v;
    } catch {
      /* ignore */
    }
  }
  return cleanVersion(APP_VERSION);
}

export type UpdateJob = {
  id: UpdateId;
  status: "running" | "ok" | "error";
  pct: number;
  determinate: boolean;
  stage: string;
  error: string;
  bytes: number;
  totalBytes: number;
  etaSec: number;
};

export type UpdateItem = {
  id: UpdateId;
  current: string;
  available: string;
  updatable: boolean;
  applying: boolean;
  error: string;
  note: string;
  progress: number;
  stage: string;
  determinate: boolean;
  bytes: number;
  totalBytes: number;
  etaSec: number;
};

export type UpdatesSnapshot = {
  ok: boolean;
  os: string;
  pending: number;
  items: UpdateItem[];
  jobs: UpdateJob[];
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

const jobs = new Map<UpdateId, UpdateJob>();

function loadShipped(): Shipped {
  const fallback: Shipped = {
    app: APP_VERSION,
    os: "Ubuntu Server 24.04 LTS",
    osAvailable: "Ubuntu Server 24.04 LTS",
    ser2net: "4.3.13",
    hamlib: "4.6.5",
    wavelog: "1.9.4",
    wlg: "1.0.0",
  };
  const candidates = [
    join("/opt/ham-cockpit", "versions.json"),
    join("/opt/cat-bridge", "versions.json"),
    join(ROOT, "versions.json"),
    SHIPPED,
  ];
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<Shipped>;
      return { ...fallback, ...raw };
    } catch {
      /* try next */
    }
  }
  return fallback;
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

function newer(available: string, current: string): boolean {
  return isNewerVersion(available, current);
}

function jobOf(id: UpdateId): UpdateJob | undefined {
  return jobs.get(id);
}

function item(
  id: UpdateId,
  current: string,
  available: string,
  note = "",
  error = "",
  helperUpdatable?: boolean | null,
): UpdateItem {
  const cur = current || "—";
  const avail = available || cur;
  const job = jobOf(id);
  // OS usa "N pacotes" (não semver). Honra o flag do station-upd quando vier.
  const updatable =
    typeof helperUpdatable === "boolean" ? helperUpdatable : newer(avail, cur);
  return {
    id,
    current: cur,
    available: avail,
    updatable,
    applying: job?.status === "running",
    error: job?.error || error,
    note,
    progress: job?.pct ?? 0,
    stage: job?.stage ?? "",
    determinate: job?.determinate ?? false,
    bytes: job?.bytes ?? 0,
    totalBytes: job?.totalBytes ?? 0,
    etaSec: job?.etaSec ?? 0,
  };
}

async function githubRawVersion(url: string, ms = 2800): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": `Ham-Cockpit/${APP_VERSION}` },
    });
    clearTimeout(t);
    if (!r.ok) return "";
    return cleanVersion(await r.text());
  } catch {
    return "";
  }
}

async function githubTag(repo: string, ms = 2800): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: ctrl.signal,
      headers: { Accept: "application/vnd.github+json", "User-Agent": `Ham-Cockpit/${APP_VERSION}` },
    });
    clearTimeout(t);
    if (!r.ok) return "";
    const j = (await r.json()) as { tag_name?: string; name?: string };
    return cleanVersion(String(j.tag_name || j.name || ""));
  } catch {
    return "";
  }
}

async function githubAppVersion(): Promise<string> {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": `Ham-Cockpit/${APP_VERSION}` };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`https://raw.githubusercontent.com/${UPDATE_REPO}/main/update/version.json`, {
      signal: ctrl.signal,
      headers,
    });
    clearTimeout(t);
    if (r.ok) {
      const j = (await r.json()) as { version?: string };
      return cleanVersion(String(j.version || ""));
    }
  } catch {
    /* ignore */
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/contents/update?ref=main`, {
      headers,
      signal: ctrl.signal,
    });
    clearTimeout(t);
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
    vers.sort((a, b) => compareVersion(a, b));
    return vers[vers.length - 1] || "";
  } catch {
    return "";
  }
}

function execError(err: unknown): string {
  const e = err as { stderr?: string | Buffer; message?: string; killed?: boolean; code?: string };
  const stderr = String(e.stderr || "")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.includes("HC_PROGRESS "))
    .join("\n")
    .trim();
  if (e.killed) return stderr || "tempo esgotado ao consultar station-upd";
  if (stderr) return stderr.split(/\r?\n/).filter(Boolean).slice(-6).join("\n");
  const msg = String(e.message || err)
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.includes("HC_PROGRESS "))
    .join("\n");
  return msg || String(err);
}

async function helper(cmd: string, id = ""): Promise<UpdatesSnapshot | null> {
  const bin = helperPath();
  if (process.platform !== "linux" || !existsSync(bin)) return null;
  try {
    const args = id ? [cmd, id] : [cmd];
    const timeout = cmd === "apply" ? 900_000 : cmd === "refresh" ? 50_000 : 18_000;
    const { stdout } = await execFileAsync("sudo", ["-n", bin, ...args], {
      timeout,
      windowsHide: true,
      maxBuffer: 2_000_000,
    });
    return parseHelperOut(String(stdout || "").trim());
  } catch (err) {
    return snapshot(baseline().items, loadShipped().os, false, execError(err));
  }
}

function parseHelperOut(stdout: string): UpdatesSnapshot | null {
  try {
    const parsed = JSON.parse(lastJsonObject(stdout || "{}")) as {
      ok?: boolean;
      os?: string;
      items?: Partial<UpdateItem>[];
      error?: string;
    };
    if (!Array.isArray(parsed.items)) return null;
    const byId = new Map(parsed.items.map((row) => [row.id as UpdateId, row]));
    const items = UPDATE_IDS.map((id) => {
      const hit = byId.get(id);
      const helperUp =
        typeof hit?.updatable === "boolean"
          ? hit.updatable
          : id === "os" && /pacotes/i.test(String(hit?.available || ""))
            ? true
            : null;
      if (id === "app") {
        const cur = appCurrent() || String(hit?.current || "");
        const avail = String(hit?.available || cur);
        return item(
          "app",
          cur,
          avail,
          String(hit?.note || `github.com/${UPDATE_REPO}/update`),
          String(hit?.error || ""),
          helperUp,
        );
      }
      return item(
        id,
        String(hit?.current || ""),
        String(hit?.available || hit?.current || ""),
        String(hit?.note || ""),
        String(hit?.error || ""),
        helperUp,
      );
    });
    return snapshot(items, String(parsed.os || ""), parsed.ok !== false, String(parsed.error || ""));
  } catch {
    return null;
  }
}

function snapshot(items: UpdateItem[], os: string, ok = true, error = ""): UpdatesSnapshot {
  const decorated = items.map((row) => {
    const job = jobOf(row.id);
    if (!job) return { ...row, applying: false };
    return {
      ...row,
      applying: job.status === "running",
      error: job.error || row.error,
      progress: job.pct,
      stage: job.stage,
      determinate: job.determinate,
      bytes: job.bytes,
      totalBytes: job.totalBytes,
      etaSec: job.etaSec,
    };
  });
  return {
    ok,
    os,
    pending: decorated.filter((row) => row.updatable).length,
    items: decorated,
    jobs: Array.from(jobs.values()),
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

function looksVersion(v: string): boolean {
  return /\d/.test(v) && v !== "—";
}

type Remotes = { app: string; wavelog: string; wlg: string };

async function fetchRemotes(): Promise<Remotes> {
  const [app, wavelog, wlg] = await Promise.all([
    githubAppVersion(),
    githubTag("wavelog/wavelog"),
    githubRawVersion(`https://raw.githubusercontent.com/${UPDATE_REPO}/main/deploy/wavelog-gate/VERSION`),
  ]);
  return { app, wavelog, wlg };
}

function applyRemotes(base: UpdatesSnapshot, rem: Remotes): UpdatesSnapshot {
  const next = base.items.map((row) => {
    if (row.id === "app") {
      const installed = appCurrent() || row.current;
      const remote = rem.app || row.available || installed;
      return item("app", installed, remote, row.note, row.error);
    }
    // ser2net/hamlib: só apt (candidato vs instalado). Tag GitHub ≠ versão Debian.
    if (row.id === "wavelog" && rem.wavelog && looksVersion(row.current)) {
      return item(row.id, row.current, rem.wavelog, row.note, row.error);
    }
    if (row.id === "wlg" && rem.wlg && looksVersion(row.current)) {
      return item(row.id, row.current, rem.wlg, row.note, row.error);
    }
    return row;
  });
  return snapshot(next, base.os, base.ok, base.error);
}

let cache: { at: number; snap: UpdatesSnapshot } | null = null;

function ingestProgress(id: UpdateId, text: string) {
  const job = jobs.get(id);
  if (!job) return;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("HC_PROGRESS ")) continue;
    try {
      const j = JSON.parse(line.slice("HC_PROGRESS ".length)) as {
        pct?: number;
        stage?: string;
        determinate?: boolean;
        error?: string;
        bytes?: number;
        totalBytes?: number;
        etaSec?: number;
      };
      if (typeof j.pct === "number" && Number.isFinite(j.pct)) job.pct = Math.max(0, Math.min(100, Math.round(j.pct)));
      if (typeof j.stage === "string" && j.stage) job.stage = j.stage;
      if (typeof j.determinate === "boolean") job.determinate = j.determinate;
      if (typeof j.error === "string" && j.error) job.error = j.error;
      if (typeof j.bytes === "number" && Number.isFinite(j.bytes)) job.bytes = Math.max(0, Math.round(j.bytes));
      if (typeof j.totalBytes === "number" && Number.isFinite(j.totalBytes)) job.totalBytes = Math.max(0, Math.round(j.totalBytes));
      if (typeof j.etaSec === "number" && Number.isFinite(j.etaSec)) job.etaSec = Math.max(0, Math.round(j.etaSec));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Uma única verificação por vez (single-flight). Sem isso, vários navegadores/abas e o
 * polling do console disparavam `station-upd check` + curl em paralelo no Pi 3 (1 GB)
 * e o equipamento travava por falta de RAM/CPU.
 */
let inflight: Promise<UpdatesSnapshot> | null = null;
let inflightKind: "check" | "refresh" | null = null;

function runCheck(kind: "check" | "refresh"): Promise<UpdatesSnapshot> {
  if (inflight) return inflight;
  inflightKind = kind;
  inflight = (async () => {
    try {
      const [live, rem] = await Promise.all([helper(kind), fetchRemotes()]);
      const snap = applyRemotes(live ?? baseline(), rem);
      cache = { at: Date.now(), snap };
      return snap;
    } finally {
      inflight = null;
      inflightKind = null;
    }
  })();
  return inflight;
}

export async function updatesStatus(force = false): Promise<UpdatesSnapshot> {
  const running = Array.from(jobs.values()).some((j) => j.status === "running");
  if (running) {
    const base = cache?.snap ?? baseline();
    return snapshot(base.items, base.os, true, "");
  }
  if (!force && cache && Date.now() - cache.at < 60_000) {
    return snapshot(cache.snap.items, cache.snap.os, cache.snap.ok, cache.snap.error);
  }
  // Já existe verificação em andamento: reaproveita (ou devolve o cache velho sem esperar).
  if (inflight) {
    if (cache && !force) return snapshot(cache.snap.items, cache.snap.os, cache.snap.ok, cache.snap.error);
    return inflight;
  }
  return runCheck("check");
}

export async function updatesRefresh(): Promise<UpdatesSnapshot> {
  if (inflight && inflightKind === "refresh") return inflight;
  if (inflight) {
    await inflight.catch(() => undefined);
  }
  cache = null;
  return runCheck("refresh");
}

function lastJsonObject(text: string): string {
  const start = text.lastIndexOf('{"ok"');
  if (start >= 0) return text.slice(start);
  const alt = text.lastIndexOf("{");
  return alt >= 0 ? text.slice(alt) : text;
}

function spawnApply(sid: UpdateId): Promise<UpdatesSnapshot> {
  const bin = helperPath();
  const job: UpdateJob = {
    id: sid,
    status: "running",
    pct: 2,
    determinate: true,
    stage: "prepare",
    error: "",
    bytes: 0,
    totalBytes: 0,
    etaSec: 0,
  };
  jobs.set(sid, job);
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-n", bin, "apply", sid], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => child.kill("SIGTERM"), 900_000);
    child.stdout?.on("data", (buf: Buffer) => {
      const chunk = String(buf);
      stdout += chunk;
      ingestProgress(sid, chunk);
    });
    child.stderr?.on("data", (buf: Buffer) => {
      const chunk = String(buf);
      stderr += chunk;
      ingestProgress(sid, chunk);
    });
    const finish = async (code: number | null, errMsg = "") => {
      clearTimeout(killer);
      const parsed = parseHelperOut(lastJsonObject(stdout.trim()));
      const errText =
        errMsg ||
        stderr
          .split(/\r?\n/)
          .filter((l) => l.trim() && !l.includes("HC_PROGRESS "))
          .slice(-8)
          .join("\n");
      if (code === 0 && parsed) {
        job.status = "ok";
        job.pct = 100;
        job.determinate = true;
        job.stage = "done";
        job.error = "";
        const over = applyRemotes(parsed, await fetchRemotes());
        // Mantém 100% no poll por alguns segundos (restart do console apaga a memória).
        cache = {
          at: Date.now(),
          snap: snapshot(
            over.items.map((row) =>
              row.id === sid
                ? {
                    ...row,
                    applying: false,
                    progress: 100,
                    stage: "done",
                    determinate: true,
                    updatable: false,
                  }
                : row,
            ),
            over.os,
            true,
            "",
          ),
        };
        setTimeout(() => {
          if (jobs.get(sid)?.status === "ok") jobs.delete(sid);
        }, 20_000);
        resolve(cache.snap);
        return;
      }
      job.status = "error";
      job.determinate = true;
      job.stage = "error";
      job.error =
        errText ||
        `falha ao aplicar ${sid} (código ${code == null ? "sinal/timeout" : code})`;
      const cur = cache?.snap ?? (await updatesStatus(true));
      const failed = snapshot(
        cur.items.map((row) => (row.id === sid ? { ...row, error: job.error } : row)),
        cur.os,
        false,
        job.error,
      );
      cache = { at: Date.now(), snap: failed };
      setTimeout(() => {
        if (jobs.get(sid)?.status === "error") jobs.delete(sid);
      }, 20_000);
      resolve(failed);
    };
    child.on("error", (err) => {
      void finish(1, String(err.message || err));
    });
    child.on("close", (code, signal) => {
      void finish(code, signal ? `processo encerrado (${signal})` : "");
    });
  });
}

let applyChain: Promise<void> = Promise.resolve();

export async function updatesApply(id: string): Promise<UpdatesSnapshot> {
  if (!UPDATE_IDS.includes(id as UpdateId)) {
    const cur = await updatesStatus();
    return { ...cur, ok: false, error: "componente desconhecido" };
  }
  const sid = id as UpdateId;
  const existing = jobs.get(sid);
  if (existing?.status === "running") {
    const cur = cache?.snap ?? (await updatesStatus());
    return snapshot(cur.items, cur.os, true, "");
  }
  if (process.platform !== "linux" || !existsSync(helperPath())) {
    const cur = await updatesStatus();
    return {
      ...cur,
      ok: false,
      error: "O aplicativo roda no Ubuntu Server da estação. Neste host só a verificação está disponível.",
    };
  }
  try {
    // Um apply por vez (apt + docker pull + npm em paralelo derrubava o Pi 3).
    jobs.set(sid, {
      id: sid,
      status: "running",
      pct: 1,
      determinate: true,
      stage: "queued",
      error: "",
      bytes: 0,
      totalBytes: 0,
      etaSec: 0,
    });
    const run = applyChain.then(() => spawnApply(sid));
    applyChain = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  } catch (err) {
    const cur = await updatesStatus(true);
    return { ...cur, ok: false, error: String(err) };
  }
}
