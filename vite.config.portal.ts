import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import {
  fallbackImage,
  IMAGE_RELEASES_API,
  pickLatestImage,
  type GhRelease,
  type ImageInfo,
} from "./shared/image-release";
import { imageBase } from "./shared/version";

/**
 * Portal público (Cloudflare Pages · ham-cockpit.pages.dev).
 *
 *   pnpm exec vite build --config vite.config.portal.ts   →   dist/portal
 *
 * Mesmo código React do site do aparelho, mas com entrada própria
 * (client/src/portal/main.tsx): sem console, sem API do Pi.
 * O build grava `latest-image.json` (última imagem publicada no GitHub).
 */

const ROOT = import.meta.dirname;
const OUT = path.resolve(ROOT, "dist/portal");

function readVersionFile(): string {
  try {
    return fs.readFileSync(path.join(ROOT, "VERSION"), "utf8").trim();
  } catch {
    return "";
  }
}

async function fetchLatestImage(): Promise<ImageInfo | null> {
  const versionFile = readVersionFile();
  const nextVersion = versionFile ? imageBase(versionFile) : null;
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "ham-cockpit-portal-build",
    };
    // Opcional: só eleva o limite da API no CI. Nunca vai para o front.
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(IMAGE_RELEASES_API, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const releases = (await res.json()) as GhRelease[];
    const info = pickLatestImage(releases, { nextVersion, source: "build" });
    if (info) return info;
  } catch (e) {
    console.warn(`[portal] release do GitHub indisponível: ${(e as Error).message}`);
  }
  return fallbackImage(versionFile);
}

/** Usa a entrada do portal e grava latest-image.json + _redirects (SPA) no build. */
function portalPlugin(): Plugin {
  return {
    name: "ham-cockpit-portal",
    transformIndexHtml: {
      // "pre": o Vite descobre o script de entrada antes dos hooks normais.
      order: "pre",
      handler(html) {
        return html.replace("/src/main.tsx", "/src/portal/main.tsx");
      },
    },
    async generateBundle() {
      const info = await fetchLatestImage();
      if (info) {
        console.log(`[portal] última imagem: ${info.version} (${info.source})`);
        this.emitFile({ type: "asset", fileName: "latest-image.json", source: JSON.stringify(info, null, 2) + "\n" });
      } else {
        console.warn("[portal] sem versão de imagem — a página de download mostra o aviso padrão");
      }
      this.emitFile({ type: "asset", fileName: "_redirects", source: "/* /index.html 200\n" });
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: "/latest-image.json\n  Cache-Control: public, max-age=300\n  Access-Control-Allow-Origin: *\n",
      });
    },
    closeBundle() {
      // Coletor de debug do Manus não faz sentido num site público.
      fs.rmSync(path.join(OUT, "__manus__"), { recursive: true, force: true });
      fs.rmSync(path.join(OUT, ".gitkeep"), { force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), portalPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(ROOT, "client", "src"),
      "@shared": path.resolve(ROOT, "shared"),
      "@assets": path.resolve(ROOT, "attached_assets"),
    },
  },
  define: {
    "import.meta.env.VITE_PORTAL": JSON.stringify("1"),
  },
  envDir: ROOT,
  root: path.resolve(ROOT, "client"),
  build: {
    outDir: OUT,
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
});
