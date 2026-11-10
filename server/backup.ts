import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { listUsers } from "./users";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ID_RE = /^(?:hamcockpit|catbridge)-\d{8}-\d{6}-[a-f0-9]{8}$/;

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
    { key: "radios", dir: existsSync("/opt/radios") ? "/opt/radios" : local("radios") },
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

function copyTree(src: string, dest: string) {
  if (!existsSync(src)) return false;
  const st = statSync(src);
  if (st.isFile()) {
    if (skipName(basename(src))) return false;
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    return true;
  }
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skipName(name)) continue;
    copyTree(join(src, name), join(dest, name));
  }
  return true;
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

function envValue(file: string, key: string) {
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

async function dumpWavelog(dest: string, warnings: string[], parts: string[]) {
  mkdirSync(dest, { recursive: true });
  const home = wavelogDir();
  for (const name of [".env", "docker-compose.yml", "wavelog-ctl.sh"]) {
    const src = join(home, name);
    if (existsSync(src)) {
      mkdirSync(join(dest, "opt"), { recursive: true });
      cpSync(src, join(dest, "opt", name));
    }
  }
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
  const pass = envValue(join(home, ".env"), "WAVELOG_DB_PASSWORD");
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
      cpSync(join(opt, name), join(home, name));
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
  const pass = envValue(join(home, ".env"), "WAVELOG_DB_PASSWORD");
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

export async function backupCreate(user: string): Promise<{ ok: boolean; item?: BackupItem; folder?: string; error?: string }> {
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
  try {
    for (const src of stationSources()) {
      if (copyTree(src.dir, join(staging, "station", src.key))) parts.push(`station:${src.key}`);
    }
    try {
      const users = await listUsers();
      writeFileSync(join(staging, "station", "linux-users.json"), `${JSON.stringify({ users }, null, 2)}\n`);
      parts.push("station:users");
    } catch (err) {
      warnings.push(`users: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (copyTree(wlgDir(), join(staging, "wlg"))) parts.push("wlg");
    await dumpWavelog(join(staging, "wavelog"), warnings, parts);
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

export function backupDelete(id: string): { ok: boolean; error?: string } {
  if (!ID_RE.test(id)) return { ok: false, error: "id" };
  const dir = backupDir();
  const file = archivePath(dir, id);
  if (!existsSync(file)) return { ok: false, error: "missing" };
  unlinkSync(file);
  if (existsSync(sidecarPath(dir, id))) unlinkSync(sidecarPath(dir, id));
  return { ok: true };
}

export async function backupRestore(
  id: string,
  confirm: boolean,
): Promise<{ ok: boolean; warnings?: string[]; error?: string }> {
  if (!confirm) return { ok: false, error: "confirm" };
  if (!ID_RE.test(id)) return { ok: false, error: "id" };
  const dir = backupDir();
  const file = archivePath(dir, id);
  if (!existsSync(file)) return { ok: false, error: "missing" };
  const staging = join(tmpdir(), `restore-${id}`);
  mkdirSync(staging, { recursive: true });
  const warnings: string[] = [];
  try {
    const tar = await run("tar", ["-xzf", file, "-C", staging], { timeout: 180_000 });
    if (tar.code !== 0) return { ok: false, error: tar.stderr.trim() || "tar" };
    const station = join(staging, "station");
    if (existsSync(station)) {
      for (const src of stationSources()) {
        const from = join(station, src.key);
        if (!existsSync(from)) continue;
        mkdirSync(src.dir, { recursive: true });
        copyTree(from, src.dir);
      }
    }
    const wlg = join(staging, "wlg");
    if (existsSync(wlg)) copyTree(wlg, wlgDir());
    const wav = join(staging, "wavelog");
    if (existsSync(wav)) await restoreWavelog(wav, warnings);
    return { ok: true, warnings };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
