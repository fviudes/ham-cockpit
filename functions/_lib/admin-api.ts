import { normalizeSerial, serialDisplay } from "../../shared/license";
import { requireAdmin } from "./admin-auth";
import { settlePayment, loadPayment } from "./checkout";
import { audit, getSettings, setSetting } from "./db";
import type { Ctx } from "./env";
import { getFxRate, setManualRate } from "./fx";
import { createDefinitive, extendTrial, revokeLicense, upsertDevice, type LicenseRow } from "./licenses";
import { getPrice, previewPrice } from "./pricing";
import { getProvider, loadProviderCfg, loadProviderRow, missingFields, saveProviderSecrets } from "./providers";
import type { PaymentRow, ProviderMode } from "./providers/types";
import { HttpError, clip, decimalToCents, json, maskSerial, readJson } from "./util";

type Match = RegExpMatchArray;

function pageSize(url: URL): number {
  const n = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 50;
}

function effectiveStatus(ctx: Ctx, status: string, exp: number | null): string {
  return status === "active" && exp !== null && exp <= ctx.now() ? "expired" : status;
}

async function listLicenses(ctx: Ctx, url: URL): Promise<Response> {
  const lim = pageSize(url);
  const where: string[] = [];
  const args: unknown[] = [];
  const type = url.searchParams.get("type");
  if (type === "trial" || type === "definitive") {
    args.push(type);
    where.push(`l.type = ?${args.length}`);
  }
  const status = url.searchParams.get("status");
  const now = ctx.now();
  if (status === "expired") {
    args.push(now);
    where.push(`(l.status = 'expired' OR (l.status = 'active' AND l.expires_at IS NOT NULL AND l.expires_at <= ?${args.length}))`);
  } else if (status === "active") {
    args.push(now);
    where.push(`(l.status = 'active' AND (l.expires_at IS NULL OR l.expires_at > ?${args.length}))`);
  } else if (status === "revoked" || status === "superseded") {
    args.push(status);
    where.push(`l.status = ?${args.length}`);
  }
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().replace(/[^0-9a-z_]/g, "");
  if (q.startsWith("lic_")) {
    args.push(q);
    where.push(`l.id = ?${args.length}`);
  } else if (q) {
    args.push(`%${q.replace(/[^0-9a-f]/g, "") || "zzzz"}%`);
    where.push(`l.serial LIKE ?${args.length}`);
  }
  const cur = url.searchParams.get("cursor");
  if (cur) {
    const [ts, id] = cur.split("|");
    const t = Number.parseInt(ts, 10);
    if (Number.isFinite(t) && id) {
      args.push(t, id);
      where.push(`(l.issued_at < ?${args.length - 1} OR (l.issued_at = ?${args.length - 1} AND l.id < ?${args.length}))`);
    }
  }
  args.push(lim + 1);
  const rows = await ctx.env.DB.prepare(
    `SELECT l.id, l.serial, l.type, l.status, l.source, l.issued_at, l.expires_at, l.revoked_reason, d.last_country, d.last_seen_at, d.is_test, d.last_app_version
     FROM licenses l JOIN devices d ON d.serial = l.serial
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY l.issued_at DESC, l.id DESC LIMIT ?${args.length}`,
  )
    .bind(...args)
    .all<{
      id: string;
      serial: string;
      type: string;
      status: string;
      source: string;
      issued_at: number;
      expires_at: number | null;
      revoked_reason: string | null;
      last_country: string | null;
      last_seen_at: number;
      is_test: number;
      last_app_version: string | null;
    }>();
  const more = rows.results.length > lim;
  const items = rows.results.slice(0, lim);
  const last = items[items.length - 1];
  return json({
    items: items.map(r => ({
      id: r.id,
      serial: maskSerial(r.serial),
      type: r.type,
      status: effectiveStatus(ctx, r.status, r.expires_at),
      source: r.source,
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      country: r.last_country,
      lastSeenAt: r.last_seen_at,
      appVersion: r.last_app_version,
      isTest: !!r.is_test,
      revokedReason: r.revoked_reason,
    })),
    nextCursor: more && last ? `${last.issued_at}|${last.id}` : null,
  });
}

