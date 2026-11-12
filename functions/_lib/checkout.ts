import { parseSerialInput, serialDisplay } from "../../shared/license";
import { audit, bumpCrl, enforceRate, ipKey, licenseEvent, rateLimit } from "./db";
import type { Ctx } from "./env";
import { createDefinitive, currentLicense, upsertDevice, type LicenseRow } from "./licenses";
import { createQuote, previewPrice, getPrice } from "./pricing";
import { getProvider, loadProviderCfg, missingFields } from "./providers";
import type { Currency, NormalizedStatus, PaymentRow, ProviderCfg } from "./providers/types";
import { HttpError, errorJson, json, newId } from "./util";

const FINAL = new Set(["refunded", "chargeback"]);
const OPEN = ["created", "pending", "approved"] as const;
const PAYMENT_TTL = 30 * 60;

export async function loadPayment(ctx: Ctx, pid: string): Promise<PaymentRow | null> {
  if (!/^pay_[0-9a-z]{16}$/.test(pid)) return null;
  return ctx.env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(pid).first<PaymentRow>();
}

function providerCurrency(mode: "USD" | "BRL" | "AUTO", ctx: Ctx, lang: string): Currency {
  if (mode === "USD") return "USD";
  if (mode === "BRL") return "BRL";
  return ctx.country === "BR" || (!ctx.country && lang === "pt") ? "BRL" : "USD";
}

/** Provedores que o comprador pode usar agora (habilitados e com credenciais completas). */
async function availableProviders(ctx: Ctx, lang: string) {
  const out: Array<{ id: string; label: string; currency: Currency; needsBuyer: boolean; noSandbox: boolean; mode: string }> = [];
  const rows = await ctx.env.DB.prepare("SELECT id FROM providers WHERE enabled = 1 ORDER BY sort_order").all<{ id: string }>();
  const ids = rows.results.map(r => r.id);
  if (ctx.env.ENABLE_MOCK_PROVIDER === "1") ids.push("mock");
  for (const id of ids) {
    const prov = getProvider(ctx, id);
    if (!prov) continue;
    const cfg = await loadProviderCfg(ctx, id);
    if (!cfg || missingFields(prov, cfg).length) continue;
    out.push({
      id,
      label: prov.label,
      currency: providerCurrency(cfg.row.currency_mode, ctx, lang),
      needsBuyer: !!prov.needsBuyer,
      noSandbox: !!prov.noSandbox,
      mode: cfg.row.mode,
    });
  }
  return out;
}

export async function checkoutConfig(ctx: Ctx, url: URL): Promise<Response> {
  await enforceRate(ctx, "co-config", await ipKey(ctx), 90, 3600);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "pt";
  const parsed = await parseSerialInput(url.searchParams.get("serial") ?? "", url.searchParams.get("chk") ?? undefined);
  const providers = await availableProviders(ctx, lang);
  if (!parsed.ok) return json({ serial: { valid: false, error: parsed.error }, providers, noRefund: true });
  const lic = await currentLicense(ctx, parsed.serial);
  const price = await getPrice(ctx);
  return json({
    serial: { valid: true, display: await serialDisplay(parsed.serial), checked: parsed.checked },
    alreadyLicensed: lic?.type === "definitive" && lic.status === "active",
    priceConfigured: !!price,
    providers,
    noRefund: true,
  });
}

export async function checkoutQuote(ctx: Ctx, body: { serial?: string; chk?: string }): Promise<Response> {
  await enforceRate(ctx, "co-quote", await ipKey(ctx), 30, 3600);
  const parsed = await parseSerialInput(String(body.serial ?? ""), body.chk);
  if (!parsed.ok) throw new HttpError(400, parsed.error, "Serial inválido");
  const q = await createQuote(ctx, parsed.serial);
  return json({ ...q, serialDisplay: await serialDisplay(parsed.serial), noRefund: true });
}

interface QuoteRow {
  id: string;
  serial: string;
  usd_cents: number;
  fx_rate_micro: number | null;
  brl_cents: number | null;
  expires_at: number;
  used_payment_id: string | null;
}

