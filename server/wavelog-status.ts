import { execFile } from "node:child_process";
import { access, copyFile, readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATION_SVC = "/opt/ham-cockpit/bin/station-svc";
const STATION_BACKUP = "/opt/ham-cockpit/bin/station-backup";
const DB_CONTAINER = "wavelog-db";
const DB_NAME = "wavelog";
const DB_USER = "wavelog";
const DB_HOST = "wavelog-db";
const DB_PORT = 3306;

export type WavelogStatus = {
  ok: boolean;
  url: string;
  port: number;
  docker: boolean;
  compose: string;
  reason: "ok" | "down" | "no-docker" | "docker-down" | "no-compose" | "error";
  error?: string;
  httpStatus?: number;
};

async function composeDir(): Promise<string> {
  if (process.env.WAVELOG_DIR) return process.env.WAVELOG_DIR;
  const pi = "/opt/wavelog";
  if (await fileExists(join(pi, "docker-compose.yml"))) return pi;
  return join(ROOT, "deploy", "wavelog");
}

async function stationSvc(action: "start" | "stop" | "enable" | "is-active", id: string): Promise<string> {
  if (!(await fileExists(STATION_SVC))) return "";
  try {
    const { stdout } = await execFileAsync("sudo", ["-n", STATION_SVC, action, id], {
      timeout: 180_000,
      windowsHide: true,
    });
    return String(stdout || "").trim();
  } catch {
    return "";
  }
}

async function systemctlWavelog(action: "start" | "stop" | "enable"): Promise<boolean> {
  const viaHelper = await stationSvc(action, "wavelog");
  if (viaHelper === "started" || viaHelper === "stopped" || viaHelper === "enabled") return true;
  try {
    await execFileAsync("systemctl", [action, "wavelog.service"], {
      timeout: 120_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function probeWavelog(port = 8086, host = "127.0.0.1"): Promise<{
  ok: boolean;
  httpStatus?: number;
  error?: string;
  url: string;
}> {
  const url = `http://${host}:${port}/`;
  return new Promise((resolve) => {
    const req = httpRequest(url, { method: "GET", timeout: 2500 }, (res) => {
      res.resume();
      const httpStatus = res.statusCode ?? 0;
      resolve({ ok: httpStatus > 0 && httpStatus < 500, httpStatus, url });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout", url });
    });
    req.on("error", (err) => resolve({ ok: false, error: err.message, url }));
    req.end();
  });
}

async function dockerBinaryPresent(): Promise<boolean> {
  for (const p of ["/usr/bin/docker", "/bin/docker"]) {
    if (await fileExists(p)) return true;
  }
  try {
    await execFileAsync("docker", ["--version"], { timeout: 3000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** Daemon responde no sock (precisa grupo docker / root). */
async function dockerDaemonUp(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 5000,
      windowsHide: true,
    });
    return true;
  } catch {
    const active = await stationSvc("is-active", "docker");
    return active === "active";
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function wavelogStatus(port = 8086): Promise<WavelogStatus> {
  const compose = await composeDir();
  const url = `http://127.0.0.1:${port}/`;
  const hasBin = await dockerBinaryPresent();
  const daemon = hasBin ? await dockerDaemonUp() : false;
  const docker = hasBin && daemon;
  const hasCompose = await fileExists(join(compose, "docker-compose.yml"));
  const probe = await probeWavelog(port);
  if (probe.ok) {
    return { ok: true, url, port, docker: hasBin, compose, reason: "ok", httpStatus: probe.httpStatus };
  }
  if (!hasCompose) {
    return { ok: false, url, port, docker: hasBin, compose, reason: "no-compose", error: probe.error };
  }
  if (!hasBin) {
    return { ok: false, url, port, docker: false, compose, reason: "no-docker", error: probe.error };
  }
  if (!daemon) {
    return {
      ok: false,
      url,
      port,
      docker: false,
      compose,
      reason: "docker-down",
      error: probe.error,
    };
  }
  return { ok: false, url, port, docker: true, compose, reason: "down", error: probe.error };
}

async function ensureEnv(dir: string): Promise<void> {
  const env = join(dir, ".env");
  if (await fileExists(env)) return;
  const example = join(dir, ".env.example");
  if (await fileExists(example)) await copyFile(example, env);
}

export async function wavelogUp(port = 8086): Promise<WavelogStatus> {
  const status = await wavelogStatus(port);
  if (status.ok) return status;
  if (status.reason === "no-docker") return status;
  if (status.reason === "no-compose") return status;
  try {
    await ensureEnv(status.compose);
    // Sobe docker (se parado) + wavelog.service via sudo station-svc.
    const viaSystemd = (await systemctlWavelog("enable")) && (await systemctlWavelog("start"));
    if (!viaSystemd) {
      await stationSvc("start", "docker");
      await execFileAsync("docker", ["compose", "up", "-d"], {
        cwd: status.compose,
        timeout: 120_000,
        windowsHide: true,
      });
    }
  } catch (err) {
    return { ...status, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
  const after = await wavelogStatus(port);
  return after.ok ? after : { ...after, reason: after.reason === "ok" ? "down" : after.reason };
}

export async function wavelogDown(port = 8086): Promise<WavelogStatus> {
  const stopped = await systemctlWavelog("stop");
  if (!stopped && (await dockerDaemonUp())) {
    try {
      await execFileAsync("docker", ["compose", "stop"], {
        cwd: await composeDir(),
        timeout: 60_000,
        windowsHide: true,
      });
    } catch {
      /* ignore */
    }
  }
  return wavelogStatus(port);
}

export type WavelogDatabase = {
  ok: boolean;
  running: boolean;
  connected: boolean;
  health: string;
  deploy: "docker";
  compose: string;
  envFile: string;
  passwordSource: "env" | "missing";
  queryVia: "user" | "root-socket" | "none";
  host: string;
  port: number;
  published: boolean;
  name: string;
  user: string;
  password: string;
  version: string;
  charset: string;
  collation: string;
  engine: string;
  tables: number;
  sizeBytes: number;
  url: string;
  network: string;
  volume: string;
  image: string;
  error?: string;
};

function envValueFromText(text: string, key: string): string {
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

function scrubSecret(msg: string, secret: string): string {
  if (!secret) return msg;
  return msg.split(secret).join("***");
}

async function readEnvFile(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
    if (code !== "EACCES" && code !== "EPERM") return "";
  }
  try {
    const { stdout } = await execFileAsync("sudo", ["-n", STATION_BACKUP, "cat", file], {
      timeout: 8_000,
      windowsHide: true,
    });
    return String(stdout || "");
  } catch {
    return "";
  }
}

async function readDbPassword(dir: string): Promise<{ password: string; envFile: string; source: "env" | "missing" }> {
  const envFile = join(dir, ".env");
  if (!(await fileExists(envFile))) return { password: "", envFile, source: "missing" };
  const text = await readEnvFile(envFile);
  const password = envValueFromText(text, "WAVELOG_DB_PASSWORD");
  return { password, envFile, source: password ? "env" : "missing" };
}

async function dockerInspectDb(): Promise<{ running: boolean; health: string; image: string }> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "inspect",
        "--format",
        "{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.Config.Image}}",
        DB_CONTAINER,
      ],
      { timeout: 5_000, windowsHide: true },
    );
    const [runningS, healthS, imageS] = stdout.trim().split("|");
    const running = runningS === "true";
    const health = healthS || (running ? "running" : "exited");
    return { running, health, image: imageS || "" };
  } catch {
    return { running: false, health: "missing", image: "" };
  }
}

function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const DB_STATS_SQL =
  "SELECT VERSION(), @@character_set_server, @@collation_server, " +
  "(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'wavelog' AND TABLE_TYPE = 'BASE TABLE'), " +
  "(SELECT IFNULL(SUM(DATA_LENGTH + INDEX_LENGTH), 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'wavelog'), " +
  "(SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'wavelog' AND ENGINE IS NOT NULL ORDER BY DATA_LENGTH DESC LIMIT 1);";

/** Usuário do compose; senha só no env do container (não no argv do host). */
async function mariadbQueryUser(sql: string): Promise<string> {
  const inner = `mariadb -uwavelog -p"$MARIADB_PASSWORD" -N -B -e ${shSingleQuote(sql)}`;
  const { stdout } = await execFileAsync("docker", ["exec", DB_CONTAINER, "sh", "-c", inner], {
    timeout: 12_000,
    windowsHide: true,
  });
  return stdout.trim();
}

/** Root só via docker exec no MariaDB (TCP 127.0.0.1 no container). Nunca no socket do host. */
async function mariadbQueryRoot(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    ["exec", DB_CONTAINER, "mariadb", "-uroot", "--protocol=tcp", "-h127.0.0.1", "--skip-password", "-N", "-B", "-e", sql],
    { timeout: 12_000, windowsHide: true },
  );
  return stdout.trim();
}

async function mariadbVersionFallback(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("docker", ["exec", DB_CONTAINER, "mariadbd", "--version"], {
      timeout: 8_000,
      windowsHide: true,
    });
    const m = stdout.match(/Ver\s+(\S+)/);
    return m?.[1] || stdout.trim();
  } catch {
    return "";
  }
}

function parseStats(row: string): {
  version: string;
  charset: string;
  collation: string;
  tables: number;
  sizeBytes: number;
  engine: string;
} {
  const cols = row.split("\t");
  return {
    version: cols[0] || "",
    charset: cols[1] || "",
    collation: cols[2] || "",
    tables: Number(cols[3] || 0) || 0,
    sizeBytes: Number(cols[4] || 0) || 0,
    engine: cols[5] || "",
  };
}

export async function wavelogDatabase(httpPort = 8086): Promise<WavelogDatabase> {
  const compose = await composeDir();
  const { password, envFile, source } = await readDbPassword(compose);
  const inspect = await dockerInspectDb();
  const base: WavelogDatabase = {
    ok: false,
    running: inspect.running,
    connected: false,
    health: inspect.health,
    deploy: "docker",
    compose,
    envFile,
    passwordSource: source,
    queryVia: "none",
    host: DB_HOST,
    port: DB_PORT,
    published: false,
    name: DB_NAME,
    user: DB_USER,
    password,
    version: "",
    charset: "",
    collation: "",
    engine: "",
    tables: 0,
    sizeBytes: 0,
    url: `http://127.0.0.1:${httpPort}/`,
    network: "wavelog",
    volume: "wavelog-dbdata",
    image: inspect.image,
  };
  if (!password) {
    return { ...base, error: "WAVELOG_DB_PASSWORD ausente em .env" };
  }
  if (!inspect.running) {
    return { ...base, error: inspect.health === "missing" ? "container wavelog-db ausente" : "MariaDB parado" };
  }
  try {
    const stats = parseStats(await mariadbQueryUser(DB_STATS_SQL));
    return { ...base, ...stats, ok: true, connected: true, queryVia: "user" };
  } catch (userErr) {
    const userMsg = scrubSecret(userErr instanceof Error ? userErr.message : String(userErr), password);
    try {
      const stats = parseStats(await mariadbQueryRoot(DB_STATS_SQL));
      return {
        ...base,
        ...stats,
        ok: true,
        connected: false,
        queryVia: "root-socket",
        error: "Usuário/banco wavelog ainda não existem neste volume. Credenciais do .env são as do instalador web.",
      };
    } catch {
      const version = await mariadbVersionFallback();
      return {
        ...base,
        version,
        error: userMsg || "falha ao consultar o MariaDB no container",
      };
    }
  }
}

export async function wavelogDbUpdate(httpPort = 8086): Promise<WavelogDatabase & { updated?: boolean }> {
  const compose = await composeDir();
  await ensureEnv(compose);
  await stationSvc("start", "wavelog");
  const ctl = join(compose, "wavelog-ctl.sh");
  try {
    if (await fileExists(ctl)) {
      await execFileAsync("bash", [ctl, "pull"], { cwd: compose, timeout: 240_000, windowsHide: true });
    } else {
      await execFileAsync("docker", ["compose", "pull"], { cwd: compose, timeout: 180_000, windowsHide: true });
      await execFileAsync("docker", ["compose", "up", "-d", "--remove-orphans"], {
        cwd: compose,
        timeout: 120_000,
        windowsHide: true,
      });
    }
  } catch (err) {
    const db = await wavelogDatabase(httpPort);
    return {
      ...db,
      updated: false,
      error: scrubSecret(err instanceof Error ? err.message : String(err), db.password),
    };
  }
  await probeWavelog(httpPort);
  const db = await wavelogDatabase(httpPort);
  return { ...db, updated: true };
}
