import { brlCentsFromUsd } from "../../shared/license";
import type { Ctx } from "./env";
import { getFxRate } from "./fx";
import { HttpError, newId } from "./util";

export interface PriceRow {
  id: number;
  usd_cents: number;
  fx_spread_bps: number;
  rounding: "cent" | "ten_cents" | "real";
  quote_ttl_seconds: number;
  effective_from: number;
}

/** Preço vigente; `null` = "preço não configurado" (o checkout fica indisponível). */
export async function getPrice(ctx: Ctx): Promise<PriceRow | null> {
  return ctx.env.DB.prepare("SELECT id, usd_cents, fx_spread_bps, rounding, quote_ttl_seconds, effective_from FROM price_settings WHERE effective_from <= ?1 ORDER BY effective_from DESC, id DESC LIMIT 1")
    .bind(ctx.now())
    .first<PriceRow>();
}

export interface QuoteView {
  quoteId: string;
  usdCents: number;
  brlCents: number | null;
  rateMicro: number | null;
  rateSource: string | null;
  rateDate: string | null;
  spreadBps: number;
  stale: boolean;
  expiresAt: number;
}

/** Spread extra quando só há cotação velha (fonte fora do ar). */
const STALE_EXTRA_BPS = 100;

export interface PricePreview {
  usdCents: number;
  brlCents: number | null;
  rateMicro: number | null;
  rateSource: string | null;
  rateDate: string | null;
  spreadBps: number;
  stale: boolean;
}

export async function previewPrice(ctx: Ctx, price: PriceRow, opts: { force?: boolean } = {}): Promise<PricePreview> {
  const fx = await getFxRate(ctx, { force: opts.force });
  if (!fx) {
    return { usdCents: price.usd_cents, brlCents: null, rateMicro: null, rateSource: null, rateDate: null, spreadBps: price.fx_spread_bps, stale: false };
  }
  const spread = price.fx_spread_bps + (fx.stale ? STALE_EXTRA_BPS : 0);
  return {
    usdCents: price.usd_cents,
    brlCents: brlCentsFromUsd(price.usd_cents, fx.rateMicro, spread, price.rounding),
    rateMicro: fx.rateMicro,
    rateSource: fx.source,
    rateDate: fx.rateDate,
    spreadBps: spread,
    stale: fx.stale,
  };
}

/** Cria a cotação congelada (tempo curto do checkout). Sem preço: 409 `price_not_configured`. */
export async function createQuote(ctx: Ctx, serial: string): Promise<QuoteView> {
  const price = await getPrice(ctx);
  if (!price) throw new HttpError(409, "price_not_configured", "Preço não configurado. O pagamento está indisponível no momento.");
  const pv = await previewPrice(ctx, price);
  const now = ctx.now();
  const id = newId("qt");
  const expires = now + price.quote_ttl_seconds;
  await ctx.env.DB.prepare(
    "INSERT INTO price_quotes (id, serial, usd_cents, fx_rate_micro, fx_source, fx_rate_date, spread_bps, rounding, brl_cents, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
  )
    .bind(id, serial, pv.usdCents, pv.rateMicro, pv.rateSource, pv.rateDate, pv.spreadBps, price.rounding, pv.brlCents, now, expires)
    .run();
  return {
    quoteId: id,
    usdCents: pv.usdCents,
    brlCents: pv.brlCents,
    rateMicro: pv.rateMicro,
    rateSource: pv.rateSource,
    rateDate: pv.rateDate,
    spreadBps: pv.spreadBps,
    stale: pv.stale,
    expiresAt: expires,
  };
}
