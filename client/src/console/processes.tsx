import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isConsoleUnit, validServiceUnit } from "@shared/process-unit";
import { useConsole } from "./state";
import { Chip, GhostBtn, PageHead, Panel, PanelTitle } from "./widgets";

type ProcRow = {
  unit: string;
  active: string;
  sub: string;
  description: string;
};

type ProcList = {
  ok?: boolean;
  available?: boolean;
  items?: ProcRow[];
  error?: string;
};

function isRow(row: unknown): row is ProcRow {
  if (!row || typeof row !== "object") return false;
  const unit = (row as { unit?: unknown }).unit;
  return typeof unit === "string" && validServiceUnit(unit);
}

export function ProcessesPage({ embedded = false }: { embedded?: boolean }) {
  const { tx, pushLog } = useConsole();
  const [items, setItems] = useState<ProcRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const alive = useRef(true);

  const apply = (j: ProcList) => {
    if (!alive.current) return;
    setAvailable(j.available !== false);
    setItems(Array.isArray(j.items) ? j.items.filter(isRow) : []);
    setError(typeof j.error === "string" ? j.error : "");
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/processes", { cache: "no-store" });
      const j = (await r.json()) as ProcList;
      apply(j);
      if (!r.ok && !(typeof j.error === "string" && j.error)) setError(tx("procFail"));
    } catch {
      if (alive.current) setError(tx("procFail"));
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, []);

  const waitUntilBack = async () => {
    setReconnecting(true);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (!alive.current) return;
      try {
        const r = await fetch("/api/processes", { cache: "no-store" });
        if (!r.ok) continue;
        const j = (await r.json()) as ProcList;
        apply(j);
        if (!alive.current) return;
        setReconnecting(false);
        toast.success(tx("procBack"));
        return;
      } catch {
        /* o console ainda está fora */
      }
    }
    if (!alive.current) return;
    setReconnecting(false);
    toast.error(tx("procReconnectFail"));
  };

  const act = async (unit: string, action: "stop" | "restart") => {
    if (!validServiceUnit(unit)) {
      toast.error(tx("procBad"));
      return;
    }
    const self = isConsoleUnit(unit);
    if (self && !window.confirm(action === "stop" ? tx("procSelfStop") : tx("procSelfRestart"))) return;
    setBusy(`${action}:${unit}`);
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), self && action === "restart" ? 8_000 : 50_000);
      let r: Response;
      try {
        r = await fetch("/api/processes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unit, action }),
          signal: ctrl.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }
      let j: { ok?: boolean; error?: string } = {};
      try {
        j = (await r.json()) as { ok?: boolean; error?: string };
      } catch {
        j = {};
      }
      if (self && action === "restart") {
        toast.message(tx("procReconnect"));
        void waitUntilBack();
        return;
      }
      if (self && action === "stop") {
        toast.message(tx("procSelfStopped"));
        return;
      }
      if (!r.ok || j.ok === false) {
        toast.error(j.error || tx("procFail"));
        return;
      }
      pushLog("SYS", `${unit} · ${action === "stop" ? tx("procStop") : tx("procRestart")}`);
      toast.success(action === "stop" ? tx("procStopped") : tx("procRestarted"));
      await refresh();
    } catch {
      if (self && action === "restart") {
        toast.message(tx("procReconnect"));
        void waitUntilBack();
        return;
      }
      if (self && action === "stop") {
        toast.message(tx("procSelfStopped"));
        return;
      }
      toast.error(tx("procFail"));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const banner = !available ? tx("procUnavailable") : error;
  const locked = Boolean(busy) || reconnecting;

  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("admin")} title={tx("processes")} />}
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("procHelp")}</p>
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PanelTitle>{tx("processes")}</PanelTitle>
          <GhostBtn disabled={locked} onClick={() => void refresh()}>
            {loading ? tx("procLoading") : tx("procRefresh")}
          </GhostBtn>
        </div>
        {reconnecting ? <p className="mb-3 text-sm text-[#ffb300]">{tx("procReconnect")}</p> : null}
        {banner ? <p className={`mb-3 text-sm ${available ? "text-[#f87171]" : "text-[#8ea0b3]"}`}>{banner}</p> : null}
        {available && !loading && items.length === 0 && !error ? (
          <p className="text-sm text-[#8ea0b3]">{tx("procEmpty")}</p>
        ) : null}
        {items.length > 0 ? (
          <div className="divide-y divide-[rgba(79,195,247,0.08)]">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto] gap-3 pb-2 font-['IBM_Plex_Mono'] text-[10px] tracking-[0.14em] text-[#5d7184] uppercase sm:grid">
              <span>{tx("procColUnit")}</span>
              <span>{tx("procColState")}</span>
              <span />
            </div>
            {items.map((row) => {
              const state = row.sub ? `${row.active} · ${row.sub}` : row.active;
              const rowBusy = busy === `stop:${row.unit}` || busy === `restart:${row.unit}`;
              return (
                <div
                  key={row.unit}
                  className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-['IBM_Plex_Mono'] text-sm font-semibold text-white">{row.unit}</p>
                    {row.description ? <p className="truncate text-xs text-[#8ea0b3]">{row.description}</p> : null}
                    {isConsoleUnit(row.unit) ? <p className="mt-1 text-xs text-[#ffb300]">{tx("procSelfHint")}</p> : null}
                  </div>
                  <div>
                    <Chip active={row.sub === "running" || row.active === "active"} tone={row.sub === "running" ? "ok" : "cyan"}>
                      {state}
                    </Chip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GhostBtn danger disabled={locked} onClick={() => void act(row.unit, "stop")}>
                      {rowBusy && busy?.startsWith("stop:") ? "…" : tx("procStop")}
                    </GhostBtn>
                    <GhostBtn disabled={locked} onClick={() => void act(row.unit, "restart")}>
                      {rowBusy && busy?.startsWith("restart:") ? "…" : tx("procRestart")}
                    </GhostBtn>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
