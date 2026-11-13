import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type WriteStream,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { listUsers } from "./users";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ID_RE = /^(?:hamcockpit|catbridge)-\d{8}-\d{6}-[a-f0-9]{8}$/;
const HELPER = "/opt/ham-cockpit/bin/station-backup";
const WAVELG_OPT_FILES = [".env", "docker-compose.yml", "wavelog-ctl.sh"] as const;

export type BackupItem = {
  id: string;
  user: string;
  createdAt: string;
  size: number;
  parts: string[];
  warnings: string[];
};

type Sidecar = {
  version: 1;
  id: string;
  user: string;
  createdAt: string;
  parts: string[];
  warnings: string[];
};

function linux() {
  return process.platform === "linux";
}

function backupDir(): string {
  if (linux()) {
    for (const dir of ["/backup", "/opt/ham-cockpit/backup"]) {
      try {
        mkdirSync(dir, { recursive: true });
        const probe = join(dir, ".w");
        writeFileSync(probe, "1");
        unlinkSync(probe);
        return dir;
      } catch {
        /* try next */
      }
    }
  }
  const local = join(ROOT, "data", "backup");
  mkdirSync(local, { recursive: true });
  return local;
}

function stationSources(): { key: string; dir: string }[] {
  const local = (name: string) => join(ROOT, "data", name);
  const cat = existsSync("/opt/ham-cockpit");
  return [
    { key: "ser2net", dir: existsSync("/opt/ser2net") ? "/opt/ser2net" : local("ser2net") },
    {
      key: "radios",
      dir: cat
        ? existsSync("/opt/radios") && !existsSync("/opt/ham-cockpit/radios")
          ? "/opt/radios"
          : "/opt/ham-cockpit/radios"
        : local("radios"),
    },
    { key: "equipment", dir: cat ? "/opt/ham-cockpit/equipment" : local("equipment") },
    { key: "layouts", dir: cat ? "/opt/ham-cockpit/layouts" : local("layouts") },
    { key: "ldg", dir: cat ? "/opt/ham-cockpit/ldg" : local("ldg") },
    { key: "lp100a", dir: cat ? "/opt/ham-cockpit/lp100a" : local("lp100a") },
    { key: "net", dir: cat ? "/opt/ham-cockpit/net" : local("net") },
    { key: "services", dir: cat ? "/opt/ham-cockpit/services" : local("services") },
    { key: "lextel", dir: existsSync("/opt/lextel") ? "/opt/lextel" : local("lextel") },
    { key: "mmdvm", dir: existsSync("/opt/ham-cockpit/mmdvm") ? "/opt/ham-cockpit/mmdvm" : local("mmdvm") },
  ];
}

function wlgDir(): string {
  if (existsSync("/opt/wavelog-gate")) return "/opt/wavelog-gate";
  return join(ROOT, "deploy", "wavelog-gate");
}

function wavelogDir(): string {
  if (existsSync("/opt/wavelog")) return "/opt/wavelog";
  return join(ROOT, "deploy", "wavelog");
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function skipName(base: string) {
  if (base === "node_modules" || base === "capture.bin") return true;
  if (base.endsWith(".lock")) return true;
  return false;
}

function isEacces(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "EACCES");
}