async function licenseDetail(ctx: Ctx, id: string): Promise<Response> {
  const l = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE id = ?1").bind(id).first<LicenseRow>();
  if (!l) throw new HttpError(404, "license_not_found");
  const events = await ctx.env.DB.prepare("SELECT at, kind, actor, data_json FROM license_events WHERE serial = ?1 ORDER BY at DESC, id DESC LIMIT 50").bind(l.serial).all<{ at: number; kind: string; actor: string; data_json: string | null }>();
  const pays = await ctx.env.DB.prepare("SELECT id, provider, mode, status, currency, amount_cents, usd_cents, created_at, paid_at FROM payments WHERE serial = ?1 ORDER BY created_at DESC LIMIT 20").bind(l.serial).all();
  return json({
    license: {
      id: l.id,
      serial: maskSerial(l.serial),
      serialDisplay: (await serialDisplay(l.serial)).replace(/^(.{4}).{9}/, "$1-••••-••••"),
      type: l.type,
      status: effectiveStatus(ctx, l.status, l.expires_at),
      source: l.source,
      issuedAt: l.issued_at,
      expiresAt: l.expires_at,
      revokedAt: l.revoked_at,
      revokedReason: l.revoked_reason,
      createdBy: l.created_by,
      paymentId: l.payment_id,
    },
    events: events.results.map(e => ({ at: e.at, kind: e.kind, actor: e.actor, data: e.data_json ? JSON.parse(e.data_json) : null })),
    payments: pays.results,
  });
}

async function pricingGet(ctx: Ctx, url: URL): Promise<Response> {
  const price = await getPrice(ctx);
  const history = await ctx.env.DB.prepare("SELECT id, usd_cents, fx_spread_bps, rounding, quote_ttl_seconds, effective_from, created_by FROM price_settings ORDER BY id DESC LIMIT 10").all();
  const refresh = url.searchParams.get("refresh") === "1";
  let preview = null;
  let fx = null;
  if (price) preview = await previewPrice(ctx, price, { force: refresh });
  else fx = await getFxRate(ctx, { force: refresh });
  const manual = await ctx.env.DB.prepare("SELECT rate_micro, expires_at FROM fx_rates WHERE source = 'manual' AND expires_at > ?1 ORDER BY id DESC LIMIT 1").bind(ctx.now()).first<{ rate_micro: number; expires_at: number }>();
  const s = await getSettings(ctx);
  return json({
    configured: !!price,
    price,
    history: history.results,
    preview,
    fx: fx ? { source: fx.source, rateMicro: fx.rateMicro, rateDate: fx.rateDate, stale: fx.stale } : null,
    manual,
    settings: { trialDays: s.trialDays, provisionalDays: s.provisionalDays, enforce: s.enforce },
  });
}

async function pricingPut(ctx: Ctx, request: Request, adminId: string): Promise<Response> {
  const b = await readJson<{ usd?: string | number; usdCents?: number; spreadBps?: number; rounding?: string; quoteTtl?: number }>(request);
  const cents = b.usdCents !== undefined ? Number(b.usdCents) : decimalToCents(String(b.usd ?? "").replace(",", "."));
  if (cents === null || !Number.isInteger(cents) || cents < 100 || cents > 1_000_000) throw new HttpError(400, "invalid_price", "Preço entre US$ 1,00 e US$ 10.000,00");
  const spread = b.spreadBps === undefined ? 300 : Number(b.spreadBps);
  if (!Number.isInteger(spread) || spread < 0 || spread > 2000) throw new HttpError(400, "invalid_spread", "Spread entre 0 e 20% (em pontos-base)");
  const rounding = b.rounding ?? "real";
  if (!["cent", "ten_cents", "real"].includes(rounding)) throw new HttpError(400, "invalid_rounding");
  const ttl = b.quoteTtl === undefined ? 900 : Number(b.quoteTtl);
  if (!Number.isInteger(ttl) || ttl < 120 || ttl > 3600) throw new HttpError(400, "invalid_ttl", "Validade da cotação entre 120 e 3600 s");
  const before = await getPrice(ctx);
  await ctx.env.DB.prepare("INSERT INTO price_settings (usd_cents, fx_spread_bps, rounding, quote_ttl_seconds, effective_from, created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)")
    .bind(cents, spread, rounding, ttl, ctx.now(), adminId)
    .run();
  await audit(ctx, adminId, "price_set", "price", before, { usdCents: cents, spreadBps: spread, rounding, ttl });
  return json({ ok: true });
}

