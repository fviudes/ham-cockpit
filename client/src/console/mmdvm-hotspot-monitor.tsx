import { useEffect, useRef, useState } from "react";
import { useConsole } from "./state";
import { GhostBtn, Lcd, PageHead, Panel, PanelTitle } from "./widgets";
import type { I18nKey } from "./i18n";
import { HeardCall } from "./mmdvm-heard-call";
import type { Heard, MmdvmApi } from "./mmdvm-types";

function StatusTile({ label, value, on, amber }: { label: string; value: string; on?: boolean; amber?: boolean }) {
  const color = amber ? "text-[#ffb300]" : on ? "text-[#34d399]" : "text-[#f87171]";
  return (
    <Panel>
      <p className="text-[11px] tracking-wide text-[#8ea0b3] uppercase">{label}</p>
      <p className={`mt-1 truncate font-['IBM_Plex_Mono'] text-lg font-semibold ${color}`}>{value}</p>
    </Panel>
  );
}

export function MmdvmHotspotMonitorPage() {
  const { tx } = useConsole();
  const [st, setSt] = useState<MmdvmApi | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pull = () =>
      fetch("/api/mmdvm")
        .then((r) => r.json() as Promise<MmdvmApi>)
        .then((j) => setSt(j))
        .catch(() => undefined);
    void pull();
    const id = window.setInterval(() => void pull(), 3500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const toggleFullscreen = async () => {
    if (!fullscreen) {
      try {
        await panelRef.current?.requestFullscreen();
      } catch {
        /* fallback só CSS */
      }
      setFullscreen(true);
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
    setFullscreen(false);
  };

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const heard = (st?.lastHeard ?? []).slice(0, 20);

  const shellClass = fullscreen
    ? "fixed inset-0 z-[80] overflow-auto bg-[#071018] p-4 sm:p-6"
    : "";

  return (
    <div className={shellClass}>
      {!fullscreen ? (
        <PageHead kicker={tx("mmdvm")} title={tx("mmdvmMonitorTitle")} />
      ) : (
        <MonitorFsHeader title={tx("mmdvmMonitorTitle")} onRestore={() => void toggleFullscreen()} restoreLabel={tx("mmdvmMonitorRestore")} />
      )}
      {!fullscreen ? (
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("mmdvmMonitorHelp")}</p>
      ) : null}

      <div ref={panelRef} className={fullscreen ? "mx-auto max-w-6xl" : ""}>
        <MonitorToolBar fullscreen={fullscreen} onToggle={() => void toggleFullscreen()} maximize={tx("mmdvmMonitorMax")} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusTile label={tx("mmdvmHost")} value={st?.hostRunning ? tx("svcRunning") : tx("svcStopped")} on={Boolean(st?.hostRunning)} />
          <StatusTile label={tx("mmdvmGateway")} value={st?.gatewayRunning ? tx("svcRunning") : tx("svcStopped")} on={Boolean(st?.gatewayRunning)} />
          <StatusTile
            label={st?.tx ? tx("tx") : tx("rx")}
            value={st?.currentMode || (st?.duplex ? tx("mmdvmDuplex") : tx("mmdvmSimplex"))}
            on={Boolean(st?.hostRunning)}
            amber={Boolean(st?.tx)}
          />
          <StatusTile label={tx("mmdvmCallsign")} value={st?.callsign || "—"} on={Boolean(st?.hostRunning)} />
        </div>

        <Panel className="mt-4">
          <PanelTitle>{tx("mmdvmLastHeard")}</PanelTitle>
          <Lcd className="mb-3">
            <p className="text-[11px] tracking-widest text-[#4fc3f7]/70 uppercase">{tx("mmdvmLive")}</p>
            <p className="mt-1 text-lg text-[#7ee0ff]">
              {heard[0] ? (
                <>
                  <HeardCall callsign={heard[0].callsign} radio={heard[0].radio} />
                  {` → ${heard[0].target} · ${heard[0].mode}`}
                </>
              ) : (
                tx("mmdvmEmptyHeard")
              )}
            </p>
          </Lcd>
          <HeardTable heard={heard} tx={tx} hostRunning={st?.hostRunning} liveTx={st?.tx} />
        </Panel>
      </div>
    </div>
  );
}

function HeardTable({
  heard,
  tx,
  hostRunning,
  liveTx,
}: {
  heard: Heard[];
  tx: (k: I18nKey) => string;
  hostRunning?: boolean;
  liveTx?: boolean;
}) {
  const slots: (Heard | null)[] = Array.from({ length: 20 }, (_, i) => heard[i] ?? null);
  return (
    <div className="overflow-hidden">
      <table className="w-full table-fixed text-left text-[13px]">
        <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
          <tr>
            <th className="w-[14%] py-1.5">{tx("mmdvmColTime")}</th>
            <th className="w-[22%]">{tx("mmdvmColCall")}</th>
            <th className="w-[14%]">{tx("mode")}</th>
            <th className="w-[18%]">{tx("mmdvmColTarget")}</th>
            <th className="w-[10%]">{tx("mmdvmColSrc")}</th>
            <th className="w-[11%]">{tx("mmdvmColDur")}</th>
            <th className="w-[11%]">{tx("mmdvmColLoss")}</th>
          </tr>
        </thead>
        <tbody className="font-['IBM_Plex_Mono'] text-[#c5d4e0]">
          {slots.map((row, i) =>
            row ? (
              <tr key={`${row.timeUtc}-${row.callsign}-${i}`} className="border-t border-[rgba(79,195,247,0.08)]">
                <td className="truncate py-1 text-[#8ea0b3]">{row.timeUtc.slice(11)}</td>
                <td className="truncate text-[#4fc3f7]">
                  <HeardCall callsign={row.callsign} radio={row.radio} />
                </td>
                <td className="truncate">{row.mode}</td>
                <td className="truncate">{row.target}</td>
                <td className={row.src === "RF" ? "text-[#ffb300]" : "text-[#34d399]"}>{row.src}</td>
                <td>{row.duration || (liveTx && i === 0 && hostRunning ? "TX" : "—")}</td>
                <td className="truncate">{row.loss || "—"}</td>
              </tr>
            ) : (
              <tr key={`empty-${i}`} className="border-t border-[rgba(79,195,247,0.08)]">
                <td className="py-1 text-[#3d4d5c]" colSpan={7}>
                  {i === 0 ? tx("mmdvmEmptyHeard") : "\u00a0"}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function MonitorFsHeader({ title, onRestore, restoreLabel }: { title: string; onRestore: () => void; restoreLabel: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-['Space_Grotesk'] text-xl text-white">{title}</h1>
      <GhostBtn onClick={onRestore}>{restoreLabel}</GhostBtn>
    </div>
  );
}

function MonitorToolBar({
  fullscreen,
  onToggle,
  maximize,
}: {
  fullscreen: boolean;
  onToggle: () => void;
  maximize: string;
}) {
  if (fullscreen) return null;
  return (
    <div className="mb-4 flex justify-end">
      <GhostBtn onClick={onToggle}>{maximize}</GhostBtn>
    </div>
  );
}