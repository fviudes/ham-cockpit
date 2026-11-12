import type { KeyringEntry } from "../../shared/license-keys";

/**
 * Tipos mínimos do ambiente das Pages Functions (sem depender de @cloudflare/workers-types).
 */
export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  [k: string]: unknown;
}
export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

/** Bindings, variáveis e secrets do projeto Pages `ham-cockpit`. */
export interface Env {
  DB: D1Database;
  // Variáveis (wrangler.jsonc)
  PORTAL_ORIGIN?: string;
  LICENSE_ACTIVE_KID?: string;
  // Secrets (nunca no repositório): ver docs/portal.md
  LICENSE_SIGNING_KEY_K1?: string;
  LICENSE_SIGNING_KEY_K2?: string;
  SECRETS_MASTER_KEY?: string;
  ADMIN_BOOTSTRAP_TOKEN?: string;
  ADMIN_TOTP_SECRET?: string;
  IP_HASH_KEY?: string;
  // Só em desenvolvimento local / testes: liga o provedor simulado.
  ENABLE_MOCK_PROVIDER?: string;
  MOCK_WEBHOOK_SECRET?: string;
  [k: string]: unknown;
}

/** Contexto de uma requisição, com relógio e fetch injetáveis (testes). */
export interface Ctx {
  env: Env;
  /** Segundos Unix. */
  now: () => number;
  fetch: typeof fetch;
  ip: string;
  country: string;
  origin: string;
  /** Substitui o chaveiro embutido (só testes). */
  keyring?: KeyringEntry[];
}

export function makeCtx(request: Request, env: Env, opts?: { now?: () => number; fetch?: typeof fetch; keyring?: KeyringEntry[] }): Ctx {
  const url = new URL(request.url);
  return {
    env,
    now: opts?.now ?? (() => Math.floor(Date.now() / 1000)),
    fetch: opts?.fetch ?? ((input, init) => fetch(input, init)),
    ip: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0",
    country: (request.headers.get("cf-ipcountry") || "").toUpperCase(),
    origin: env.PORTAL_ORIGIN || url.origin,
    keyring: opts?.keyring,
  };
}
