import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const HELPER = "/opt/ham-cockpit/bin/station-user";
const NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const FORBIDDEN = new Set(["root", "daemon", "bin", "sys", "sync", "games", "man", "mail", "www-data", "nobody"]);

export type LinuxUser = { name: string; sudo: boolean };

const mockUsers: LinuxUser[] = [
  { name: "hamcockpit", sudo: true },
  { name: "admin", sudo: true },
];

function linux(): boolean {
  return process.platform === "linux";
}

function run(cmd: string, args: string[], input?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

export async function listUsers(): Promise<LinuxUser[]> {
  if (!linux()) {
    return mockUsers.map((u) => ({ ...u }));
  }
  if (existsSync(HELPER)) {
    const r = await run("sudo", ["-n", HELPER, "list"]);
    if (r.code === 0) {
      const names = r.stdout
        .split(/[,\n]/)
        .map((n) => n.trim())
        .filter(Boolean);
      const uniq = Array.from(new Set(["hamcockpit", "catbridge", ...names]));
      return uniq.sort().map((name) => ({ name, sudo: true }));
    }
  }
  try {
    const { stdout } = await execFileAsync("getent", ["group", "sudo"], { timeout: 4000 });
    const members = stdout.trim().split(":").pop()?.split(",").filter(Boolean) ?? [];
    return Array.from(new Set(["hamcockpit", "catbridge", ...members]))
      .sort()
      .map((name) => ({ name, sudo: true }));
  } catch {
    return [{ name: "hamcockpit", sudo: true }];
  }
}

export async function createUser(name: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const user = name.trim().toLowerCase();
  if (!NAME_RE.test(user) || FORBIDDEN.has(user)) {
    return { ok: false, error: "nome inválido" };
  }
  if (!password || password.length < 4) {
    return { ok: false, error: "senha muito curta" };
  }
  if (!linux()) {
    if (mockUsers.some((u) => u.name === user)) {
      return { ok: false, error: "já existe" };
    }
    mockUsers.push({ name: user, sudo: true });
    return { ok: true };
  }
  if (!existsSync(HELPER)) {
    return { ok: false, error: "station-user ausente" };
  }
  const r = await run("sudo", ["-n", HELPER, "add", user], password);
  if (r.code !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || "falha ao criar usuário").trim() };
  }
  return { ok: true };
}

export async function deleteUser(name: string): Promise<{ ok: boolean; error?: string }> {
  const user = name.trim().toLowerCase();
  if (user === "hamcockpit" || user === "root" || !NAME_RE.test(user)) {
    return { ok: false, error: "usuário protegido" };
  }
  if (!linux()) {
    const i = mockUsers.findIndex((u) => u.name === user);
    if (i < 0) return { ok: false, error: "não encontrado" };
    mockUsers.splice(i, 1);
    return { ok: true };
  }
  if (!existsSync(HELPER)) {
    return { ok: false, error: "station-user ausente" };
  }
  const r = await run("sudo", ["-n", HELPER, "del", user]);
  if (r.code !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || "falha ao remover").trim() };
  }
  return { ok: true };
}

export async function sshStatus(): Promise<{ ok: boolean; unit: string }> {
  if (!linux()) return { ok: false, unit: "ssh" };
  for (const unit of ["ssh", "sshd"]) {
    try {
      const { stdout } = await execFileAsync("systemctl", ["is-active", unit], { timeout: 3000 });
      if (stdout.trim() === "active") return { ok: true, unit };
    } catch {
      /* próximo */
    }
  }
  return { ok: false, unit: "ssh" };
}
