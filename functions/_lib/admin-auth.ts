import { audit, enforceRate, getSettings, ipKey, setSetting } from "./db";
import type { Ctx } from "./env";
import { HttpError, getCookie, hmacHex, ipHash, json, safeEqual, sha256Hex } from "./util";

/**
 * Autenticação de contingência do admin (sem domínio próprio, sem Cloudflare Access):
 * chave longa (ADMIN_BOOTSTRAP_TOKEN) + TOTP (RFC 6238, ADMIN_TOTP_SECRET) → sessão em cookie HttpOnly.
 * Sem PBKDF2 de propósito (o plano Free dá 10 ms de CPU por requisição): a chave tem 256 bits de entropia.
 * Quando houver domínio próprio: trocar por Cloudflare Access (docs/licenciamento.md, "Migração para Access").
 */
const SESSION_TTL = 8 * 3600;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface AdminIdentity {
  id: string;
  email: string;
  role: "owner" | "admin" | "viewer";
  csrf: string;
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

/** Devolve o passo (janela de 30 s) que casou, ou null. Aceita ±1 passo de deriva de relógio. */
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

export function adminConfigured(ctx: Ctx): boolean {
  return !!(ctx.env.ADMIN_BOOTSTRAP_TOKEN && ctx.env.ADMIN_TOTP_SECRET);
}

export async function adminLogin(ctx: Ctx, body: { token?: string; code?: string }): Promise<Response> {
  if (!adminConfigured(ctx)) throw new HttpError(503, "admin_not_configured", "Admin ainda não configurado no portal.");
  // Força bruta: 6 tentativas por IP a cada 15 min e 30 por hora no total (contam todas as tentativas).
  await enforceRate(ctx, "adm-login-ip", await ipKey(ctx), 6, 900);
  await enforceRate(ctx, "adm-login-all", "all", 30, 3600);

  const tokenOk = await safeEqual(String(body.token ?? ""), ctx.env.ADMIN_BOOTSTRAP_TOKEN!);
  const step = await matchTotp(ctx.env.ADMIN_TOTP_SECRET!, String(body.code ?? "").replace(/\s/g, ""), ctx.now());
  const lastStep = Number.parseInt((await ctx.env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_totp_last_step'").first<{ value: string }>())?.value ?? "0", 10) || 0;
  if (!tokenOk || step === null || step <= lastStep) {
    await audit(ctx, null, "admin_login_failed", null, undefined, undefined);
    throw new HttpError(401, "invalid_credentials", "Chave ou código inválido.");
  }
  await setSetting(ctx, "admin_totp_last_step", String(step), "admin");

  const now = ctx.now();
  await ctx.env.DB.prepare("INSERT OR IGNORE INTO admin_users (id, email, name, role, status, created_at) VALUES ('adm_owner', 'owner@local', 'Proprietário', 'owner', 'active', ?1)").bind(now).run();
  await ctx.env.DB.prepare("UPDATE admin_users SET last_login_at = ?1 WHERE id = 'adm_owner'").bind(now).run();
  await ctx.env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?1").bind(now).run();

  const raw = crypto.getRandomValues(new Uint8Array(32));
  const sid = Array.from(raw, b => b.toString(16).padStart(2, "0")).join("");
  const idHash = await sha256Hex(sid);
  await ctx.env.DB.prepare("INSERT INTO admin_sessions (id_hash, admin_id, created_at, expires_at, ip_hash) VALUES (?1, 'adm_owner', ?2, ?3, ?4)")
    .bind(idHash, now, now + SESSION_TTL, await ipHash(ctx))
    .run();
  await audit(ctx, "adm_owner", "admin_login", null, undefined, undefined);
  return json({ ok: true, csrf: await csrfFor(ctx, idHash), role: "owner" }, 200, { "set-cookie": setCookie(ctx, sid, SESSION_TTL) });
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
    "SELECT u.id, u.email, u.role, s.expires_at FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id WHERE s.id_hash = ?1 AND u.status = 'active'",
  )
    .bind(idHash)
    .first<{ id: string; email: string; role: AdminIdentity["role"]; expires_at: number }>();
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
  return { id: row.id, email: row.email, role: row.role, csrf };
}

export { getSettings };
