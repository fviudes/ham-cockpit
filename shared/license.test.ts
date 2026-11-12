import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  EMPTY_CLOCK_STATE,
  PROVISIONAL_DAYS,
  anchorServerTime,
  b64urlEncode,
  brlCentsFromUsd,
  effectiveNow,
  evaluateLicense,
  importPrivateKey,
  isValidCallsign,
  isValidEmail,
  isValidSerial,
  licenseGateOf,
  licenseMenusOpen,
  normalizeCallsign,
  normalizeEmail,
  normalizeSerial,
  parseSerialInput,
  serialCheck,
  serialDisplay,
  serialFromCpuinfo,
  signBlob,
  verifyBlob,
  verifyLicenseToken,
  type LicensePayload,
} from "./license";
import type { KeyringEntry } from "./license-keys";

const SERIAL = "10000000a1b2c3d4";
const DAY = 86400;
const T0 = 1_794_499_132;

async function makeKey(label = "t") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "jwk" }).x as string;
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const kid = pub.slice(0, 8);
  const keyring: KeyringEntry[] = [{ kid, label: "t", env: "dev", pub, status: "active" }];
  return { kid, keyring, key: await importPrivateKey(pkcs8), label };
}

function payload(kid: string, over: Partial<LicensePayload> = {}): LicensePayload {
  return { v: 1, kid, lid: "lic_TEST", serial: SERIAL, type: "trial", iat: T0, exp: T0 + 30 * DAY, line: "0", st: T0, ...over };
}

describe("serial", () => {
  it("normaliza, rejeita zeros e valida o dígito verificador", async () => {
    expect(normalizeSerial("  10000000A1B2C3D4 ")).toBe(SERIAL);
    expect(normalizeSerial("0000000000000000")).toBeNull();
    expect(normalizeSerial("abc")).toBeNull();
    expect(normalizeSerial("ffff10000000a1b2c3d4")).toBe(SERIAL);
    expect(isValidSerial(SERIAL)).toBe(true);
    expect(isValidSerial("10000000A1B2C3D4")).toBe(false);
    const chk = await serialCheck(SERIAL);
    expect(chk).toMatch(/^[0-9A-F]{2}$/);
    const shown = await serialDisplay(SERIAL);
    expect(shown).toBe(`1000-0000-A1B2-C3D4-${chk}`);
    expect(await parseSerialInput(shown)).toEqual({ ok: true, serial: SERIAL, checked: true });
    expect(await parseSerialInput(SERIAL)).toEqual({ ok: true, serial: SERIAL, checked: false });
    expect(await parseSerialInput(SERIAL, chk)).toMatchObject({ ok: true, checked: true });
    const wrong = chk === "00" ? "01" : "00";
    expect(await parseSerialInput(SERIAL, wrong)).toEqual({ ok: false, error: "serial_check_failed" });
    expect(await parseSerialInput("123")).toEqual({ ok: false, error: "serial_invalid" });
    expect(await parseSerialInput("0000000000000000")).toEqual({ ok: false, error: "serial_invalid" });
  });

  it("lê o serial de /proc/cpuinfo e do device-tree", () => {
    const cpu = "processor\t: 0\nHardware\t: BCM2835\nRevision\t: c03111\nSerial\t\t: 10000000a1b2c3d4\nModel\t\t: Raspberry Pi 4\n";
    expect(serialFromCpuinfo(cpu)).toBe(SERIAL);
    expect(serialFromCpuinfo("Serial\t: 0000000000000000\n", "10000000a1b2c3d4\0")).toBe(SERIAL);
    expect(serialFromCpuinfo("processor : 0\n", null)).toBeNull();
  });
});

describe("callsign / prefixo", () => {
  it("normaliza e valida indicativos típicos", () => {
    expect(normalizeCallsign(" py2abc/qrp ")).toBe("PY2ABC");
    expect(isValidCallsign("PY2ABC")).toBe(true);
    expect(isValidCallsign("PU2XYZ")).toBe(true);
    expect(isValidCallsign("W1AW")).toBe(true);
    expect(isValidCallsign("9A1ABC")).toBe(true);
    expect(isValidCallsign("")).toBe(false);
    expect(isValidCallsign("N0CALL")).toBe(false);
    expect(isValidCallsign("ABC")).toBe(false);
    expect(isValidCallsign("123")).toBe(false);
  });
});

