import type { Ctx } from "../env";
import { HttpError, centsToDecimal, safeEqual } from "../util";
import type { CheckoutExtra, CheckoutResult, NormalizedState, NormalizedStatus, PaymentProvider, PaymentRow, ProviderCfg, VerifiedEvent } from "./types";

/**
 * PicPay · Carteira PicPay E-commerce (API pública v2). Fontes revalidadas em 2026-11-12:
 *  - https://developers-business.picpay.com/wallet/checkout/guides/accepting-payments
 *  - https://developers-business.picpay.com/wallet/checkout/guides/order-status
 *  - https://developers-business.picpay.com/wallet/checkout/authentication
 *  - https://developers-business.picpay.com/wallet/en/checkout/guides/cancel-order
 *
 * A documentação diz que NÃO há sandbox para este produto: testes ocorrem em produção, com valor mínimo e estorno.
 * O produto "API de Checkout" (que tem sandbox) não pôde ser validado (documentação respondeu 403) e NÃO é usado.
 * O esquema exato da resposta de status não aparece no guia; o adaptador lê `status`, `authorizationId` e, se vier, `value`.
 */
export const PICPAY_API = "https://api.picpay.com";

const tokenCache = new Map<string, { token: string; exp: number }>();
export function clearPicpayTokenCache(): void {
  tokenCache.clear();
}

async function accessToken(ctx: Ctx, cfg: ProviderCfg, force = false): Promise<string> {
  const id = cfg.secrets.client_id;
  const secret = cfg.secrets.client_secret;
  if (!id || !secret) throw new HttpError(409, "provider_not_configured", "PicPay sem client_id/client_secret");
  const hit = tokenCache.get(id);
  if (!force && hit && hit.exp > ctx.now() + 20) return hit.token;
  const res = await ctx.fetch(`${PICPAY_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new HttpError(502, "picpay_auth_failed", `PicPay recusou as credenciais (HTTP ${res.status})`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new HttpError(502, "picpay_auth_failed", "Resposta de autenticação sem token");
  // O token vale 5 minutos; guarda por até 4.
  tokenCache.set(id, { token: j.access_token, exp: ctx.now() + Math.min(240, j.expires_in ?? 240) });
  return j.access_token;
}

async function api(ctx: Ctx, cfg: ProviderCfg, method: string, path: string, body?: unknown): Promise<Response> {
  const send = async (force: boolean) =>
    ctx.fetch(`${PICPAY_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken(ctx, cfg, force)}`, "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  return res;
}

/** ISO com deslocamento de Brasília (-03:00), como nos exemplos da documentação. */
export function brasiliaIso(epochSec: number): string {
  const d = new Date((epochSec - 3 * 3600) * 1000).toISOString().slice(0, 19);
  return `${d}-03:00`;
}

const STATUS: Record<string, NormalizedState> = {
  created: "pending",
  analysis: "pending",
  authorized: "approved",
  paid: "paid",
  expired: "expired",
  refunded: "refunded",
  chargeback: "chargeback",
};

export const picpay: PaymentProvider = {
  id: "picpay",
  label: "PicPay",
  secretNames: ["client_id", "client_secret", "seller_token"],
  hintable: ["client_id"],
  required: ["client_id", "client_secret", "seller_token"],
  noSandbox: true,
  needsBuyer: true,

  async createCheckout(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg, x: CheckoutExtra): Promise<CheckoutResult> {
    if (p.currency !== "BRL") throw new HttpError(409, "currency_unsupported", "PicPay cobra em reais");
    const b = x.buyer ?? {};
    if (!b.firstName || !b.lastName || !b.document) {
      throw new HttpError(400, "buyer_required", "O PicPay exige nome, sobrenome e CPF do pagador.", { fields: ["firstName", "lastName", "document"] });
    }
    const minutes = Math.min(120, Math.max(5, Number(cfg.config.expires_minutes) || 30));
    const expiresAt = ctx.now() + minutes * 60;
    const body = {
      referenceId: p.id,
      callbackUrl: `${ctx.origin}/api/webhooks/picpay`,
      returnUrl: x.returnUrl,
      expiresAt: brasiliaIso(expiresAt),
      value: Number(centsToDecimal(p.amount_cents)),
      buyer: {
        firstName: b.firstName,
        lastName: b.lastName,
        document: b.document,
        ...(b.email || x.email ? { email: b.email || x.email } : {}),
        ...(b.phone ? { phone: b.phone } : {}),
      },
    };
    const res = await api(ctx, cfg, "POST", "/ecommerce/v2/payments", body);
    if (!res.ok) throw new HttpError(502, "picpay_create_failed", `PicPay recusou o pedido (HTTP ${res.status})`);
    const j = (await res.json()) as { referenceId?: string; paymentUrl?: string; qrcode?: { content?: string; base64?: string }; expiresAt?: string };
    if (!j.paymentUrl && !j.qrcode?.content) throw new HttpError(502, "picpay_create_failed", "Resposta do PicPay sem link de pagamento");
    return {
      redirectUrl: j.paymentUrl,
      qr: j.qrcode?.content ? { content: j.qrcode.content, base64: j.qrcode.base64 } : undefined,
      providerRef: j.referenceId || p.id,
      expiresAt,
    };
  },

  async fetchStatus(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg): Promise<NormalizedStatus> {
    const ref = p.provider_ref || p.id;
    const res = await api(ctx, cfg, "GET", `/ecommerce/v2/payments/${encodeURIComponent(ref)}/status`);
    if (!res.ok) throw new HttpError(502, "picpay_status_failed", `Falha ao consultar o PicPay (HTTP ${res.status})`);
    const j = (await res.json()) as { status?: string; authorizationId?: string; value?: number; amount?: number; referenceId?: string };
    const status = STATUS[String(j.status ?? "").toLowerCase()] ?? "pending";
    const value = typeof j.value === "number" ? j.value : typeof j.amount === "number" ? j.amount : undefined;
    return {
      status,
      currency: "BRL",
      amountCents: value === undefined ? undefined : Math.round(value * 100),
      captureId: j.authorizationId,
      customId: j.referenceId ?? ref,
    };
  },

  async verifyWebhook(ctx: Ctx, req, cfg: ProviderCfg): Promise<VerifiedEvent | null> {
    const expected = cfg.secrets.seller_token;
    const got = req.headers.get("x-seller-token");
    if (!expected || !got || !(await safeEqual(got, expected))) return null;
    let body: { referenceId?: string; authorizationId?: string };
    try {
      body = JSON.parse(req.body);
    } catch {
      return null;
    }
    if (!body?.referenceId) return null;
    // O callback não traz o status novo (a doc manda consultar). Cada recebimento vira um evento próprio;
    // a idempotência real está em `settlePayment` (UPDATE condicionado ao estado anterior).
    return {
      eventId: `${body.referenceId}:${body.authorizationId ?? "-"}:${ctx.now()}`,
      type: "picpay.callback",
      action: "settle",
      paymentId: body.referenceId,
      captureId: body.authorizationId,
    };
  },

  async testConnection(ctx: Ctx, cfg: ProviderCfg) {
    try {
      await accessToken(ctx, cfg, true);
      return { ok: true, message: "Autenticou no PicPay." };
    } catch (e) {
      return { ok: false, message: e instanceof HttpError ? e.message : "Falha ao falar com o PicPay." };
    }
  },
};
