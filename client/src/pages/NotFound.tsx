import { Link } from "wouter";
import NavBar from "@/components/NavBar";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0d1b2a]">
      <NavBar />
      <div className="pt-14 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="font-['IBM_Plex_Mono'] text-[120px] font-bold text-[#4fc3f7]/10 leading-none select-none">
            404
          </div>
          <h1 className="font-['Space_Grotesk'] font-bold text-2xl text-white -mt-4 mb-3">
            Página não encontrada
          </h1>
          <p className="text-[#94a3b8] text-sm mb-6 font-['IBM_Plex_Sans']">
            O endereço solicitado não existe neste dispositivo.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#4fc3f7] text-[#0d1b2a] font-bold text-sm rounded font-['IBM_Plex_Mono'] hover:bg-[#81d4fa] transition-colors"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    </div>
  );
}
