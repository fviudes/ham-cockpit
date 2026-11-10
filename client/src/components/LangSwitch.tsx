import { ChevronDown } from "lucide-react";
import { t, type Lang } from "@/console/i18n";
import { useSiteLang } from "@/pages/site-lang";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReactNode } from "react";

function FlagBr() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0 rounded-[1px]" aria-hidden>
      <rect width="20" height="14" fill="#009b3a" />
      <polygon points="10,1.2 18.6,7 10,12.8 1.4,7" fill="#fedf00" />
      <circle cx="10" cy="7" r="3.1" fill="#002776" />
    </svg>
  );
}

function FlagUs() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0 rounded-[1px]" aria-hidden>
      <rect width="20" height="14" fill="#bf0a30" />
      {[2, 4, 6, 8, 10, 12].map((y) => (
        <rect key={y} y={y} width="20" height="1.1" fill="#fff" />
      ))}
      <rect width="8.2" height="7.5" fill="#002868" />
    </svg>
  );
}

const LANGS: { id: Lang; Flag: () => ReactNode; label: "langPtName" | "langEnName" }[] = [
  { id: "pt", Flag: FlagBr, label: "langPtName" },
  { id: "en", Flag: FlagUs, label: "langEnName" },
];

const menuBox =
  "z-50 min-w-[11rem] rounded-md border border-[rgba(79,195,247,0.22)] bg-[#0b1520] p-1 text-[#c5d4e0] shadow-lg";
const menuItem =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[#c5d4e0] outline-none focus:bg-[#4fc3f7]/15 focus:text-[#4fc3f7]";

export function LangSwitch() {
  const { lang, setLang } = useSiteLang();
  const current = LANGS.find((row) => row.id === lang) || LANGS[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-2 text-[12px] font-semibold text-[#c5d4e0] outline-none hover:border-[#4fc3f7]"
          aria-label={t(lang, "langMenu")}
        >
          <current.Flag />
          <span className="hidden sm:inline">{t(lang, current.label)}</span>
          <ChevronDown size={14} className="text-[#8ea0b3]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuBox}>
        {LANGS.map((row) => (
          <DropdownMenuItem
            key={row.id}
            className={cn(menuItem, lang === row.id && "bg-[#4fc3f7]/15 text-[#4fc3f7]")}
            onSelect={() => setLang(row.id)}
          >
            <row.Flag />
            {t(lang, row.label)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
