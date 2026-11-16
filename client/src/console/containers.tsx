import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { allowedDockerContainer } from "@shared/docker-container";
import { useConsole } from "./state";
import { ConsoleInput, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

type ContainerRow = {
  name: string;
  image: string;
  state: string;
  memLimitBytes?: number | null;
  cpusLimit?: number | null;
  memUsageBytes?: number | null;
  cpuPct?: number | null;
};

type ContainerList = {
  ok?: boolean;
  available?: boolean;
  items?: ContainerRow[];
  error?: string;
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GiB`;
}

function fmtCpu(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0%";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function fmtMem(row: ContainerRow): string {
  const usage = row.memUsageBytes;
  const limit = row.memLimitBytes;
  if (usage != null && usage >= 0) {
    const base = fmtBytes(usage);
    if (limit != null && limit > 0) return `${base} / ${fmtBytes(limit)}`;
    return base;
  }
  if (limit != null && limit > 0) return fmtBytes(limit);
  return "—";
}

function fmtCpus(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function isRow(row: unknown): row is ContainerRow {
  if (!row || typeof row !== "object") return false;
  const name = (row as { name?: unknown }).name;
  return typeof name === "string" && allowedDockerContainer(name);
}

export function ContainersPage({ embedded = false }: { embedded?: boolean }) {
  const { tx, pushLog } = useConsole();
  const [items, setItems] = useState<ContainerRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContainerRow | null>(null);
  const [editMem, setEditMem] = useState("");
  const [editCpus, setEditCpus] = useState("");
  const alive = useRef(true);

  const apply = (j: ContainerList) => {
    if (!alive.current) return;
    setAvailable(j.available !== false);
    setItems(Array.isArray(j.items) ? j.items.filter(isRow) : []);
    setError(typeof j.error === "string" ? j.error : "");
  };

  const refresh = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/containers", { cache: "no-store" });
      const j = (await r.json()) as ContainerList;
      apply(j);
      if (!r.ok && !(typeof j.error === "string" && j.error)) setError(tx("ctrFail"));
    } catch {
      if (alive.current) setError(tx("ctrFail"));
    } finally {
      if (alive.current && !silent) setLoading(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    void refresh();
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh({ silent: true });
    };
    const t = window.setInterval(tick, 2500);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const openEdit = (row: ContainerRow) => {
    const memMiB =
      row.memLimitBytes != null && row.memLimitBytes > 0
        ? String(Math.round(row.memLimitBytes / (1024 * 1024)))
        : "";
    setEditMem(memMiB);
    setEditCpus(row.cpusLimit != null ? String(row.cpusLimit) : "");
    setEditing(row);
  };

  const act = async (name: string, action: "stop" | "restart") => {
    if (!allowedDockerContainer(name)) {
      toast.error(tx("ctrBad"));
      return;
    }
    if (action === "stop" && !window.confirm(tx("ctrStopConfirm"))) return;
    setBusy(`${action}:${name}`);
    try {
      const r = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) {
        toast.error(j.error || tx("ctrFail"));
        return;
      }
      pushLog("SYS", `${name} · ${action === "stop" ? tx("ctrStop") : tx("ctrRestart")}`);
      toast.success(action === "stop" ? tx("ctrStopped") : tx("ctrRestarted"));
      await refresh({ silent: true });
    } catch {
      toast.error(tx("ctrFail"));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const saveLimits = async () => {
    if (!editing) return;
    const memoryMiB = Number(editMem.trim());
    const cpus = Number(editCpus.trim().replace(",", "."));
    if (!Number.isFinite(memoryMiB) || !Number.isFinite(cpus)) {
      toast.error(tx("ctrLimitsBad"));
      return;
    }
    setBusy(`limits:${editing.name}`);
    try {
      const r = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          action: "set-limits",
          memoryMiB,
          cpus,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) {
        toast.error(j.error || tx("ctrFail"));
        return;
      }
      toast.success(tx("ctrLimitsSaved"));
      pushLog("SYS", `${editing.name} · ${tx("ctrEditLimits")}`);
      setEditing(null);
      await refresh({ silent: true });
    } catch {
      toast.error(tx("ctrFail"));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const banner = !available ? tx("ctrUnavailable") : error;
  const locked = Boolean(busy);

  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("admin")} title={tx("containers")} />}
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("ctrHelp")}</p>
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PanelTitle>{tx("containers")}</PanelTitle>
          <GhostBtn disabled={locked} onClick={() => void refresh()}>
            {loading ? tx("ctrLoading") : tx("ctrRefresh")}
          </GhostBtn>
        </div>
        {banner ? <p className={`mb-3 text-sm ${available ? "text-[#f87171]" : "text-[#8ea0b3]"}`}>{banner}</p> : null}
        {available && !loading && items.length === 0 && !error ? (
          <p className="text-sm text-[#8ea0b3]">{tx("ctrEmpty")}</p>
        ) : null}
        {items.length > 0 ? (
          <div className="divide-y divide-[rgba(79,195,247,0.08)]">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_auto] gap-3 pb-2 font-['IBM_Plex_Mono'] text-[10px] tracking-[0.14em] text-[#5d7184] uppercase sm:grid">
              <span>{tx("ctrColName")}</span>
              <span>{tx("ctrColState")}</span>
              <span>{tx("ctrColCpu")}</span>
              <span>{tx("ctrColMem")}</span>
              <span>{tx("ctrColLimits")}</span>
              <span />
            </div>
            {items.map((row) => {
              const rowBusy = busy === `stop:${row.name}` || busy === `restart:${row.name}` || busy === `limits:${row.name}`;
              const limits =
                row.memLimitBytes || row.cpusLimit
                  ? `${row.cpusLimit != null ? `${fmtCpus(row.cpusLimit)} CPU` : "—"} · ${
                      row.memLimitBytes != null ? fmtBytes(row.memLimitBytes) : "—"
                    }`
                  : "—";
              return (
                <div
                  key={row.name}
                  className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-['IBM_Plex_Mono'] text-sm font-semibold text-white">{row.name}</p>
                    {row.image ? <p className="truncate text-xs text-[#8ea0b3]">{row.image}</p> : null}
                    <p className="mt-1 font-['IBM_Plex_Mono'] text-[11px] text-[#5d7184] sm:hidden">
                      {tx("ctrColCpu")}: {fmtCpu(row.cpuPct)} · {tx("ctrColMem")}: {fmtMem(row)}
                    </p>
                  </div>
                  <motionState state={row.state} tx={tx} />
                  <div className="hidden font-['IBM_Plex_Mono'] text-xs text-[#c5d4e3] sm:block">{fmtCpu(row.cpuPct)}</div>
                  <div className="hidden font-['IBM_Plex_Mono'] text-xs text-[#c5d4e3] sm:block">{fmtMem(row)}</div>
                  <div className="hidden font-['IBM_Plex_Mono'] text-xs text-[#c5d4e3] sm:block">{limits}</div>
                  <div className="flex flex-wrap gap-2">
                    <GhostBtn disabled={locked || row.state === "not-found"} onClick={() => openEdit(row)}>
                      {tx("ctrEditLimits")}
                    </GhostBtn>
                    <GhostBtn danger disabled={locked || row.state !== "running"} onClick={() => void act(row.name, "stop")}>
                      {rowBusy && busy?.startsWith("stop:") ? "…" : tx("ctrStop")}
                    </GhostBtn>
                    <GhostBtn disabled={locked || row.state === "not-found"} onClick={() => void act(row.name, "restart")}>
                      {rowBusy && busy?.startsWith("restart:") ? "…" : tx("ctrRestart")}
                    </GhostBtn>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Panel>
      {editing ? (
        <Panel className="mt-4">
          <PanelTitle>
            {tx("ctrEditLimits")}: {editing.name}
          </PanelTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[#8ea0b3]">
              {tx("ctrMemMiB")}
              <ConsoleInput value={editMem} onChange={(e) => setEditMem(e.target.value)} className="mt-1" inputMode="numeric" />
            </label>
            <label className="block text-sm text-[#8ea0b3]">
              {tx("ctrCpus")}
              <ConsoleInput value={editCpus} onChange={(e) => setEditCpus(e.target.value)} className="mt-1" inputMode="decimal" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <PrimaryBtn disabled={locked} onClick={() => void saveLimits()}>
              {tx("save")}
            </PrimaryBtn>
            <GhostBtn disabled={locked} onClick={() => setEditing(null)}>
              {tx("wizardBack")}
            </GhostBtn>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function motionState({ state, tx }: { state: string; tx: (k: import("./i18n").I18nKey) => string }) {
  const label =
    state === "running"
      ? tx("ctrRunning")
      : state === "not-found"
        ? tx("ctrNotFound")
        : state || "—";
  const ok = state === "running";
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 font-['IBM_Plex_Mono'] text-[11px] ${
        ok ? "border-[#34d399]/40 text-[#34d399]" : "border-[#5d7184]/40 text-[#8ea0b3]"
      }`}
    >
      {label}
    </span>
  );
}