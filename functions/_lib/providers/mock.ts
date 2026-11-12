import type { Ctx } from "../env";
import { hmacHex, safeEqual } from "../util";
import type { CheckoutResult, NormalizedStatus, PaymentProvider, PaymentRow, ProviderCfg, VerifiedEvent } from "./types";

/**
 * Provedor SIMULADO para desenvolvimento e testes. Só existe quando ENABLE_MOCK_PROVIDER=1
 * (nunca ligado em produção). O "provedor" guarda o estado em `payments.note` (mock:approved | mock:declined).
 * Webhook: cabeçalho `x-mock-signature` = HMAC-SHA256(MOCK_WEBHOOK_SECRET, corpo).
 */
export function mockEnabled(ctx: Ctx): boolean {
  return ctx.env.ENABLE_MOCK_PROVIDER === "1";
}

export function mockSecret(ctx: Ctx): string {
  return ctx.env.MOCK_WEBHOOK_SECRET || "mock-webhook-secret";
}

export async function mockSign(ctx: Ctx, body: string): Promise<string> {
  return hmacHex(mockSecret(ctx), body);
}

export const mock: PaymentProvider = {
  id: "mock",
  label: "Simulado (teste)",
  secretNames: [],
  hintable: [],
  required: [],

  async createCheckout(ctx: Ctx, p: PaymentRow): Promise<CheckoutResult> {
    return { redirectUrl: `${ctx.origin}/api/mock/pay?pid=${encodeURIComponent(p.id)}`, providerRef: `mock_${p.id}` };
  },

  async fetchStatus(_ctx: Ctx, p: PaymentRow): Promise<NormalizedStatus> {
    const n = p.note || "";
    const state = n.startsWith("mock:approved")
      ? "paid"
      : n.startsWith("mock:declined")
        ? "failed"
        : n.startsWith("mock:refunded")
          ? "refunded"
          : n.startsWith("mock:chargeback")
            ? "chargeback"
            : "pending";
    // O simulador cobra exatamente o que foi gravado, como um provedor honesto. Teste de adulteração usa `mock:approved:<centavos>`.
    const m = /^mock:approved:(\d+)$/.exec(p.note || "");
    return {
      status: state,
      amountCents: m ? Number(m[1]) : p.amount_cents,
      currency: p.currency,
      captureId: state === "paid" ? `cap_${p.id}` : undefined,
      customId: p.id,
      payerEmail: "comprador.teste@example.invalid",
    };
  },

  async verifyWebhook(ctx: Ctx, req): Promise<VerifiedEvent | null> {
    const sig = req.headers.get("x-mock-signature");
    if (!sig || !(await safeEqual(sig, await mockSign(ctx, req.body)))) return null;
    let b: { id?: string; type?: string; paymentId?: string };
    try {
      b = JSON.parse(req.body);
    } catch {
      return null;
    }
    if (!b.id || !b.type) return null;
    const action = b.type === "paid" ? "settle" : b.type === "refunded" ? "refund" : b.type === "chargeback" ? "chargeback" : "ignore";
    return { eventId: b.id, type: b.type, action, paymentId: b.paymentId };
  },

  async testConnection() {
    return { ok: true, message: "Provedor simulado sempre responde." };
  },
};

export type { ProviderCfg };