export async function checkoutStart(
  ctx: Ctx,
  body: {
    quoteId?: string;
    provider?: string;
    email?: string;
    lang?: string;
    acceptNoRefund?: boolean;
    buyer?: { firstName?: string; lastName?: string; document?: string; email?: string; phone?: string };
  },
): Promise<Response> {
  await enforceRate(ctx, "co-start", await ipKey(ctx), 15, 3600);
  const lang: "pt" | "en" = body.lang === "en" ? "en" : "pt";
  if (body.acceptNoRefund !== true) throw new HttpError(400, "no_refund_not_accepted", "É preciso aceitar a política de ausência de reembolso.");
  const quote = await ctx.env.DB.prepare("SELECT id, serial, usd_cents, fx_rate_micro, brl_cents, expires_at, used_payment_id FROM price_quotes WHERE id = ?1")
    .bind(String(body.quoteId ?? ""))
    .first<QuoteRow>();
  if (!quote) throw new HttpError(404, "quote_not_found", "Cotação não encontrada. Recarregue a página.");
  if (quote.expires_at <= ctx.now()) throw new HttpError(409, "quote_expired", "A cotação expirou. Recarregue a página para ver o valor atual.");
  if (quote.used_payment_id) throw new HttpError(409, "quote_used", "Esta cotação já foi usada. Recarregue a página.");

  const prov = getProvider(ctx, String(body.provider ?? ""));
  const cfg = prov ? await loadProviderCfg(ctx, prov.id) : null;
  if (!prov || !cfg || (!cfg.row.enabled && prov.id !== "mock") || missingFields(prov, cfg).length) {
    throw new HttpError(409, "provider_unavailable", "Forma de pagamento indisponível.");
  }
  const currency = providerCurrency(cfg.row.currency_mode, ctx, lang);
  const amount = currency === "USD" ? quote.usd_cents : quote.brl_cents;
  if (!amount) throw new HttpError(409, "brl_unavailable", "Pagamento em reais indisponível agora (cotação). Tente de novo mais tarde.");

  const dev = await upsertDevice(ctx, quote.serial, {});
  if (dev.blocked) throw new HttpError(403, "device_blocked", "Este serial está bloqueado.");
  const lic = await currentLicense(ctx, quote.serial);
  if (lic?.type === "definitive" && lic.status === "active") throw new HttpError(409, "already_licensed", "Este serial já tem licença definitiva.");

  const email = typeof body.email === "string" && /^[^\s@]{1,64}@[^\s@]{1,200}$/.test(body.email.trim()) ? body.email.trim().slice(0, 120) : null;
  const now = ctx.now();
  const pid = newId("pay");
  const claim = await ctx.env.DB.prepare("UPDATE price_quotes SET used_payment_id = ?2 WHERE id = ?1 AND used_payment_id IS NULL").bind(quote.id, pid).run();
  if ((claim.meta.changes ?? 0) === 0) throw new HttpError(409, "quote_used", "Esta cotação já foi usada. Recarregue a página.");
  await ctx.env.DB.prepare(
    "INSERT INTO payments (id, serial, provider, mode, status, quote_id, currency, amount_cents, usd_cents, fx_rate_micro, payer_email, payer_country, lang, created_at, updated_at, expires_at) VALUES (?1, ?2, ?3, ?4, 'created', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14)",
  )
    .bind(pid, quote.serial, prov.id, cfg.row.mode, quote.id, currency, amount, quote.usd_cents, currency === "BRL" ? quote.fx_rate_micro : null, email, ctx.country || null, lang, now, now + PAYMENT_TTL)
    .run();
  const payment = (await loadPayment(ctx, pid))!;
  try {
    const result = await prov.createCheckout(ctx, payment, cfg, {
      returnUrl: `${ctx.origin}/api/checkout/return?pid=${pid}`,
      cancelUrl: `${ctx.origin}/comprar?serial=${quote.serial}&cancel=1&lang=${lang}`,
      serialDisplay: await serialDisplay(quote.serial),
      email: email ?? undefined,
      buyer: body.buyer,
    });
    await ctx.env.DB.prepare("UPDATE payments SET status = 'pending', provider_ref = ?2, updated_at = ?3, expires_at = COALESCE(?4, expires_at) WHERE id = ?1")
      .bind(pid, result.providerRef, ctx.now(), result.expiresAt ?? null)
      .run();
    await licenseEvent(ctx, "checkout_started", `device-buyer`, quote.serial, null, { pid, provider: prov.id, currency, amount });
    return json({ paymentId: pid, redirectUrl: result.redirectUrl ?? null, qr: result.qr ?? null, currency, amountCents: amount });
  } catch (e) {
    await ctx.env.DB.prepare("UPDATE payments SET status = 'failed', note = ?2, updated_at = ?3 WHERE id = ?1").bind(pid, "create_failed", ctx.now()).run();
    await ctx.env.DB.prepare("UPDATE price_quotes SET used_payment_id = NULL WHERE id = ?1 AND used_payment_id = ?2").bind(quote.id, pid).run();
    throw e;
  }
}

