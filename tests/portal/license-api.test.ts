import { describe, expect, it } from "vitest";
import { serialCheck, verifyBlob, type CrlPayload, type ReceiptPayload } from "../../shared/license";
import { SERIAL, T0, fxHandler, makePortal, payloadOf } from "./harness";

const DAY = 86400;

describe("API do aparelho: registro e trial", () => {
  it("concede trial de 30 dias a partir da concessão e é idempotente por serial", async () => {
    const p = await makePortal();
    const a = await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL, appVersion: "0.1.06.02" } });
    expect(a.status).toBe(200);
    expect(a.body.status).toBe("trial");
    const ver = await p.verify(a.body.license.token);
    expect(ver.ok).toBe(true);
    const pl = payloadOf(a.body.license.token);
    expect(pl).toMatchObject({ serial: SERIAL, type: "trial", iat: T0, exp: T0 + 30 * DAY, line: "0" });
    expect(a.body.license.exp).toBe(T0 + 30 * DAY);
    expect(a.body.policy).toEqual({ enforce: false });

    // O recibo é assinado e traz o relógio do servidor.
    const rc = await verifyBlob<ReceiptPayload>("HCR1", a.body.receipt, p.keyring);
    expect(rc.ok && rc.payload.st).toBe(T0);

    // Dias depois: mesma licença, sem trial novo.
    p.clock.t = T0 + 5 * DAY;
    const b = await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL, lid: a.body.license.lid } });
    expect(b.body.license.lid).toBe(a.body.license.lid);
    expect(b.body.license.token).toBe(a.body.license.token);
    expect(b.body.changed).toBe(false);
    const rows = await p.db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE serial = ?1").bind(SERIAL).first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it("corrida: vários registros simultâneos do mesmo serial geram uma única concessão", async () => {
    const p = await makePortal();
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => p.json("POST", "/api/lic/activate", { json: { serial: SERIAL }, ip: `192.0.2.${i + 1}` })));
    expect(rs.every(r => r.status === 200)).toBe(true);
    expect(new Set(rs.map(r => r.body.license.lid)).size).toBe(1);
    const n = await p.db.prepare("SELECT COUNT(*) AS n FROM licenses").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("valida o serial (formato, zeros e dígito verificador)", async () => {
    const p = await makePortal();
    expect((await p.json("POST", "/api/lic/activate", { json: { serial: "abc" } })).body.error).toBe("serial_invalid");
    expect((await p.json("POST", "/api/lic/activate", { json: { serial: "0000000000000000" } })).body.error).toBe("serial_invalid");
    expect((await p.json("POST", "/api/lic/activate", { json: {} })).status).toBe(400);
    const chk = await serialCheck(SERIAL);
    const wrong = chk === "00" ? "01" : "00";
    expect((await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL, chk: wrong } })).body.error).toBe("serial_check_failed");
    expect((await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL, chk } })).status).toBe(200);
    expect((await p.json("POST", "/api/lic/activate", { json: { serial: "1000-0000-A1B2-C3D4-" + chk }, ip: "192.0.2.77" })).status).toBe(200);
  });

  it("limita requisições por IP (429)", async () => {
    const p = await makePortal();
    let last = 200;
    for (let i = 0; i < 12; i++) {
      const r = await p.json("POST", "/api/lic/activate", { json: { serial: `10000000a1b2${String(1000 + i).padStart(4, "0")}` }, ip: "192.0.2.50" });
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it("trial expirado não renova e aparece como expirado", async () => {
    const p = await makePortal();
    const a = await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL } });
    p.clock.t = T0 + 31 * DAY;
    const b = await p.json("POST", "/api/lic/sync", { json: { serial: SERIAL, lid: a.body.license.lid } });
    expect(b.body.status).toBe("expired");
    expect(b.body.license.lid).toBe(a.body.license.lid);
    const n = await p.db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE serial = ?1").bind(SERIAL).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("serial bloqueado não recebe licença", async () => {
    const p = await makePortal();
    await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL } });
    await p.db.prepare("UPDATE devices SET blocked = 1 WHERE serial = ?1").bind(SERIAL).run();
    expect((await p.json("POST", "/api/lic/sync", { json: { serial: SERIAL } })).status).toBe(403);
  });

  it("CRL assinada e política em modo observação", async () => {
    const p = await makePortal();
    const crl = await p.json("GET", "/api/lic/crl");
    const v = await verifyBlob<CrlPayload>("HCC1", crl.body.crl, p.keyring);
    expect(v.ok && v.payload.revoked).toEqual([]);
    expect((await p.json("GET", "/api/lic/policy")).body.enforce).toBe(false);
  });
});

