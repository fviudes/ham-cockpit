/** Resposta curta em cache para polls S-meter concorrentes (várias abas / ~30 Hz). */
export const SMETER_CACHE_TTL_MS = 28;

type Entry = { at: number; body: unknown };

const cache = new Map<string, Entry>();

export function smeterCacheKey(parts: Record<string, string | number>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export function readSmeterCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SMETER_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.body as T;
}

export function writeSmeterCache(key: string, body: unknown) {
  cache.set(key, { at: Date.now(), body });
}