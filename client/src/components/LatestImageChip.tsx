import { Package } from "lucide-react";
import { useLatestImage } from "@/lib/latest-image";
import { useSiteLang } from "@/pages/site-lang";
import { HOME } from "@/pages/site-copy";

/** Selo "Imagem mais recente: 0.1.06" (portal). Atualiza sozinho a cada release. */
export default function LatestImageChip({ className = "" }: { className?: string }) {
  const { t } = useSiteLang();
  const { info, loading } = useLatestImage();
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full border border-[rgba(79,195,247,0.25)] bg-[#0b1520] px-3.5 py-1.5 font-['IBM_Plex_Mono'] text-xs text-[#c5d4e0] ${className}`}
      data-testid="latest-image-chip"
    >
      <Package size={14} className="text-[#4fc3f7]" />
      {t(HOME.imageLabel)}:{" "}
      <strong className="text-[#FFB300]">{info ? info.version : loading ? "…" : "—"}</strong>
    </p>
  );
}
