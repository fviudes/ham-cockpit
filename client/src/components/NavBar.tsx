import { useLocation } from "wouter";
import { Radio } from "lucide-react";
import { APP_VERSION } from "@shared/brand";
import { LangSwitch } from "@/components/LangSwitch";
import { useSiteLang } from "@/pages/site-lang";
import { NAV } from "@/pages/site-copy";

export default function NavBar() {
  const [location, navigate] = useLocation();
  const { t } = useSiteLang();
  const isActive = (path: string) => location === path;

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-[rgba(79,195,247,0.12)] bg-[#0d1b2a]/95 backdrop-blur-sm">
      <div className="container flex h-14 items-center justify-between">
        <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80">
          <span className="grid size-8 place-items-center rounded-md bg-[#4fc3f7]/15 text-[#4fc3f7]">
            <Radio size={18} />
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className="font-['Space_Grotesk'] text-sm font-bold text-white">Ham Cockpit</span>
            <span className="font-['IBM_Plex_Mono'] text-[10px] tracking-widest text-[#FFB300]">
              v{APP_VERSION} · {t(NAV.station)}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-3 sm:gap-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className={`hidden text-sm sm:inline ${isActive("/") ? "text-[#4fc3f7]" : "text-[#94a3b8] hover:text-[#4fc3f7]"}`}
          >
            {t(NAV.home)}
          </button>
          <button
            type="button"
            onClick={() => navigate("/docs")}
            className={`text-sm ${isActive("/docs") ? "text-[#4fc3f7]" : "text-[#94a3b8] hover:text-[#4fc3f7]"}`}
          >
            {t(NAV.docs)}
          </button>
          <LangSwitch />
          <button
            type="button"
            onClick={() => navigate("/console")}
            className="rounded-md bg-[#4fc3f7] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a] hover:bg-[#80d8ff] sm:px-4"
          >
            {t(NAV.console)}
          </button>
        </div>
      </div>
    </nav>
  );
}
