import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { currentLayoutUser } from "./panel-layout";
import { useConsole } from "./state";
import { GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

type BackupItem = {
  id: string;
  user: string;
  createdAt: string;
  size: number;
  parts: string[];
  warnings: string[];
};

type ListBody = { ok?: boolean; folder?: string; items?: BackupItem[]; error?: string };

const FETCH_MS = 300_000;

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "—" };
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function BackupPage({ embedded = false }: { embedded?: boolean }) {
  const { tx, pushLog } = useConsole();
  const [folder, setFolder] = useState("/backup");
  const [items, setItems] = useState<BackupItem[]>([]);
  const [busy, setBusy] = useState<"create" | "restore" | "delete" | null>(null);
  const [target, setTarget] = useState<BackupItem | null>(null);
  const [ack, setAck] = useState(false);

  const load = useCallback(async () => {
    try {
      const j = await api<ListBody>("/api/backup");
      if (j.folder) setFolder(j.folder);
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      toast.error(tx("backupFail"));
    }
  }, [tx]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy("create");
    try {
      const j = await api<{ ok?: boolean; item?: BackupItem; error?: string }>("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: currentLayoutUser() }),
      });
      if (!j.ok) {
        toast.error(j.error || tx("backupFail"));
        return;
      }
      toast.success(tx("backupOk"));
      pushLog("SYS", `backup ${j.item?.id || ""}`);
      await load();
    } catch {
      toast.error(tx("backupFail"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: BackupItem) => {
    setBusy("delete");
    try {
      const j = await api<{ ok?: boolean; error?: string }>(`/api/backup/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      if (!j.ok) {
        toast.error(j.error || tx("backupDelFail"));
        return;
      }
      toast.success(tx("backupDelOk"));
      if (target?.id === row.id) {
        setTarget(null);
        setAck(false);
      }
      await load();
    } catch {
      toast.error(tx("backupDelFail"));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!target || !ack) return;
    setBusy("restore");
    try {
      const j = await api<{ ok?: boolean; error?: string; warnings?: string[] }>(
        `/api/backup/${encodeURIComponent(target.id)}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      if (!j.ok) {
        toast.error(j.error || tx("backupRestoreFail"));
        return;
      }
      toast.success(tx("backupRestoreOk"));
      pushLog("SYS", `restore ${target.id}`);
      if (j.warnings?.length) toast.message(j.warnings.slice(0, 3).join(" · "));
      setTarget(null);
      setAck(false);
      await load();
    } catch {
      toast.error(tx("backupRestoreFail"));
    } finally {
      setBusy(null);
    }
  };

  const openRestore = (row: BackupItem | undefined) => {
    if (!row) {
      toast.error(tx("backupNone"));
      return;
    }
    setAck(false);
    setTarget(row);
  };

  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("backup")} title={tx("backupTitle")} />}
      <Panel>
        <PanelTitle>{tx("backupTitle")}</PanelTitle>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("backupHelp")}</p>
        <p className="mb-4 font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">
          {tx("backupFolder")}: {folder}
        </p>
        <div className="mb-5 flex flex-wrap gap-2">
          <PrimaryBtn disabled={busy !== null} onClick={() => void create()}>
            <span className="inline-flex items-center gap-2">
              <Archive size={16} />
              {busy === "create" ? tx("backupRunning") : tx("backupRun")}
            </span>
          </PrimaryBtn>
          <GhostBtn disabled={busy !== null || items.length === 0} onClick={() => openRestore(items[0])}>
            {tx("backupRestore")}
          </GhostBtn>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-[#8ea0b3]">{tx("backupEmpty")}</p>
        ) : (
          <div className="console-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
                <tr>
                  <th className="py-2 pr-3">{tx("backupUser")}</th>
                  <th className="py-2 pr-3">{tx("backupDate")}</th>
                  <th className="py-2 pr-3">{tx("backupTime")}</th>
                  <th className="py-2 pr-3">{tx("backupSize")}</th>
                  <th className="py-2 pr-3">{tx("backupParts")}</th>
                  <th className="py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {items.map((row) => {
                  const { date, time } = when(row.createdAt);
                  return (
                    <tr key={row.id} className="border-t border-[rgba(79,195,247,0.08)]">
                      <td className="py-2.5 pr-3 font-['IBM_Plex_Mono'] text-xs">{row.user}</td>
                      <td className="py-2.5 pr-3">{date}</td>
                      <td className="py-2.5 pr-3 font-['IBM_Plex_Mono'] text-xs">{time}</td>
                      <td className="py-2.5 pr-3 font-['IBM_Plex_Mono'] text-xs">{fmtSize(row.size)}</td>
                      <td className="py-2.5 pr-3 text-xs text-[#8ea0b3]">{row.parts.join(", ") || "—"}</td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            title={tx("backupRestore")}
                            disabled={busy !== null}
                            className="grid h-9 w-9 place-items-center rounded-md text-[#4fc3f7] hover:bg-[#4fc3f7]/10 disabled:opacity-40"
                            onClick={() => openRestore(row)}
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button
                            type="button"
                            title={tx("remove")}
                            disabled={busy !== null}
                            className="grid h-9 w-9 place-items-center rounded-md text-[#f87171] hover:bg-[#ef4444]/10 disabled:opacity-40"
                            onClick={() => void remove(row)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {target ? (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-black/60 px-4"
          onClick={() => (busy === "restore" ? undefined : (setTarget(null), setAck(false)))}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-restore-title"
            className="w-full max-w-lg rounded-2xl border border-[rgba(79,195,247,0.2)] bg-[#0b1520] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="backup-restore-title" className="font-['Space_Grotesk'] text-lg font-semibold text-white">
              {tx("backupDlgTitle")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#8ea0b3]">{tx("backupDlgBody")}</p>
            <p className="mt-3 font-['IBM_Plex_Mono'] text-xs text-[#ffb300]">
              {tx("backupDlgWhen")}: {when(target.createdAt).date} {when(target.createdAt).time} · {target.user} · {fmtSize(target.size)}
            </p>
            {target.warnings.length ? (
              <p className="mt-2 text-xs text-[#fbbf24]">
                {tx("backupWarn")}: {target.warnings.join(" · ")}
              </p>
            ) : null}
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-[#c5d4e0]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#4fc3f7]"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>{tx("backupDlgCheck")}</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <GhostBtn disabled={busy === "restore"} onClick={() => (setTarget(null), setAck(false))}>
                {tx("cancelEdit")}
              </GhostBtn>
              <PrimaryBtn disabled={!ack || busy === "restore"} onClick={() => void restore()}>
                {busy === "restore" ? tx("backupRestoring") : tx("backupDlgGo")}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
