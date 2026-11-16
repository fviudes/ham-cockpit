export const LAYOUT_COLS = 12;
export const LAYOUT_ROW = 36;
export const LAYOUT_GAP = 4;
export const LAYOUT_MIN_W = 3;
export const LAYOUT_MIN_H = 5;

export type GridTile<T extends string = string> = { id: T; x: number; y: number; w: number; h: number };

export function patchGridTile<T extends string>(list: GridTile<T>[], id: T, patch: Partial<GridTile<T>>): GridTile<T>[] {
  return list.map((t) => (t.id === id ? { ...t, ...patch, id } : t));
}

export function tilesEqual<T extends string>(a: GridTile<T>[], b: GridTile<T>[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}