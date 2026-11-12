import type { Ctx } from "../env";
import { HttpError, centsToDecimal, decimalToCents } from "../util";
import type { CheckoutExtra, CheckoutResult, NormalizedState, NormalizedStatus, PaymentProvider, PaymentRow, ProviderCfg, VerifiedEvent } from "./types";

/**
 * PayPal Orders v2 + webhooks (fonte: developer.paypal.com/docs/api/orders/v2/).
 * Bases: sandbox https://api-m.sandbox.paypal.com · produção https://api-m.paypal.com
 */
export function paypalBase(mode: string): string {
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

const tokenCache = new Map<string, { token: string; exp: number }>();
export function clearPaypalTokenCache(): void {
  tokenCache.clear();
}

async function accessToken(ctx: Ctx, cfg: ProviderCfg, force = false): Promise<string> {
  const id = cfg.secrets.client_id;
  const secret = cfg.secrets.client_secret;
  if (!id || !secret) throw new HttpError(409, "provider_not_configured", "PayPal sem client_id/client_secret");
  const base = paypalBase(cfg.row.mode);
  const key = `${base}|${id}`;
  const hit = tokenCache.get(key);
  if (!force && hit && hit.exp > ctx.now() + 30) return hit.token;
  const res = await ctx.fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${id}:${secret}`)}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new HttpError(502, "paypal_auth_failed", `PayPal recusou as credenciais (HTTP ${res.status})`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new HttpError(502, "paypal_auth_failed", "Resposta de autenticação sem token");
  tokenCache.set(key, { token: j.access_token, exp: ctx.now() + (j.expires_in ?? 300) });
  return j.access_token;
}

/** Chamada autenticada; em 401 renova o token e repete uma vez. */
async function api(ctx: Ctx, cfg: ProviderCfg, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const base = paypalBase(cfg.row.mode);
  const send = async (force: boolean) =>
    ctx.fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await accessToken(ctx, cfg, force)}`,
        "content-type": "application/json",
        accept: "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  return res;
}

interface PpOrder {
  id?: string;
  status?: string;
  links?: Array<{ rel: string; href: string }>;
  payer?: { email_address?: string; address?: { country_code?: string } };
  purchase_units?: Array<{
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: Array<{ id?: string; status?: string; custom_id?: string; amount?: { currency_code?: string; value?: string }; seller_receivable_breakdown?: { paypal_fee?: { value?: string } } }> };
  }>;
}

function mapOrder(order: PpOrder): NormalizedStatus {
  const unit = order.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  const payerEmail = order.payer?.email_address;
  const payerCountry = order.payer?.address?.country_code;
  if (cap) {
    const map: Record<string, NormalizedState> = {
      COMPLETED: "paid",
      PENDING: "pending",
      DECLINED: "failed",
      FAILED: "failed",
      REFUNDED: "refunded",
      PARTIALLY_REFUNDED: "partially_refunded",
    };
    return {
      status: map[cap.status ?? ""] ?? "pending",
      amountCents: cap.amount?.value ? (decimalToCents(cap.amount.value) ?? undefined) : undefined,
      currency: cap.amount?.currency_code === "BRL" ? "BRL" : cap.amount?.currency_code === "USD" ? "USD" : undefined,
      captureId: cap.id,
      customId: cap.custom_id ?? unit?.custom_id,
      payerEmail,
      payerCountry,
      feeCents: cap.seller_receivable_breakdown?.paypal_fee?.value ? (decimalToCents(cap.seller_receivable_breakdown.paypal_fee.value) ?? undefined) : undefined,
    };
  }
  const map2: Record<string, NormalizedState> = { APPROVED: "approved", CREATED: "pending", SAVED: "pending", PAYER_ACTION_REQUIRED: "pending", VOIDED: "failed", COMPLETED: "pending" };
  return {
    status: map2[order.status ?? ""] ?? "pending",
    amountCents: unit?.amount?.value ? (decimalToCents(unit.amount.value) ?? undefined) : undefined,
    currency: unit?.amount?.currency_code === "BRL" ? "BRL" : unit?.amount?.currency_code === "USD" ? "USD" : undefined,
    customId: unit?.custom_id,
    payerEmail,
    payerCountry,
  };
}

