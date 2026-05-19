/*
 * NavBar — Blueprint Técnico
 * Barra de navegação fixa com identidade visual de engenharia
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Radio, Cpu } from "lucide-react";

const navLinks = [
  { href: "/", label: "Início" },
  { href: "/docs", label: "Documentação" },
  { href: "/code", label: "Código-Fonte" },
];

export default function NavBar() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(79,195,247,0.15)] bg-[rgba(13,27,42,0.95)] backdrop-blur-md">
      <div className="container">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded border border-[#4fc3f7]/40 group-hover:border-[#4fc3f7]/80 transition-colors" />
              <Cpu size={16} className="text-[#4fc3f7]" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-['Space_Grotesk'] font-700 text-sm text-white tracking-wide">
                ESP32 CI-V
              </span>
              <span className="text-[10px] text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] tracking-widest uppercase">
                Gateway
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-1.5 text-sm font-medium rounded transition-all duration-150 font-['IBM_Plex_Sans'] ${
                  location === link.href
                    ? "text-[#4fc3f7] bg-[rgba(79,195,247,0.1)] border border-[rgba(79,195,247,0.2)]"
                    : "text-[#94a3b8] hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA + Mobile toggle */}
          <div className="flex items-center gap-3">
            <a
              href="/manus-storage/ESP32_CIV_Gateway_3429e4d6.ino"
              download="ESP32_CIV_Gateway.ino"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs font-semibold font-['IBM_Plex_Mono'] text-[#0d1b2a] bg-[#4fc3f7] rounded hover:bg-[#81d4fa] transition-colors active:scale-95"
            >
              <Radio size={12} />
              Download .ino
            </a>
            <button
              className="md:hidden text-[#94a3b8] hover:text-white p-1"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[rgba(79,195,247,0.1)] bg-[rgba(13,27,42,0.98)] px-4 py-3 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`px-3 py-2 text-sm rounded font-['IBM_Plex_Sans'] ${
                location === link.href
                  ? "text-[#4fc3f7] bg-[rgba(79,195,247,0.1)]"
                  : "text-[#94a3b8] hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <a
            href="/manus-storage/ESP32_CIV_Gateway_3429e4d6.ino"
            download="ESP32_CIV_Gateway.ino"
            className="mt-2 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold font-['IBM_Plex_Mono'] text-[#0d1b2a] bg-[#4fc3f7] rounded"
          >
            <Radio size={12} />
            Download .ino
          </a>
        </div>
      )}
    </header>
  );
}