function sameAmount(p: PaymentRow, ns: NormalizedStatus): boolean {
  if (ns.amountCents !== undefined && ns.amountCents !== p.amount_cents) return false;
  if (ns.currency !== undefined && ns.currency !== p.currency) return false;
  if (ns.customId !== undefined && ns.customId !== p.id) return false;
  return true;
}

async function setStatus(ctx: Ctx, pid: string, status: string, from: readonly string[], note?: string): Promise<number> {
  const marks = from.map((_, i) => `?${i + 4}`).join(",");
  const r = await ctx.env.DB.prepare(`UPDATE payments SET status = ?2, updated_at = ?3${note ? `, note = '${note.replace(/[^a-z_:0-9]/g, "")}'` : ""} WHERE id = ?1 AND status IN (${marks})`)
    .bind(pid, status, ctx.now(), ...from)
    .run();
  return r.meta.changes ?? 0;
}

/** Revoga a licença definitiva ligada a um pagamento (reembolso/chargeback) e publica na CRL. */
async function revokeForPayment(ctx: Ctx, p: PaymentRow, reason: string): Promise<void> {
  const lic = await ctx.env.DB.prepare("SELECT * FROM licenses WHERE payment_id = ?1").bind(p.id).first<LicenseRow>();
  if (!lic || lic.status === "revoked") return;
  await ctx.env.DB.prepare("UPDATE licenses SET status = 'revoked', revoked_at = ?2, revoked_reason = ?3 WHERE id = ?1").bind(lic.id, ctx.now(), reason).run();
  await bumpCrl(ctx, `provider:${p.provider}`);
  await licenseEvent(ctx, "refund_revoked", `provider:${p.provider}`, p.serial, lic.id, { reason, pid: p.id });
}

/**
 * Concilia um pagamento com o provedor (fonte da verdade) e aplica o efeito. IDEMPOTENTE:
 * retorno do comprador, webhook e botão "Reconciliar" do admin chamam a mesma função.
 * Licença definitiva só nasce aqui, depois de conferir valor, moeda e `custom_id`.
 */
