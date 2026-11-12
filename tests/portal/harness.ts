import { generateKeyPairSync, randomBytes } from "node:crypto";
import { totpCode } from "../../functions/_lib/admin-auth";
import type { Env } from "../../functions/_lib/env";
import { clearPaypalTokenCache } from "../../functions/_lib/providers/paypal";
import { clearPicpayTokenCache } from "../../functions/_lib/providers/picpay";
import { handle } from "../../functions/_lib/router";
import { importPrivateKey, verifyLicenseToken, type LicensePayload } from "../../shared/license";
import type { KeyringEntry } from "../../shared/license-keys";
import { createTestDb } from "./d1-sqlite";

export const ORIGIN = "https://portal.test";
export const SERIAL = "10000000a1b2c3d4";
export const T0 = 1_794_499_132; // 2026-11-12 (referência)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function b32(bytes: Buffer): string {
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response> | undefined;

export interface Portal {
  env: Env;
  db: ReturnType<typeof createTestDb>;
  keyring: KeyringEntry[];
  clock: { t: number };
  fetchLog: string[];
  fetchHandlers: FetchHandler[];
  adminToken: string;
  totpSecret: string;
  call(method: string, path: string, opts?: { json?: unknown; body?: string; headers?: Record<string, string>; ip?: string; country?: string }): Promise<Response>;
  json<T = Record<string, any>>(method: string, path: string, opts?: Parameters<Portal["call"]>[2]): Promise<{ status: number; body: T; res: Response }>;
  login(): Promise<{ cookie: string; csrf: string }>;
  admin<T = Record<string, any>>(session: { cookie: string; csrf: string }, method: string, path: string, json?: unknown): Promise<{ status: number; body: T }>;
  verify(token: string, serial?: string): ReturnType<typeof verifyLicenseToken>;
  setPrice(session: { cookie: string; csrf: string }, usd?: string): Promise<void>;
}

let ipCounter = 0;
let totpBump = 0;

export async function makePortal(over: Partial<Env> = {}): Promise<Portal> {
  totpBump = 0;
  clearPaypalTokenCache();
  clearPicpayTokenCache();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "jwk" }).x as string;
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const kid = pub.slice(0, 8);
  const keyring: KeyringEntry[] = [{ kid, label: "k1", env: "dev", pub, status: "active" }];
  void importPrivateKey;
  const adminToken = randomBytes(32).toString("hex");
  const totpSecret = b32(randomBytes(20));
  const db = createTestDb();
  const env: Env = {
    DB: db,
    PORTAL_ORIGIN: ORIGIN,
    LICENSE_ACTIVE_KID: kid,
    LICENSE_SIGNING_KEY_K1: pkcs8,
    SECRETS_MASTER_KEY: randomBytes(32).toString("base64"),
    ADMIN_BOOTSTRAP_TOKEN: adminToken,
    ADMIN_TOTP_SECRET: totpSecret,
    IP_HASH_KEY: randomBytes(16).toString("hex"),
    ENABLE_MOCK_PROVIDER: "1",
    ...over,
  };
  const clock = { t: T0 };
  const fetchLog: string[] = [];
  const fetchHandlers: FetchHandler[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchLog.push(`${(init?.method || "GET").toUpperCase()} ${url}`);
    for (const h of fetchHandlers) {
      const r = await h(url, init ?? {});
      if (r) return r;
    }
    return new Response("not found (teste)", { status: 404 });
  };

  const p: Portal = {
    env,
    db,
    keyring,
    clock,
    fetchLog,
    fetchHandlers,
    adminToken,
    totpSecret,
    async call(method, path, opts = {}) {
      const headers: Record<string, string> = { "cf-connecting-ip": opts.ip ?? `198.51.100.${(ipCounter++ % 250) + 1}`, ...(opts.headers ?? {}) };
      if (opts.country) headers["cf-ipcountry"] = opts.country;
      let body: string | undefined = opts.body;
      if (opts.json !== undefined) {
        body = JSON.stringify(opts.json);
        headers["content-type"] = "application/json";
      }
      const req = new Request(`${ORIGIN}${path}`, { method, headers, body });
      return handle(req, env, { now: () => clock.t, fetch: fakeFetch, keyring });
    },
    async json(method, path, opts) {
      const res = await p.call(method, path, opts);
      const text = await res.text();
      let body: any = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { _text: text };
      }
      return { status: res.status, body, res };
    },
    async login() {
      // Cada login do teste usa um passo TOTP diferente (anti-replay): -1, 0, +1 em torno do atual.
      const code = await totpCode(totpSecret, Math.floor(clock.t / 30) - 1 + totpBump++);
      const r = await p.call("POST", "/api/admin/login", { json: { token: adminToken, code }, ip: "203.0.113.9" });
      if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${await r.text()}`);
      const setCookie = r.headers.get("set-cookie") ?? "";
      const cookie = setCookie.split(";")[0];
      const body = (await r.json()) as { csrf: string };
      return { cookie, csrf: body.csrf };
    },
    async admin(session, method, path, json) {
      const headers: Record<string, string> = { cookie: session.cookie, "x-hc-csrf": session.csrf };
      const r = await p.json(method, path, { json, headers, ip: "203.0.113.9" });
      return { status: r.status, body: r.body };
    },
    verify(token, serial = SERIAL) {
      return verifyLicenseToken(token, serial, keyring);
    },
    async setPrice(session, usd = "29.00") {
      const r = await p.admin(session, "PUT", "/api/admin/pricing", { usd });
      if (r.status !== 200) throw new Error(`preço: ${r.status} ${JSON.stringify(r.body)}`);
    },
  };
  return p;
}

/** Fontes de câmbio simuladas. `ptax=null` simula fonte fora do ar. */
export function fxHandler(rates: { ptax?: number | null; awesome?: number | null; frank?: number | null }): FetchHandler {
  return url => {
    if (url.includes("olinda.bcb.gov.br")) {
      return rates.ptax == null ? new Response("fora", { status: 503 }) : Response.json({ value: [{ cotacaoVenda: rates.ptax, dataHoraCotacao: "x" }] });
    }
    if (url.includes("awesomeapi")) {
      return rates.awesome == null ? new Response("fora", { status: 503 }) : Response.json({ USDBRL: { ask: String(rates.awesome) } });
    }
    if (url.includes("frankfurter")) {
      return rates.frank == null ? new Response("fora", { status: 503 }) : Response.json({ rates: { BRL: rates.frank }, date: "2026-11-12" });
    }
    return undefined;
  };
}

export function payloadOf(token: string): LicensePayload {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as LicensePayload;
}