function readable(path: string): boolean {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function writableTarget(path: string): boolean {
  try {
    if (existsSync(path)) {
      accessSync(path, constants.W_OK);
      return true;
    }
    accessSync(dirname(path), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[], opts?: { cwd?: string; timeout?: number; input?: Buffer | string }): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
    }, opts?.timeout ?? 120_000);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (opts?.input !== undefined) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

async function helper(args: string[], timeout = 15_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  if (!linux() || !existsSync(HELPER)) return { ok: false, stdout: "", stderr: "helper ausente" };
  try {
    const r = await run("sudo", ["-n", HELPER, ...args], { timeout });
    return { ok: r.code === 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    return { ok: false, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }
}

async function ensureWavelogEnvPerms(warnings: string[]) {
  if (!linux() || !existsSync(join(wavelogDir(), ".env"))) return;
  if (readable(join(wavelogDir(), ".env"))) return;
  const r = await helper(["ensure-env"]);
  if (!r.ok) {
    warnings.push(`permissões do Wavelog .env: ${r.stderr.trim() || "sudo/station-backup indisponível"}`);
  }
}

async function copyPrivilegedFile(src: string, dest: string, warnings: string[], label: string): Promise<boolean> {
  if (!existsSync(src)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  if (readable(src)) {
    try {
      cpSync(src, dest);
      return true;
    } catch (err) {
      if (!isEacces(err)) {
        warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    }
  }
  const r = await helper(["copy", src, dest]);
  if (r.ok && existsSync(dest)) return true;
  warnings.push(`${label}: sem permissão para ler ${src}`);
  return false;
}

async function installPrivilegedFile(src: string, dest: string, warnings: string[], label: string): Promise<boolean> {
  if (!existsSync(src)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  if (writableTarget(dest)) {
    try {
      cpSync(src, dest);
      return true;
    } catch (err) {
      if (!isEacces(err)) {
        warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    }
  }
  const r = await helper(["install", src, dest]);
  if (r.ok) return true;
  warnings.push(`${label}: sem permissão para gravar ${dest}`);
  return false;
}

function copyTree(src: string, dest: string, warnings: string[], label: string): boolean {
  if (!existsSync(src)) return false;
  let any = false;
  const walk = (from: string, to: string) => {
    let st;
    try {
      st = statSync(from);
    } catch (err) {
      if (isEacces(err)) warnings.push(`${label}: sem permissão para acessar ${from}`);
      else warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (st.isFile()) {
      if (skipName(basename(from))) return;
      try {
        mkdirSync(dirname(to), { recursive: true });
        cpSync(from, to);
        any = true;
      } catch (err) {
        if (isEacces(err)) warnings.push(`${label}: sem permissão para copiar ${from}`);
        else warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    try {
      mkdirSync(to, { recursive: true });
      for (const name of readdirSync(from)) {
        if (skipName(name)) continue;
        walk(join(from, name), join(to, name));
      }
      any = true;
    } catch (err) {
      if (isEacces(err)) warnings.push(`${label}: sem permissão para listar ${from}`);
      else warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  walk(src, dest);
  return any;
}

function envValueFromText(text: string, key: string) {
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

async function readEnvValue(file: string, key: string, warnings: string[]): Promise<string> {
  if (!existsSync(file)) return "";
  if (readable(file)) {
    try {
      return envValueFromText(readFileSync(file, "utf8"), key);
    } catch (err) {
      if (!isEacces(err)) {
        warnings.push(`.env: ${err instanceof Error ? err.message : String(err)}`);
        return "";
      }
    }
  }
  const r = await helper(["cat", file]);
  if (r.ok) return envValueFromText(r.stdout, key);
  warnings.push(`sem permissão para ler ${file}`);
  return "";
}

async function dumpWavelog(dest: string, warnings: string[], parts: string[]) {
  mkdirSync(dest, { recursive: true });
  const home = wavelogDir();
  let copiedOpt = false;
  for (const name of WAVELG_OPT_FILES) {
    const src = join(home, name);
    if (!existsSync(src)) continue;
    const ok = await copyPrivilegedFile(src, join(dest, "opt", name), warnings, `wavelog:${name}`);
    if (ok) copiedOpt = true;
  }
  if (copiedOpt) parts.push("wavelog:opt");
  try {
    const { stdout } = await execFileAsync("docker", ["volume", "ls", "-q"], { timeout: 15_000, windowsHide: true });
    const vols = stdout
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter((v) => /wavelog/i.test(v) && !/dbdata/i.test(v));
    for (const vol of vols) {
      const out = join(dest, `${vol}.tgz`);
      const r = await run("docker", ["run", "--rm", "-v", `${vol}:/from:ro`, "-v", `${dest}:/to`, "alpine:3.20", "tar", "czf", `/to/${basename(out)}`, "-C", "/from", "."], {
        timeout: 180_000,
      });
      if (r.code === 0 && existsSync(out)) parts.push(`wavelog:${vol}`);
      else warnings.push(`volume ${vol}: ${r.stderr.trim() || r.code}`);
    }
  } catch (err) {
    warnings.push(`docker volumes: ${err instanceof Error ? err.message : String(err)}`);
  }
  const pass = await readEnvValue(join(home, ".env"), "WAVELOG_DB_PASSWORD", warnings);
  if (!pass) {
    warnings.push("WAVELOG_DB_PASSWORD ausente — dump SQL do Wavelog não feito");
    return;
  }
  try {
    const r = await run("docker", ["exec", "wavelog-db", "mariadb-dump", `-uwavelog`, `-p${pass}`, "--single-transaction", "wavelog"], {
      timeout: 180_000,
    });
    if (r.code === 0 && r.stdout.includes("CREATE TABLE")) {
      writeFileSync(join(dest, "wavelog.sql"), r.stdout);
      parts.push("wavelog-db");
    } else {
      warnings.push(`mariadb-dump: ${r.stderr.trim() || r.code}`);
    }
  } catch (err) {
    warnings.push(`mariadb-dump: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function restoreWavelog(src: string, warnings: string[]) {
  const home = wavelogDir();
  const opt = join(src, "opt");
  if (existsSync(opt)) {
    mkdirSync(home, { recursive: true });
    for (const name of readdirSync(opt)) {
      const from = join(opt, name);
      const to = join(home, name);
      if ((WAVELG_OPT_FILES as readonly string[]).includes(name) || name.endsWith(".env")) {
        await installPrivilegedFile(from, to, warnings, `restore wavelog:${name}`);
      } else {
        try {
          cpSync(from, to);
        } catch (err) {
          warnings.push(
            isEacces(err)
              ? `restore wavelog:${name}: sem permissão`
              : `restore wavelog:${name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }
  const tgz = existsSync(src)
    ? readdirSync(src).filter((n) => n.endsWith(".tgz"))
    : [];
  for (const file of tgz) {
    const vol = file.replace(/\.tgz$/, "");
    const r = await run(
      "docker",
      ["run", "--rm", "-v", `${vol}:/to`, "-v", `${src}:/from:ro`, "alpine:3.20", "sh", "-c", `rm -rf /to/* /to/.[!.]*; tar xzf /from/${file} -C /to`],
      { timeout: 180_000 },
    );
    if (r.code !== 0) warnings.push(`restore ${vol}: ${r.stderr.trim() || r.code}`);
  }
  const sql = join(src, "wavelog.sql");
  const pass = await readEnvValue(join(home, ".env"), "WAVELOG_DB_PASSWORD", warnings);
  if (existsSync(sql) && pass) {
    try {
      const dump = readFileSync(sql);
      const r = await run("docker", ["exec", "-i", "wavelog-db", "mariadb", `-uwavelog`, `-p${pass}`, "wavelog"], {
        timeout: 180_000,
        input: dump,
      });
      if (r.code !== 0) warnings.push(`mariadb restore: ${r.stderr.trim() || r.code}`);
    } catch (err) {
      warnings.push(`mariadb restore: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function sidecarPath(dir: string, id: string) {
  return join(dir, `${id}.json`);
}

function archivePath(dir: string, id: string) {
  return join(dir, `${id}.tgz`);
}

function readSidecar(dir: string, id: string): Sidecar | null {
  try {
    const j = JSON.parse(readFileSync(sidecarPath(dir, id), "utf8")) as Sidecar;
    if (j && j.id === id) return j;
  } catch {
    /* */
  }
  return null;
}

function toItem(dir: string, id: string): BackupItem | null {
  const file = archivePath(dir, id);
  if (!existsSync(file)) return null;
  const size = statSync(file).size;
  const sc = readSidecar(dir, id);
  const st = statSync(file);
  return {
    id,
    user: sc?.user || "admin",
    createdAt: sc?.createdAt || st.mtime.toISOString(),
    size,
    parts: sc?.parts || [],
    warnings: sc?.warnings || [],
  };
}

export function backupList(): { ok: boolean; folder: string; items: BackupItem[] } {
  const dir = backupDir();
  const ids = readdirSync(dir)
    .filter((n) => n.endsWith(".tgz"))
    .map((n) => n.replace(/\.tgz$/, ""))
    .filter((id) => ID_RE.test(id));
  const items = ids
    .map((id) => toItem(dir, id))
    .filter((x): x is BackupItem => Boolean(x))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, folder: dir, items };
}

export type BackupJob = {
  id: string;
  kind: "create" | "restore";
  status: "running" | "ok" | "error";
  pct: number;
  stage: string;
  error: string;
  item?: BackupItem;
  folder?: string;
  warnings?: string[];
};

const jobs = new Map<string, BackupJob>();

function jobId(kind: "create" | "restore") {
  return `bk-${kind}-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

function setProg(job: BackupJob, pct: number, stage: string) {
  job.pct = Math.max(0, Math.min(99, Math.round(pct)));
  job.stage = stage;
}

export function backupJobGet(id: string): BackupJob | null {
  return jobs.get(id) ?? null;
}

type ProgressFn = (pct: number, stage: string) => void;

export async function backupCreate(
  user: string,
  onProgress?: ProgressFn,
): Promise<{ ok: boolean; item?: BackupItem; folder?: string; error?: string }> {
  const who = String(user || "admin")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 32) || "admin";
  const dir = backupDir();
  const now = new Date();
  const id = `hamcockpit-${stamp(now)}-${randomBytes(4).toString("hex")}`;
  const staging = join(tmpdir(), id);
  mkdirSync(join(staging, "station"), { recursive: true });
  const parts: string[] = [];
  const warnings: string[] = [];
  const prog = onProgress ?? (() => undefined);
  try {
    prog(5, "prepare");
    await ensureWavelogEnvPerms(warnings);
    prog(15, "station");
    for (const src of stationSources()) {
      if (copyTree(src.dir, join(staging, "station", src.key), warnings, `station:${src.key}`)) {
        parts.push(`station:${src.key}`);
      }
    }
    try {
      const users = await listUsers();
      writeFileSync(join(staging, "station", "linux-users.json"), `${JSON.stringify({ users }, null, 2)}\n`);
      parts.push("station:users");
    } catch (err) {
      warnings.push(`users: ${err instanceof Error ? err.message : String(err)}`);
    }
    prog(35, "wlg");
    if (copyTree(wlgDir(), join(staging, "wlg"), warnings, "wlg")) parts.push("wlg");
    prog(45, "wavelog");
    await dumpWavelog(join(staging, "wavelog"), warnings, parts);
    prog(75, "archive");
    writeFileSync(
      join(staging, "manifest.json"),
      `${JSON.stringify({ version: 1, id, user: who, createdAt: now.toISOString(), parts, warnings }, null, 2)}\n`,
    );
    const dest = archivePath(dir, id);
    const tar = await run("tar", ["-czf", dest, "-C", staging, "."], { timeout: 180_000 });
    if (tar.code !== 0 || !existsSync(dest)) {
      return { ok: false, error: tar.stderr.trim() || "tar" };
    }
    try {
      chmodSync(dest, 0o640);
    } catch {
      /* */
    }
    prog(95, "finalize");
    const sc: Sidecar = { version: 1, id, user: who, createdAt: now.toISOString(), parts, warnings };
    writeFileSync(sidecarPath(dir, id), `${JSON.stringify(sc, null, 2)}\n`);
    const item = toItem(dir, id);
    return item ? { ok: true, item, folder: dir } : { ok: false, error: "stat" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Inicia backup em background; a UI faz poll em /api/backup/jobs/:id. */
export function backupCreateStart(user: string): { ok: true; jobId: string } {
  const id = jobId("create");
  const job: BackupJob = { id, kind: "create", status: "running", pct: 2, stage: "prepare", error: "" };
  jobs.set(id, job);
  void backupCreate(user, (pct, stage) => setProg(job, pct, stage))
    .then((r) => {
      if (r.ok) {
        job.status = "ok";
        job.pct = 100;
        job.stage = "done";
        job.item = r.item;
        job.folder = r.folder;
      } else {
        job.status = "error";
        job.stage = "error";
        job.error = r.error || "backup";
      }
    })
    .catch((err) => {
      job.status = "error";
      job.stage = "error";
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      setTimeout(() => {
        if (jobs.get(id)?.status !== "running") jobs.delete(id);
      }, 60_000);
    });
  return { ok: true, jobId: id };
}

export function backupDelete(id: string): { ok: boolean; error?: string } {
  if (!ID_RE.test(id)) return { ok: false, error: "id" };
  const dir = backupDir();
  const file = archivePath(dir, id);
  if (!existsSync(file)) return { ok: false, error: "missing" };
  unlinkSync(file);
  if (existsSync(sidecarPath(dir, id))) unlinkSync(sidecarPath(dir, id));
  return { ok: true };
}

/** Mesmo restore do backup da lista, lendo o .tgz já gravado em `file`. */
async function restoreArchive(
  file: string,
  onProgress?: ProgressFn,
): Promise<{ ok: boolean; warnings?: string[]; error?: string }> {
  const staging = join(tmpdir(), `restore-${randomBytes(6).toString("hex")}`);
  mkdirSync(staging, { recursive: true });
  const warnings: string[] = [];
  const prog = onProgress ?? (() => undefined);
  try {
    prog(5, "prepare");
    prog(15, "archive");
    const tar = await run("tar", ["-xzf", file, "-C", staging], { timeout: 180_000 });
    if (tar.code !== 0) return { ok: false, error: tar.stderr.trim() || "tar" };
    prog(35, "station");
    const station = join(staging, "station");
    if (existsSync(station)) {
      for (const src of stationSources()) {
        const from = join(station, src.key);
        if (!existsSync(from)) continue;
        mkdirSync(src.dir, { recursive: true });
        copyTree(from, src.dir, warnings, `restore station:${src.key}`);
      }
    }
    prog(55, "wlg");
    const wlg = join(staging, "wlg");
    if (existsSync(wlg)) {
      const gateEnv = join(wlg, "wavelog-gate.env");
      const destEnv = join(wlgDir(), "wavelog-gate.env");
      copyTree(wlg, wlgDir(), warnings, "restore wlg");
      if (existsSync(gateEnv)) {
        await installPrivilegedFile(gateEnv, destEnv, warnings, "restore wlg:env");
      }
    }
    prog(70, "wavelog");
    const wav = join(staging, "wavelog");
    if (existsSync(wav)) await restoreWavelog(wav, warnings);
    prog(92, "finalize");
    await ensureWavelogEnvPerms(warnings);
    return { ok: true, warnings };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export async function backupRestore(
  id: string,
  confirm: boolean,
  onProgress?: ProgressFn,
): Promise<{ ok: boolean; warnings?: string[]; error?: string }> {
  if (!confirm) return { ok: false, error: "confirm" };
  if (!ID_RE.test(id)) return { ok: false, error: "id" };
  const file = archivePath(backupDir(), id);
  if (!existsSync(file)) return { ok: false, error: "missing" };
  return restoreArchive(file, onProgress);
}

export function backupRestoreStart(id: string, confirm: boolean): { ok: true; jobId: string } | { ok: false; error: string } {
  if (!confirm) return { ok: false, error: "confirm" };
  if (!ID_RE.test(id)) return { ok: false, error: "id" };
  const jobKey = jobId("restore");
  const job: BackupJob = { id: jobKey, kind: "restore", status: "running", pct: 2, stage: "prepare", error: "" };
  jobs.set(jobKey, job);
  void backupRestore(id, true, (pct, stage) => setProg(job, pct, stage))
    .then((r) => {
      if (r.ok) {
        job.status = "ok";
        job.pct = 100;
        job.stage = "done";
        job.warnings = r.warnings;
      } else {
        job.status = "error";
        job.stage = "error";
        job.error = r.error || "restore";
      }
    })
    .catch((err) => {
      job.status = "error";
      job.stage = "error";
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      setTimeout(() => {
        if (jobs.get(jobKey)?.status !== "running") jobs.delete(jobKey);
      }, 60_000);
    });
  return { ok: true, jobId: jobKey };
}

/** Teto do .tgz enviado pelo restore por arquivo. */
export const BACKUP_UPLOAD_MAX = 1024 * 1024 * 1024;

const UPLOAD_SLACK = 2 * 1024 * 1024;
const FORMAT_ERR = "O arquivo não é um backup .tgz gerado por esta estação.";

export function backupArchiveFile(id: string): { ok: true; path: string; filename: string } | { ok: false; error: string } {
  if (!ID_RE.test(id)) return { ok: false, error: "id" };
  const file = archivePath(backupDir(), id);
  if (!existsSync(file)) return { ok: false, error: "missing" };
  return { ok: true, path: file, filename: `${id}.tgz` };
}

export function backupDropUpload(path: string) {
  try {
    rmSync(path, { force: true });
  } catch {
    /* já saiu */
  }
}

type UploadReq = {
  headers: { "content-type"?: string | string[]; "content-length"?: string | string[] };
  on: (ev: string, fn: (chunk?: Buffer | Error) => void) => void;
  pause?: () => void;
  resume?: () => void;
};

export type BackupUpload =
  | { ok: true; path: string; filename: string; confirm: boolean }
  | { ok: false; error: string };

function headerOne(req: UploadReq, name: "content-type" | "content-length"): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v.join(";") : v || "").trim();
}

function multipartBoundary(contentType: string): string | null {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const b = (m?.[1] || m?.[2] || "").trim();
  return b || null;
}

function dispositionOf(headerBlock: string): { name: string; filename: string } {
  const disp = headerBlock.split(/\r?\n/).find((l) => l.toLowerCase().startsWith("content-disposition"));
  if (!disp) return { name: "", filename: "" };
  const name = /(?:^|;)\s*name="([^"]*)"/i.exec(disp)?.[1] || "";
  const star = /filename\*=UTF-8''([^;\r\n]+)/i.exec(disp)?.[1];
  const quoted = /filename="([^"]*)"/i.exec(disp)?.[1];
  let filename = "";
  if (star) {
    try {
      filename = decodeURIComponent(star.trim());
    } catch {
      filename = star.trim();
    }
  } else if (quoted) filename = quoted;
  filename = basename(filename.replace(/\\/g, "/"));
  return { name, filename };
}

/** Lê o multipart (campo file + confirm) e grava o .tgz num arquivo temporário. */
export function backupReadUpload(req: UploadReq): Promise<BackupUpload> {
  const boundary = multipartBoundary(headerOne(req, "content-type"));
  if (!boundary) return Promise.resolve({ ok: false, error: "Envie o backup como arquivo .tgz." });
  const declared = Number(headerOne(req, "content-length") || "0");
  if (Number.isFinite(declared) && declared > BACKUP_UPLOAD_MAX + UPLOAD_SLACK) {
    req.resume?.();
    req.on("data", () => undefined);
    return Promise.resolve({ ok: false, error: "Arquivo grande demais (limite de 1 GB)." });
  }

  const openDelim = Buffer.from(`--${boundary}`);
  const nextDelim = Buffer.from(`\r\n--${boundary}`);
  const headerSep = Buffer.from("\r\n\r\n");
  const keep = nextDelim.length + 4;

  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    let mode: "start" | "headers" | "body" = "start";
    let fileOut: WriteStream | null = null;
    let tmpPath = "";
    let filename = "";
    let confirm = false;
    let currentName = "";
    let fileBytes = 0;
    let total = 0;
    let done = false;
    let fieldChunks: Buffer[] = [];
    let closed: Promise<void> = Promise.resolve();
    let closing = false;

    const finish = (result: BackupUpload) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    const fail = (error: string) => {
      if (done) return;
      try {
        fileOut?.destroy();
      } catch {
        /* */
      }
      fileOut = null;
      if (tmpPath) backupDropUpload(tmpPath);
      tmpPath = "";
      finish({ ok: false, error });
    };

    const writeBody = (chunk: Buffer) => {
      if (!chunk.length || done) return;
      if (fileOut) {
        fileBytes += chunk.length;
        if (fileBytes > BACKUP_UPLOAD_MAX) {
          fail("Arquivo grande demais (limite de 1 GB).");
          return;
        }
        const stream = fileOut;
        const ok = stream.write(chunk);
        if (!ok) {
          req.pause?.();
          stream.once("drain", () => req.resume?.());
        }
        return;
      }
      fieldChunks.push(chunk);
      if (fieldChunks.reduce((n, c) => n + c.length, 0) > 64) fail("Campo de formulário inválido.");
    };

    const closePart = () => {
      if (fileOut) {
        const stream = fileOut;
        fileOut = null;
        closed = new Promise((res, rej) => {
          stream.on("error", rej);
          stream.end(() => res());
        });
      } else if (currentName === "confirm") {
        confirm = Buffer.concat(fieldChunks).toString("utf8").trim() === "true";
      }
      currentName = "";
      fieldChunks = [];
    };

    const openPart = (headerText: string) => {
      const d = dispositionOf(headerText);
      currentName = d.name;
      fieldChunks = [];
      if (!d.filename) return;
      if (filename) {
        fail("Envie apenas um arquivo.");
        return;
      }
      if (!/^[^\\/:*?"<>|]+\.tgz$/i.test(d.filename)) {
        fail("Use um arquivo .tgz gerado pelo backup desta estação.");
        return;
      }
      filename = d.filename;
      tmpPath = join(tmpdir(), `hc-restore-${randomBytes(8).toString("hex")}.tgz`);
      fileOut = createWriteStream(tmpPath);
      fileOut.on("error", () => fail("Não foi possível gravar o arquivo enviado."));
    };

    const pump = () => {
      for (;;) {
        if (done) return;
        if (mode === "start") {
          const at = buf.indexOf(openDelim);
          if (at < 0) {
            if (buf.length > openDelim.length + 64) buf = buf.subarray(buf.length - (openDelim.length + 64));
            return;
          }
          const after = at + openDelim.length;
          if (buf.length < after + 2) return;
          const mark = buf.subarray(after, after + 2).toString("utf8");
          if (mark === "--") {
            closing = true;
            buf = Buffer.alloc(0);
            closePart();
            void closed
              .then(() => {
                if (!filename || !tmpPath) {
                  finish({ ok: false, error: "Nenhum arquivo enviado." });
                  return;
                }
                finish({ ok: true, path: tmpPath, filename, confirm });
              })
              .catch(() => finish({ ok: false, error: "Não foi possível gravar o arquivo enviado." }));
            return;
          }
          if (mark !== "\r\n") {
            fail("Envio multipart inválido.");
            return;
          }
          buf = buf.subarray(after + 2);
          mode = "headers";
          continue;
        }
        if (mode === "headers") {
          const at = buf.indexOf(headerSep);
          if (at < 0) {
            if (buf.length > 64 * 1024) fail("Cabeçalho do envio grande demais.");
            return;
          }
          const headerText = buf.subarray(0, at).toString("utf8");
          buf = buf.subarray(at + 4);
          mode = "body";
          openPart(headerText);
          continue;
        }
        const at = buf.indexOf(nextDelim);
        if (at < 0) {
          const safe = buf.length - keep;
          if (safe > 0) {
            const chunk = buf.subarray(0, safe);
            buf = buf.subarray(safe);
            writeBody(chunk);
          }
          return;
        }
        writeBody(buf.subarray(0, at));
        if (done) return;
        closePart();
        buf = buf.subarray(at + 2);
        mode = "start";
      }
    };

    req.on("data", (chunk) => {
      if (done || !chunk || chunk instanceof Error) return;
      total += chunk.length;
      if (total > BACKUP_UPLOAD_MAX + UPLOAD_SLACK) {
        fail("Arquivo grande demais (limite de 1 GB).");
        return;
      }
      buf = Buffer.concat([buf, chunk]);
      pump();
    });
    req.on("end", () => {
      if (done || closing) return;
      pump();
      if (!done && !closing) fail("Envio multipart incompleto.");
    });
    req.on("error", () => fail("Não foi possível ler o arquivo enviado."));
  });
}

function unsafeMember(name: string) {
  const n = name.replace(/\\/g, "/").trim();
  if (!n || n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return true;
  return n.split("/").some((part) => part === "..");
}

function rootManifestMember(listing: string): string | null {
  for (const raw of listing.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (unsafeMember(line)) return null;
    if (line.replace(/^\.\//, "") === "manifest.json") return line;
  }
  return null;
}

/** Confere extensão, gzip e o manifest.json que o backup da estação grava. */
export async function backupValidateUpload(file: string, originalName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = basename(originalName);
  if (!/^[^\\/:*?"<>|]+\.tgz$/i.test(base)) {
    return { ok: false, error: "Use um arquivo .tgz gerado pelo backup desta estação." };
  }
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    return { ok: false, error: FORMAT_ERR };
  }
  if (size <= 0) return { ok: false, error: FORMAT_ERR };
  if (size > BACKUP_UPLOAD_MAX) return { ok: false, error: "Arquivo grande demais (limite de 1 GB)." };
  const fh = openSync(file, "r");
  const magic = Buffer.alloc(2);
  try {
    if (readSync(fh, magic, 0, 2, 0) < 2) return { ok: false, error: FORMAT_ERR };
  } finally {
    closeSync(fh);
  }
  if (magic[0] !== 0x1f || magic[1] !== 0x8b) return { ok: false, error: FORMAT_ERR };
  const listed = await run("tar", ["-tzf", file], { timeout: 120_000 });
  if (listed.code !== 0) return { ok: false, error: FORMAT_ERR };
  if (listed.stdout.split(/\r?\n/).some((line) => line.trim() && unsafeMember(line.trim()))) {
    return { ok: false, error: FORMAT_ERR };
  }
  const member = rootManifestMember(listed.stdout);
  if (!member) return { ok: false, error: FORMAT_ERR };
  const manifest = await run("tar", ["-xOf", file, member], { timeout: 60_000 });
  if (manifest.code !== 0 || !manifest.stdout.trim()) return { ok: false, error: FORMAT_ERR };
  let parsed: { version?: unknown; id?: unknown };
  try {
    parsed = JSON.parse(manifest.stdout) as { version?: unknown; id?: unknown };
  } catch {
    return { ok: false, error: FORMAT_ERR };
  }
  if (parsed.version !== 1 || typeof parsed.id !== "string" || !ID_RE.test(parsed.id)) {
    return { ok: false, error: FORMAT_ERR };
  }
  return { ok: true };
}

/** Restaura a partir do .tgz enviado. O arquivo temporário sai ao terminar o job. */
export function backupRestoreFileStart(
  filePath: string,
  confirm: boolean,
): { ok: true; jobId: string } | { ok: false; error: string } {
  if (!confirm || !existsSync(filePath)) {
    backupDropUpload(filePath);
    return {
      ok: false,
      error: confirm ? "missing" : "Confirme a restauração antes de continuar.",
    };
  }
  const jobKey = jobId("restore");
  const job: BackupJob = { id: jobKey, kind: "restore", status: "running", pct: 2, stage: "prepare", error: "" };
  jobs.set(jobKey, job);
  void restoreArchive(filePath, (pct, stage) => setProg(job, pct, stage))
    .then((r) => {
      if (r.ok) {
        job.status = "ok";
        job.pct = 100;
        job.stage = "done";
        job.warnings = r.warnings;
      } else {
        job.status = "error";
        job.stage = "error";
        job.error = r.error || "restore";
      }
    })
    .catch((err) => {
      job.status = "error";
      job.stage = "error";
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      backupDropUpload(filePath);
      setTimeout(() => {
        if (jobs.get(jobKey)?.status !== "running") jobs.delete(jobKey);
      }, 60_000);
    });
  return { ok: true, jobId: jobKey };
}
