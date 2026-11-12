/**
 * API de licença do aparelho (modo observação nesta entrega: nunca bloqueia a estação).
 * Estado em /var/lib/hamcockpit/license; veredito em /run/ham-cockpit/license.json.
 */
import type { Express, Request, Response } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { APP_VERSION } from "../shared/brand";
import {
  HONOR_PORTAL_POLICY,
  PROVISIONAL_DAYS,
  anchorServerTime,
  cleanToken,
  effectiveNow,
  EMPTY_CLOCK_STATE,
  evaluateLicense,
  isValidCallsign,
  isValidEmail,
  licenseGateOf,
  normalizeCallsign,
  normalizeEmail,
  serialDisplay,
  serialFromCpuinfo,
  verifyBlob,
  verifyLicenseToken,
  type ClockState,
  type LicenseGate,
  type ReceiptPayload,
  type Verdict,
} from "../shared/license";

export const PORTAL_ORIGIN = process.env.HAMCOCKPIT_PORTAL_URL || "https://ham-cockpit.pages.dev";

const DATA_DIR =
  process.env.HAMCOCKPIT_LICENSE_DIR ||
  (process.platform === "win32"
    ? path.join(homedir(), "AppData", "Local", "hamcockpit", "license")
    : "/var/lib/hamcockpit/license");
const RUN_DIR =
  process.env.HAMCOCKPIT_LICENSE_RUN ||
  (process.platform === "win32" ? path.join(DATA_DIR, "run") : "/run/ham-cockpit");

interface LicenseStore {
  firstSeen: number;
  token: string | null;
  receipt: string | null;
  lastSync: number | null;
  clock: ClockState;
  /** Só true liga o bloqueio localmente; o padrão (observação) é false. */
  enforceLocal: boolean;
  crlVersion: number;
  revoked: string[];
  /** Prefixo/indicativo do operador (obrigatório para Licenciar). */
  callsign: string | null;
  /** E-mail do operador (obrigatório para Licenciar). */
  email: string | null;
}

function emptyStore(now = Math.floor(Date.now() / 1000)): LicenseStore {
  return {
    firstSeen: now,
    token: null,
    receipt: null,
    lastSync: null,
    clock: { ...EMPTY_CLOCK_STATE },
    enforceLocal: false,
    crlVersion: 0,
    revoked: [],
    callsign: null,
    email: null,
  };
}

/** Estado persistente em /var/lib (gravável pelo User=hamcockpit). */
function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Veredito em /run/ham-cockpit (tmpfs). O unit declara RuntimeDirectory=ham-cockpit;
 * sem isso o mkdir falha (EACCES) — nunca derrubar a API por causa do run dir.
 */
