import type { Ctx } from "./env";

const enc = new TextEncoder();

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function errorJson(status: number, error: string, message?: string, extra?: Record<string, unknown>): Response {
  return json({ error, message: message ?? error, ...extra }, status);
}

export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 65536): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large");
  if (!text.trim()) return {} as T;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object") throw new Error("não é objeto");
    return v as T;
  } catch {
    throw new HttpError(400, "invalid_json", "Corpo JSON inválido");
  }
}

const B32 = "0123456789abcdefghjkmnpqrstvwxyz";

/** Identificador com prefixo e 80 bits aleatórios (não adivinhável). */
export function newId(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(10));
  let bits = 0;
  let acc = 0;
  let out = "";
  for (let i = 0; i < b.length; i++) {
    acc = (acc << 8) | b[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `${prefix}_${out}`;
}

export function hex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += u[i].toString(16).padStart(2, "0");
  return s;
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmacHex(key: string, msg: string, hash: "SHA-256" | "SHA-1" = "SHA-256"): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

/** Comparação em tempo constante (compara os hashes, não o texto). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(`eq:${a}`), sha256Hex(`eq:${b}`)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0 && a.length === b.length;
}

/** Anonimiza o IP (HMAC com IP_HASH_KEY); nunca grava o IP puro. */
export async function ipHash(ctx: Ctx): Promise<string> {
  const key = ctx.env.IP_HASH_KEY || "dev-ip-key";
  return (await hmacHex(key, `ip:${ctx.ip}`)).slice(0, 20);
}

/** Converte "29.00" em 2900 sem usar ponto flutuante. */
export function decimalToCents(value: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

export function centsToDecimal(cents: number): string {
  const s = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(s / 100)}.${String(s % 100).padStart(2, "0")}`;
}

export function maskSerial(serial: string): string {
  return serial.length === 16 ? `${serial.slice(0, 4)}••••••••${serial.slice(-4)}`.toUpperCase() : "••••";
}

export function clip(text: unknown, max = 200): string {
  return String(text ?? "").slice(0, max);
}

export function getCookie(request: Request, name: string): string | null {
  const h = request.headers.get("cookie");
  if (!h) return null;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