async function providersList(ctx: Ctx): Promise<Response> {
  const rows = await ctx.env.DB.prepare("SELECT id FROM providers WHERE id <> 'mock' ORDER BY sort_order").all<{ id: string }>();
  const out = [];
  for (const { id } of rows.results) {
    const prov = getProvider(ctx, id);
    const row = await loadProviderRow(ctx, id);
    if (!prov || !row) continue;
    const secrets = await ctx.env.DB.prepare("SELECT mode, name, hint, updated_at FROM provider_secrets WHERE provider = ?1").bind(id).all<{ mode: string; name: string; hint: string | null; updated_at: number }>();
    const bySecret: Record<string, Record<string, { set: true; hint: string | null; updatedAt: number }>> = { sandbox: {}, live: {} };
    for (const s of secrets.results) bySecret[s.mode][s.name] = { set: true, hint: s.hint, updatedAt: s.updated_at };
    const have = new Set(Object.keys(bySecret[row.mode]));
    const missing = prov.required.filter(n => !have.has(n));
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(row.config_json || "{}");
    } catch {
      config = {};
    }
    out.push({
      id,
      label: prov.label,
      enabled: !!row.enabled,
      mode: row.mode,
      currencyMode: row.currency_mode,
      config,
      secretNames: prov.secretNames,
      required: prov.required,
      secrets: bySecret,
      missing,
      status: missing.length ? "awaiting_credentials" : row.enabled ? "active" : "ready",
      noSandbox: !!prov.noSandbox,
      webhookUrl: `${ctx.origin}/api/webhooks/${id}`,
    });
  }
  return json({ providers: out });
}

async function providerPut(ctx: Ctx, request: Request, id: string, adminId: string): Promise<Response> {
  const prov = getProvider(ctx, id);
  const row = await loadProviderRow(ctx, id);
  if (!prov || !row || id === "mock") throw new HttpError(404, "provider_not_found");
  const b = await readJson<{ enabled?: boolean; mode?: string; currencyMode?: string; config?: Record<string, unknown> }>(request);
  const mode: ProviderMode = b.mode === "live" || b.mode === "sandbox" ? b.mode : row.mode;
  if (prov.noSandbox && mode === "sandbox") throw new HttpError(400, "no_sandbox", `${prov.label} não tem ambiente de teste; use o modo produção.`);
  const cm = b.currencyMode ?? row.currency_mode;
  if (!["USD", "BRL", "AUTO"].includes(cm)) throw new HttpError(400, "invalid_currency_mode");
  if (id === "picpay" && cm === "USD") throw new HttpError(400, "invalid_currency_mode", "PicPay só cobra em reais.");
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.config_json || "{}");
  } catch {
    config = {};
  }
  if (b.config && typeof b.config === "object") {
    for (const k of ["brand_name", "expires_minutes"]) if (k in b.config) config[k] = typeof b.config[k] === "string" ? clip(b.config[k], 60) : b.config[k];
  }
  const enabled = b.enabled === undefined ? !!row.enabled : !!b.enabled;
  if (enabled) {
    const have = await ctx.env.DB.prepare("SELECT name FROM provider_secrets WHERE provider = ?1 AND mode = ?2").bind(id, mode).all<{ name: string }>();
    const set = new Set(have.results.map(r => r.name));
    const missing = prov.required.filter(n => !set.has(n));
    if (missing.length) throw new HttpError(409, "missing_credentials", "Faltam credenciais para ligar este provedor.", { missing });
  }
  await ctx.env.DB.prepare("UPDATE providers SET enabled = ?2, mode = ?3, currency_mode = ?4, config_json = ?5, updated_at = ?6, updated_by = ?7 WHERE id = ?1")
    .bind(id, enabled ? 1 : 0, mode, cm, JSON.stringify(config), ctx.now(), adminId)
    .run();
  await audit(ctx, adminId, "provider_update", id, { enabled: !!row.enabled, mode: row.mode, currencyMode: row.currency_mode }, { enabled, mode, currencyMode: cm });
  return json({ ok: true });
}

