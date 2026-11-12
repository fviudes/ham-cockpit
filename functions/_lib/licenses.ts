import {
  CRL_PREFIX,
  RECEIPT_PREFIX,
  TOKEN_PREFIX,
  importPrivateKey,
  isValidCallsign,
  isValidEmail,
  normalizeCallsign,
  normalizeEmail,
  parseSerialInput,
  serialDisplay,
  signBlob,
  type CrlPayload,
  type LicensePayload,
  type LicenseType,
  type ReceiptPayload,
} from "../../shared/license";
import { ACTIVE_KID, LICENSE_KEYRING } from "../../shared/license-keys";
import { bumpCrl, enforceRate, getSettings, ipKey, licenseEvent } from "./db";
import type { Ctx } from "./env";
import { HttpError, clip, ipHash, newId } from "./util";

/** Linha de produto coberta pelas licenças emitidas hoje (`0` cobre 0.x.y). */
export const PRODUCT_LINE = "0";

export interface LicenseRow {
  id: string;
  serial: string;
  type: LicenseType;
  status: "active" | "expired" | "revoked" | "superseded";
  source: string;
  line: string;
  issued_at: number;
  starts_at: number;
  expires_at: number | null;
  kid: string;
  token: string;
  payment_id: string | null;
  revoked_at: number | null;
  revoked_reason: string | null;
  created_by: string | null;
}

const keyCache = new Map<string, CryptoKey>();

export async function signer(ctx: Ctx): Promise<{ kid: string; key: CryptoKey }> {
  const keyring = ctx.keyring ?? LICENSE_KEYRING;
  const kid = ctx.env.LICENSE_ACTIVE_KID || ACTIVE_KID;
  const entry = keyring.find(k => k.kid === kid && k.status !== "revoked");
  if (!entry) throw new HttpError(500, "signing_key_unknown", `kid ${kid} fora do chaveiro`);
  const secret = ctx.env[`LICENSE_SIGNING_KEY_${entry.label.toUpperCase()}`];
  if (typeof secret !== "string" || !secret) throw new HttpError(500, "signing_key_missing", "Chave de assinatura não configurada no portal");
  let key = keyCache.get(secret);
  if (!key) {
    key = await importPrivateKey(secret);
    keyCache.set(secret, key);
  }
  return { kid: entry.kid, key };
}

export async function issueToken(
  ctx: Ctx,
  f: { lid: string; serial: string; type: LicenseType; iat: number; exp: number | null },
): Promise<{ token: string; kid: string }> {
  const { kid, key } = await signer(ctx);
  const payload: LicensePayload = {
    v: 1,
    kid,
    lid: f.lid,
    serial: f.serial,
    type: f.type,
    iat: f.iat,
    exp: f.exp,
    line: PRODUCT_LINE,
    st: ctx.now(),
  };
  return { token: await signBlob(TOKEN_PREFIX, payload, key), kid };
}

export async function buildReceipt(ctx: Ctx, serial: string, lid: string | null): Promise<string> {
  const { kid, key } = await signer(ctx);
  const s = await getSettings(ctx);
  const p: ReceiptPayload = { v: 1, kid, serial, lid, st: ctx.now(), crl: s.crlVersion, enforce: s.enforce };
  return signBlob(RECEIPT_PREFIX, p, key);
}

export async function buildCrl(ctx: Ctx): Promise<{ crl: string; version: number }> {
  const { kid, key } = await signer(ctx);
  const s = await getSettings(ctx);
  const rows = await ctx.env.DB.prepare("SELECT id FROM licenses WHERE status = 'revoked' ORDER BY revoked_at LIMIT 5000").all<{ id: string }>();
  const p: CrlPayload = { v: 1, kid, version: s.crlVersion, st: ctx.now(), revoked: rows.results.map(r => r.id) };
  return { crl: await signBlob(CRL_PREFIX, p, key), version: s.crlVersion };
}

