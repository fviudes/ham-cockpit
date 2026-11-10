/**
 * Versionamento Ham Cockpit.
 *
 * - Imagem (bake .img): base de 3 partes `major.minor.patch` (ex.: `0.1.05`).
 *   Artefato: `ham-cockpit-0.1.05-raspi.img.xz`. OTA suffix some (ou `.00`).
 * - OTA-only: mesma base + sufixo `.01` … `.99` (ex.: `0.1.04.01`).
 *   Artefato: `ham-cockpit-0.1.04.01.tgz`.
 *
 * `VERSION` guarda a string completa (3 ou 4 partes). Comparação numérica
 * trata partes ausentes como 0, então `0.1.04` ≡ `0.1.04.00` < `0.1.04.01` < `0.1.05`.
 */

export type VersionParts = {
  major: number;
  minor: number;
  patch: number;
  /** Sufixo OTA 0–99; 0 = base de imagem / sem sufixo. */
  ota: number;
};

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d{1,2}))?$/i;

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/** Normaliza e remove prefixo `v`. */
export function cleanVersion(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^v/i, "");
}

/** Aceita `x.y.zz` ou `x.y.zz.NN` (NN = 00–99). */
export function isValidVersion(raw: string): boolean {
  return VERSION_RE.test(cleanVersion(raw));
}

export function parseVersion(raw: string): VersionParts | null {
  const m = cleanVersion(raw).match(VERSION_RE);
  if (!m) return null;
  return {
    major: Number(m[1]) || 0,
    minor: Number(m[2]) || 0,
    patch: Number(m[3]) || 0,
    ota: m[4] != null ? Number(m[4]) || 0 : 0,
  };
}

/** Base de imagem (sempre 3 partes, patch com 2 dígitos). */
export function imageBase(raw: string): string {
  const p = parseVersion(raw);
  if (!p) return cleanVersion(raw);
  return `${p.major}.${p.minor}.${pad2(p.patch)}`;
}

/**
 * Formata a versão completa.
 * Com `ota === 0` e `includeOtaZero === false` (padrão), omite o sufixo.
 */
export function formatVersion(parts: VersionParts, includeOtaZero = false): string {
  const base = `${parts.major}.${parts.minor}.${pad2(parts.patch)}`;
  if (parts.ota > 0 || includeOtaZero) return `${base}.${pad2(parts.ota)}`;
  return base;
}

/** Partes numéricas soltas (app `0.1.04.01`, tags apt `4.5.5`, OS `24.04.3`). */
export function versionNums(raw: string): number[] {
  return cleanVersion(raw)
    .replace(/^[^\d]+/, "")
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => Number(n) || 0);
}

/**
 * -1 se a < b, 0 se iguais, 1 se a > b.
 * Ham Cockpit (`0.1.04` < `0.1.04.01` < `0.1.05`) e strings soltas (apt/Docker/OS).
 * Partes ausentes contam como 0 (`0.1.04` ≡ `0.1.04.00`).
 */
export function compareVersion(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa && pb) {
    if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
    if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
    if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
    if (pa.ota !== pb.ota) return pa.ota > pb.ota ? 1 : -1;
    return 0;
  }
  const aa = versionNums(a);
  const bb = versionNums(b);
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    const x = aa[i] || 0;
    const y = bb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function isNewerVersion(available: string, current: string): boolean {
  const avail = cleanVersion(available);
  const cur = cleanVersion(current);
  if (!avail || !cur || avail === "—") return false;
  if (/pacotes/i.test(avail)) return true;
  if (avail === cur) return false;
  return compareVersion(avail, cur) > 0;
}

/** Próximo OTA na mesma base de imagem (`… .01` … `.99`). */
export function bumpOta(raw: string): string {
  const p = parseVersion(raw);
  if (!p) throw new Error(`versão inválida: ${raw}`);
  if (p.ota >= 99) {
    throw new Error(`sufixo OTA esgotado em ${formatVersion(p)} — rode bumpImage()`);
  }
  return formatVersion({ ...p, ota: p.ota + 1 });
}

/** Próxima imagem: incrementa patch e zera o sufixo OTA. */
export function bumpImage(raw: string): string {
  const p = parseVersion(raw);
  if (!p) throw new Error(`versão inválida: ${raw}`);
  return formatVersion({ ...p, patch: p.patch + 1, ota: 0 });
}