async function providerSecretsPut(ctx: Ctx, request: Request, id: string, adminId: string): Promise<Response> {
  const b = await readJson<{ mode?: string; values?: Record<string, unknown>; clear?: string[] }>(request);
  const mode: ProviderMode = b.mode === "live" ? "live" : "sandbox";
  const touched = await saveProviderSecrets(ctx, id, mode, b.values ?? {}, Array.isArray(b.clear) ? b.clear.map(String) : [], adminId);
  // O audit registra QUAIS campos mudaram, nunca os valores.
  await audit(ctx, adminId, "provider_secrets", id, undefined, { mode, fields: touched });
  if (touched.some(t => t.startsWith("-")) || touched.length) {
    // Se faltou algo obrigatório no modo ativo, desliga para não deixar o checkout meio configurado.
    const row = await loadProviderRow(ctx, id);
    const prov = getProvider(ctx, id);
    if (row && prov && row.enabled && row.mode === mode) {
      const have = await ctx.env.DB.prepare("SELECT name FROM provider_secrets WHERE provider = ?1 AND mode = ?2").bind(id, mode).all<{ name: string }>();
      const set = new Set(have.results.map(r => r.name));
      if (prov.required.some(n => !set.has(n))) await ctx.env.DB.prepare("UPDATE providers SET enabled = 0 WHERE id = ?1").bind(id).run();
    }
  }
  return json({ ok: true, updated: touched.filter(t => !t.startsWith("-")), cleared: touched.filter(t => t.startsWith("-")).map(t => t.slice(1)) });
}

async function providerTest(ctx: Ctx, id: string, adminId: string): Promise<Response> {
  const prov = getProvider(ctx, id);
  const cfg = prov ? await loadProviderCfg(ctx, id) : null;
  if (!prov || !cfg) throw new HttpError(404, "provider_not_found");
  const missing = missingFields(prov, cfg);
  if (missing.length) return json({ ok: false, message: `Faltam credenciais: ${missing.join(", ")}`, missing });
  const r = await prov.testConnection(ctx, cfg);
  await audit(ctx, adminId, "provider_test", id, undefined, { ok: r.ok });
  return json(r);
}

async function paymentsList(ctx: Ctx, url: URL): Promise<Response> {
  const lim = pageSize(url);
  const args: unknown[] = [];
  let where = "";
  const st = url.searchParams.get("status");
  if (st && /^[a-z_]{3,20}$/.test(st)) {
    args.push(st);
    where = "WHERE status = ?1";
  }
  args.push(lim);
  const rows = await ctx.env.DB.prepare(
    `SELECT id, serial, provider, mode, status, currency, amount_cents, usd_cents, fx_rate_micro, provider_ref, provider_fee_cents, payer_email, payer_country, note, created_at, paid_at FROM payments ${where} ORDER BY created_at DESC LIMIT ?${args.length}`,
  )
    .bind(...args)
    .all<PaymentRow>();
  return json({
    items: rows.results.map(p => ({ ...p, serial: maskSerial(p.serial), payer_email: p.payer_email ? p.payer_email.replace(/^(.).*(@.*)$/, "$1•••$2") : null })),
  });
}

async function auditList(ctx: Ctx): Promise<Response> {
  const a = await ctx.env.DB.prepare("SELECT at, admin_id, action, target, after_json FROM admin_audit ORDER BY id DESC LIMIT 100").all<{ at: number; admin_id: string | null; action: string; target: string | null; after_json: string | null }>();
  const e = await ctx.env.DB.prepare("SELECT at, serial, kind, actor FROM license_events ORDER BY id DESC LIMIT 100").all<{ at: number; serial: string | null; kind: string; actor: string }>();
  return json({
    audit: a.results.map(r => ({ at: r.at, admin: r.admin_id, action: r.action, target: r.target, after: r.after_json ? JSON.parse(r.after_json) : null })),
    events: e.results.map(r => ({ at: r.at, serial: r.serial ? maskSerial(r.serial) : null, kind: r.kind, actor: r.actor })),
  });
}

async function summary(ctx: Ctx): Promise<Response> {
  const now = ctx.now();
  const q = async (sql: string, ...a: unknown[]) => (await ctx.env.DB.prepare(sql).bind(...a).first<{ n: number }>())?.n ?? 0;
  return json({
    devices: await q("SELECT COUNT(*) AS n FROM devices"),
    trialsActive: await q("SELECT COUNT(*) AS n FROM licenses WHERE type = 'trial' AND status = 'active' AND expires_at > ?1", now),
    trialsExpired: await q("SELECT COUNT(*) AS n FROM licenses WHERE type = 'trial' AND (status = 'expired' OR (status = 'active' AND expires_at <= ?1))", now),
    definitive: await q("SELECT COUNT(*) AS n FROM licenses WHERE type = 'definitive' AND status = 'active'"),
    paid: await q("SELECT COUNT(*) AS n FROM payments WHERE status = 'paid'"),
  });
}

