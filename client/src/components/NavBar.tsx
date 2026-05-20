/*
 * NavBar Component — ESP32 CI-V Gateway
 * Design: Blueprint Técnico
 * Navegação global com logo e links
 */
import { useLocation } from "wouter";
import { Cpu } from "lucide-react";

export default function NavBar() {
  const [location, navigate] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(79,195,247,0.1)] bg-[#0d1b2a]/95 backdrop-blur-sm">
      <div className="container flex items-center justify-between h-14">
        {/* Logo */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Cpu size={24} className="text-[#4fc3f7]" />
          <div className="flex flex-col">
            <span className="font-['Space_Grotesk'] font-bold text-white text-sm">ESP32 CI-V</span>
            <span className="font-['IBM_Plex_Mono'] text-[10px] text-[#FFB300] tracking-widest">GATEWAY</span>
          </div>
        </button>

        {/* Links */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate("/")}
            className={`font-['IBM_Plex_Sans'] text-sm transition-colors ${
              isActive("/")
                ? "text-[#4fc3f7]"
                : "text-[#94a3b8] hover:text-[#4fc3f7]"
            }`}
          >
            Início
          </button>
          <button
            onClick={() => navigate("/docs")}
            className={`font-['IBM_Plex_Sans'] text-sm transition-colors ${
              isActive("/docs")
                ? "text-[#4fc3f7]"
                : "text-[#94a3b8] hover:text-[#4fc3f7]"
            }`}
          >
            Documentação
          </button>
          <button
            onClick={() => navigate("/code")}
            className={`font-['IBM_Plex_Sans'] text-sm transition-colors ${
              isActive("/code")
                ? "text-[#4fc3f7]"
                : "text-[#94a3b8] hover:text-[#4fc3f7]"
            }`}
          >
            Código-Fonte
          </button>
          <a
            href="/ESP32_CIV_Gateway_Complete_v1.0.ino"
            download
            className="px-4 py-2 bg-[#4fc3f7] text-[#0d1b2a] font-bold rounded text-sm hover:bg-[#80d8ff] transition-colors"
          >
            Download .ino
          </a>
        </div>
      </div>
    </nav>
  );
}
