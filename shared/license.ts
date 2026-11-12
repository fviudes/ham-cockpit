/**
 * Núcleo da licença do Ham Cockpit (funções puras + WebCrypto).
 * Roda igual no aparelho (Node 20+), no portal (Workers) e nos testes.
 *
 * Formato: `HCL1.<payload b64url>.<assinatura b64url>`; Ed25519 sobre `"HCL1\n" || bytes do payload`.
 * Detalhes e racional: docs/licenciamento.md.
 */
import { LICENSE_KEYRING, type KeyringEntry } from "./license-keys";

export const TOKEN_PREFIX = "HCL1";
export const RECEIPT_PREFIX = "HCR1";
export const CRL_PREFIX = "HCC1";

/** Janela provisória (dias) sem token, contada da primeira inicialização. */
export const PROVISIONAL_DAYS = 7;
/** Tolerância de relógio para trás/adiantado sem sincronia (segundos). */
export const ROLLBACK_TOLERANCE_S = 36 * 3600;
/**
 * Entrega em MODO OBSERVAÇÃO: a política `enforce` do portal é só informativa.
 * O bloqueio só liga por flag local explícita (ver server/license-core.ts). Para a fase de enforce,
 * esta constante muda para `true` em uma versão própria.
 */
export const HONOR_PORTAL_POLICY = false;

export type LicenseType = "trial" | "definitive";

export interface LicensePayload {
  v: 1;
  kid: string;
  lid: string;
  serial: string;
  type: LicenseType;
  iat: number;
  exp: number | null;
  line: string;
  st: number;
}

export interface ReceiptPayload {
  v: 1;
  kid: string;
  serial: string;
  lid: string | null;
  st: number;
  crl: number;
  /** Política global do portal (informativa nesta entrega). */
  enforce: boolean;
}

export interface CrlPayload {
  v: 1;
  kid: string;
  version: number;
  st: number;
  revoked: string[];
}

/* ------------------------------ base64url ------------------------------ */

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("base64url inválido");
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64Decode(text: string): Uint8Array {
  const bin = atob(text.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64Encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/* -------------------------------- serial ------------------------------- */

/** Normaliza o serial do Pi: minúsculas, 16 hexadecimais; rejeita vazio e zeros. */
export function normalizeSerial(raw: string): string | null {
  const hex = String(raw ?? "").trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length < 16) return null;
  const s = hex.slice(-16);
  return /^0{16}$/.test(s) ? null : s;
}

/** Serial exato (16 hex minúsculos, não zero), para validar entradas do portal. */
export function isValidSerial(serial: string): boolean {
  return /^[0-9a-f]{16}$/.test(serial) && !/^0{16}$/.test(serial);
}

/** Dois caracteres de verificação: SHA-256("hc1:" + serial), 2 primeiros hex em maiúsculas. */
export async function serialCheck(serial: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`hc1:${serial}`)));
  return (d[0].toString(16).padStart(2, "0")).toUpperCase();
}

/** `1000-0000-A1B2-C3D4-7F` */
export async function serialDisplay(serial: string): Promise<string> {
  const groups = serial.toUpperCase().match(/.{4}/g) ?? [];
  return `${groups.join("-")}-${await serialCheck(serial)}`;
}

export type SerialInputResult =
  | { ok: true; serial: string; checked: boolean }
  | { ok: false; error: "serial_invalid" | "serial_check_failed" };

/**
 * Aceita o serial puro (16 hex) ou o formato de tela (16 hex + 2 de verificação, com ou sem hífens).
 * Com verificação, um erro de digitação é detectado na hora.
 * `chk` (opcional) vem do link gerado pelo console.
 */
export async function parseSerialInput(input: string, chk?: string): Promise<SerialInputResult> {
  const hex = String(input ?? "").trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  let serial: string;
  let check: string | undefined = chk ? String(chk).trim().toUpperCase() : undefined;
  if (hex.length === 18) {
    serial = hex.slice(0, 16);
    check = hex.slice(16).toUpperCase();
  } else if (hex.length === 16) {
    serial = hex;
  } else {
    return { ok: false, error: "serial_invalid" };
  }
  if (!isValidSerial(serial)) return { ok: false, error: "serial_invalid" };
  if (check) {
    if (check !== (await serialCheck(serial))) return { ok: false, error: "serial_check_failed" };
    return { ok: true, serial, checked: true };
  }
  return { ok: true, serial, checked: false };
}

