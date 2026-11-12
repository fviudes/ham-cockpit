import type { Ctx } from "./env";
import { audit } from "./db";

/**
 * Cotação USD→BRL. Ordem: PTAX (Banco Central) → AwesomeAPI → Frankfurter → última boa (até 72 h, +1% de folga)
 * → cotação manual do admin (com validade). Cache de 1 h no D1. Atualização preguiçosa (Pages não tem cron).
 */
export type FxSource = "ptax" | "awesomeapi" | "frankfurter" | "manual";

export interface FxRate {
  source: FxSource;
  rateMicro: number;
  rateDate: string;
  fetchedAt: number;
  /** Cotação velha (fonte fora do ar): quem calcula soma +1% de folga. */
  stale: boolean;
}

const CACHE_TTL = 3600;
const STALE_MAX = 72 * 3600;
export const DIVERGENCE_MAX_BPS = 500;

function toMicro(x: unknown): number | null {
  const n = typeof x === "string" ? Number.parseFloat(x) : typeof x === "number" ? x : NaN;
  if (!Number.isFinite(n) || n < 0.5 || n > 100) return null; // sanidade: dólar entre R$ 0,50 e R$ 100
  return Math.round(n * 1_000_000);
}

async function getJson(ctx: Ctx, url: string): Promise<unknown> {
  const res = await ctx.fetch(url, { headers: { accept: "application/json", "user-agent": "ham-cockpit-portal" }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Data de Brasília (UTC-3) no formato MM-DD-AAAA, recuando `back` dias. */
function ptaxDate(now: number, back: number): { api: string; iso: string } {
  const d = new Date((now - 3 * 3600 - back * 86400) * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear());
  return { api: `${mm}-${dd}-${yy}`, iso: `${yy}-${mm}-${dd}` };
}

export async function fetchPtax(ctx: Ctx): Promise<{ rateMicro: number; rateDate: string } | null> {
  for (let back = 0; back <= 5; back++) {
    const d = ptaxDate(ctx.now(), back);
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${d.api}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
    try {
      const j = (await getJson(ctx, url)) as { value?: Array<{ cotacaoVenda?: number }> };
      const micro = toMicro(j.value?.[0]?.cotacaoVenda);
      if (micro) return { rateMicro: micro, rateDate: d.iso };
    } catch {
      return null; // BCB fora do ar: não adianta recuar o dia
    }
  }
  return null;
}

async function fetchAwesome(ctx: Ctx): Promise<{ rateMicro: number; rateDate: string } | null> {
  try {
    const j = (await getJson(ctx, "https://economia.awesomeapi.com.br/json/last/USD-BRL")) as { USDBRL?: { ask?: string } };
    const micro = toMicro(j.USDBRL?.ask);
    return micro ? { rateMicro: micro, rateDate: ptaxDate(ctx.now(), 0).iso } : null;
  } catch {
    return null;
  }
}

async function fetchFrankfurter(ctx: Ctx): Promise<{ rateMicro: number; rateDate: string } | null> {
  try {
    const j = (await getJson(ctx, "https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL")) as { rates?: { BRL?: number }; date?: string };
    const micro = toMicro(j.rates?.BRL);
    return micro ? { rateMicro: micro, rateDate: j.date || ptaxDate(ctx.now(), 0).iso } : null;
  } catch {
    return null;
  }
}

interface FxRow {
  source: FxSource;
  rate_micro: number;
  rate_date: string;
  fetched_at: number;
  expires_at: number | null;
}

async function storeRate(ctx: Ctx, source: FxSource, rateMicro: number, rateDate: string, by: string | null): Promise<void> {
  await ctx.env.DB.prepare("INSERT INTO fx_rates (source, rate_micro, rate_date, fetched_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(source, rateMicro, rateDate, ctx.now(), by)
    .run();
}

export async function setManualRate(ctx: Ctx, rateMicro: number, validHours: number, by: string): Promise<void> {
  const now = ctx.now();
  await ctx.env.DB.prepare("INSERT INTO fx_rates (source, rate_micro, rate_date, fetched_at, expires_at, created_by) VALUES ('manual', ?1, ?2, ?3, ?4, ?5)")
    .bind(rateMicro, ptaxDate(now, 0).iso, now, now + validHours * 3600, by)
    .run();
}

/** Cotação a usar agora; `null` quando nenhuma fonte serve (checkout em BRL fica indisponível). */
export async function getFxRate(ctx: Ctx, opts: { force?: boolean } = {}): Promise<FxRate | null> {
  const now = ctx.now();
  const db = ctx.env.DB;

  if (!opts.force) {
    const cached = await db
      .prepare("SELECT source, rate_micro, rate_date, fetched_at, expires_at FROM fx_rates WHERE source <> 'manual' AND fetched_at > ?1 ORDER BY fetched_at DESC LIMIT 1")
      .bind(now - CACHE_TTL)
      .first<FxRow>();
    if (cached) return { source: cached.source, rateMicro: cached.rate_micro, rateDate: cached.rate_date, fetchedAt: cached.fetched_at, stale: false };
  }

  const ptax = await fetchPtax(ctx);
  const awesome = await fetchAwesome(ctx);
  if (ptax && awesome) {
    const diff = (Math.abs(ptax.rateMicro - awesome.rateMicro) * 10000) / Math.min(ptax.rateMicro, awesome.rateMicro);
    if (diff > DIVERGENCE_MAX_BPS) {
      await audit(ctx, null, "fx_divergence", "fx", { ptax: ptax.rateMicro, awesomeapi: awesome.rateMicro }, undefined);
      return manualOrNull(ctx);
    }
  }
  const pick = ptax ? { s: "ptax" as const, ...ptax } : awesome ? { s: "awesomeapi" as const, ...awesome } : null;
  const final = pick ?? ((r => (r ? { s: "frankfurter" as const, ...r } : null))(await fetchFrankfurter(ctx)));
  if (final) {
    await storeRate(ctx, final.s, final.rateMicro, final.rateDate, null);
    return { source: final.s, rateMicro: final.rateMicro, rateDate: final.rateDate, fetchedAt: now, stale: false };
  }

  const last = await db
    .prepare("SELECT source, rate_micro, rate_date, fetched_at, expires_at FROM fx_rates WHERE source <> 'manual' AND fetched_at > ?1 ORDER BY fetched_at DESC LIMIT 1")
    .bind(now - STALE_MAX)
    .first<FxRow>();
  if (last) return { source: last.source, rateMicro: last.rate_micro, rateDate: last.rate_date, fetchedAt: last.fetched_at, stale: true };
  return manualOrNull(ctx);
}

async function manualOrNull(ctx: Ctx): Promise<FxRate | null> {
  const now = ctx.now();
  const m = await ctx.env.DB.prepare(
    "SELECT source, rate_micro, rate_date, fetched_at, expires_at FROM fx_rates WHERE source = 'manual' AND expires_at > ?1 ORDER BY fetched_at DESC LIMIT 1",
  )
    .bind(now)
    .first<FxRow>();
  return m ? { source: "manual", rateMicro: m.rate_micro, rateDate: m.rate_date, fetchedAt: m.fetched_at, stale: false } : null;
}