export async function settlePayment(ctx: Ctx, pid: string): Promise<PaymentRow> {
  const p0 = await loadPayment(ctx, pid);
  if (!p0) throw new HttpError(404, "payment_not_found");
  if (FINAL.has(p0.status) || p0.status === "failed" || p0.status === "cancelled") return p0;
  const prov = getProvider(ctx, p0.provider);
  const cfg = prov ? await loadProviderCfg(ctx, prov.id) : null;
  if (!prov || !cfg) throw new HttpError(409, "provider_unavailable");

  const ns = await prov.fetchStatus(ctx, p0, cfg);

  if (["paid", "refunded", "partially_refunded", "chargeback"].includes(ns.status) && !sameAmount(p0, ns)) {
    await setStatus(ctx, pid, "failed", [...OPEN, "paid"], "mismatch");
    await licenseEvent(ctx, "payment_mismatch", `provider:${p0.provider}`, p0.serial, null, { pid, expected: [p0.amount_cents, p0.currency], got: [ns.amountCents, ns.currency, ns.customId] });
    return (await loadPayment(ctx, pid))!;
  }

  switch (ns.status) {
    case "paid": {
      if (OPEN.includes(p0.status as (typeof OPEN)[number])) {
        const r = await ctx.env.DB.prepare(
          "UPDATE payments SET status = 'paid', paid_at = ?2, updated_at = ?2, provider_capture_id = COALESCE(?3, provider_capture_id), provider_fee_cents = COALESCE(?4, provider_fee_cents), payer_email = COALESCE(payer_email, ?5), payer_country = COALESCE(payer_country, ?6) WHERE id = ?1 AND status IN ('created','pending','approved')",
        )
          .bind(pid, ctx.now(), ns.captureId ?? null, ns.feeCents ?? null, ns.payerEmail ?? null, ns.payerCountry ?? null)
          .run();
        if ((r.meta.changes ?? 0) > 0) await licenseEvent(ctx, "payment_paid", `provider:${p0.provider}`, p0.serial, null, { pid });
      }
      // Idempotente por payment_id: repetir não duplica (também repara falha entre o UPDATE e o INSERT).
      const p1 = (await loadPayment(ctx, pid))!;
      if (p1.status === "paid") await createDefinitive(ctx, p1.serial, "payment", pid, `provider:${p1.provider}`);
      break;
    }
    case "approved":
    case "pending":
      if (p0.status === "created") await setStatus(ctx, pid, ns.status, ["created"]);
      else if (p0.status === "pending" && ns.status === "approved") await setStatus(ctx, pid, "approved", ["pending"]);
      break;
    case "failed":
    case "expired":
      await setStatus(ctx, pid, ns.status, OPEN);
      break;
    case "refunded":
    case "chargeback": {
      const changed = await setStatus(ctx, pid, ns.status, ["paid", "partially_refunded"]);
      if (changed) await revokeForPayment(ctx, p0, ns.status);
      break;
    }
    case "partially_refunded":
      if ((await setStatus(ctx, pid, "partially_refunded", ["paid"])) > 0) {
        await licenseEvent(ctx, "partial_refund_alert", `provider:${p0.provider}`, p0.serial, null, { pid });
      }
      break;
    default:
      break;
  }
  return (await loadPayment(ctx, pid))!;
}

/** Retorno do comprador do provedor: captura (PayPal), concilia e manda para a página de resultado. */
export async function checkoutReturn(ctx: Ctx, url: URL): Promise<Response> {
  const pid = url.searchParams.get("pid") ?? "";
  const p = await loadPayment(ctx, pid);
  const back = (extra = "") => new Response(null, { status: 302, headers: { location: `${ctx.origin}/comprar/retorno?pid=${encodeURIComponent(pid)}${extra}`, "cache-control": "no-store" } });
  if (!p) return back("&error=not_found");
  if (!(await rateLimit(ctx, "co-return", pid, 30, 3600))) return back();
  try {
    const prov = getProvider(ctx, p.provider);
    const cfg = prov ? await loadProviderCfg(ctx, prov.id) : null;
    if (prov?.captureOnReturn && cfg && OPEN.includes(p.status as (typeof OPEN)[number])) await prov.captureOnReturn(ctx, p, cfg);
    await settlePayment(ctx, pid);
  } catch {
    // O webhook e a conciliação preguiçosa terminam o serviço; a página de resultado mostra "aguardando".
  }
  return back();
}

export async function checkoutStatus(ctx: Ctx, url: URL): Promise<Response> {
  const pid = url.searchParams.get("pid") ?? "";
  const p = await loadPayment(ctx, pid);
  if (!p) return errorJson(404, "payment_not_found", "Pagamento não encontrado");
  await enforceRate(ctx, "co-status", pid, 240, 3600);
  let cur = p;
  // Conciliação preguiçosa (sem cron): no máximo 1 consulta ao provedor a cada 10 s por pagamento.
  if (OPEN.includes(p.status as (typeof OPEN)[number]) && (await rateLimit(ctx, "co-recon", pid, 1, 10))) {
    try {
      cur = await settlePayment(ctx, pid);
    } catch {
      cur = (await loadPayment(ctx, pid)) ?? p;
    }
  }
  let license: { token: string; lid: string } | null = null;
  if (cur.status === "paid") {
    const lic = await ctx.env.DB.prepare("SELECT id, token, status FROM licenses WHERE payment_id = ?1").bind(pid).first<{ id: string; token: string; status: string }>();
    if (lic && lic.status === "active") license = { token: lic.token, lid: lic.id };
  }
  return json({
    status: cur.status,
    currency: cur.currency,
    amountCents: cur.amount_cents,
    serialDisplay: await serialDisplay(cur.serial),
    license,
  });
}