/** Lê o serial do Pi a partir do texto de /proc/cpuinfo ou /proc/device-tree/serial-number. */
export function serialFromCpuinfo(cpuinfo: string | null, deviceTree?: string | null): string | null {
  if (cpuinfo) {
    const m = cpuinfo.match(/^Serial\s*:\s*([0-9a-fA-F]+)\s*$/m);
    if (m) {
      const s = normalizeSerial(m[1]);
      if (s) return s;
    }
  }
  if (deviceTree) {
    const s = normalizeSerial(deviceTree.replace(/\0+$/g, ""));
    if (s) return s;
  }
  return null;
}

/* ------------------------------ callsign / prefixo ------------------------------ */

/** Normaliza indicativo: maiúsculas, só A–Z / 0–9; descarta sufixo após `/`. */
export function normalizeCallsign(raw: string): string {
  const base = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "")
    .split("/")[0];
  return base || "";
}

/**
 * Validação simples de indicativo amador (ITU-ish).
 * Aceita PY2ABC, PU2XYZ, W1AW, 9A1ABC; rejeita vazio, N0CALL e só letras/só números.
 */
export function isValidCallsign(raw: string): boolean {
  const c = normalizeCallsign(raw);
  if (c.length < 3 || c.length > 10) return false;
  if (c === "N0CALL" || c === "NOCALL") return false;
  if (!/[A-Z]/.test(c) || !/[0-9]/.test(c)) return false;
  return /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z]$/.test(c);
}

/** Normaliza e-mail (trim + minúsculas). */
export function normalizeEmail(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

/** Formato básico de e-mail (obrigatório no Licenciar). */
export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  if (e.length < 5 || e.length > 120) return false;
  return /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,24}$/.test(e);
}

/* ------------------------------ criptografia --------------------------- */

const pubCache = new Map<string, CryptoKey>();

async function importPublic(pub: string): Promise<CryptoKey> {
  let k = pubCache.get(pub);
  if (!k) {
    k = await crypto.subtle.importKey("raw", b64urlDecode(pub), { name: "Ed25519" }, false, ["verify"]);
    pubCache.set(pub, k);
  }
  return k;
}

export async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", b64Decode(pkcs8Base64), { name: "Ed25519" }, false, ["sign"]);
}

/** Assina `payload` (JSON) com o prefixo dado e devolve `PREFIXO.payload.assinatura`. */
export async function signBlob(prefix: string, payload: object, key: CryptoKey): Promise<string> {
  const bytes = enc.encode(JSON.stringify(payload));
  const msg = concatBytes(enc.encode(`${prefix}\n`), bytes);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, msg));
  return `${prefix}.${b64urlEncode(bytes)}.${b64urlEncode(sig)}`;
}

export type VerifyError = "invalid_format" | "unknown_kid" | "bad_signature";

export type VerifiedBlob<T> = { ok: true; payload: T; kid: string } | { ok: false; error: VerifyError };

/** Remove espaços e quebras de linha (a chave pode ser colada em várias linhas). */
export function cleanToken(text: string): string {
  return String(text ?? "").replace(/\s+/g, "");
}

export async function verifyBlob<T extends { kid?: string; v?: number }>(
  prefix: string,
  text: string,
  keyring: KeyringEntry[] = LICENSE_KEYRING,
): Promise<VerifiedBlob<T>> {
  const t = cleanToken(text);
  const parts = t.split(".");
  if (parts.length !== 3 || parts[0] !== prefix || !parts[1] || !parts[2]) return { ok: false, error: "invalid_format" };
  let payloadBytes: Uint8Array;
  let sig: Uint8Array;
  let payload: T;
  try {
    payloadBytes = b64urlDecode(parts[1]);
    sig = b64urlDecode(parts[2]);
    payload = JSON.parse(dec.decode(payloadBytes)) as T;
  } catch {
    return { ok: false, error: "invalid_format" };
  }
  if (!payload || typeof payload !== "object" || payload.v !== 1 || typeof payload.kid !== "string") {
    return { ok: false, error: "invalid_format" };
  }
  const entry = keyring.find(k => k.kid === payload.kid && k.status !== "revoked");
  if (!entry) return { ok: false, error: "unknown_kid" };
  if (sig.length !== 64) return { ok: false, error: "bad_signature" };
  const msg = concatBytes(enc.encode(`${prefix}\n`), payloadBytes);
  let ok = false;
  try {
    ok = await crypto.subtle.verify({ name: "Ed25519" }, await importPublic(entry.pub), sig, msg);
  } catch {
    ok = false;
  }
  return ok ? { ok: true, payload, kid: entry.kid } : { ok: false, error: "bad_signature" };
}