export async function upsertDevice(
  ctx: Ctx,
  serial: string,
  meta: {
    appVersion?: string;
    image?: string;
    model?: string;
    callsign?: string | null;
    email?: string | null;
  },
): Promise<{ blocked: boolean; reason: string | null; created: boolean }> {
  const now = ctx.now();
  const ih = await ipHash(ctx);
  const callsign = meta.callsign ? clip(meta.callsign, 16) : null;
  const email = meta.email ? clip(meta.email, 120) : null;
  const ins = await ctx.env.DB.prepare(
    "INSERT INTO devices (serial, first_seen_at, last_seen_at, last_app_version, last_image_version, model, last_country, last_ip_hash, callsign, email) VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT (serial) DO NOTHING",
  )
    .bind(
      serial,
      now,
      clip(meta.appVersion, 32) || null,
      clip(meta.image, 32) || null,
      clip(meta.model, 64) || null,
      ctx.country || null,
      ih,
      callsign,
      email,
    )
    .run();
  const created = (ins.meta.changes ?? 0) > 0;
  if (!created) {
    await ctx.env.DB.prepare(
      "UPDATE devices SET last_seen_at = ?2, last_app_version = COALESCE(?3, last_app_version), last_image_version = COALESCE(?4, last_image_version), model = COALESCE(?5, model), last_country = COALESCE(?6, last_country), last_ip_hash = ?7, callsign = COALESCE(?8, callsign), email = COALESCE(?9, email) WHERE serial = ?1",
    )
      .bind(
        serial,
        now,
        clip(meta.appVersion, 32) || null,
        clip(meta.image, 32) || null,
        clip(meta.model, 64) || null,
        ctx.country || null,
        ih,
        callsign,
        email,
      )
      .run();
  }
  const row = await ctx.env.DB.prepare("SELECT blocked, blocked_reason FROM devices WHERE serial = ?1")
    .bind(serial)
    .first<{ blocked: number; blocked_reason: string | null }>();
  return { blocked: !!row?.blocked, reason: row?.blocked_reason ?? null, created };
}

/** Escolhe a licença "vigente" do serial (definitiva ativa > revogada > trial). */
export async function currentLicense(ctx: Ctx, serial: string): Promise<LicenseRow | null> {
  const row = await ctx.env.DB.prepare(
    `SELECT * FROM licenses WHERE serial = ?1
     ORDER BY CASE WHEN type = 'definitive' AND status = 'active' THEN 0 WHEN status = 'revoked' THEN 1 WHEN type = 'trial' THEN 2 ELSE 3 END,
              issued_at DESC LIMIT 1`,
  )
    .bind(serial)
    .first<LicenseRow>();
  if (!row) return null;
  if (row.status === "active" && row.expires_at !== null && row.expires_at <= ctx.now()) {
    await ctx.env.DB.prepare("UPDATE licenses SET status = 'expired' WHERE id = ?1 AND status = 'active'").bind(row.id).run();
    return { ...row, status: "expired" };
  }
  return row;
}

/** Concede o trial de forma atômica: o índice único por serial resolve a corrida entre aparelhos. */
export async function grantTrial(ctx: Ctx, serial: string): Promise<LicenseRow> {
  const settings = await getSettings(ctx);
  const now = ctx.now();
  const lid = newId("lic");
  const exp = now + settings.trialDays * 86400;
  const { token, kid } = await issueToken(ctx, { lid, serial, type: "trial", iat: now, exp });
  const r = await ctx.env.DB.prepare(
    "INSERT INTO licenses (id, serial, type, status, source, line, issued_at, starts_at, expires_at, kid, token) VALUES (?1, ?2, 'trial', 'active', 'auto', ?3, ?4, ?4, ?5, ?6, ?7) ON CONFLICT DO NOTHING",
  )
    .bind(lid, serial, PRODUCT_LINE, now, exp, kid, token)
    .run();
  if ((r.meta.changes ?? 0) > 0) await licenseEvent(ctx, "trial_granted", "device", serial, lid, { days: settings.trialDays });
  const row = await currentLicense(ctx, serial);
  if (!row) throw new HttpError(500, "grant_failed");
  return row;
}