/** Webhook de provedor: valida assinatura, grava o evento (idempotência) e concilia. */
export async function handleWebhook(ctx: Ctx, providerId: string, request: Request): Promise<Response> {
  const prov = getProvider(ctx, providerId);
  const cfg: ProviderCfg | null = prov ? await loadProviderCfg(ctx, providerId) : null;
  if (!prov || !cfg) return errorJson(404, "provider_not_found");
  const body = await request.text();
  if (body.length > 65536) return errorJson(413, "payload_too_large");
  await enforceRate(ctx, "webhook", await ipKey(ctx), 600, 3600);
  const ev = await prov.verifyWebhook(ctx, { headers: request.headers, body }, cfg);
  if (!ev) return errorJson(401, "invalid_signature", "Assinatura do webhook inválida");

  const ins = await ctx.env.DB.prepare("INSERT OR IGNORE INTO webhook_events (provider, event_id, event_type, received_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(providerId, ev.eventId, ev.type, ctx.now())
    .run();
  if ((ins.meta.changes ?? 0) === 0) {
    const prev = await ctx.env.DB.prepare("SELECT status FROM webhook_events WHERE provider = ?1 AND event_id = ?2").bind(providerId, ev.eventId).first<{ status: string }>();
    if (prev?.status !== "error") return json({ ok: true, duplicate: true });
    await ctx.env.DB.prepare("UPDATE webhook_events SET status = 'received', error = NULL WHERE provider = ?1 AND event_id = ?2").bind(providerId, ev.eventId).run();
  }

  const finish = async (status: "ok" | "ignored" | "error", paymentId: string | null, error?: string) => {
    await ctx.env.DB.prepare("UPDATE webhook_events SET status = ?3, processed_at = ?4, payment_id = ?5, error = ?6 WHERE provider = ?1 AND event_id = ?2")
      .bind(providerId, ev.eventId, status, ctx.now(), paymentId, error ? error.slice(0, 200) : null)
      .run();
  };

  try {
    let pid = ev.paymentId && /^pay_[0-9a-z]{16}$/.test(ev.paymentId) ? ev.paymentId : null;
    if (pid && !(await loadPayment(ctx, pid))) pid = null;
    if (!pid && ev.providerRef) {
      pid = (await ctx.env.DB.prepare("SELECT id FROM payments WHERE provider = ?1 AND provider_ref = ?2").bind(providerId, ev.providerRef).first<{ id: string }>())?.id ?? null;
    }
    if (!pid && ev.captureId) {
      pid = (await ctx.env.DB.prepare("SELECT id FROM payments WHERE provider = ?1 AND provider_capture_id = ?2").bind(providerId, ev.captureId).first<{ id: string }>())?.id ?? null;
    }
    if (!pid) {
      await finish("ignored", null, "payment_not_found");
      return json({ ok: true, ignored: true });
    }
    if (ev.action === "ignore") {
      await finish("ignored", pid);
      return json({ ok: true, ignored: true });
    }
    if (ev.action === "dispute") {
      const p = await loadPayment(ctx, pid);
      await licenseEvent(ctx, "dispute_alert", `provider:${providerId}`, p?.serial ?? null, null, { pid, type: ev.type });
      await audit(ctx, null, "provider_dispute", pid, undefined, { type: ev.type });
      await finish("ok", pid);
      return json({ ok: true });
    }
    if (ev.action === "capture_then_settle") {
      const p = await loadPayment(ctx, pid);
      if (p && prov.captureOnReturn && OPEN.includes(p.status as (typeof OPEN)[number])) await prov.captureOnReturn(ctx, p, cfg);
    }
    await settlePayment(ctx, pid);
    await finish("ok", pid);
    return json({ ok: true });
  } catch (e) {
    // Falha nossa/transitória: apaga o registro para o provedor reenviar e reprocessarmos.
    await ctx.env.DB.prepare("DELETE FROM webhook_events WHERE provider = ?1 AND event_id = ?2").bind(providerId, ev.eventId).run();
    return errorJson(500, "webhook_failed", e instanceof HttpError ? e.message : "Falha ao processar");
  }
}

export { previewPrice };
