import { describe, expect, it } from "vitest";
import { verifyBlob, type CrlPayload } from "../../shared/license";
import { SERIAL, T0, fxHandler, makePortal, payloadOf, type FetchHandler, type Portal } from "./harness";

type Session = { cookie: string; csrf: string };

async function ready(p: Portal): Promise<Session> {
  p.fetchHandlers.push(fxHandler({ ptax: 5.4321 }));
  const s = await p.login();
  await p.setPrice(s, "29.00");
  return s;
}

async function quote(p: Portal, serial = SERIAL) {
  const q = await p.json("POST", "/api/checkout/quote", { json: { serial } });
  expect(q.status).toBe(200);
  return q.body;
}

async function startCheckout(p: Portal, provider: string, extra: Record<string, unknown> = {}, serial = SERIAL, opts: { country?: string } = {}) {
  const q = await quote(p, serial);
  return p.json("POST", "/api/checkout/start", {
    json: { quoteId: q.quoteId, provider, acceptNoRefund: true, lang: "pt", ...extra },
    country: opts.country,
  });
}

const licCount = async (p: Portal) => (await p.db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE type = 'definitive'").first<{ n: number }>())!.n;

async function mockWebhook(p: Portal, body: object, sign = true) {
  const text = JSON.stringify(body);
  const headers: Record<string, string> = {};
  if (sign) {
    const { mockSign } = await import("../../functions/_lib/providers/mock");
    headers["x-mock-signature"] = await mockSign({ env: p.env } as never, text);
  }
  return p.json("POST", "/api/webhooks/mock", { body: text, headers });
}

describe("checkout com provedor simulado", () => {
  it("página de config: ausência de reembolso, serial e provedores", async () => {
    const p = await makePortal();
    await ready(p);
    const cfg = await p.json("GET", `/api/checkout/config?serial=${SERIAL}&lang=pt`, { country: "BR" });
    expect(cfg.body.serial.valid).toBe(true);
    expect(cfg.body.serial.display).toMatch(/^1000-0000-A1B2-C3D4-[0-9A-F]{2}$/);
    expect(cfg.body.noRefund).toBe(true);
    expect(cfg.body.priceConfigured).toBe(true);
    expect(cfg.body.providers.map((x: { id: string }) => x.id)).toEqual(["mock"]);
    expect((await p.json("GET", "/api/checkout/config?serial=zzz")).body.serial.valid).toBe(false);
  });

  it("aprovado → licença definitiva; sem aceitar a política de não reembolso o pedido é recusado", async () => {
    const p = await makePortal();
    await ready(p);
    const q = await quote(p);
    const no = await p.json("POST", "/api/checkout/start", { json: { quoteId: q.quoteId, provider: "mock", lang: "pt" } });
    expect(no.body.error).toBe("no_refund_not_accepted");

    const st = await p.json("POST", "/api/checkout/start", { json: { quoteId: q.quoteId, provider: "mock", acceptNoRefund: true, lang: "pt", email: "alguem@example.com" } });
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ currency: "BRL", amountCents: 16300 });
    const pid = st.body.paymentId as string;
    expect(st.body.redirectUrl).toContain(`/api/mock/pay?pid=${pid}`);

    // cotação usada não vale de novo
    expect((await p.json("POST", "/api/checkout/start", { json: { quoteId: q.quoteId, provider: "mock", acceptNoRefund: true } })).body.error).toBe("quote_used");

    // antes de aprovar: pendente e sem chave
    expect((await p.json("GET", `/api/checkout/status?pid=${pid}`)).body).toMatchObject({ status: "pending", license: null });

    // comprador aprova no simulador e volta
    const pay = await p.call("POST", "/api/mock/pay", { body: `pid=${pid}&choice=approve`, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(pay.status).toBe(302);
    const back = await p.call("GET", `/api/checkout/return?pid=${pid}`);
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toContain(`/comprar/retorno?pid=${pid}`);

    const s = (await p.json("GET", `/api/checkout/status?pid=${pid}`)).body;
    expect(s.status).toBe("paid");
    expect(s.license.token).toMatch(/^HCL1\./);
    const pl = payloadOf(s.license.token);
    expect(pl).toMatchObject({ serial: SERIAL, type: "definitive", exp: null });
    expect((await p.verify(s.license.token)).ok).toBe(true);

    // o aparelho passa a receber a definitiva
    const act = await p.json("POST", "/api/lic/sync", { json: { serial: SERIAL } });
    expect(act.body.status).toBe("definitive");
    expect(act.body.license.exp).toBeNull();

    // serial licenciado não paga de novo
    expect((await p.json("GET", `/api/checkout/config?serial=${SERIAL}`)).body.alreadyLicensed).toBe(true);
    const q2 = await quote(p);
    expect((await p.json("POST", "/api/checkout/start", { json: { quoteId: q2.quoteId, provider: "mock", acceptNoRefund: true } })).body.error).toBe("already_licensed");
  });

  it("webhook repetido 5 vezes gera 1 licença; sem assinatura = 401 e nada gravado", async () => {
    const p = await makePortal();
    await ready(p);
    const st = await startCheckout(p, "mock");
    const pid = st.body.paymentId as string;
    await p.db.prepare("UPDATE payments SET note = 'mock:approved' WHERE id = ?1").bind(pid).run();

    const bad = await mockWebhook(p, { id: "evt-1", type: "paid", paymentId: pid }, false);
    expect(bad.status).toBe(401);
    expect((await p.db.prepare("SELECT COUNT(*) AS n FROM webhook_events").first<{ n: number }>())!.n).toBe(0);
    expect(await licCount(p)).toBe(0);

    const results = [];
    for (let i = 0; i < 5; i++) results.push(await mockWebhook(p, { id: "evt-1", type: "paid", paymentId: pid }));
    expect(results.every(r => r.status === 200)).toBe(true);
    expect(results.filter(r => r.body.duplicate).length).toBe(4);
    expect(await licCount(p)).toBe(1);
    // mesmo evento novo (id diferente) também não duplica a licença
    expect((await mockWebhook(p, { id: "evt-2", type: "paid", paymentId: pid })).status).toBe(200);
    expect(await licCount(p)).toBe(1);
    const ev = await p.db.prepare("SELECT COUNT(*) AS n FROM license_events WHERE kind = 'payment_paid'").first<{ n: number }>();
    expect(ev!.n).toBe(1);
  });

  it("valor adulterado no provedor não gera licença; pedido recusado vira 'failed'", async () => {
    const p = await makePortal();
    await ready(p);
    const a = await startCheckout(p, "mock");
    await p.call("POST", "/api/mock/pay", { body: `pid=${a.body.paymentId}&choice=tamper`, headers: { "content-type": "application/x-www-form-urlencoded" } });
    await p.call("GET", `/api/checkout/return?pid=${a.body.paymentId}`);
    expect((await p.json("GET", `/api/checkout/status?pid=${a.body.paymentId}`)).body.status).toBe("failed");
    expect(await licCount(p)).toBe(0);
    const ev = await p.db.prepare("SELECT COUNT(*) AS n FROM license_events WHERE kind = 'payment_mismatch'").first<{ n: number }>();
    expect(ev!.n).toBe(1);

    const b = await startCheckout(p, "mock");
    await p.call("POST", "/api/mock/pay", { body: `pid=${b.body.paymentId}&choice=decline`, headers: { "content-type": "application/x-www-form-urlencoded" } });
    await p.call("GET", `/api/checkout/return?pid=${b.body.paymentId}`);
    expect((await p.json("GET", `/api/checkout/status?pid=${b.body.paymentId}`)).body.status).toBe("failed");
  });

  it("reembolso/chargeback revogam a licença e publicam na CRL", async () => {
    const p = await makePortal();
    await ready(p);
    const st = await startCheckout(p, "mock");
    const pid = st.body.paymentId as string;
    await p.db.prepare("UPDATE payments SET note = 'mock:approved' WHERE id = ?1").bind(pid).run();
    await mockWebhook(p, { id: "e1", type: "paid", paymentId: pid });
    const lid = (await p.db.prepare("SELECT id FROM licenses WHERE payment_id = ?1").bind(pid).first<{ id: string }>())!.id;

    await p.db.prepare("UPDATE payments SET note = 'mock:refunded' WHERE id = ?1").bind(pid).run();
    expect((await mockWebhook(p, { id: "e2", type: "refunded", paymentId: pid })).status).toBe(200);
    const crl = await p.json("GET", "/api/lic/crl");
    const v = await verifyBlob<CrlPayload>("HCC1", crl.body.crl, p.keyring);
    expect(v.ok && v.payload.revoked).toContain(lid);
    expect((await p.json("POST", "/api/lic/sync", { json: { serial: SERIAL } })).body.status).toBe("revoked");
    expect((await p.json("GET", `/api/checkout/status?pid=${pid}`)).body.license).toBeNull();
  });

  it("sem preço, o início do pagamento é recusado", async () => {
    const p = await makePortal();
    p.fetchHandlers.push(fxHandler({ ptax: 5.4321 }));
    const q = await p.json("POST", "/api/checkout/quote", { json: { serial: SERIAL } });
    expect(q.body.error).toBe("price_not_configured");
    expect((await p.json("POST", "/api/checkout/start", { json: { quoteId: "qt_inexistente", provider: "mock", acceptNoRefund: true } })).status).toBe(404);
  });

  it("cotação expirada pede nova cotação", async () => {
    const p = await makePortal();
    await ready(p);
    const q = await quote(p);
    p.clock.t += 901;
    const r = await p.json("POST", "/api/checkout/start", { json: { quoteId: q.quoteId, provider: "mock", acceptNoRefund: true } });
    expect(r.body.error).toBe("quote_expired");
  });
});

/* -------------------------------- PayPal -------------------------------- */

function fakePaypal() {
  const orders = new Map<string, { custom: string; currency: string; value: string; approved: boolean; captured: boolean; captureValue?: string }>();
  let n = 0;
  const calls = { capture: 0, verify: 0 };
  const handler: FetchHandler = async (url, init) => {
    if (!url.startsWith("https://api-m.sandbox.paypal.com")) return undefined;
    const path = url.replace("https://api-m.sandbox.paypal.com", "");
    const method = (init.method || "GET").toUpperCase();
    const auth = String((init.headers as Record<string, string>)?.authorization || "");
    if (path === "/v1/oauth2/token") {
      const ok = auth === `Basic ${btoa("PP-CLIENT-1234:PP-SECRET-xyz")}`;
      return ok ? Response.json({ access_token: "tok", expires_in: 300 }) : new Response("bad", { status: 401 });
    }
    if (auth !== "Bearer tok") return new Response("unauth", { status: 401 });
    if (path === "/v2/checkout/orders" && method === "POST") {
      const b = JSON.parse(String(init.body));
      const id = `ORD${++n}`;
      const u = b.purchase_units[0];
      orders.set(id, { custom: u.custom_id, currency: u.amount.currency_code, value: u.amount.value, approved: false, captured: false });
      return Response.json({ id, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: `https://paypal.test/approve/${id}` }] }, { status: 201 });
    }
    let m = path.match(/^\/v2\/checkout\/orders\/(\w+)\/capture$/);
    if (m && method === "POST") {
      calls.capture++;
      const o = orders.get(m[1])!;
      if (o.captured) return Response.json({ details: [{ issue: "ORDER_ALREADY_CAPTURED" }] }, { status: 422 });
      if (!o.approved) return Response.json({ details: [{ issue: "ORDER_NOT_APPROVED" }] }, { status: 422 });
      o.captured = true;
      return Response.json({ id: m[1], status: "COMPLETED" }, { status: 201 });
    }
    m = path.match(/^\/v2\/checkout\/orders\/(\w+)$/);
    if (m && method === "GET") {
      const o = orders.get(m[1]);
      if (!o) return new Response("nf", { status: 404 });
      const unit: Record<string, unknown> = { custom_id: o.custom, amount: { currency_code: o.currency, value: o.value } };
      if (o.captured) {
        unit.payments = { captures: [{ id: `CAP-${m[1]}`, status: "COMPLETED", custom_id: o.custom, amount: { currency_code: o.currency, value: o.captureValue ?? o.value }, seller_receivable_breakdown: { paypal_fee: { value: "1.50" } } }] };
      }
      return Response.json({ id: m[1], status: o.captured ? "COMPLETED" : o.approved ? "APPROVED" : "PAYER_ACTION_REQUIRED", payer: { email_address: "pagador@example.com", address: { country_code: "BR" } }, purchase_units: [unit] });
    }
    if (path === "/v1/notifications/verify-webhook-signature" && method === "POST") {
      calls.verify++;
      const b = JSON.parse(String(init.body));
      return Response.json({ verification_status: b.transmission_sig === "valid-sig" && b.webhook_id === "WH-ID-1" ? "SUCCESS" : "FAILURE" });
    }
    return new Response("rota desconhecida", { status: 404 });
  };
  return { handler, orders, calls };
}