/** Cria a licença definitiva (pagamento ou concessão do admin). Idempotente por `payment_id`. */
export async function createDefinitive(
  ctx: Ctx,
  serial: string,
  source: "payment" | "admin" | "manual" | "migration",
  paymentId: string | null,
  actor: string,
): Promise<{ license: LicenseRow; created: boolean }> {
  const now = ctx.now();
  if (paymentId) {
    const existing = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE payment_id = ?1").bind(paymentId).first<LicenseRow>();
    if (existing) return { license: existing, created: false };
  }
  const active = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE serial = ?1 AND type = 'definitive' AND status = 'active'")
    .bind(serial)
    .first<LicenseRow>();
  if (active) return { license: active, created: false };
  const lid = newId("lic");
  const { token, kid } = await issueToken(ctx, { lid, serial, type: "definitive", iat: now, exp: null });
  const r = await ctx.env.DB.prepare(
    "INSERT INTO licenses (id, serial, type, status, source, line, issued_at, starts_at, expires_at, kid, token, payment_id, created_by) VALUES (?1, ?2, 'definitive', 'active', ?3, ?4, ?5, ?5, NULL, ?6, ?7, ?8, ?9) ON CONFLICT DO NOTHING",
  )
    .bind(lid, serial, source, PRODUCT_LINE, now, kid, token, paymentId, actor)
    .run();
  const created = (r.meta.changes ?? 0) > 0;
  if (created) {
    await licenseEvent(ctx, "definitive_issued", actor, serial, lid, { source, paymentId });
    // Data/hora da virada trial → definitiva (grid admin e cadastro do aparelho).
    // Se o pagamento trouxe e-mail e o aparelho ainda não tem, grava agora.
    let payerEmail: string | null = null;
    if (paymentId) {
      const pay = await ctx.env.DB.prepare("SELECT payer_email FROM payments WHERE id = ?1")
        .bind(paymentId)
        .first<{ payer_email: string | null }>();
      const raw = pay?.payer_email ? normalizeEmail(pay.payer_email) : "";
      payerEmail = isValidEmail(raw) ? raw : null;
    }
    await ctx.env.DB.prepare("UPDATE devices SET licensed_at = ?2, email = COALESCE(email, ?3) WHERE serial = ?1")
      .bind(serial, now, payerEmail)
      .run();
    await ctx.env.DB.prepare(
      "UPDATE licenses SET status = 'superseded' WHERE serial = ?1 AND type = 'trial' AND status = 'active' AND id <> ?2",
    )
      .bind(serial, lid)
      .run();
  }
  const row = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE id = ?1").bind(lid).first<LicenseRow>();
  if (row) return { license: row, created };
  const again = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE serial = ?1 AND type = 'definitive' AND status = 'active'").bind(serial).first<LicenseRow>();
  if (!again) throw new HttpError(500, "grant_failed");
  return { license: again, created: false };
}

export async function revokeLicense(ctx: Ctx, id: string, reason: string, actor: string): Promise<LicenseRow> {
  const row = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE id = ?1").bind(id).first<LicenseRow>();
  if (!row) throw new HttpError(404, "license_not_found");
  if (row.status === "revoked") return row;
  await ctx.env.DB.prepare("UPDATE licenses SET status = 'revoked', revoked_at = ?2, revoked_reason = ?3 WHERE id = ?1")
    .bind(id, ctx.now(), clip(reason, 200))
    .run();
  await bumpCrl(ctx, actor);
  await licenseEvent(ctx, "revoked", actor, row.serial, id, { reason: clip(reason, 200) });
  return { ...row, status: "revoked", revoked_at: ctx.now(), revoked_reason: clip(reason, 200) };
}

export async function extendTrial(ctx: Ctx, id: string, days: number, reason: string, actor: string): Promise<LicenseRow> {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, "invalid_days", "Dias entre 1 e 365");
  const row = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE id = ?1").bind(id).first<LicenseRow>();
  if (!row) throw new HttpError(404, "license_not_found");
  if (row.type !== "trial") throw new HttpError(409, "not_trial", "Só trial pode ser estendido");
  if (row.status === "revoked") throw new HttpError(409, "revoked", "Licença revogada não pode ser estendida");
  const now = ctx.now();
  const base = row.expires_at !== null && row.expires_at > now ? row.expires_at : now;
  const exp = base + days * 86400;
  const { token, kid } = await issueToken(ctx, { lid: row.id, serial: row.serial, type: "trial", iat: row.issued_at, exp });
  await ctx.env.DB.prepare("UPDATE licenses SET expires_at = ?2, token = ?3, kid = ?4, status = 'active' WHERE id = ?1")
    .bind(id, exp, token, kid)
    .run();
  await licenseEvent(ctx, "extended", actor, row.serial, id, { days, reason: clip(reason, 200), exp });
  return { ...row, expires_at: exp, token, kid, status: "active" };
}

