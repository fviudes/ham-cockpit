/**
 * Sessão do console da estação (mesmo usuário e senha do login do aparelho).
 * Cookie HttpOnly. Não registra senha.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COOKIE = "hc_console";
const USER = "admin";
const PASS = "1234";
const MAX_AGE_SEC = 12 * 60 * 60;

function secretFile(): string {
  if (existsSync("/opt/ham-cockpit")) return "/opt/ham-cockpit/console-session.key";
  return join(dirname(fileURLToPath(import.meta.url)), "..", "data", "console-session.key");
}

function secret(): Buffer {
  const path = secretFile();
  try {
    if (existsSync(path)) {
      const cur = readFileSync(path);
      if (cur.length >= 32) return cur;
    }
  } catch {
    /* gera de novo */
  }
  const next = randomBytes(32);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* Windows não aplica modo Unix */
  }
  return next;
}

export function consoleSessionToken(user: string, password: string): string | null {
  if (user !== USER || password !== PASS) return null;
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = Buffer.from(JSON.stringify({ u: USER, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function consoleSessionCookie(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
}

export function consoleSessionOk(cookieHeader: string | undefined | null): boolean {
  if (!cookieHeader) return false;
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  let token = raw.slice(COOKIE.length + 1);
  try {
    token = decodeURIComponent(token);
  } catch {
    return false;
  }
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: string; exp?: number };
    if (body.u !== USER) return false;
    return typeof body.exp === "number" && body.exp >= Date.now() / 1000;
  } catch {
    return false;
  }
}