async function setupPaypal(p: Portal, s: Session) {
  const sec = await p.admin(s, "PUT", "/api/admin/providers/paypal/secrets", {
    mode: "sandbox",
    values: { client_id: "PP-CLIENT-1234", client_secret: "PP-SECRET-xyz", webhook_id: "WH-ID-1" },
  });
  expect(sec.status).toBe(200);
  const en = await p.admin(s, "PUT", "/api/admin/providers/paypal", { enabled: true, mode: "sandbox", currencyMode: "USD" });
  expect(en.status).toBe(200);
}

function ppHeaders(sig = "valid-sig"): Record<string, string> {
  return {
    "paypal-transmission-id": "tx-1",
    "paypal-transmission-time": "2026-11-12T12:00:00Z",
    "paypal-transmission-sig": sig,
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
    "paypal-auth-algo": "SHA256withRSA",
  };
}

describe("PayPal (Orders v2 + webhook) contra um PayPal simulado", () => {
  it("parametrização: segredos nunca voltam ao navegador e ficam cifrados", async () => {
    const p = await makePortal();
    const s = await ready(p);
    // sem credenciais não liga
    const early = await p.admin(s, "PUT", "/api/admin/providers/paypal", { enabled: true });
    expect(early.status).toBe(409);
    expect(early.body.missing).toEqual(["client_id", "client_secret", "webhook_id"]);
    await setupPaypal(p, s);

    const list = await p.admin(s, "GET", "/api/admin/providers");
    const text = JSON.stringify(list.body);
    for (const secret of ["PP-SECRET-xyz", "PP-CLIENT-1234", "WH-ID-1"]) expect(text).not.toContain(secret);
    const pp = list.body.providers.find((x: { id: string }) => x.id === "paypal");
    expect(pp.status).toBe("active");
    expect(pp.secrets.sandbox.client_secret.set).toBe(true);
    expect(pp.secrets.sandbox.client_secret.hint).toBeNull(); // segredo de verdade nunca mostra sufixo
    expect(pp.secrets.sandbox.client_id.hint).toBe("…1234"); // identificador não secreto: só o final
    expect(pp.webhookUrl).toBe("https://portal.test/api/webhooks/paypal");

    const rows = await p.db.prepare("SELECT ciphertext, iv FROM provider_secrets").all<{ ciphertext: string; iv: string }>();
    expect(rows.results).toHaveLength(3);
    expect(JSON.stringify(rows.results)).not.toContain("PP-SECRET-xyz");

    // checkout público também não vaza
    const cfg = await p.json("GET", `/api/checkout/config?serial=${SERIAL}`);
    expect(JSON.stringify(cfg.body)).not.toContain("PP-SECRET");
    expect(cfg.body.providers.map((x: { id: string }) => x.id)).toEqual(["paypal", "mock"]);

    // apagar um segredo desliga o provedor (não deixa checkout pela metade)
    await p.admin(s, "PUT", "/api/admin/providers/paypal/secrets", { mode: "sandbox", clear: ["webhook_id"], values: {} });
    const after = await p.admin(s, "GET", "/api/admin/providers");
    expect(after.body.providers.find((x: { id: string }) => x.id === "paypal").status).toBe("awaiting_credentials");
    const audit = JSON.stringify((await p.admin(s, "GET", "/api/admin/audit")).body);
    expect(audit).not.toContain("PP-SECRET");
  });

  it("pedido → aprovação → captura no retorno → licença definitiva; repetir o retorno é idempotente", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const pp = fakePaypal();
    p.fetchHandlers.push(pp.handler);
    await setupPaypal(p, s);

    expect((await p.admin(s, "POST", "/api/admin/providers/paypal/test")).body.ok).toBe(true);

    const st = await startCheckout(p, "paypal", {}, SERIAL, { country: "US" });
    expect(st.status).toBe(200);
    expect(st.body.currency).toBe("USD");
    expect(st.body.amountCents).toBe(2900);
    expect(st.body.redirectUrl).toBe("https://paypal.test/approve/ORD1");
    const pid = st.body.paymentId as string;
    const order = pp.orders.get("ORD1")!;
    expect(order).toMatchObject({ custom: pid, currency: "USD", value: "29.00" });

    // volta sem aprovar: segue pendente
    await p.call("GET", `/api/checkout/return?pid=${pid}&token=ORD1`);
    expect((await p.json("GET", `/api/checkout/status?pid=${pid}`)).body.status).not.toBe("paid");
    expect(await licCount(p)).toBe(0);

    order.approved = true;
    for (let i = 0; i < 3; i++) await p.call("GET", `/api/checkout/return?pid=${pid}&token=ORD1`);
    const s2 = (await p.json("GET", `/api/checkout/status?pid=${pid}`)).body;
    expect(s2.status).toBe("paid");
    expect(s2.license.token).toMatch(/^HCL1\./);
    expect(await licCount(p)).toBe(1);
    const row = await p.db.prepare("SELECT provider_capture_id, provider_fee_cents, payer_email, status FROM payments WHERE id = ?1").bind(pid).first<Record<string, unknown>>();
    expect(row).toMatchObject({ provider_capture_id: "CAP-ORD1", provider_fee_cents: 150, payer_email: "pagador@example.com", status: "paid" });
  });

  it("webhook: assinatura verificada na API do PayPal, idempotente por event id, captura valores e moeda", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const pp = fakePaypal();
    p.fetchHandlers.push(pp.handler);
    await setupPaypal(p, s);
    const st = await startCheckout(p, "paypal");
    const pid = st.body.paymentId as string;
    pp.orders.get("ORD1")!.approved = true;
    pp.orders.get("ORD1")!.captured = true;

    const evt = { id: "WH-EVT-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-ORD1", custom_id: pid, amount: { currency_code: "USD", value: "29.00" } } };
    const bad = await p.json("POST", "/api/webhooks/paypal", { body: JSON.stringify(evt), headers: ppHeaders("assinatura-falsa") });
    expect(bad.status).toBe(401);
    expect((await p.db.prepare("SELECT COUNT(*) AS n FROM webhook_events").first<{ n: number }>())!.n).toBe(0);
    const semCab = await p.json("POST", "/api/webhooks/paypal", { body: JSON.stringify(evt) });
    expect(semCab.status).toBe(401);
    expect(await licCount(p)).toBe(0);

    for (let i = 0; i < 5; i++) {
      const r = await p.json("POST", "/api/webhooks/paypal", { body: JSON.stringify(evt), headers: ppHeaders() });
      expect(r.status).toBe(200);
    }
    expect(await licCount(p)).toBe(1);
    const ev = await p.db.prepare("SELECT status, payment_id FROM webhook_events WHERE event_id = 'WH-EVT-1'").first<{ status: string; payment_id: string }>();
    expect(ev).toEqual({ status: "ok", payment_id: pid });
    expect(pp.calls.verify).toBe(6); // 5 válidos + 1 inválido (a falta de cabeçalho nem chega à API)
  });

  it("webhook CHECKOUT.ORDER.APPROVED captura sozinho (comprador fechou a aba)", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const pp = fakePaypal();
    p.fetchHandlers.push(pp.handler);
    await setupPaypal(p, s);
    const st = await startCheckout(p, "paypal");
    const pid = st.body.paymentId as string;
    pp.orders.get("ORD1")!.approved = true;
    const evt = { id: "WH-EVT-A", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "ORD1", purchase_units: [{ custom_id: pid }] } };
    expect((await p.json("POST", "/api/webhooks/paypal", { body: JSON.stringify(evt), headers: ppHeaders() })).status).toBe(200);
    expect(pp.calls.capture).toBe(1);
    expect(await licCount(p)).toBe(1);
  });

  it("valor capturado diferente do pedido: pagamento falha e nenhuma licença é emitida", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const pp = fakePaypal();
    p.fetchHandlers.push(pp.handler);
    await setupPaypal(p, s);
    const st = await startCheckout(p, "paypal");
    const pid = st.body.paymentId as string;
    const o = pp.orders.get("ORD1")!;
    o.approved = true;
    o.captured = true;
    o.captureValue = "1.00";
    await p.call("GET", `/api/checkout/return?pid=${pid}&token=ORD1`);
    expect((await p.json("GET", `/api/checkout/status?pid=${pid}`)).body.status).toBe("failed");
    expect(await licCount(p)).toBe(0);
  });

  it("evento de reembolso do PayPal revoga a licença", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const pp = fakePaypal();
    p.fetchHandlers.push(pp.handler);
    await setupPaypal(p, s);
    const st = await startCheckout(p, "paypal");
    const pid = st.body.paymentId as string;
    const o = pp.orders.get("ORD1")!;
    o.approved = true;
    await p.call("GET", `/api/checkout/return?pid=${pid}&token=ORD1`);
    expect(await licCount(p)).toBe(1);
    // o PayPal passa a reportar a captura como REFUNDED
    const realFetchOrder = pp.handler;
    p.fetchHandlers.unshift(async (url, init) => {
      const r = await realFetchOrder(url, init);
      if (r && url.endsWith("/v2/checkout/orders/ORD1") && (init.method || "GET") === "GET") {
        const j = await r.json();
        j.purchase_units[0].payments.captures[0].status = "REFUNDED";
        return Response.json(j);
      }
      return r;
    });
    const evt = { id: "WH-EVT-R", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "CAP-ORD1", custom_id: pid } };
    expect((await p.json("POST", "/api/webhooks/paypal", { body: JSON.stringify(evt), headers: ppHeaders() })).status).toBe(200);
    expect((await p.db.prepare("SELECT status FROM licenses WHERE type = 'definitive'").first<{ status: string }>())!.status).toBe("revoked");
    expect((await p.db.prepare("SELECT status FROM payments WHERE id = ?1").bind(pid).first<{ status: string }>())!.status).toBe("refunded");
  });

  it("credenciais erradas: 'Testar conexão' falha com mensagem clara", async () => {
    const p = await makePortal();
    const s = await ready(p);
    p.fetchHandlers.push(fakePaypal().handler);
    await p.admin(s, "PUT", "/api/admin/providers/paypal/secrets", { mode: "sandbox", values: { client_id: "OUTRO-1234", client_secret: "errado", webhook_id: "WH-ID-1" } });
    const r = await p.admin(s, "POST", "/api/admin/providers/paypal/test");
    expect(r.body.ok).toBe(false);
    expect(r.body.message).toContain("recusou");
  });
});