describe("admin: login, sessão e proteção", () => {
  it("exige usuário + senha, bloqueia força bruta e protege rotas", async () => {
    const p = await makePortal();
    // sem sessão
    expect((await p.json("GET", "/api/admin/licenses")).status).toBe(401);
    // credenciais ruins
    expect((await p.json("POST", "/api/admin/login", { json: { username: "admin", password: "errada-errada" }, ip: "203.0.113.1" })).status).toBe(401);
    expect((await p.json("POST", "/api/admin/login", { json: { username: "nobody", password: p.adminPassword }, ip: "203.0.113.1" })).status).toBe(401);
    expect((await p.json("POST", "/api/admin/login", { json: { username: "admin" }, ip: "203.0.113.1" })).status).toBe(401);
    // força bruta: após 6 tentativas do mesmo IP, 429 até para as credenciais certas
    for (let i = 0; i < 3; i++) await p.json("POST", "/api/admin/login", { json: { username: "admin", password: "x".repeat(12) }, ip: "203.0.113.1" });
    const blocked = await p.json("POST", "/api/admin/login", { json: { username: p.adminUsername, password: p.adminPassword }, ip: "203.0.113.1" });
    expect(blocked.status).toBe(429);

    // IP limpo + credenciais certas
    const s = await p.login();
    expect(s.cookie).toMatch(/hc_admin|__Host-hc_admin/);
    const me = await p.admin(s, "GET", "/api/admin/me");
    expect(me.status).toBe(200);
    expect(me.body.username).toBe("admin");
    // mutação sem CSRF = 403
    const noCsrf = await p.json("PUT", "/api/admin/pricing", { json: { usd: "29" }, headers: { cookie: s.cookie }, ip: "203.0.113.9" });
    expect(noCsrf.status).toBe(403);
    // com CSRF funciona
    expect((await p.admin(s, "PUT", "/api/admin/pricing", { usd: "29.00" })).status).toBe(200);
    // sessão expira
    p.clock.t += 9 * 3600;
    expect((await p.admin(s, "GET", "/api/admin/me")).status).toBe(401);
  });

  it("o cookie de sessão é HttpOnly, Secure e SameSite=Strict (https)", async () => {
    const p = await makePortal();
    const r = await p.call("POST", "/api/admin/login", {
      json: { username: p.adminUsername, password: p.adminPassword },
      ip: "203.0.113.5",
    });
    const c = r.headers.get("set-cookie") ?? "";
    expect(c).toContain("__Host-hc_admin=");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Strict");
    expect(c).toContain("Path=/");
  });

  it("health.adminConfigured reflete usuários no D1", async () => {
    const empty = await makePortal({ seedAdmin: false });
    expect((await empty.json("GET", "/api/health")).body.adminConfigured).toBe(false);
    expect((await empty.json("POST", "/api/admin/login", { json: { username: "admin", password: "x".repeat(12) } })).status).toBe(503);

    const p = await makePortal();
    expect((await p.json("GET", "/api/health")).body.adminConfigured).toBe(true);
  });
});

