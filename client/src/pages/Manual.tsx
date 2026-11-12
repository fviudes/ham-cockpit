import NavBar from "@/components/NavBar";
import { ManualPage } from "@/console/manual";

/** Manual de operação no portal (`/manual`). No dispositivo o mesmo conteúdo fica em `/console/manual`. */
export default function Manual() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="flex-1 pt-16">
        <div className="container max-w-5xl py-10">
          <ManualPage />
        </div>
      </main>
      <footer className="border-t border-[rgba(79,195,247,0.1)] py-6">
        <div className="container text-xs text-[#5d7184]">
          Ham Cockpit · Raspberry Pi 3 / 4 / 5 · Ubuntu Server 24.04 LTS
        </div>
      </footer>
    </div>
  );
}