function tryEnsureRunDir(): boolean {
  try {
    mkdirSync(RUN_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function storePath() {
  return path.join(DATA_DIR, "state.json");
}

function readStore(): LicenseStore {
  ensureDataDir();
  const p = storePath();
  if (!existsSync(p)) {
    const s = emptyStore();
    writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
    return s;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<LicenseStore>;
    return {
      ...emptyStore(typeof raw.firstSeen === "number" ? raw.firstSeen : undefined),
      ...raw,
      callsign: typeof raw.callsign === "string" && raw.callsign ? normalizeCallsign(raw.callsign) || null : null,
      email: typeof raw.email === "string" && raw.email && isValidEmail(raw.email) ? normalizeEmail(raw.email) : null,
      clock: raw.clock ? { ...EMPTY_CLOCK_STATE, ...raw.clock } : { ...EMPTY_CLOCK_STATE },
      revoked: Array.isArray(raw.revoked) ? raw.revoked.map(String) : [],
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(s: LicenseStore) {
  ensureDataDir();
  writeFileSync(storePath(), JSON.stringify(s, null, 2) + "\n");
}

export function readDeviceSerial(): string | null {
  if (process.env.HAMCOCKPIT_SERIAL) return serialFromCpuinfo(null, process.env.HAMCOCKPIT_SERIAL);
  try {
    if (existsSync("/proc/cpuinfo")) {
      const cpu = readFileSync("/proc/cpuinfo", "utf8");
      const dt = existsSync("/proc/device-tree/serial-number")
        ? readFileSync("/proc/device-tree/serial-number", "utf8")
        : null;
      return serialFromCpuinfo(cpu, dt);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function uptimeSec(): number {
  try {
    if (existsSync("/proc/uptime")) {
      const n = Number.parseFloat(readFileSync("/proc/uptime", "utf8").split(" ")[0] || "0");
      return Number.isFinite(n) ? Math.floor(n) : 0;
    }
  } catch {
    /* ignore */
  }
  return Math.floor(process.uptime());
}

function ntpSynced(): boolean {
  // Observação: sem timedatectl aqui; o recibo do portal ancora o relógio.
  return false;
}

export interface LicenseApiBody {
  serial: string | null;
  serialDisplay: string | null;
  callsign: string | null;
  email: string | null;
  /** Veredito interno (provisional/trial/ativa/…). */
  state: Verdict["state"];
  /** Gate de UI: unlicensed | trial | trial_expired | licensed. */
  gate: LicenseGate;
  type: Verdict["type"];
  licenseId: string | null;
  issuedAt: number | null;
  expiresAt: number | null;
  daysLeft: number | null;
  provisionalEndsAt: number | null;
  locked: boolean;
  observationOnly: boolean;
  clock: { suspect: boolean; ntpSynced: boolean };
  lastSync: number | null;
  online: boolean | null;
  buyUrl: string | null;
  reason: string | null;
  portalUrl: string;
}

async function computeVerdict(store: LicenseStore, serial: string | null): Promise<{
  verdict: Verdict;
  clockSuspect: boolean;
  now: number;
  nextClock: ClockState;
}> {
  const clockIn = {
    wall: Math.floor(Date.now() / 1000),
    uptime: uptimeSec(),
    ntpSynced: ntpSynced(),
    witness: 0,
  };
  const eff = effectiveNow(store.clock, clockIn, store.firstSeen);
  const token = store.token ? await verifyLicenseToken(store.token, serial) : null;
  const verdict = evaluateLicense({
    serial,
    token,
    revoked: new Set(store.revoked),
    now: eff.now,
    firstSeen: store.firstSeen,
    provisionalDays: PROVISIONAL_DAYS,
    appVersion: APP_VERSION,
    clockSuspect: eff.suspect,
  });
  return { verdict, clockSuspect: eff.suspect, now: eff.now, nextClock: eff.next };
}

/** Em observação: locked sempre false, salvo enforceLocal explícito E HONOR_PORTAL_POLICY. */
function lockedFor(verdict: Verdict, store: LicenseStore): boolean {
  if (!store.enforceLocal) return false;
  if (!HONOR_PORTAL_POLICY) return false;
  return !verdict.allowed;
}

async function toApi(store: LicenseStore, online: boolean | null = null): Promise<LicenseApiBody> {
  const serial = readDeviceSerial();
  const { verdict, clockSuspect, nextClock } = await computeVerdict(store, serial);
  store.clock = nextClock;
  writeStore(store);
  const display = serial ? await serialDisplay(serial) : null;
  const chk = display?.slice(-2);
  const buyUrl = serial
    ? `${PORTAL_ORIGIN}/comprar?serial=${encodeURIComponent(serial)}${chk ? `&chk=${chk}` : ""}`
    : null;
  const body: LicenseApiBody = {
    serial,
    serialDisplay: display,
    callsign: store.callsign,
    email: store.email,
    state: verdict.state,
    gate: licenseGateOf(verdict.state),
    type: verdict.type,
    licenseId: verdict.licenseId,
    issuedAt: verdict.issuedAt,
    expiresAt: verdict.expiresAt,
    daysLeft: verdict.daysLeft,
    provisionalEndsAt: verdict.provisionalEndsAt,
    locked: lockedFor(verdict, store),
    observationOnly: !store.enforceLocal || !HONOR_PORTAL_POLICY,
    clock: { suspect: clockSuspect, ntpSynced: ntpSynced() },
    lastSync: store.lastSync,
    online,
    buyUrl,
    reason: verdict.reason,
    portalUrl: PORTAL_ORIGIN,
  };
  try {
    if (tryEnsureRunDir()) {
      writeFileSync(path.join(RUN_DIR, "license.json"), JSON.stringify({ ...body, at: Math.floor(Date.now() / 1000) }, null, 2) + "\n");
    }
  } catch {
    /* /run pode ser só leitura em dev — estado já está em DATA_DIR */
  }
  return body;
}

async function applyPortalResponse(
  store: LicenseStore,
  serial: string,
  j: { token?: string; receipt?: string; status?: string; crlVersion?: number },
): Promise<void> {
  if (j.token) {
    const check = await verifyLicenseToken(j.token, serial);
    if (check.ok) store.token = cleanToken(j.token);
  }
  if (j.receipt) {
    const r = await verifyBlob<ReceiptPayload>("HCR1", j.receipt);
    if (r.ok) {
      store.receipt = cleanToken(j.receipt);
      store.clock = anchorServerTime(store.clock, r.payload.st);
    }
  }
  if (typeof j.crlVersion === "number") store.crlVersion = j.crlVersion;
  store.lastSync = Math.floor(Date.now() / 1000);
  writeStore(store);
}

export async function activateWithPortal(
  opts: { callsign?: string; email?: string } = {},
): Promise<{ ok: boolean; body: LicenseApiBody; error?: string }> {
  const store = readStore();
  const serial = readDeviceSerial();
  if (!serial) return { ok: false, body: await toApi(store, false), error: "serial_unavailable" };
  const callsign = normalizeCallsign(opts.callsign ?? store.callsign ?? "");
  if (!isValidCallsign(callsign)) {
    return { ok: false, body: await toApi(store, null), error: "callsign_required" };
  }
  const email = normalizeEmail(opts.email ?? store.email ?? "");
  if (!isValidEmail(email)) {
    return { ok: false, body: await toApi(store, null), error: "email_required" };
  }
  store.callsign = callsign;
  store.email = email;
  writeStore(store);
  try {
    const r = await fetch(`${PORTAL_ORIGIN}/api/lic/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serial,
        appVersion: APP_VERSION,
        nonce: crypto.randomUUID(),
        callsign,
        prefix: callsign,
        email,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json()) as {
      license?: { token?: string } | null;
      receipt?: string;
      status?: string;
      crlVersion?: number;
      message?: string;
      error?: string;
    };
    if (!r.ok) return { ok: false, body: await toApi(store, true), error: j.message || j.error || "portal_error" };
    await applyPortalResponse(store, serial, { token: j.license?.token, receipt: j.receipt, status: j.status, crlVersion: j.crlVersion });
    return { ok: true, body: await toApi(store, true) };
  } catch {
    return { ok: false, body: await toApi(store, false), error: "portal_unreachable" };
  }
}

export async function importLicenseToken(raw: string): Promise<{ ok: boolean; body: LicenseApiBody; error?: string }> {
  const store = readStore();
  const serial = readDeviceSerial();
  const token = cleanToken(raw);
  const check = await verifyLicenseToken(token, serial);
  if (!check.ok) return { ok: false, body: await toApi(store, null), error: check.error };
  if (store.token) {
    const cur = await verifyLicenseToken(store.token, serial);
    if (cur.ok && check.ok && check.payload.st < cur.payload.st) {
      return { ok: false, body: await toApi(store, null), error: "older_than_current" };
    }
  }
  store.token = token;
  store.lastSync = Math.floor(Date.now() / 1000);
  writeStore(store);
  return { ok: true, body: await toApi(store, null) };
}

/** Avalia e grava o veredito (usado pelo license-guard em modo observação). */
export async function runLicenseGuardOnce(): Promise<LicenseApiBody> {
  const store = readStore();
  return toApi(store, null);
}

export function registerLicenseRoutes(app: Express) {
  app.get("/api/license", async (_req, res) => {
    try {
      res.json(await toApi(readStore(), null));
    } catch (err) {
      // Mesmo com falha de persistência, o serial do Pi deve aparecer na UI.
      const serial = readDeviceSerial();
      let serialDisp: string | null = null;
      try {
        serialDisp = serial ? await serialDisplay(serial) : null;
      } catch {
        serialDisp = serial;
      }
      const state = serial ? "sem_licenca" : "sem_serial";
      res.status(500).json({
        ok: false,
        error: String(err),
        serial,
        serialDisplay: serialDisp,
        callsign: null,
        email: null,
        state,
        gate: licenseGateOf(state),
      });
    }
  });

  app.post("/api/license/activate", async (req: Request, res: Response) => {
    try {
      const callsign =
        typeof req.body?.callsign === "string"
          ? req.body.callsign
          : typeof req.body?.prefix === "string"
            ? req.body.prefix
            : undefined;
      const email = typeof req.body?.email === "string" ? req.body.email : undefined;
      const r = await activateWithPortal({ callsign, email });
      const status = r.ok ? 200 : r.error === "portal_unreachable" ? 502 : 400;
      res.status(status).json(r);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post("/api/license/import", async (req: Request, res: Response) => {
    try {
      const raw =
        typeof req.body === "string"
          ? req.body
          : typeof req.body?.token === "string"
            ? req.body.token
            : "";
      if (!raw.trim()) {
        res.status(400).json({ ok: false, error: "invalid_format" });
        return;
      }
      const r = await importLicenseToken(raw);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/license/request", async (_req, res) => {
    try {
      const serial = readDeviceSerial();
      if (!serial) {
        res.status(400).json({ ok: false, error: "serial_unavailable" });
        return;
      }
      const display = await serialDisplay(serial);
      const chk = display.slice(-2);
      const store = readStore();
      res.json({
        serial,
        display,
        chk,
        callsign: store.callsign,
        email: store.email,
        appVersion: APP_VERSION,
        portalUrl: PORTAL_ORIGIN,
        buyUrl: `${PORTAL_ORIGIN}/comprar?serial=${encodeURIComponent(serial)}&chk=${chk}`,
        licenseUrl: `${PORTAL_ORIGIN}/licenca?serial=${encodeURIComponent(serial)}`,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });
}
