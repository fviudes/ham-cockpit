/**
 * Última imagem do Ham Cockpit (bake `.img.xz`) a partir dos releases do GitHub.
 *
 * Usado pelo portal (Cloudflare Pages) em dois momentos:
 * - no build (vite.config.portal.ts) → gera `latest-image.json`;
 * - no navegador → atualiza ao vivo pela API pública do GitHub (sem chave).
 *
 * Só conta release de imagem: tag com 3 partes (`v0.1.06`). Releases OTA
 * (`v0.1.05.02`) não entram. Ver docs/versionamento.md.
 */
import { compareVersion, imageBase, parseVersion } from "./version";

export const IMAGE_REPO = "fviudes/ham-cockpit";
export const IMAGE_RELEASES_API = `https://api.github.com/repos/${IMAGE_REPO}/releases?per_page=30`;
export const IMAGE_RELEASES_PAGE = `https://github.com/${IMAGE_REPO}/releases`;

export type GhAsset = { name: string; size: number; browser_download_url?: string };

export type GhRelease = {
  tag_name: string;
  name?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  assets?: GhAsset[];
};

export type ImagePart = {
  name: string;
  size: number;
  url?: string;
};

export type ImageInfo = {
  /** Base de 3 partes, ex.: `0.1.06`. */
  version: string;
  tag: string;
  releaseUrl: string;
  publishedAt: string | null;
  /** Nome do `.img.xz` (lógico; se a Release só tiver .part*, ainda assim este nome). */
  fileName: string | null;
  sizeBytes: number | null;
  /** Quando o .img.xz único passa de 2 GiB, a Release publica .part00+.part01. */
  parts?: ImagePart[] | null;
  /** Base em desenvolvimento (VERSION do repositório) quando já passou da última imagem. */
  nextVersion: string | null;
  /** De onde veio a informação. */
  source: "github" | "build" | "fallback";
  generatedAt: string;
};

const IMAGE_TAG_RE = /^v?(\d+)\.(\d+)\.(\d{1,2})$/i;
const IMG_XZ_RE = /-raspi\.img\.xz$/i;
const IMG_PART_RE = /-raspi\.img\.xz\.part\d+$/i;

export function isImageTag(tag: string): boolean {
  return IMAGE_TAG_RE.test(String(tag || "").trim());
}

function imgAsset(r: GhRelease): GhAsset | null {
  return (r.assets ?? []).find((a) => IMG_XZ_RE.test(a.name)) ?? null;
}

function imgParts(r: GhRelease): GhAsset[] {
  return (r.assets ?? [])
    .filter((a) => IMG_PART_RE.test(a.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function hasImageFile(r: GhRelease): boolean {
  return Boolean(imgAsset(r) || imgParts(r).length > 0);
}

/** Escolhe o release de imagem mais novo (de preferência o que já tem o `.img.xz` ou `.part*`). */
export function pickLatestImage(
  releases: GhRelease[],
  opts: { nextVersion?: string | null; source?: ImageInfo["source"] } = {}
): ImageInfo | null {
  const candidates = releases.filter((r) => !r.draft && !r.prerelease && isImageTag(r.tag_name));
  const withFile = candidates.filter((r) => hasImageFile(r));
  const pool = withFile.length > 0 ? withFile : candidates;
  if (pool.length === 0) return null;
  const best = [...pool].sort((a, b) => compareVersion(b.tag_name, a.tag_name))[0]!;
  const asset = imgAsset(best);
  const partsRaw = imgParts(best);
  const parts: ImagePart[] | null =
    !asset && partsRaw.length > 0
      ? partsRaw.map((p) => ({
          name: p.name,
          size: p.size,
          url: p.browser_download_url,
        }))
      : null;
  const version = imageBase(best.tag_name);
  const next = opts.nextVersion ? imageBase(opts.nextVersion) : null;
  const logicalName =
    asset?.name ??
    (parts?.[0]?.name ? parts[0].name.replace(/\.part\d+$/i, "") : null);
  const sizeBytes =
    asset?.size ?? (parts ? parts.reduce((acc, p) => acc + (p.size || 0), 0) : null);
  return {
    version,
    tag: best.tag_name.startsWith("v") ? best.tag_name : `v${best.tag_name}`,
    releaseUrl: best.html_url || `${IMAGE_RELEASES_PAGE}/tag/v${version}`,
    publishedAt: best.published_at ?? null,
    fileName: logicalName,
    sizeBytes,
    parts,
    nextVersion: next && compareVersion(next, version) > 0 ? next : null,
    source: opts.source ?? "github",
    generatedAt: new Date().toISOString(),
  };
}

/** Quando a API do GitHub não responde: usa a base do arquivo VERSION. */
export function fallbackImage(versionFile: string): ImageInfo | null {
  if (!parseVersion(versionFile)) return null;
  const version = imageBase(versionFile);
  return {
    version,
    tag: `v${version}`,
    releaseUrl: `${IMAGE_RELEASES_PAGE}/tag/v${version}`,
    publishedAt: null,
    fileName: `ham-cockpit-${version}-raspi.img.xz`,
    sizeBytes: null,
    nextVersion: null,
    source: "fallback",
    generatedAt: new Date().toISOString(),
  };
}

export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2).replace(".", ",")} GB`;
  return `${(n / 1024 ** 2).toFixed(0)} MB`;
}