/* -------------------------------- PicPay -------------------------------- */

function fakePicpay() {
  const orders = new Map<string, { value: number; status: string; auth?: string }>();
  const handler: FetchHandler = async (url, init) => {
    if (!url.startsWith("https://api.picpay.com")) return undefined;
    const path = url.replace("https://api.picpay.com", "");
    const method = (init.method || "GET").toUpperCase();
    if (path === "/oauth2/token") {
      const b = JSON.parse(String(init.body));
      return b.client_id === "pic-client-0001" && b.client_secret === "pic-secret" && b.grant_type === "client_credentials"
        ? Response.json({ access_token: "pic-tok", token_type: "Bearer", expires_in: 300 })
        : new Response("no", { status: 401 });
    }
    if ((init.headers as Record<string, string>)?.authorization !== "Bearer pic-tok") return new Response("unauth", { status: 401 });
    if (path === "/ecommerce/v2/payments" && method === "POST") {
      const b = JSON.parse(String(init.body));
      orders.set(b.referenceId, { value: b.value, status: "created" });
      return Response.json({ referenceId: b.referenceId, paymentUrl: `https://app.picpay.test/checkout/${b.referenceId}`, qrcode: { content: "https://app.picpay.test/c", base64: "data:image/png;base64,AAAA" }, expiresAt: b.expiresAt });
    }
    const m = path.match(/^\/ecommerce\/v2\/payments\/(pay_\w+)\/status$/);
    if (m && method === "GET") {
      const o = orders.get(m[1]);
      return o ? Response.json({ referenceId: m[1], status: o.status, authorizationId: o.auth, value: o.value }) : new Response("nf", { status: 404 });
    }
    return new Response("x", { status: 404 });
  };
  return { handler, orders };
}