export type TokenError = VerifyError | "serial_mismatch" | "invalid_payload";

export type TokenCheck =
  | { ok: true; payload: LicensePayload }
  | { ok: false; error: TokenError };

/** Verifica assinatura, esquema do payload e serial. Não olha prazo (isso é do `evaluateLicense`). */
export async function verifyLicenseToken(
  token: string,
  serial: string | null,
  keyring: KeyringEntry[] = LICENSE_KEYRING,
): Promise<TokenCheck> {
  const r = await verifyBlob<LicensePayload>(TOKEN_PREFIX, token, keyring);
  if (!r.ok) return r;
  const p = r.payload;
  const okShape =
    typeof p.lid === "string" &&
    typeof p.serial === "string" &&
    (p.type === "trial" || p.type === "definitive") &&
    Number.isFinite(p.iat) &&
    (p.exp === null || Number.isFinite(p.exp)) &&
    typeof p.line === "string" &&
    Number.isFinite(p.st);
  if (!okShape) return { ok: false, error: "invalid_payload" };
  if (!serial || p.serial !== serial) return { ok: false, error: "serial_mismatch" };
  return { ok: true, payload: p };
}

/* ------------------------------- relógio ------------------------------- */

export interface ClockInput {
  /** Relógio de parede (segundos Unix). */
  wall: number;
  /** Segundos desde o boot atual. */
  uptime: number;
  /** NTP sincronizado (ou recibo recente do portal). */
  ntpSynced: boolean;
  /** Maior mtime entre testemunhas independentes do relógio (0 se não houver). */
  witness: number;
}

export interface ClockState {
  /** Maior instante efetivo já visto. */
  maxSeen: number;
  /** Uptime no último ponto de verificação (para somar só o tempo ligado depois dele). */
  checkpointUptime: number;
  /** Maior `st` visto em token/recibo do portal. */
  maxServerTime: number;
}

export const EMPTY_CLOCK_STATE: ClockState = { maxSeen: 0, checkpointUptime: 0, maxServerTime: 0 };

export interface EffectiveClock {
  now: number;
  /** Relógio de parede ficou mais de 36 h abaixo do maior instante visto. */
  suspect: boolean;
  next: ClockState;
}

/**
 * agora efetivo = max(parede confiável, maior instante visto + uptime desde o último ponto,
 * testemunhas, `st` do servidor, piso `iat`). Sem sincronia, a parede só vale até "provável + 36 h".
 */
export function effectiveNow(state: ClockState, c: ClockInput, floor = 0): EffectiveClock {
  // Reboot: o uptime recomeçou; o ponto anterior deixa de valer como base de soma.
  const base = c.uptime >= state.checkpointUptime ? state.checkpointUptime : 0;
  const provable = state.maxSeen + Math.max(0, c.uptime - base);
  const wallTrusted = c.ntpSynced ? c.wall : Math.min(c.wall, provable + ROLLBACK_TOLERANCE_S);
  const now = Math.floor(Math.max(wallTrusted, provable, c.witness, state.maxServerTime, floor));
  const suspect = state.maxSeen > 0 && c.wall < state.maxSeen - ROLLBACK_TOLERANCE_S;
  return {
    now,
    suspect,
    next: {
      maxSeen: Math.max(state.maxSeen, now),
      checkpointUptime: c.uptime,
      maxServerTime: state.maxServerTime,
    },
  };
}

/** Registra um `st` do portal como âncora (nunca recua). */
export function anchorServerTime(state: ClockState, st: number): ClockState {
  return { ...state, maxServerTime: Math.max(state.maxServerTime, Number.isFinite(st) ? st : 0) };
}

/* ------------------------------ veredito ------------------------------- */

export type LicenseState =
  | "provisional"
  | "trial"
  | "ativa"
  | "expirada"
  | "sem_licenca"
  | "revogada"
  | "invalida"
  | "sem_serial";

/**
 * Estado de UI / gate de navegação do console.
 * Independente do enforce de serviços (observação): menus liberados só em trial/licensed.
 */
export type LicenseGate = "unlicensed" | "trial" | "trial_expired" | "licensed";

