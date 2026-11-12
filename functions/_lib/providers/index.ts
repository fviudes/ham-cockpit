import type { Ctx } from "../env";
import { HttpError } from "../util";
import { decryptSecret, encryptSecret } from "../secrets";
import { mock, mockEnabled } from "./mock";
import { paypal } from "./paypal";
import { picpay } from "./picpay";
import type { PaymentProvider, ProviderCfg, ProviderId, ProviderMode, ProviderRow } from "./types";

const REGISTRY: Record<string, PaymentProvider> = { paypal, picpay, mock };

export function getProvider(ctx: Ctx, id: string): PaymentProvider | null {
  if (id === "mock" && !mockEnabled(ctx)) return null;
  return REGISTRY[id] ?? null;
}

export function secretAad(provider: string, mode: string, name: string): string {
  return `provider:${provider}|${mode}|${name}`;
}

export async function loadProviderRow(ctx: Ctx, id: string): Promise<ProviderRow | null> {
  if (id === "mock" && mockEnabled(ctx)) {
    // `payments.provider` tem FK para `providers`; o simulado ganha uma linha (desligada) só em dev/testes.
    await ctx.env.DB.prepare("INSERT OR IGNORE INTO providers (id, display_name, enabled, mode, currency_mode, sort_order) VALUES ('mock', 'Simulado (teste)', 0, 'sandbox', 'AUTO', 999)").run();
    return { id: "mock", display_name: "Simulado (teste)", enabled: 1, mode: "sandbox", currency_mode: "AUTO", sort_order: 999, config_json: "{}" };
  }
  return ctx.env.DB.prepare("SELECT id, display_name, enabled, mode, currency_mode, sort_order, config_json FROM providers WHERE id = ?1").bind(id).first<ProviderRow>();
}

/** Carrega a configuração com os segredos decifrados do modo ativo. Nunca devolver isto ao navegador. */
export async function loadProviderCfg(ctx: Ctx, id: string): Promise<ProviderCfg | null> {
  const row = await loadProviderRow(ctx, id);
  const prov = getProvider(ctx, id);
  if (!row || !prov) return null;
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.config_json || "{}") as Record<string, unknown>;
  } catch {
    config = {};
  }
  const secrets: Record<string, string> = {};
  if (prov.secretNames.length) {
    const rows = await ctx.env.DB.prepare("SELECT name, ciphertext, iv FROM provider_secrets WHERE provider = ?1 AND mode = ?2")
      .bind(id, row.mode)
      .all<{ name: string; ciphertext: string; iv: string }>();
    for (const r of rows.results) {
      if (!prov.secretNames.includes(r.name)) continue;
      secrets[r.name] = await decryptSecret(ctx, secretAad(id, row.mode, r.name), r.ciphertext, r.iv);
    }
  }
  return { row, config, secrets };
}

export function missingFields(prov: PaymentProvider, cfg: ProviderCfg): string[] {
  return prov.required.filter(n => !cfg.secrets[n]);
}

export async function saveProviderSecrets(
  ctx: Ctx,
  id: string,
  mode: ProviderMode,
  values: Record<string, unknown>,
  clear: string[],
  by: string,
): Promise<string[]> {
  const prov = getProvider(ctx, id);
  if (!prov) throw new HttpError(404, "provider_not_found");
  const touched: string[] = [];
  for (const [name, raw] of Object.entries(values)) {
    if (!prov.secretNames.includes(name)) throw new HttpError(400, "unknown_secret", `Campo desconhecido: ${name}`);
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) continue; // vazio = manter o valor atual
    if (v.length > 2000) throw new HttpError(400, "secret_too_long");
    const { ciphertext, iv } = await encryptSecret(ctx, secretAad(id, mode, name), v);
    const hint = prov.hintable.includes(name) && v.length >= 8 ? `…${v.slice(-4)}` : null;
    await ctx.env.DB.prepare(
      "INSERT INTO provider_secrets (provider, mode, name, ciphertext, iv, hint, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (provider, mode, name) DO UPDATE SET ciphertext = ?4, iv = ?5, hint = ?6, updated_at = ?7, updated_by = ?8",
    )
      .bind(id, mode, name, ciphertext, iv, hint, ctx.now(), by)
      .run();
    touched.push(name);
  }
  for (const name of clear) {
    if (!prov.secretNames.includes(name)) continue;
    await ctx.env.DB.prepare("DELETE FROM provider_secrets WHERE provider = ?1 AND mode = ?2 AND name = ?3").bind(id, mode, name).run();
    touched.push(`-${name}`);
  }
  return touched;
}

export type { PaymentProvider, ProviderCfg, ProviderId, ProviderMode, ProviderRow };
