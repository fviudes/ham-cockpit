import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/layouts";

export type PanelTile = { id: string; x: number; y: number; w: number; h: number };

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "layouts");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "panel.json");
}

function writeAtomic(file: string, body: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, file);
}

export function sanitizeUser(name: unknown) {
  const n = String(name ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 32);
  return n || "admin";
}

function loadStore(): Record<string, PanelTile[]> {
  try {
    const raw = readFileSync(jsonPath(), "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) return {};
    return j as Record<string, PanelTile[]>;
  } catch {
    return {};
  }
}

function asTile(v: unknown): PanelTile | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = String(o.id || "");
  if (!id) return null;
  const x = Math.max(0, Math.min(11, Math.round(Number(o.x) || 0)));
  const y = Math.max(0, Math.min(80, Math.round(Number(o.y) || 0)));
  const w = Math.max(2, Math.min(12, Math.round(Number(o.w) || 4)));
  const h = Math.max(3, Math.min(40, Math.round(Number(o.h) || 6)));
  return { id, x, y, w: Math.min(w, 12 - x), h };
}

export function layoutGet(user: string) {
  const name = sanitizeUser(user);
  const store = loadStore();
  if (!Object.prototype.hasOwnProperty.call(store, name)) {
    return { ok: true, user: name, tiles: null };
  }
  const tiles = Array.isArray(store[name]) ? store[name].map(asTile).filter(Boolean) : [];
  return { ok: true, user: name, tiles: tiles as PanelTile[] };
}

export function layoutSave(user: string, tiles: unknown) {
  const name = sanitizeUser(user);
  const list = Array.isArray(tiles) ? tiles.map(asTile).filter(Boolean) : [];
  const store = loadStore();
  store[name] = list as PanelTile[];
  writeAtomic(jsonPath(), `${JSON.stringify(store, null, 2)}\n`);
  return { ok: true, user: name, tiles: store[name] };
}
