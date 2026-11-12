import { audit, enforceRate, getSettings, ipKey, setSetting } from "./db";
import type { Ctx } from "./env";
import { HttpError, getCookie, hmacHex, ipHash, json, newId, safeEqual, sha256Hex } from "./util";

/**
 * Auth do admin: conta no D1 (username + senha) → sessão em cookie HttpOnly.
 *
 * Hash: PBKDF2-SHA256 com 10_000 iterações (cabe no Workers Free ~10 ms de CPU).
 * Tradeoff: iterações baixas vs. OWASP; mitigações = senha longa gerada no seed,
 * rate limit forte (6/15 min por IP, 30/h global) e pepper implícito do isolamento do D1.
 * TOTP opcional por usuário (coluna totp_secret); se preenchida, exige código no login.
 *
 * Cloudflare Access continua o alvo com domínio próprio (docs/licenciamento.md).
 */
const SESSION_TTL = 8 * 3600;
const PBKDF2_ITERS = 10_000;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface AdminIdentity {
  id: string;
  username: string;
  email: string;
  role: "owner" | "admin" | "viewer";
  csrf: string;
}

export interface AdminUserRow {
  id: string;
  username: string | null;
  email: string;
  name: string | null;
  role: AdminIdentity["role"];
  status: "active" | "disabled";
  password_hash: string | null;
  totp_secret: string | null;
  created_at: number;
  last_login_at: number | null;
}