async function purgeTest(ctx: Ctx, adminId: string): Promise<Response> {
  const t = await ctx.env.DB.prepare("SELECT serial FROM devices WHERE is_test = 1").all<{ serial: string }>();
  const serials = t.results.map(r => r.serial);
  const db = ctx.env.DB;
  for (const s of serials) {
    await db.batch([
      db.prepare("DELETE FROM webhook_events WHERE payment_id IN (SELECT id FROM payments WHERE serial = ?1)").bind(s),
      db.prepare("DELETE FROM licenses WHERE serial = ?1").bind(s),
      db.prepare("DELETE FROM payments WHERE serial = ?1").bind(s),
      db.prepare("DELETE FROM price_quotes WHERE serial = ?1").bind(s),
      db.prepare("DELETE FROM license_events WHERE serial = ?1").bind(s),
      db.prepare("DELETE FROM devices WHERE serial = ?1 AND is_test = 1").bind(s),
    ]);
  }
  await audit(ctx, adminId, "purge_test_devices", "devices", undefined, { count: serials.length });
  return json({ ok: true, removed: serials.length });
}

/** Roteador `/api/admin/*` (login/logout ficam em router.ts, fora da exigência de sessão). */
export async function adminRoute(ctx: Ctx, request: Request, path: string): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let m: Match | null;
  const need = (minRole: "viewer" | "admin" | "owner" = "viewer") => requireAdmin(ctx, request, { minRole });

  if (path === "/me" && method === "GET") {
    const a = await need();
    return json({ ok: true, csrf: a.csrf, role: a.role, email: a.email });
  }
  if (path === "/summary" && method === "GET") {
    await need();
    return summary(ctx);
  }
  if (path === "/licenses" && method === "GET") {
    await need();
    return listLicenses(ctx, url);
  }
  if (path === "/licenses/grant" && method === "POST") {
    const a = await need("admin");
    const b = await readJson<{ serial?: string; reason?: string; test?: boolean }>(request);
    const serial = normalizeSerial(String(b.serial ?? ""));
    if (!serial || String(b.serial ?? "").replace(/[^0-9a-fA-F]/g, "").length !== 16) throw new HttpError(400, "serial_invalid", "Serial inválido (16 hexadecimais).");
    await upsertDevice(ctx, serial, {});
    if (b.test) await ctx.env.DB.prepare("UPDATE devices SET is_test = 1 WHERE serial = ?1").bind(serial).run();
    const r = await createDefinitive(ctx, serial, "admin", null, `admin:${a.id}`);
    await audit(ctx, a.id, "license_grant", r.license.id, undefined, { serial: maskSerial(serial), reason: clip(b.reason, 200), created: r.created });
    if (!r.created) throw new HttpError(409, "already_definitive", "Este serial já tem licença definitiva ativa.");
    return json({ ok: true, id: r.license.id });
  }
  if ((m = path.match(/^\/licenses\/(lic_[0-9a-z]{16})$/)) && method === "GET") {
    await need();
    return licenseDetail(ctx, m[1]);
  }
  if ((m = path.match(/^\/licenses\/(lic_[0-9a-z]{16})\/(extend|revoke)$/)) && method === "POST") {
    const a = await need("admin");
    const b = await readJson<{ days?: number; reason?: string }>(request);
    const reason = clip(b.reason, 200);
    if (!reason.trim()) throw new HttpError(400, "reason_required", "Informe o motivo.");
    if (m[2] === "extend") {
      const r = await extendTrial(ctx, m[1], Number(b.days), reason, `admin:${a.id}`);
      await audit(ctx, a.id, "license_extend", r.id, undefined, { days: b.days, reason });
    } else {
      const r = await revokeLicense(ctx, m[1], reason, `admin:${a.id}`);
      await audit(ctx, a.id, "license_revoke", r.id, undefined, { reason });
    }
    return json({ ok: true });
  }
  if (path === "/pricing" && method === "GET") {
    await need();
    return pricingGet(ctx, url);
  }
  if (path === "/pricing" && method === "PUT") {
    const a = await need("admin");
    return pricingPut(ctx, request, a.id);
  }
  if (path === "/fx/manual" && method === "PUT") {
    const a = await need("admin");
    const b = await readJson<{ rate?: string | number; hours?: number }>(request);
    const rate = Number.parseFloat(String(b.rate ?? "").replace(",", "."));
    const hours = Number(b.hours ?? 24);
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 100) throw new HttpError(400, "invalid_rate");
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new HttpError(400, "invalid_hours");
    await setManualRate(ctx, Math.round(rate * 1_000_000), hours, a.id);
    await audit(ctx, a.id, "fx_manual", "fx", undefined, { rate, hours });
    return json({ ok: true });
  }
  if (path === "/settings" && method === "PUT") {
    const a = await need("owner");
    const b = await readJson<{ trialDays?: number; provisionalDays?: number; enforce?: boolean }>(request);
    const before = await getSettings(ctx);
    if (b.trialDays !== undefined) {
      const n = Number(b.trialDays);
      if (!Number.isInteger(n) || n < 1 || n > 365) throw new HttpError(400, "invalid_trial_days");
      await setSetting(ctx, "trial_days", String(n), a.id);
    }
    if (b.provisionalDays !== undefined) {
      const n = Number(b.provisionalDays);
      if (!Number.isInteger(n) || n < 0 || n > 60) throw new HttpError(400, "invalid_provisional_days");
      await setSetting(ctx, "provisional_days", String(n), a.id);
    }
    if (b.enforce !== undefined) await setSetting(ctx, "enforce", b.enforce ? "1" : "0", a.id);
    await audit(ctx, a.id, "settings_update", "settings", before, b);
    return json({ ok: true });
  }
  if (path === "/providers" && method === "GET") {
    await need();
    return providersList(ctx);
  }
  if ((m = path.match(/^\/providers\/(paypal|picpay)$/)) && method === "PUT") {
    const a = await need("owner");
    return providerPut(ctx, request, m[1], a.id);
  }
  if ((m = path.match(/^\/providers\/(paypal|picpay)\/secrets$/)) && method === "PUT") {
    const a = await need("owner");
    return providerSecretsPut(ctx, request, m[1], a.id);
  }
  if ((m = path.match(/^\/providers\/(paypal|picpay)\/test$/)) && method === "POST") {
    const a = await need("owner");
    return providerTest(ctx, m[1], a.id);
  }
  if (path === "/payments" && method === "GET") {
    await need();
    return paymentsList(ctx, url);
  }
  if ((m = path.match(/^\/payments\/(pay_[0-9a-z]{16})\/reconcile$/)) && method === "POST") {
    const a = await need("admin");
    const p = await loadPayment(ctx, m[1]);
    if (!p) throw new HttpError(404, "payment_not_found");
    const prov = getProvider(ctx, p.provider);
    const cfg = prov ? await loadProviderCfg(ctx, p.provider) : null;
    if (prov?.captureOnReturn && cfg && ["created", "pending", "approved"].includes(p.status)) {
      try {
        await prov.captureOnReturn(ctx, p, cfg);
      } catch {
        /* a conciliação abaixo informa o estado real */
      }
    }
    const r = await settlePayment(ctx, m[1]);
    await audit(ctx, a.id, "payment_reconcile", r.id, { status: p.status }, { status: r.status });
    return json({ ok: true, status: r.status });
  }
  if (path === "/audit" && method === "GET") {
    await need();
    return auditList(ctx);
  }
  if (path === "/devices/mark-test" && method === "POST") {
    const a = await need("admin");
    const b = await readJson<{ serial?: string }>(request);
    const serial = normalizeSerial(String(b.serial ?? ""));
    if (!serial) throw new HttpError(400, "serial_invalid");
    const r = await ctx.env.DB.prepare("UPDATE devices SET is_test = 1 WHERE serial = ?1").bind(serial).run();
    await audit(ctx, a.id, "device_mark_test", maskSerial(serial), undefined, { changed: r.meta.changes ?? 0 });
    return json({ ok: true, changed: r.meta.changes ?? 0 });
  }
  if (path === "/devices/purge-test" && method === "POST") {
    const a = await need("owner");
    return purgeTest(ctx, a.id);
  }
  return null;
}
