import { DEFAULT_USER } from "./i18n";
import {
  LAYOUT_COLS,
  LAYOUT_MIN_H,
  LAYOUT_MIN_W,
  patchGridTile,
  tilesEqual as gridTilesEqual,
  type GridTile,
} from "./layout-grid";

export const DIGITAL_TILE_IDS = ["status", "waterfall", "bandActivity", "rxFreq", "tabs", "controls", "footer"] as const;
export type DigitalTileId = (typeof DIGITAL_TILE_IDS)[number];
export type DigitalTile = GridTile<DigitalTileId>;

const AUTH_USER_KEY = "hamcockpit.user";

/** Altura mínima ao redimensionar no grid digital (painel RF continua em LAYOUT_MIN_H). */
export const DIGITAL_LAYOUT_MIN_H = 3;

export const DEFAULT_DIGITAL_TILES: Record<DigitalTileId, DigitalTile> = {
  status: { id: "status", x: 0, y: 0, w: 12, h: 3 },
  waterfall: { id: "waterfall", x: 0, y: 3, w: 12, h: 10 },
  bandActivity: { id: "bandActivity", x: 0, y: 13, w: 5, h: 12 },
  rxFreq: { id: "rxFreq", x: 5, y: 13, w: 7, h: 12 },
  tabs: { id: "tabs", x: 0, y: 25, w: 5, h: 10 },
  controls: { id: "controls", x: 5, y: 25, w: 7, h: 10 },
  footer: { id: "footer", x: 0, y: 35, w: 12, h: 3 },
};

export function currentLayoutUser() {
  return sessionStorage.getItem(AUTH_USER_KEY) || DEFAULT_USER;
}

function localKey(user: string) {
  return `hamcockpit.digitalLayout.${user}`;
}

function asId(v: string): DigitalTileId | null {
  return (DIGITAL_TILE_IDS as readonly string[]).includes(v) ? (v as DigitalTileId) : null;
}

export function defaultDigitalTiles(): DigitalTile[] {
  return DIGITAL_TILE_IDS.map((id) => ({ ...DEFAULT_DIGITAL_TILES[id] }));
}

export function normalizeDigitalTiles(raw: unknown): DigitalTile[] {
  const byId = new Map<DigitalTileId, DigitalTile>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id = asId(String(o.id || ""));
      if (!id) continue;
      const x = Math.max(0, Math.min(LAYOUT_COLS - LAYOUT_MIN_W, Math.round(Number(o.x) || 0)));
      const y = Math.max(0, Math.min(80, Math.round(Number(o.y) || 0)));
      const w = Math.max(LAYOUT_MIN_W, Math.min(LAYOUT_COLS - x, Math.round(Number(o.w) || DEFAULT_DIGITAL_TILES[id].w)));
      const h = Math.max(DIGITAL_LAYOUT_MIN_H, Math.min(40, Math.round(Number(o.h) || DEFAULT_DIGITAL_TILES[id].h)));
      byId.set(id, { id, x, y, w, h });
    }
  }
  return DIGITAL_TILE_IDS.map((id) => byId.get(id) ?? { ...DEFAULT_DIGITAL_TILES[id] });
}

export function tilesEqual(a: DigitalTile[], b: DigitalTile[]) {
  return gridTilesEqual(a, b);
}

export function patchDigitalTile(list: DigitalTile[], id: DigitalTileId, patch: Partial<DigitalTile>): DigitalTile[] {
  return patchGridTile(list, id, patch);
}

export async function loadDigitalLayout(user: string): Promise<DigitalTile[]> {
  try {
    const r = await fetch(`/api/layout?user=${encodeURIComponent(user)}&scope=digital`);
    const j = (await r.json()) as { ok?: boolean; tiles?: unknown };
    if (j.ok && Array.isArray(j.tiles)) return normalizeDigitalTiles(j.tiles);
  } catch {
    /* local fallback */
  }
  try {
    const raw = localStorage.getItem(localKey(user));
    if (raw) return normalizeDigitalTiles(JSON.parse(raw) as unknown);
  } catch {
    /* defaults */
  }
  return defaultDigitalTiles();
}

export async function saveDigitalLayout(user: string, tiles: DigitalTile[]) {
  const body = normalizeDigitalTiles(tiles);
  localStorage.setItem(localKey(user), JSON.stringify(body));
  const r = await fetch("/api/layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, scope: "digital", tiles: body }),
  });
  const j = (await r.json()) as { ok?: boolean; tiles?: unknown; error?: string };
  if (!r.ok || j.ok === false) throw new Error(j.error || "layout");
  return normalizeDigitalTiles(j.tiles ?? body);
}