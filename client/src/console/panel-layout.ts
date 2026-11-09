import { DEFAULT_USER } from "./i18n";

export const TILE_IDS = ["vfo", "spe", "palstar", "hamplus", "acom", "lextel", "ldg"] as const;
export type TileId = (typeof TILE_IDS)[number];
export type PanelTile = { id: TileId; x: number; y: number; w: number; h: number };

export const LAYOUT_COLS = 12;
export const LAYOUT_ROW = 36;
export const LAYOUT_GAP = 12;
export const LAYOUT_MIN_W = 3;
export const LAYOUT_MIN_H = 5;

export const DEFAULT_TILES: Record<TileId, PanelTile> = {
  vfo: { id: "vfo", x: 0, y: 0, w: 7, h: 12 },
  spe: { id: "spe", x: 7, y: 0, w: 5, h: 12 },
  palstar: { id: "palstar", x: 0, y: 12, w: 6, h: 9 },
  hamplus: { id: "hamplus", x: 6, y: 12, w: 6, h: 9 },
  lextel: { id: "lextel", x: 0, y: 21, w: 6, h: 9 },
  acom: { id: "acom", x: 6, y: 21, w: 6, h: 9 },
  ldg: { id: "ldg", x: 0, y: 30, w: 6, h: 10 },
};

const AUTH_USER_KEY = "hamcockpit.user";

export function currentLayoutUser() {
  return sessionStorage.getItem(AUTH_USER_KEY) || DEFAULT_USER;
}

function localKey(user: string) {
  return `hamcockpit.panelLayout.${user}`;
}

function asId(v: string): TileId | null {
  return (TILE_IDS as readonly string[]).includes(v) ? (v as TileId) : null;
}

export function defaultTiles(): PanelTile[] {
  return TILE_IDS.map((id) => ({ ...DEFAULT_TILES[id] }));
}

function overlaps(a: PanelTile, b: PanelTile) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normalizeTiles(raw: unknown): PanelTile[] {
  if (!Array.isArray(raw)) return defaultTiles();
  const seen = new Set<TileId>();
  const out: PanelTile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = asId(String(o.id || ""));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const x = Math.max(0, Math.min(LAYOUT_COLS - LAYOUT_MIN_W, Math.round(Number(o.x) || 0)));
    const y = Math.max(0, Math.min(80, Math.round(Number(o.y) || 0)));
    const w = Math.max(LAYOUT_MIN_W, Math.min(LAYOUT_COLS - x, Math.round(Number(o.w) || DEFAULT_TILES[id].w)));
    const h = Math.max(LAYOUT_MIN_H, Math.min(40, Math.round(Number(o.h) || DEFAULT_TILES[id].h)));
    out.push({ id, x, y, w, h });
  }
  return out;
}

export function placeTile(list: PanelTile[], id: TileId): PanelTile {
  const def = { ...DEFAULT_TILES[id] };
  if (!list.some((t) => overlaps(t, def))) return def;
  const y = list.reduce((m, t) => Math.max(m, t.y + t.h), 0);
  return { id, x: 0, y, w: def.w, h: def.h };
}

export function addTile(list: PanelTile[], id: TileId): PanelTile[] {
  if (list.some((t) => t.id === id)) return list;
  return [...list, placeTile(list, id)];
}

export function removeTile(list: PanelTile[], id: TileId): PanelTile[] {
  return list.filter((t) => t.id !== id);
}

export function tilesEqual(a: PanelTile[], b: PanelTile[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function patchTile(list: PanelTile[], id: TileId, patch: Partial<PanelTile>): PanelTile[] {
  return list.map((t) => (t.id === id ? { ...t, ...patch, id } : t));
}

export async function loadLayout(user: string): Promise<PanelTile[]> {
  try {
    const r = await fetch(`/api/layout?user=${encodeURIComponent(user)}`);
    const j = (await r.json()) as { ok?: boolean; tiles?: unknown };
    if (j.ok && Array.isArray(j.tiles)) return normalizeTiles(j.tiles);
  } catch {
    /* local fallback */
  }
  try {
    const raw = localStorage.getItem(localKey(user));
    if (raw) return normalizeTiles(JSON.parse(raw) as unknown);
  } catch {
    /* defaults */
  }
  return defaultTiles();
}

export async function saveLayout(user: string, tiles: PanelTile[]) {
  const body = normalizeTiles(tiles);
  localStorage.setItem(localKey(user), JSON.stringify(body));
  const r = await fetch("/api/layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, tiles: body }),
  });
  const j = (await r.json()) as { ok?: boolean; tiles?: unknown; error?: string };
  if (!r.ok || j.ok === false) throw new Error(j.error || "layout");
  return normalizeTiles(j.tiles ?? body);
}