/** Mapeia o veredito interno para o gate do console. */
export function licenseGateOf(state: LicenseState | string | null | undefined): LicenseGate {
  if (state === "ativa") return "licensed";
  if (state === "trial") return "trial";
  if (state === "expirada") return "trial_expired";
  return "unlicensed";
}

/** Menus do console liberados (trial ativo ou licença definitiva). */
export function licenseMenusOpen(gate: LicenseGate): boolean {
  return gate === "licensed" || gate === "trial";
}

export interface Verdict {
  state: LicenseState;
  type: LicenseType | null;
  licenseId: string | null;
  issuedAt: number | null;
  expiresAt: number | null;
  daysLeft: number | null;
  provisionalEndsAt: number | null;
  /** O aparelho pode rodar a estação (o bloqueio só age em `allowed === false` E com enforce). */
  allowed: boolean;
  reason: string | null;
  clockSuspect: boolean;
}

export interface EvaluateInput {
  serial: string | null;
  /** Resultado de `verifyLicenseToken`, ou `null` se não há token. */
  token: TokenCheck | null;
  revoked?: ReadonlySet<string>;
  now: number;
  /** Primeira vez que este aparelho foi visto (segundos Unix). */
  firstSeen: number;
  provisionalDays?: number;
  /** Versão do app (ex.: `0.1.06.02`) para conferir `line`. */
  appVersion?: string;
  clockSuspect?: boolean;
}

export function lineCovers(line: string, appVersion: string | undefined): boolean {
  if (!appVersion) return true;
  const major = appVersion.split(".")[0];
  return line === "*" || line === major;
}

export function evaluateLicense(i: EvaluateInput): Verdict {
  const blank: Verdict = {
    state: "sem_licenca",
    type: null,
    licenseId: null,
    issuedAt: null,
    expiresAt: null,
    daysLeft: null,
    provisionalEndsAt: null,
    allowed: false,
    reason: null,
    clockSuspect: !!i.clockSuspect,
  };
  if (!i.serial) return { ...blank, state: "sem_serial", allowed: true, reason: "serial_unavailable" };

  const provDays = i.provisionalDays ?? PROVISIONAL_DAYS;
  const provEnd = i.firstSeen + provDays * 86400;
  const inProvisional = i.now < provEnd;

  const noTokenVerdict = (reason: string | null, invalid: boolean): Verdict => {
    if (inProvisional) {
      return { ...blank, state: invalid ? "invalida" : "provisional", provisionalEndsAt: provEnd, allowed: true, reason };
    }
    return { ...blank, state: "sem_licenca", provisionalEndsAt: provEnd, allowed: false, reason: reason ?? "no_license" };
  };

  if (!i.token) return noTokenVerdict(null, false);
  if (!i.token.ok) return noTokenVerdict(i.token.error, true);

  const p = i.token.payload;
  const common = { type: p.type, licenseId: p.lid, issuedAt: p.iat, expiresAt: p.exp, provisionalEndsAt: null };
  if (!lineCovers(p.line, i.appVersion)) return noTokenVerdict("line_not_covered", true);
  if (i.revoked?.has(p.lid)) return { ...blank, ...common, state: "revogada", allowed: false, reason: "revoked" };
  if (p.exp !== null && i.now >= p.exp) {
    return { ...blank, ...common, state: "expirada", daysLeft: 0, allowed: false, reason: "expired" };
  }
  return {
    ...blank,
    ...common,
    state: p.type === "definitive" ? "ativa" : "trial",
    daysLeft: p.exp === null ? null : Math.max(0, Math.ceil((p.exp - i.now) / 86400)),
    allowed: true,
    reason: null,
  };
}

/** Conversão USD→BRL com inteiros (BigInt), usada no portal e nos testes. */
export function brlCentsFromUsd(usdCents: number, rateMicro: number, spreadBps: number, rounding: "cent" | "ten_cents" | "real"): number {
  // brl = usd_cents/100 * rate_micro/1e6 * (1 + spread_bps/1e4) * 100 (em centavos de real)
  const num = BigInt(usdCents) * BigInt(rateMicro) * BigInt(10000 + spreadBps);
  const one = BigInt(1);
  const den = BigInt(1_000_000) * BigInt(10_000);
  let cents = (num + den - one) / den; // teto
  const step = BigInt(rounding === "real" ? 100 : rounding === "ten_cents" ? 10 : 1);
  cents = ((cents + step - one) / step) * step;
  return Number(cents);
}