describe("admin: licenças", () => {
  it("lista com serial mascarado, filtra, concede, estende, revoga e publica na CRL", async () => {
    const p = await makePortal();
    const s = await p.login();
    const act = await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL } });
    const lid = act.body.license.lid as string;

    const list = await p.admin(s, "GET", "/api/admin/licenses?type=trial");
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].serial).toBe("1000••••••••C3D4");
    expect(JSON.stringify(list.body)).not.toContain(SERIAL);
    expect((await p.admin(s, "GET", "/api/admin/licenses?type=definitive")).body.items).toHaveLength(0);
    expect((await p.admin(s, "GET", "/api/admin/licenses?q=c3d4")).body.items).toHaveLength(1);

    // estender trial exige motivo
    expect((await p.admin(s, "POST", `/api/admin/licenses/${lid}/extend`, { days: 10 })).body.error).toBe("reason_required");
    expect((await p.admin(s, "POST", `/api/admin/licenses/${lid}/extend`, { days: 10, reason: "suporte" })).status).toBe(200);
    const again = await p.json("POST", "/api/lic/activate", { json: { serial: SERIAL, lid: "old" } });
    expect(payloadOf(again.body.license.token).exp).toBe(T0 + 40 * DAY);
    expect(payloadOf(again.body.license.token).iat).toBe(T0); // iat original preservado

    // conceder definitiva
    const g = await p.admin(s, "POST", "/api/admin/licenses/grant", { serial: "20000000a1b2c3d4", reason: "cortesia", test: true });
    expect(g.status).toBe(200);
    expect((await p.admin(s, "POST", "/api/admin/licenses/grant", { serial: "20000000a1b2c3d4", reason: "x" })).status).toBe(409);
    expect((await p.admin(s, "POST", "/api/admin/licenses/grant", { serial: "123" })).status).toBe(400);

    // revogar publica na CRL e muda o status do aparelho
    expect((await p.admin(s, "POST", `/api/admin/licenses/${lid}/revoke`, { reason: "teste" })).status).toBe(200);
    const crl = await p.json("GET", "/api/lic/crl");
    const v = await verifyBlob<CrlPayload>("HCC1", crl.body.crl, p.keyring);
    expect(v.ok && v.payload.revoked).toContain(lid);
    expect(v.ok && v.payload.version).toBe(2);
    const st = await p.json("POST", "/api/lic/sync", { json: { serial: SERIAL, lid } });
    expect(st.body.status).toBe("revoked");
    expect(st.body.license).toBeNull();

    // detalhe e auditoria
    const det = await p.admin(s, "GET", `/api/admin/licenses/${lid}`);
    expect(det.body.events.length).toBeGreaterThan(0);
    const aud = await p.admin(s, "GET", "/api/admin/audit");
    const actions = aud.body.audit.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["license_extend", "license_revoke", "license_grant", "admin_login"]));

    // limpeza dos serais de teste
    expect((await p.admin(s, "POST", "/api/admin/devices/purge-test")).body.removed).toBe(1);
  });

  it("viewer/permissões: mutação sem sessão é recusada", async () => {
    const p = await makePortal();
    expect((await p.json("POST", "/api/admin/licenses/grant", { json: { serial: SERIAL } })).status).toBe(401);
  });
});

describe("preço e conversão", () => {
  it("sem preço: checkout indisponível ('preço não configurado')", async () => {
    const p = await makePortal();
    const cfg = await p.json("GET", `/api/checkout/config?serial=${SERIAL}`);
    expect(cfg.body.priceConfigured).toBe(false);
    expect(cfg.body.noRefund).toBe(true);
    const q = await p.json("POST", "/api/checkout/quote", { json: { serial: SERIAL } });
    expect(q.status).toBe(409);
    expect(q.body.error).toBe("price_not_configured");
  });

  it("USD 29,00 com PTAX 5,4321 + 3% sobe ao real; cotação fica congelada e expira", async () => {
    const p = await makePortal();
    p.fetchHandlers.push(fxHandler({ ptax: 5.4321 }));
    const s = await p.login();
    await p.setPrice(s, "29.00");
    const q = await p.json("POST", "/api/checkout/quote", { json: { serial: SERIAL } });
    expect(q.status).toBe(200);
    expect(q.body).toMatchObject({ usdCents: 2900, brlCents: 16300, rateMicro: 5_432_100, rateSource: "ptax", spreadBps: 300 });
    expect(q.body.expiresAt).toBe(T0 + 900);
    expect(q.body.noRefund).toBe(true);

    // Mercado mexe, mas dentro do cache de 1 h o valor segue o mesmo; outra cotação usa a taxa em cache.
    p.fetchHandlers.length = 0;
    p.fetchHandlers.push(fxHandler({ ptax: 6.0 }));
    p.clock.t += 600;
    const q2 = await p.json("POST", "/api/checkout/quote", { json: { serial: SERIAL } });
    expect(q2.body.brlCents).toBe(16300);
    // Após 1 h a cotação nova entra.
    p.clock.t += 3700;
    const q3 = await p.json("POST", "/api/checkout/quote", { json: { serial: SERIAL } });
    expect(q3.body.rateMicro).toBe(6_000_000);
    expect(q3.body.brlCents).toBe(18000); // 29 × 6 × 1,03 = 179,22 → sobe ao real
  });
});