describe("token HCL1", () => {
  it("assina e verifica; adulteração e chave errada falham", async () => {
    const a = await makeKey();
    const token = await signBlob("HCL1", payload(a.kid), a.key);
    expect(token.startsWith("HCL1.")).toBe(true);
    expect(token.split(".").length).toBe(3);
    const ok = await verifyLicenseToken(token, SERIAL, a.keyring);
    expect(ok.ok).toBe(true);
    // colado com quebras de linha
    expect((await verifyLicenseToken(token.replace(/(.{60})/g, "$1\n  "), SERIAL, a.keyring)).ok).toBe(true);
    // serial de outro aparelho
    expect(await verifyLicenseToken(token, "20000000a1b2c3d4", a.keyring)).toEqual({ ok: false, error: "serial_mismatch" });
    // payload alterado (exp + 10 anos) com a assinatura antiga
    const [p, body, sig] = token.split(".");
    const forged = { ...payload(a.kid), exp: T0 + 3650 * DAY };
    const forgedToken = `${p}.${b64urlEncode(new TextEncoder().encode(JSON.stringify(forged)))}.${sig}`;
    expect(await verifyLicenseToken(forgedToken, SERIAL, a.keyring)).toEqual({ ok: false, error: "bad_signature" });
    // um bit trocado na assinatura
    const sigBytes = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    sigBytes[0] ^= 1;
    const flipped = `${p}.${body}.${b64urlEncode(new Uint8Array(sigBytes))}`;
    expect(await verifyLicenseToken(flipped, SERIAL, a.keyring)).toEqual({ ok: false, error: "bad_signature" });
    // outra chave com o mesmo kid
    const b = await makeKey();
    const fake = await signBlob("HCL1", payload(a.kid), b.key);
    expect(await verifyLicenseToken(fake, SERIAL, a.keyring)).toEqual({ ok: false, error: "bad_signature" });
    // kid desconhecido e formatos ruins
    expect(await verifyLicenseToken(token, SERIAL, b.keyring)).toEqual({ ok: false, error: "unknown_kid" });
    expect(await verifyLicenseToken("HCL1.abc", SERIAL, a.keyring)).toEqual({ ok: false, error: "invalid_format" });
    expect(await verifyLicenseToken("XXXX." + body + "." + sig, SERIAL, a.keyring)).toEqual({ ok: false, error: "invalid_format" });
    expect(await verifyLicenseToken("HCL1.@@@.@@@", SERIAL, a.keyring)).toEqual({ ok: false, error: "invalid_format" });
  });

  it("separação de domínio: recibo não vale como licença", async () => {
    const a = await makeKey();
    const receipt = await signBlob("HCR1", { v: 1, kid: a.kid, serial: SERIAL, lid: null, st: T0, crl: 0, enforce: false }, a.key);
    expect((await verifyBlob("HCR1", receipt, a.keyring)).ok).toBe(true);
    const asLicense = receipt.replace(/^HCR1/, "HCL1");
    expect(await verifyLicenseToken(asLicense, SERIAL, a.keyring)).toMatchObject({ ok: false, error: "bad_signature" });
  });
});

