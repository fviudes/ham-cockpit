import { useLocation } from "wouter";
import { APP_LOGO, APP_NAME, APP_VERSION } from "@shared/brand";
import { LangSwitch } from "@/components/LangSwitch";
import { IS_PORTAL } from "@/lib/portal";
import { useSiteLang } from "@/pages/site-lang";
import { NAV } from "@/pages/site-copy";

export default function NavBar() {
  const [location, navigate] = useLocation();
  const { t } = useSiteLang();
  const isActive = (path: string) => location === path;
  const link = (path: string) =>
    `text-sm ${isActive(path) ? "text-[#4fc3f7]" : "text-[#94a3b8] hover:text-[#4fc3f7]"}`;

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-[rgba(79,195,247,0.12)] bg-[#0d1b2a]/95 backdrop-blur-sm">
      <div className="container flex h-16 items-center justify-between">
        <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2.5 hover:opacity-80">
          <img src={APP_LOGO} alt="" className="size-11 shrink-0 object-contain" />
          <span className="flex flex-col items-start leading-none">
            <span className="font-['Space_Grotesk'] text-sm font-bold text-white">{APP_NAME}</span>
            <span className="font-['IBM_Plex_Mono'] text-[10px] tracking-widest text-[#FFB300]">
              {IS_PORTAL ? t(NAV.station) : `v${APP_VERSION} · ${t(NAV.station)}`}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-3 sm:gap-6">
          <button type="button" onClick={() => navigate("/")} className={`hidden sm:inline ${link("/")}`}>
            {t(NAV.home)}
          </button>
          <button type="button" onClick={() => navigate("/docs")} className={link("/docs")}>
            {t(NAV.docs)}
          </button>
          {IS_PORTAL ? (
            <button type="button" onClick={() => navigate("/manual")} className={`hidden sm:inline ${link("/manual")}`}>
              {t(NAV.manual)}
            </button>
          ) : null}
          <LangSwitch />
          <button
            type="button"
            onClick={() => navigate(IS_PORTAL ? "/download" : "/console")}
            className="rounded-md bg-[#4fc3f7] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a] hover:bg-[#80d8ff] sm:px-4"
          >
            {t(IS_PORTAL ? NAV.download : NAV.console)}
          </button>
        </div>
      </div>
    </nav>
  );
}
