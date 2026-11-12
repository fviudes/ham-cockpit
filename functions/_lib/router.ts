import { adminLogin, adminLogout, adminConfigured } from "./admin-auth";
import { adminRoute } from "./admin-api";
import { checkoutConfig, checkoutQuote, checkoutReturn, checkoutStart, checkoutStatus, handleWebhook, loadPayment } from "./checkout";
import { getSettings } from "./db";
import { makeCtx, type Ctx, type Env } from "./env";
import { activate, buildCrl, type ActivateBody } from "./licenses";
import { getPrice } from "./pricing";
import { mockEnabled } from "./providers/mock";
import { HttpError, errorJson, json, readJson } from "./util";

export interface HandleOptions {
  now?: () => number;
  fetch?: typeof fetch;
  keyring?: Ctx["keyring"];
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
};

function withHeaders(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function mockPage(pid: string, amount: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>Provedor simulado</title>
<body style="font-family:sans-serif;max-width:32rem;margin:3rem auto"><h1>Provedor simulado (somente teste)</h1>
<p>Pagamento <code>${pid}</code> — ${amount}</p>
<form method="post" action="/api/mock/pay"><input type="hidden" name="pid" value="${pid}">
<button name="choice" value="approve">Aprovar</button> <button name="choice" value="decline">Recusar</button>
<button name="choice" value="tamper">Aprovar com valor adulterado</button></form></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function route(ctx: Ctx, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  if (!path.startsWith("/api/")) return errorJson(404, "not_found");
  const p = path.slice(4); // sem o "/api"

  if (p === "/health" && method === "GET") {
    const price = await getPrice(ctx);
    const s = await getSettings(ctx);
    return json({ ok: true, service: "ham-cockpit-portal", priceConfigured: !!price, enforce: s.enforce, adminConfigured: await adminConfigured(ctx), time: ctx.now() });
  }

  // --- Aparelho ---
  if (p === "/lic/activate" && method === "POST") return json(await activate(ctx, await readJson<ActivateBody>(request), "activate"));
  if (p === "/lic/sync" && method === "POST") return json(await activate(ctx, await readJson<ActivateBody>(request), "sync"));
  if (p === "/lic/crl" && method === "GET") {
    const { crl, version } = await buildCrl(ctx);
    return json({ crl, version }, 200, { "cache-control": "public, max-age=300" });
  }
  if (p === "/lic/policy" && method === "GET") {
    const s = await getSettings(ctx);
    return json({ enforce: s.enforce, enforceFrom: null, observationOnlyInThisRelease: true });
  }

  // --- Checkout ---
  if (p === "/checkout/config" && method === "GET") return checkoutConfig(ctx, url);
  if (p === "/checkout/quote" && method === "POST") return checkoutQuote(ctx, await readJson(request));
  if (p === "/checkout/start" && method === "POST") return checkoutStart(ctx, await readJson(request));
  if (p === "/checkout/return" && method === "GET") return checkoutReturn(ctx, url);
  if (p === "/checkout/status" && method === "GET") return checkoutStatus(ctx, url);

  // --- Webhooks ---
  let m = p.match(/^\/webhooks\/(paypal|picpay|mock)$/);
  if (m && method === "POST") return handleWebhook(ctx, m[1], request);

  // --- Provedor simulado (só com ENABLE_MOCK_PROVIDER=1) ---
  if (p === "/mock/pay" && mockEnabled(ctx)) {
    if (method === "GET") {
      const pay = await loadPayment(ctx, url.searchParams.get("pid") ?? "");
      if (!pay) return errorJson(404, "payment_not_found");
      return mockPage(pay.id, `${pay.currency} ${(pay.amount_cents / 100).toFixed(2)}`);
    }
    if (method === "POST") {
      const form = new URLSearchParams(await request.text());
      const pay = await loadPayment(ctx, form.get("pid") ?? "");
      if (!pay || pay.provider !== "mock") return errorJson(404, "payment_not_found");
      const note = form.get("choice") === "approve" ? "mock:approved" : form.get("choice") === "tamper" ? "mock:approved:1" : "mock:declined";
      await ctx.env.DB.prepare("UPDATE payments SET note = ?2 WHERE id = ?1").bind(pay.id, note).run();
      return new Response(null, { status: 302, headers: { location: `${ctx.origin}/api/checkout/return?pid=${pay.id}` } });
    }
  }

  // --- Admin ---
  if (p === "/admin/login" && method === "POST") return adminLogin(ctx, await readJson(request, 2048));
  if (p === "/admin/logout" && method === "POST") return adminLogout(ctx, request);
  if (p.startsWith("/admin/")) {
    const r = await adminRoute(ctx, request, p.slice("/admin".length));
    if (r) return r;
  }
  return errorJson(404, "not_found", "Rota não encontrada");
}

/** Ponto único de entrada (Pages Function e testes). */
export async function handle(request: Request, env: Env, opts: HandleOptions = {}): Promise<Response> {
  const ctx = makeCtx(request, env, opts);
  try {
    return withHeaders(await route(ctx, request));
  } catch (e) {
    if (e instanceof HttpError) return withHeaders(errorJson(e.status, e.code, e.message, e.extra));
    // Nunca vazar detalhes internos (nem segredos) na resposta.
    console.error("[portal] erro interno:", e instanceof Error ? e.message : String(e));
    return withHeaders(errorJson(500, "internal_error", "Erro interno. Tente de novo em instantes."));
  }
}