describe("PicPay (carteira e-commerce) contra um PicPay simulado", () => {
  async function setup(p: Portal, s: Session) {
    const sec = await p.admin(s, "PUT", "/api/admin/providers/picpay/secrets", { mode: "live", values: { client_id: "pic-client-0001", client_secret: "pic-secret", seller_token: "seller-token-xyz" } });
    expect(sec.status).toBe(200);
    expect((await p.admin(s, "PUT", "/api/admin/providers/picpay", { enabled: true, mode: "live", currencyMode: "BRL" })).status).toBe(200);
  }

  it("sem credenciais fica 'aguardando credenciais'; PicPay não aceita sandbox nem USD", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const l = await p.admin(s, "GET", "/api/admin/providers");
    expect(l.body.providers.find((x: { id: string }) => x.id === "picpay")).toMatchObject({ status: "awaiting_credentials", noSandbox: true });
    expect((await p.admin(s, "PUT", "/api/admin/providers/picpay", { mode: "sandbox" })).body.error).toBe("no_sandbox");
    expect((await p.admin(s, "PUT", "/api/admin/providers/picpay", { currencyMode: "USD" })).body.error).toBe("invalid_currency_mode");
    expect((await p.admin(s, "PUT", "/api/admin/providers/picpay", { enabled: true })).status).toBe(409);
  });

  it("checkout em reais, callback autenticado por x-seller-token e consulta de status", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const pc = fakePicpay();
    p.fetchHandlers.push(pc.handler);
    await setup(p, s);
    expect((await p.admin(s, "POST", "/api/admin/providers/picpay/test")).body.ok).toBe(true);

    const q = await quote(p);
    // o PicPay exige nome e CPF do pagador
    const noBuyer = await p.json("POST", "/api/checkout/start", { json: { quoteId: q.quoteId, provider: "picpay", acceptNoRefund: true } });
    expect(noBuyer.body.error).toBe("buyer_required");
    const q2 = await quote(p);
    const st = await p.json("POST", "/api/checkout/start", {
      json: { quoteId: q2.quoteId, provider: "picpay", acceptNoRefund: true, lang: "pt", buyer: { firstName: "Fulano", lastName: "de Tal", document: "000.000.000-00" } },
    });
    expect(st.status).toBe(200);
    expect(st.body.currency).toBe("BRL");
    expect(st.body.amountCents).toBe(16300);
    expect(st.body.qr.content).toContain("picpay.test");
    const pid = st.body.paymentId as string;
    expect(pc.orders.get(pid)!.value).toBe(163);
    // o CPF não fica no nosso banco
    const dump = JSON.stringify(await p.db.prepare("SELECT * FROM payments").all());
    expect(dump).not.toContain("000.000.000-00");

    const body = JSON.stringify({ referenceId: pid, authorizationId: "AUTH-1" });
    // callback com token errado
    expect((await p.json("POST", "/api/webhooks/picpay", { body, headers: { "x-seller-token": "errado" } })).status).toBe(401);
    expect((await p.json("POST", "/api/webhooks/picpay", { body })).status).toBe(401);
    expect(await licCount(p)).toBe(0);

    // callback certo, mas o status ainda é "created": nada de licença
    expect((await p.json("POST", "/api/webhooks/picpay", { body, headers: { "x-seller-token": "seller-token-xyz" } })).status).toBe(200);
    expect(await licCount(p)).toBe(0);

    pc.orders.get(pid)!.status = "paid";
    pc.orders.get(pid)!.auth = "AUTH-1";
    p.clock.t += 1;
    expect((await p.json("POST", "/api/webhooks/picpay", { body, headers: { "x-seller-token": "seller-token-xyz" } })).status).toBe(200);
    p.clock.t += 1;
    expect((await p.json("POST", "/api/webhooks/picpay", { body, headers: { "x-seller-token": "seller-token-xyz" } })).status).toBe(200);
    expect(await licCount(p)).toBe(1);
    expect((await p.db.prepare("SELECT provider_capture_id FROM payments WHERE id = ?1").bind(pid).first<{ provider_capture_id: string }>())!.provider_capture_id).toBe("AUTH-1");

    // estorno posterior revoga
    pc.orders.get(pid)!.status = "refunded";
    p.clock.t += 1;
    await p.json("POST", "/api/webhooks/picpay", { body, headers: { "x-seller-token": "seller-token-xyz" } });
    expect((await p.db.prepare("SELECT status FROM licenses WHERE type = 'definitive'").first<{ status: string }>())!.status).toBe("revoked");
  });

  it("valor diferente do pedido no PicPay: falha, sem licença", async () => {
    const p = await makePortal();
    const s = await ready(p);
    const pc = fakePicpay();
    p.fetchHandlers.push(pc.handler);
    await setup(p, s);
    const st = await startCheckout(p, "picpay", { buyer: { firstName: "A", lastName: "B", document: "1" } });
    const pid = st.body.paymentId as string;
    pc.orders.get(pid)!.status = "paid";
    pc.orders.get(pid)!.value = 1;
    const body = JSON.stringify({ referenceId: pid, authorizationId: "A" });
    await p.json("POST", "/api/webhooks/picpay", { body, headers: { "x-seller-token": "seller-token-xyz" } });
    expect(await licCount(p)).toBe(0);
    expect((await p.db.prepare("SELECT status FROM payments WHERE id = ?1").bind(pid).first<{ status: string }>())!.status).toBe("failed");
  });
});