function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const out: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of clean) {
    acc = (acc << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((acc >> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function totpCode(secretB32: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secretB32), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(4, step >>> 0);
  new DataView(msg.buffer).setUint32(0, Math.floor(step / 2 ** 32));
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

async function matchTotp(secret: string, code: string, nowSec: number): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = Math.floor(nowSec / 30);
  for (const d of [0, -1, 1]) {
    if (await safeEqual(await totpCode(secret, cur + d), code)) return cur + d;
  }
  return null;
}

function cookieName(ctx: Ctx): string {
  return new URL(ctx.origin).protocol === "https:" ? "__Host-hc_admin" : "hc_admin_dev";
}

function setCookie(ctx: Ctx, value: string, maxAge: number): string {
  const secure = new URL(ctx.origin).protocol === "https:";
  return `${cookieName(ctx)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

async function csrfFor(ctx: Ctx, idHash: string): Promise<string> {
  return (await hmacHex(ctx.env.IP_HASH_KEY || "dev-ip-key", `csrf|${idHash}`)).slice(0, 32);
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += u[i]!.toString(16).padStart(2, "0");
  return s;
}

function fromHex(hexStr: string): Uint8Array {
  const out = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Formato: pbkdf2$sha256$iters$saltHex$hashHex */
export async function hashPassword(password: string, iters = PBKDF2_ITERS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iters }, key, 256);
  return `pbkdf2$sha256$${iters}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iters = Number.parseInt(parts[2]!, 10);
  const saltHex = parts[3]!;
  const hashHex = parts[4]!;
  if (!Number.isFinite(iters) || iters < 1000 || iters > 200_000 || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  const salt = fromHex(saltHex);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iters }, key, 256);
  return safeEqual(toHex(bits).toLowerCase(), hashHex.toLowerCase());
}

export function normalizeUsername(raw: string): string | null {
  const u = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(u)) return null;
  return u;
}

/** Há pelo menos um admin ativo com credencial no D1. */
export async function adminConfigured(ctx: Ctx): Promise<boolean> {
  const row = await ctx.env.DB.prepare(
    "SELECT 1 AS ok FROM admin_users WHERE status = 'active' AND username IS NOT NULL AND password_hash IS NOT NULL LIMIT 1",
  ).first<{ ok: number }>();
  return !!row;
}

export async function adminLogin(ctx: Ctx, body: { username?: string; password?: string; code?: string }): Promise<Response> {
  if (!(await adminConfigured(ctx))) {
    throw new HttpError(503, "admin_not_configured", "Admin ainda não configurado neste ambiente (nenhum usuário no banco).");
  }
  await enforceRate(ctx, "adm-login-ip", await ipKey(ctx), 6, 900);
  await enforceRate(ctx, "adm-login-all", "all", 30, 3600);

  const username = normalizeUsername(String(body.username ?? ""));
  const password = String(body.password ?? "");
  if (!username || !password) {
    await audit(ctx, null, "admin_login_failed", null, undefined, undefined);
    throw new HttpError(401, "invalid_credentials", "Usuário ou senha inválidos.");
  }

  const user = await ctx.env.DB.prepare(
    "SELECT id, username, email, role, status, password_hash, totp_secret FROM admin_users WHERE username = ?1",
  )
    .bind(username)
    .first<AdminUserRow>();

  const passOk = !!(user && user.status === "active" && user.password_hash && (await verifyPassword(password, user.password_hash)));
  if (!passOk || !user) {
    await audit(ctx, null, "admin_login_failed", null, undefined, undefined);
    throw new HttpError(401, "invalid_credentials", "Usuário ou senha inválidos.");
  }

  if (user.totp_secret) {
    const step = await matchTotp(user.totp_secret, String(body.code ?? "").replace(/\s/g, ""), ctx.now());
    const lastKey = `admin_totp_last_step:${user.id}`;
    const lastStep = Number.parseInt((await ctx.env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(lastKey).first<{ value: string }>())?.value ?? "0", 10) || 0;
    if (step === null || step <= lastStep) {
      await audit(ctx, user.id, "admin_login_failed", null, undefined, { reason: "totp" });
      throw new HttpError(401, "invalid_credentials", "Usuário, senha ou código inválidos.");
    }
    await setSetting(ctx, lastKey, String(step), user.id);
  }

  const now = ctx.now();
  await ctx.env.DB.prepare("UPDATE admin_users SET last_login_at = ?1 WHERE id = ?2").bind(now, user.id).run();
  await ctx.env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?1").bind(now).run();

  const raw = crypto.getRandomValues(new Uint8Array(32));
  const sid = Array.from(raw, b => b.toString(16).padStart(2, "0")).join("");
  const idHash = await sha256Hex(sid);
  await ctx.env.DB.prepare("INSERT INTO admin_sessions (id_hash, admin_id, created_at, expires_at, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(idHash, user.id, now, now + SESSION_TTL, await ipHash(ctx))
    .run();
  await audit(ctx, user.id, "admin_login", null, undefined, undefined);
  return json(
    { ok: true, csrf: await csrfFor(ctx, idHash), role: user.role, username: user.username },
    200,
    { "set-cookie": setCookie(ctx, sid, SESSION_TTL) },
  );
}

export async function adminLogout(ctx: Ctx, request: Request): Promise<Response> {
  const sid = getCookie(request, cookieName(ctx));
  if (sid) await ctx.env.DB.prepare("DELETE FROM admin_sessions WHERE id_hash = ?1").bind(await sha256Hex(sid)).run();
  return json({ ok: true }, 200, { "set-cookie": setCookie(ctx, "", 0) });
}

/** Exige sessão válida; em métodos que alteram dados exige também o cabeçalho X-HC-CSRF. */
export async function requireAdmin(ctx: Ctx, request: Request, opts: { write?: boolean; minRole?: "owner" | "admin" | "viewer" } = {}): Promise<AdminIdentity> {
  const sid = getCookie(request, cookieName(ctx));
  if (!sid || !/^[0-9a-f]{64}$/.test(sid)) throw new HttpError(401, "unauthorized", "Faça login no painel.");
  const idHash = await sha256Hex(sid);
  const row = await ctx.env.DB.prepare(
    "SELECT u.id, u.username, u.email, u.role, s.expires_at FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id WHERE s.id_hash = ?1 AND u.status = 'active'",
  )
    .bind(idHash)
    .first<{ id: string; username: string | null; email: string; role: AdminIdentity["role"]; expires_at: number }>();
  if (!row || row.expires_at <= ctx.now()) throw new HttpError(401, "unauthorized", "Sessão expirada. Entre de novo.");
  const csrf = await csrfFor(ctx, idHash);
  const method = request.method.toUpperCase();
  const mutating = opts.write ?? !(method === "GET" || method === "HEAD");
  if (mutating) {
    const got = request.headers.get("x-hc-csrf") ?? "";
    if (!(await safeEqual(got, csrf))) throw new HttpError(403, "csrf", "Falha de verificação CSRF.");
  }
  const rank = { viewer: 1, admin: 2, owner: 3 } as const;
  if (opts.minRole && rank[row.role] < rank[opts.minRole]) throw new HttpError(403, "forbidden", "Sem permissão para esta ação.");
  return { id: row.id, username: row.username || row.email, email: row.email, role: row.role, csrf };
}

export async function createAdminUser(
  ctx: Ctx,
  opts: { username: string; password: string; role?: AdminIdentity["role"]; name?: string; actorId?: string },
): Promise<AdminUserRow> {
  const username = normalizeUsername(opts.username);
  if (!username) throw new HttpError(400, "invalid_username", "Usuário inválido (3–32 chars: a-z, 0-9, _).");
  if (!opts.password) throw new HttpError(400, "empty_password", "Informe uma senha.");
  const role = opts.role ?? "admin";
  if (!["owner", "admin", "viewer"].includes(role)) throw new HttpError(400, "invalid_role");
  const id = newId("adm");
  const now = ctx.now();
  const password_hash = await hashPassword(opts.password);
  const email = `${username}@local`;
  try {
    await ctx.env.DB.prepare(
      "INSERT INTO admin_users (id, email, name, role, status, username, password_hash, created_at) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?7)",
    )
      .bind(id, email, opts.name ?? username, role, username, password_hash, now)
      .run();
  } catch {
    throw new HttpError(409, "username_taken", "Este nome de usuário já existe.");
  }
  await audit(ctx, opts.actorId ?? null, "admin_user_create", id, undefined, { username, role });
  const row = await ctx.env.DB.prepare("SELECT id, username, email, name, role, status, password_hash, totp_secret, created_at, last_login_at FROM admin_users WHERE id = ?1")
    .bind(id)
    .first<AdminUserRow>();
  if (!row) throw new HttpError(500, "internal_error");
  return row;
}

export { getSettings, PBKDF2_ITERS };
