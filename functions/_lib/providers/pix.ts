import type { Ctx } from "../env";
import type { CheckoutExtra, CheckoutResult, NormalizedStatus, PaymentProvider, PaymentRow, ProviderCfg, VerifiedEvent } from "./types";

const APPROVED = "pix:approved";

export const pix: PaymentProvider = {
  id: "pix",
  label: "PIX",
  secretNames: [],
  hintable: [],
  required: [],
  noSandbox: true,

  async createCheckout(_ctx: Ctx, p: PaymentRow, _cfg: ProviderCfg, _x: CheckoutExtra): Promise<CheckoutResult> {
    return { providerRef: `pix_${p.id}`, expiresAt: p.expires_at ?? undefined };
  },

  async fetchStatus(_ctx: Ctx, p: PaymentRow): Promise<NormalizedStatus> {
    const paid = (p.note || "").startsWith(APPROVED);
    return {
      status: paid ? "paid" : "pending",
      amountCents: p.amount_cents,
      currency: p.currency,
      captureId: paid ? `pix_${p.id}` : undefined,
      customId: p.id,
    };
  },

  async verifyWebhook(): Promise<VerifiedEvent | null> {
    return null;
  },

  async testConnection() {
    return {
      ok: true,
      message: "Pix manual: o comprador vê as instruções no portal; você confirma o pagamento na aba Pagamentos.",
    };
  },
};