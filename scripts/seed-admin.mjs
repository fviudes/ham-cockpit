#!/usr/bin/env node
/**
 * Cria o primeiro admin no D1 (production e/ou preview).
 * Uso:
 *   node scripts/seed-admin.mjs --env remote --username admin
 *   node scripts/seed-admin.mjs --env preview --username admin --password '...'
 *
 * Credenciais iniciais vão para C:\Users\<user>\hamcockpit-secrets\admin-portal.env
 * (fora do Git). Produção autentica só pelo D1 — este arquivo é só o seed local.
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PBKDF2_ITERS = 10_000;
const args = process.argv.slice(2);
function flag(name, def = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  return args[i + 1] ?? def;
}
function has(name) {
  return args.includes(`--${name}`);
}

const envFlag = flag("env", "remote"); // remote = production D1; preview = preview D1
const username = String(flag("username", "admin")).trim().toLowerCase();
const password = flag("password") || randomBytes(18).toString("base64url");
const role = flag("role", "owner");
const secretsDir = flag("secrets-dir", join(homedir(), "hamcockpit-secrets"));
const dry = has("dry-run");

if (!/^[a-z][a-z0-9_]{2,31}$/.test(username)) {
  console.error("username inválido (3–32: a-z, 0-9, _)");
  process.exit(1);
}
if (password.length < 12) {
  console.error("senha precisa de pelo menos 12 caracteres");
  process.exit(1);
}

function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pw, salt, PBKDF2_ITERS, 32, "sha256");
  return `pbkdf2$sha256$${PBKDF2_ITERS}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function newId(prefix) {
  return `${prefix}_${randomBytes(10).toString("hex").slice(0, 16)}`;
}

const passwordHash = hashPassword(password);
const id = newId("adm");
const now = Math.floor(Date.now() / 1000);
const email = `${username}@local`;

// Escape single quotes for SQL string literals
const esc = s => String(s).replace(/'/g, "''");

const sql = [
  `DELETE FROM admin_sessions WHERE admin_id IN (SELECT id FROM admin_users WHERE username = '${esc(username)}' OR email = '${esc(email)}');`,
  `DELETE FROM admin_users WHERE username = '${esc(username)}' OR email = '${esc(email)}' OR id = 'adm_owner';`,
  `INSERT INTO admin_users (id, email, name, role, status, username, password_hash, created_at)
   VALUES ('${esc(id)}', '${esc(email)}', '${esc(username)}', '${esc(role)}', 'active', '${esc(username)}', '${esc(passwordHash)}', ${now});`,
].join("\n");

console.log(`Seed admin: username=${username} role=${role} env=${envFlag} id=${id}`);
if (dry) {
  console.log("--- SQL ---");
  console.log(sql);
  console.log("--- senha (só dry-run) ---");
  console.log(password);
  process.exit(0);
}

const wranglerArgs = ["wrangler", "d1", "execute", "ham-cockpit-licenses", "--command", sql, "--yes"];
if (envFlag === "preview") wranglerArgs.push("--preview");
else wranglerArgs.push("--remote");

const r = spawnSync("pnpm", ["exec", ...wranglerArgs], {
  cwd: join(import.meta.dirname, ".."),
  encoding: "utf8",
  shell: true,
});
if (r.status !== 0) {
  console.error(r.stdout || "");
  console.error(r.stderr || "");
  process.exit(r.status || 1);
}
console.log(r.stdout || "");

mkdirSync(secretsDir, { recursive: true });
const envPath = join(secretsDir, "admin-portal.env");
let existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const dropKeys = new Set(["ADMIN_BOOTSTRAP_TOKEN", "ADMIN_TOTP_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_USER_ID"]);
const infra = existing
  .split(/\r?\n/)
  .filter(line => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith("# otpauth://")) return false;
    if (t.startsWith("# Credenciais") || t.startsWith("# Seed") || t.startsWith("# Login") || t.startsWith("# Gerado") || t.startsWith("# ADMIN_BOOTSTRAP")) return false;
    const k = t.split("=")[0]?.trim();
    if (!k || dropKeys.has(k)) return false;
    if (t.startsWith("#") && !k.includes("_")) return false;
    return true;
  })
  .join("\n")
  .trim();

const header = `# Credenciais do portal Ham Cockpit — FORA DO GIT. Nunca commitar.
# Seed em ${new Date().toISOString()}
# Login em https://ham-cockpit.pages.dev/admin com usuário + senha (conta no D1).
# ADMIN_BOOTSTRAP_TOKEN / TOTP não são mais usados para login.

ADMIN_USERNAME=${username}
ADMIN_PASSWORD=${password}
ADMIN_USER_ID=${id}
`;

writeFileSync(envPath, `${header}\n${infra ? infra + "\n" : ""}`, "utf8");

const readme = `Arquivo de login do admin: admin-portal.env
Portal: https://ham-cockpit.pages.dev/admin
Use ADMIN_USERNAME + ADMIN_PASSWORD (conta no D1).
Seed: node scripts/seed-admin.mjs --env remote --username admin
Não commitar esta pasta. Não compartilhar o conteúdo do .env.
`;
writeFileSync(join(secretsDir, "ADMIN_README.txt"), readme, "utf8");

console.log(`Credenciais gravadas em ${envPath}`);
console.log(`Usuário: ${username}`);
console.log(`Senha:   ${password}`);