/* ---------------------------------- Câmbio ------------------------------- */

describe("câmbio: fontes, fallback, cache e divergência", () => {
  it("PTAX falha → AwesomeAPI → Frankfurter; todas falham → última boa (72 h) com +1%; sem nada, BRL indisponível", async () => {
    const p = await makePortal();
    const s = await p.login();
    await p.setPrice(s, "29.00");
    const fx = (r: Parameters<typeof fxHandler>[0]) => {
      p.fetchHandlers.length = 0;
      p.fetchHandlers.push(fxHandler(r));
    };

    fx({ ptax: null, awesome: 5.5, frank: 5.6 });
    let q = await quote(p);
    expect(q.rateSource).toBe("awesomeapi");

    p.clock.t += 3700;
    fx({ ptax: null, awesome: null, frank: 5.6 });
    q = await quote(p);
    expect(q.rateSource).toBe("frankfurter");
    expect(q.rateMicro).toBe(5_600_000);

    // tudo fora do ar, cotação de 2 h atrás: usa a última boa com +1% de folga
    p.clock.t += 7300;
    fx({ ptax: null, awesome: null, frank: null });
    q = await quote(p);
    expect(q.stale).toBe(true);
    expect(q.spreadBps).toBe(400);
    expect(q.brlCents).toBe(Math.ceil((2900 * 5.6 * 1.04) / 100) * 100);

    // passou de 72 h: sem fonte nenhuma, BRL indisponível (USD segue)
    p.clock.t += 73 * 3600;
    q = await quote(p);
    expect(q.brlCents).toBeNull();
    expect(q.usdCents).toBe(2900);
    const st = await p.json("POST", "/api/checkout/start", { json: { quoteId: q.quoteId, provider: "mock", acceptNoRefund: true, lang: "pt" } });
    expect(st.body.error).toBe("brl_unavailable");
    // a cotação não fica "presa" ao pedido que falhou
    const again = await p.json("POST", "/api/checkout/start", { json: { quoteId: q.quoteId, provider: "mock", acceptNoRefund: true, lang: "pt" } });
    expect(again.body.error).toBe("brl_unavailable");

    // cotação manual do admin com validade
    const s2 = await p.login(); // a sessão anterior (8 h) expirou com o relógio avançado
    const m = await p.admin(s2, "PUT", "/api/admin/fx/manual", { rate: "5.40", hours: 2 });
    expect(m.status).toBe(200);
    q = await quote(p);
    expect(q.rateSource).toBe("manual");
    expect(q.brlCents).toBe(16200); // 29 × 5,40 × 1,03 = 161,298 → R$ 162
  });

  it("divergência > 5% entre PTAX e AwesomeAPI não é usada (proteção contra dado ruim)", async () => {
    const p = await makePortal();
    const s = await p.login();
    await p.setPrice(s, "29.00");
    p.fetchHandlers.push(fxHandler({ ptax: 5.4, awesome: 6.2, frank: 5.4 }));
    const q = await quote(p);
    expect(q.brlCents).toBeNull();
    const a = await p.admin(s, "GET", "/api/admin/audit");
    expect(a.body.audit.map((x: { action: string }) => x.action)).toContain("fx_divergence");
  });

  it("aba Preço: prévia da conversão com a cotação do dia", async () => {
    const p = await makePortal();
    const s = await p.login();
    p.fetchHandlers.push(fxHandler({ ptax: 5.4321 }));
    const none = await p.admin(s, "GET", "/api/admin/pricing");
    expect(none.body.configured).toBe(false);
    expect(none.body.fx.source).toBe("ptax");
    await p.setPrice(s, "29.00");
    const r = await p.admin(s, "GET", "/api/admin/pricing");
    expect(r.body.preview).toMatchObject({ usdCents: 2900, brlCents: 16300, rateSource: "ptax", spreadBps: 300 });
    expect(r.body.price).toMatchObject({ fx_spread_bps: 300, fxSpreadBps: 300, usdCents: 2900, rounding: "real" });
    // validações
    expect((await p.admin(s, "PUT", "/api/admin/pricing", { usd: "0.50" })).body.error).toBe("invalid_price");
    expect((await p.admin(s, "PUT", "/api/admin/pricing", { usd: "29", spreadBps: 5000 })).body.error).toBe("invalid_spread");
    // spread com vírgula decimal e re-leitura camelCase (evita NaN no admin)
    expect((await p.admin(s, "PUT", "/api/admin/pricing", { usd: "31,50", spreadBps: 350 })).status).toBe(200);
    const again = await p.admin(s, "GET", "/api/admin/pricing");
    expect(again.body.price.usdCents).toBe(3150);
    expect(again.body.price.fxSpreadBps).toBe(350);
    void T0;
  });
});