export const paypal: PaymentProvider = {
  id: "paypal",
  label: "PayPal",
  secretNames: ["client_id", "client_secret", "webhook_id"],
  hintable: ["client_id", "webhook_id"],
  required: ["client_id", "client_secret", "webhook_id"],

  async createCheckout(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg, x: CheckoutExtra): Promise<CheckoutResult> {
    const brand = typeof cfg.config.brand_name === "string" && cfg.config.brand_name ? cfg.config.brand_name : "Ham Cockpit";
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "hc-license",
          custom_id: p.id,
          invoice_id: p.id,
          description: `Ham Cockpit - licença definitiva (serial ${x.serialDisplay})`.slice(0, 120),
          amount: { currency_code: p.currency, value: centsToDecimal(p.amount_cents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: brand,
            locale: p.lang === "en" ? "en-US" : "pt-BR",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: x.returnUrl,
            cancel_url: x.cancelUrl,
          },
        },
      },
    };
    const res = await api(ctx, cfg, "POST", "/v2/checkout/orders", body, { "PayPal-Request-Id": p.id, Prefer: "return=representation" });
    if (!res.ok) {
      const t = (await res.text()).slice(0, 300);
      throw new HttpError(502, "paypal_create_failed", `PayPal recusou o pedido (HTTP ${res.status})`, { detail: t });
    }
    const order = (await res.json()) as PpOrder;
    const link = order.links?.find(l => l.rel === "payer-action") ?? order.links?.find(l => l.rel === "approve");
    if (!order.id || !link) throw new HttpError(502, "paypal_create_failed", "Resposta do PayPal sem link de aprovação");
    return { redirectUrl: link.href, providerRef: order.id };
  },

  async captureOnReturn(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg): Promise<void> {
    if (!p.provider_ref) return;
    const res = await api(ctx, cfg, "POST", `/v2/checkout/orders/${encodeURIComponent(p.provider_ref)}/capture`, {}, { "PayPal-Request-Id": `cap-${p.id}` });
    if (res.ok) return;
    const text = await res.text();
    // Já capturado (retorno repetido ou webhook chegou antes): sucesso idempotente.
    if (res.status === 422 && text.includes("ORDER_ALREADY_CAPTURED")) return;
    // Ainda não aprovado pelo comprador: o status acusa pendente, sem erro.
    if (res.status === 422 && text.includes("ORDER_NOT_APPROVED")) return;
    throw new HttpError(502, "paypal_capture_failed", `Falha ao capturar no PayPal (HTTP ${res.status})`);
  },

  async fetchStatus(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg): Promise<NormalizedStatus> {
    if (!p.provider_ref) return { status: "created" };
    const res = await api(ctx, cfg, "GET", `/v2/checkout/orders/${encodeURIComponent(p.provider_ref)}`);
    if (!res.ok) throw new HttpError(502, "paypal_status_failed", `Falha ao consultar o PayPal (HTTP ${res.status})`);
    return mapOrder((await res.json()) as PpOrder);
  },

  async verifyWebhook(ctx: Ctx, req, cfg: ProviderCfg): Promise<VerifiedEvent | null> {
    const h = req.headers;
    const webhookId = cfg.secrets.webhook_id;
    const needed = ["paypal-transmission-id", "paypal-transmission-time", "paypal-transmission-sig", "paypal-cert-url", "paypal-auth-algo"];
    if (!webhookId || needed.some(n => !h.get(n))) return null;
    let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
    try {
      event = JSON.parse(req.body);
    } catch {
      return null;
    }
    if (!event?.id || !event.event_type) return null;
    const res = await api(ctx, cfg, "POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo: h.get("paypal-auth-algo"),
      cert_url: h.get("paypal-cert-url"),
      transmission_id: h.get("paypal-transmission-id"),
      transmission_sig: h.get("paypal-transmission-sig"),
      transmission_time: h.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    });
    if (!res.ok) return null;
    const v = (await res.json()) as { verification_status?: string };
    if (v.verification_status !== "SUCCESS") return null;

    const r = (event.resource ?? {}) as {
      id?: string;
      custom_id?: string;
      invoice_id?: string;
      purchase_units?: Array<{ custom_id?: string }>;
      supplementary_data?: { related_ids?: { order_id?: string } };
      disputed_transactions?: Array<{ seller_transaction_id?: string }>;
    };
    const t = event.event_type;
    const paymentId = r.custom_id || r.invoice_id || r.purchase_units?.[0]?.custom_id;
    const isOrder = t.startsWith("CHECKOUT.ORDER.");
    const providerRef = r.supplementary_data?.related_ids?.order_id || (isOrder ? r.id : undefined);
    const captureId = t.startsWith("PAYMENT.CAPTURE.") ? r.id : r.disputed_transactions?.[0]?.seller_transaction_id;
    const action =
      t === "CHECKOUT.ORDER.APPROVED"
        ? "capture_then_settle"
        : t === "PAYMENT.CAPTURE.COMPLETED" || t === "PAYMENT.CAPTURE.PENDING" || t === "PAYMENT.CAPTURE.DENIED"
          ? "settle"
          : t === "PAYMENT.CAPTURE.REFUNDED"
            ? "refund"
            : t === "PAYMENT.CAPTURE.REVERSED"
              ? "chargeback"
              : t === "CUSTOMER.DISPUTE.CREATED"
                ? "dispute"
                : "ignore";
    return { eventId: event.id, type: t, action, paymentId, providerRef, captureId };
  },

  async testConnection(ctx: Ctx, cfg: ProviderCfg) {
    try {
      await accessToken(ctx, cfg, true);
      return { ok: true, message: `Autenticou no PayPal (${cfg.row.mode === "live" ? "produção" : "sandbox"}).` };
    } catch (e) {
      return { ok: false, message: e instanceof HttpError ? e.message : "Falha ao falar com o PayPal." };
    }
  },
};