describe("veredito", () => {
  it("matriz do protótipo: dia 1, 29, 30, definitiva, serial e anti-retrocesso", async () => {
    const a = await makeKey();
    const trial = await verifyLicenseToken(await signBlob("HCL1", payload(a.kid), a.key), SERIAL, a.keyring);
    const base = { serial: SERIAL, token: trial, firstSeen: T0, appVersion: "0.1.06.02" } as const;
    expect(evaluateLicense({ ...base, now: T0 + 1 * DAY }).state).toBe("trial");
    const d29 = evaluateLicense({ ...base, now: T0 + 29 * DAY });
    expect(d29.state).toBe("trial");
    expect(d29.daysLeft).toBe(1);
    expect(evaluateLicense({ ...base, now: T0 + 30 * DAY })).toMatchObject({ state: "expirada", allowed: false });

    const def = await verifyLicenseToken(
      await signBlob("HCL1", payload(a.kid, { type: "definitive", exp: null, lid: "lic_DEF" }), a.key),
      SERIAL,
      a.keyring,
    );
    expect(evaluateLicense({ ...base, token: def, now: T0 + 3650 * DAY })).toMatchObject({ state: "ativa", daysLeft: null, allowed: true });

    // revogada pela CRL
    expect(evaluateLicense({ ...base, token: def, now: T0 + DAY, revoked: new Set(["lic_DEF"]) })).toMatchObject({ state: "revogada", allowed: false });
    // linha de produto não coberta
    expect(evaluateLicense({ ...base, appVersion: "1.0.0", now: T0 + DAY, firstSeen: T0 - 100 * DAY }).state).toBe("sem_licenca");
  });

  it("sem token: provisório por 7 dias; depois sem licença; sem serial nunca bloqueia", () => {
    const base = { serial: SERIAL, token: null, firstSeen: T0 } as const;
    const prov = evaluateLicense({ ...base, now: T0 + 6 * DAY });
    expect(prov).toMatchObject({ state: "provisional", allowed: true });
    expect(prov.provisionalEndsAt).toBe(T0 + PROVISIONAL_DAYS * DAY);
    expect(evaluateLicense({ ...base, now: T0 + 7 * DAY })).toMatchObject({ state: "sem_licenca", allowed: false });
    expect(evaluateLicense({ serial: null, token: null, now: T0 + 999 * DAY, firstSeen: T0 })).toMatchObject({ state: "sem_serial", allowed: true });
    // token inválido dentro da janela: "invalida" mas segue liberado
    expect(evaluateLicense({ ...base, token: { ok: false, error: "bad_signature" }, now: T0 + DAY })).toMatchObject({ state: "invalida", allowed: true, reason: "bad_signature" });
    expect(evaluateLicense({ ...base, token: { ok: false, error: "bad_signature" }, now: T0 + 8 * DAY })).toMatchObject({ state: "sem_licenca", allowed: false });
  });

  it("licenseGateOf mapeia veredito → gate de UI", () => {
    expect(licenseGateOf("ativa")).toBe("licensed");
    expect(licenseGateOf("trial")).toBe("trial");
    expect(licenseGateOf("expirada")).toBe("trial_expired");
    expect(licenseGateOf("provisional")).toBe("unlicensed");
    expect(licenseGateOf("sem_licenca")).toBe("unlicensed");
    expect(licenseGateOf("revogada")).toBe("unlicensed");
    expect(licenseMenusOpen("licensed")).toBe(true);
    expect(licenseMenusOpen("trial")).toBe(true);
    expect(licenseMenusOpen("trial_expired")).toBe(false);
    expect(licenseMenusOpen("unlicensed")).toBe(false);
  });

  it("e-mail: normaliza e valida formato básico", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("relógio efetivo (anti-retrocesso)", () => {
  it("o relógio voltar para o passado não devolve dias de trial", () => {
    // Estado visto no dia 31; o usuário volta a data para o dia 1.
    const state = { maxSeen: T0 + 31 * DAY, checkpointUptime: 100, maxServerTime: 0 };
    const r = effectiveNow(state, { wall: T0 + DAY, uptime: 160, ntpSynced: false, witness: 0 });
    expect(r.now).toBeGreaterThanOrEqual(T0 + 31 * DAY + 60);
    expect(r.suspect).toBe(true);
    // Mesmo com NTP "sincronizado" mentindo para trás, nunca recua.
    const r2 = effectiveNow(state, { wall: T0 + DAY, uptime: 160, ntpSynced: true, witness: 0 });
    expect(r2.now).toBeGreaterThanOrEqual(T0 + 31 * DAY);
  });

  it("sem estado e relógio em 1970: vale o piso iat e não expira", () => {
    const r = effectiveNow(EMPTY_CLOCK_STATE, { wall: 0, uptime: 30, ntpSynced: false, witness: 0 }, T0);
    expect(r.now).toBe(T0);
  });

  it("relógio adiantado sem sincronia só avança o plausível (36 h)", () => {
    const state = { maxSeen: T0, checkpointUptime: 0, maxServerTime: 0 };
    const r = effectiveNow(state, { wall: T0 + 400 * DAY, uptime: 600, ntpSynced: false, witness: 0 });
    expect(r.now).toBeLessThan(T0 + 2 * DAY);
    const synced = effectiveNow(state, { wall: T0 + 400 * DAY, uptime: 600, ntpSynced: true, witness: 0 });
    expect(synced.now).toBe(T0 + 400 * DAY);
  });

  it("reboot reinicia a base do uptime; testemunha e âncora do servidor sustentam o piso", () => {
    const s0 = { maxSeen: T0 + 10 * DAY, checkpointUptime: 5000, maxServerTime: 0 };
    const afterBoot = effectiveNow(s0, { wall: T0, uptime: 40, ntpSynced: false, witness: 0 });
    expect(afterBoot.now).toBe(T0 + 10 * DAY + 40);
    const withWitness = effectiveNow(s0, { wall: T0, uptime: 40, ntpSynced: false, witness: T0 + 12 * DAY });
    expect(withWitness.now).toBe(T0 + 12 * DAY);
    const anchored = effectiveNow(anchorServerTime(s0, T0 + 20 * DAY), { wall: T0, uptime: 40, ntpSynced: false, witness: 0 });
    expect(anchored.now).toBe(T0 + 20 * DAY);
    expect(anchorServerTime(anchored.next, T0).maxServerTime).toBe(T0 + 20 * DAY);
  });
});

describe("conversão USD→BRL com spread", () => {
  it("exemplo do estudo: US$ 29,00 × 5,4321 + 3% sobe ao real", () => {
    // 29 × 5,4321 = 157,5309; com 3% = 162,2568; arredonda para cima ao real = 163,00
    expect(brlCentsFromUsd(2900, 5_432_100, 300, "real")).toBe(16300);
    expect(brlCentsFromUsd(2900, 5_432_100, 300, "cent")).toBe(16226);
    expect(brlCentsFromUsd(2900, 5_432_100, 300, "ten_cents")).toBe(16230);
    expect(brlCentsFromUsd(2900, 5_432_100, 0, "cent")).toBe(15754);
  });

  it("não perde precisão com valores grandes (BigInt)", () => {
    expect(brlCentsFromUsd(100_000_000, 9_999_999, 2000, "cent")).toBe(1_199_999_880);
    expect(brlCentsFromUsd(1, 1, 300, "cent")).toBe(1);
  });
});