export interface ActivateBody {
  serial?: string;
  chk?: string;
  appVersion?: string;
  image?: string;
  model?: string;
  lid?: string;
  nonce?: string;
  /** Prefixo/indicativo do operador (metadado; serial continua a chave). */
  callsign?: string;
  prefix?: string;
  /** E-mail do operador (obrigatório em activate). */
  email?: string;
}

export type LicStatus = "trial" | "definitive" | "expired" | "revoked";

export interface ActivateResponse {
  ok: true;
  status: LicStatus;
  license: { token: string; type: LicenseType; exp: number | null; lid: string } | null;
  changed: boolean;
  receipt: string;
  crlVersion: number;
  policy: { enforce: boolean };
  serverTime: number;
  serialDisplay: string;
}

/** `POST /api/lic/activate` e `/api/lic/sync` (mesmo caminho, idempotente). */
export async function activate(ctx: Ctx, body: ActivateBody, mode: "activate" | "sync"): Promise<ActivateResponse> {
  const parsed = await parseSerialInput(String(body.serial ?? ""), body.chk);
  if (!parsed.ok) throw new HttpError(400, parsed.error, parsed.error === "serial_check_failed" ? "Serial com dígito verificador inválido" : "Serial inválido");
  const serial = parsed.serial;
  const ik = await ipKey(ctx);
  if (mode === "activate") {
    await enforceRate(ctx, "lic-act-ip", ik, 10, 60);
    await enforceRate(ctx, "lic-act-serial", serial, 20, 3600);
  } else {
    await enforceRate(ctx, "lic-sync-ip", ik, 60, 3600);
    await enforceRate(ctx, "lic-sync-serial", serial, 30, 3600);
  }

  const rawCall = typeof body.callsign === "string" ? body.callsign : typeof body.prefix === "string" ? body.prefix : "";
  const callsign = normalizeCallsign(rawCall);
  const callMeta = callsign && isValidCallsign(callsign) ? callsign : null;
  const emailRaw = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const emailMeta = isValidEmail(emailRaw) ? emailRaw : null;
  if (mode === "activate" && !emailMeta) {
    throw new HttpError(400, "email_required", "Informe um e-mail válido.");
  }
  const dev = await upsertDevice(ctx, serial, {
    appVersion: body.appVersion,
    image: body.image,
    model: body.model,
    callsign: callMeta,
    email: emailMeta,
  });
  if (dev.blocked) throw new HttpError(403, "device_blocked", "Este serial está bloqueado. Fale com o suporte.");

  let row = await currentLicense(ctx, serial);
  if (!row) row = await grantTrial(ctx, serial);
  if (mode === "activate") {
    await licenseEvent(ctx, "activate", "device", serial, row.id, {
      callsign: callMeta,
      email: emailMeta,
    });
  }
  if (mode === "sync") await licenseEvent(ctx, "sync", "device", serial, row.id);

  const settings = await getSettings(ctx);
  const status: LicStatus =
    row.status === "revoked" ? "revoked" : row.type === "definitive" ? "definitive" : row.status === "expired" ? "expired" : "trial";
  const changed = !body.lid || body.lid !== row.id || (mode === "sync" && body.nonce === "force");
  return {
    ok: true,
    status,
    license:
      status === "revoked"
        ? null
        : { token: row.token, type: row.type, exp: row.expires_at, lid: row.id },
    changed,
    receipt: await buildReceipt(ctx, serial, row.id),
    crlVersion: settings.crlVersion,
    policy: { enforce: settings.enforce },
    serverTime: ctx.now(),
    serialDisplay: await serialDisplay(serial),
  };
}
