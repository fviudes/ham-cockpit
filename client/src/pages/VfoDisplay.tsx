import { FitTile } from "@/console/panel-board";
import { ConsoleProvider, useConsole } from "@/console/state";
import { VfoPanel } from "@/console/vfo-panel";
import { APP_VERSION } from "@shared/brand";
import { useEffect } from "react";

export default function VfoDisplay() {
  return (
    <ConsoleProvider active>
      <VfoDisplayInner />
    </ConsoleProvider>
  );
}

function VfoDisplayInner() {
  const { tx } = useConsole();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        void fetch("/api/vfo-display/exit", { method: "POST" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="console flex h-screen cursor-none flex-col bg-[#071018] text-[#e8eef4]">
      <div className="min-h-0 flex-1 p-4 md:p-8">
        <div className="h-full overflow-hidden rounded-xl border border-[rgba(79,195,247,0.14)] bg-[#0b1520] p-5 pt-8">
          <FitTile>
            <VfoPanel />
          </FitTile>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[rgba(79,195,247,0.12)] px-5 py-3 font-['IBM_Plex_Mono'] text-sm text-[#8ea0b3]">
        <span>
          {tx("brand")} · v{APP_VERSION}
        </span>
        <span className="text-[#4fc3f7]">{tx("vfoHdmiExit")}</span>
      </footer>
    </div>
  );
}
