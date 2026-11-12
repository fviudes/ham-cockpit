import type { Ctx } from "../env";

export type ProviderId = "paypal" | "picpay" | "mercadopago" | "mock";
export type ProviderMode = "sandbox" | "live";
export type Currency = "USD" | "BRL";

export interface PaymentRow {
  id: string;
  serial: string;
  provider: ProviderId;
  mode: ProviderMode;
  status: string;
  quote_id: string | null;
  currency: Currency;
  amount_cents: number;
  usd_cents: number;
  fx_rate_micro: number | null;
  provider_ref: string | null;
  provider_capture_id: string | null;
  provider_fee_cents: number | null;
  refunded_cents: number;
  payer_email: string | null;
  payer_country: string | null;
  lang: "pt" | "en";
  note: string | null;
  created_at: number;
  updated_at: number;
  paid_at: number | null;
  expires_at: number | null;
}

export interface ProviderRow {
  id: ProviderId;
  display_name: string;
  enabled: number;
  mode: ProviderMode;
  currency_mode: "USD" | "BRL" | "AUTO";
  sort_order: number;
  config_json: string;
}

/** Configuração carregada para uso (segredos já decifrados; só vive na memória da requisição). */
export interface ProviderCfg {
  row: ProviderRow;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

export type NormalizedState =
  | "created"
  | "pending"
  | "approved"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
  | "partially_refunded"
  | "chargeback";

export interface NormalizedStatus {
  status: NormalizedState;
  amountCents?: number;
  currency?: Currency;
  captureId?: string;
  customId?: string;
  payerEmail?: string;
  payerCountry?: string;
  feeCents?: number;
}

export type EventAction = "settle" | "capture_then_settle" | "refund" | "chargeback" | "dispute" | "ignore";

export interface VerifiedEvent {
  eventId: string;
  type: string;
  action: EventAction;
  paymentId?: string;
  providerRef?: string;
  captureId?: string;
}

export interface CheckoutExtra {
  returnUrl: string;
  cancelUrl: string;
  serialDisplay: string;
  email?: string;
  buyer?: { firstName?: string; lastName?: string; document?: string; email?: string; phone?: string };
}

export interface CheckoutResult {
  redirectUrl?: string;
  qr?: { content: string; base64?: string };
  providerRef: string;
  expiresAt?: number;
}

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  /** Nomes dos campos secretos (gravados cifrados; nunca devolvidos ao navegador). */
  secretNames: readonly string[];
  /** Nomes cujo "final" (4 últimos caracteres) pode ser mostrado ao admin para conferência. */
  hintable: readonly string[];
  /** Campos exigidos para o provedor poder ser ligado. */
  required: readonly string[];
  /** Provedor sem ambiente de teste (ex.: PicPay carteira). */
  noSandbox?: boolean;
  /** O comprador precisa informar dados extras no checkout (ex.: CPF do PicPay). */
  needsBuyer?: boolean;
  createCheckout(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg, x: CheckoutExtra): Promise<CheckoutResult>;
  verifyWebhook(ctx: Ctx, req: { headers: Headers; body: string }, cfg: ProviderCfg): Promise<VerifiedEvent | null>;
  fetchStatus(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg): Promise<NormalizedStatus>;
  /** Passo extra no retorno do comprador (PayPal: capturar o pedido aprovado). */
  captureOnReturn?(ctx: Ctx, p: PaymentRow, cfg: ProviderCfg): Promise<void>;
  testConnection(ctx: Ctx, cfg: ProviderCfg): Promise<{ ok: boolean; message: string }>;
}
