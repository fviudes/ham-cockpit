import type { Ctx } from "./env";
import { HttpError, ipHash } from "./util";

/** Rate limit por janela fixa, contador no D1. Devolve `true` se ainda dentro do limite. */
export async function rateLimit(ctx: Ctx, route: string, key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = ctx.now();
  const ws = Math.floor(now / windowSec) * windowSec;
  const row = await ctx.env.DB.prepare(
    "INSERT INTO rate_limits (k, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT (k) DO UPDATE SET count = count + 1 RETURNING count",
  )
    .bind(`${route}|${key}|${ws}`, ws)
    .first<{ count: number }>();
  // Limpeza preguiçosa (Pages não tem cron): ~1% das chamadas.
  if (Math.random() < 0.01) {
    await ctx.env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(now - 86400).run();
  }
  return (row?.count ?? 1) <= limit;
}

export async function enforceRate(ctx: Ctx, route: string, key: string, limit: number, windowSec: number): Promise<void> {
  if (!(await rateLimit(ctx, route, key, limit, windowSec))) {
    throw new HttpError(429, "rate_limited", "Muitas tentativas. Aguarde um pouco e tente de novo.");
  }
}

export async function ipKey(ctx: Ctx): Promise<string> {
  return ipHash(ctx);
}

export interface PortalSettings {
  trialDays: number;
  provisionalDays: number;
  enforce: boolean;
  crlVersion: number;
}

export async function getSettings(ctx: Ctx): Promise<PortalSettings> {
  const rows = await ctx.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const m = new Map(rows.results.map(r => [r.key, r.value]));
  const int = (k: string, d: number, lo: number, hi: number) => {
    const n = Number.parseInt(m.get(k) ?? "", 10);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
  };
  return {
    trialDays: int("trial_days", 30, 1, 365),
    provisionalDays: int("provisional_days", 7, 0, 60),
    enforce: m.get("enforce") === "1",
    crlVersion: int("crl_version", 1, 1, 1_000_000_000),
  };
}

export async function setSetting(ctx: Ctx, key: string, value: string, by: string): Promise<void> {
  await ctx.env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4",
  )
    .bind(key, value, ctx.now(), by)
    .run();
}

export async function bumpCrl(ctx: Ctx, by: string): Promise<void> {
  await ctx.env.DB.prepare(
    "UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ?1, updated_by = ?2 WHERE key = 'crl_version'",
  )
    .bind(ctx.now(), by)
    .run();
}

export async function audit(
  ctx: Ctx,
  adminId: string | null,
  action: string,
  target: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await ctx.env.DB.prepare(
    "INSERT INTO admin_audit (at, admin_id, action, target, before_json, after_json, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
  )
    .bind(
      ctx.now(),
      adminId,
      action,
      target,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
      await ipHash(ctx),
    )
    .run();
}

export async function licenseEvent(
  ctx: Ctx,
  kind: string,
  actor: string,
  serial: string | null,
  licenseId: string | null,
  data?: unknown,
): Promise<void> {
  await ctx.env.DB.prepare(
    "INSERT INTO license_events (at, serial, license_id, kind, actor, data_json, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
  )
    .bind(ctx.now(), serial, licenseId, kind, actor, data === undefined ? null : JSON.stringify(data), await ipHash(ctx))
    .run();
}
