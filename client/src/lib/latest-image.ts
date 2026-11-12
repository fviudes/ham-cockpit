import { useEffect, useState } from "react";
import {
  IMAGE_RELEASES_API,
  pickLatestImage,
  type GhRelease,
  type ImageInfo,
} from "@shared/image-release";
import { compareVersion } from "@shared/version";

/**
 * Última imagem publicada.
 * 1) `/latest-image.json` — gerado no build do portal (rápido, sem limite de API).
 * 2) API pública do GitHub — atualiza ao vivo se saiu imagem nova depois do deploy.
 * Nenhuma chave secreta no navegador.
 */
export function useLatestImage(): { info: ImageInfo | null; loading: boolean } {
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const apply = (next: ImageInfo | null) => {
      if (!alive || !next) return;
      setInfo((prev) => {
        if (!prev) return next;
        const cmp = compareVersion(next.version, prev.version);
        // Ao vivo (GitHub) vence o do build quando for igual ou mais novo.
        if (cmp > 0 || (cmp === 0 && next.source === "github")) {
          return { ...next, nextVersion: next.nextVersion ?? prev.nextVersion };
        }
        return prev;
      });
    };

    const fromBuild = fetch("/latest-image.json", { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<ImageInfo>) : null))
      .then(apply)
      .catch(() => undefined);

    const fromGithub = fetch(IMAGE_RELEASES_API, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? (r.json() as Promise<GhRelease[]>) : null))
      .then((list) => (list ? pickLatestImage(list, { source: "github" }) : null))
      .then(apply)
      .catch(() => undefined);

    void Promise.all([fromBuild, fromGithub]).then(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { info, loading };
}
