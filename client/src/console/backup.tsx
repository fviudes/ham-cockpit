import { Archive, Download, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { currentLayoutUser } from "./panel-layout";
import { useConsole } from "./state";
import { ActionProgress, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";
import type { I18nKey } from "./i18n";

type BackupItem = {
  id: string;
  user: string;
  createdAt: string;
  size: number;
  parts: string[];
  warnings: string[];
};

type ListBody = { ok?: boolean; folder?: string; items?: BackupItem[]; error?: string };

type BackupJob = {
  id: string;
  kind: "create" | "restore";
  status: "running" | "ok" | "error";
  pct: number;
  stage: string;
  error: string;
  item?: BackupItem;
  warnings?: string[];
};

const FETCH_MS = 30_000;
const POLL_MS = 500;

const STAGE_KEY: Record<string, I18nKey> = {
  prepare: "backupStagePrepare",
  station: "backupStageStation",
  wlg: "backupStageWlg",
  wavelog: "backupStageWavelog",
  archive: "backupStageArchive",
  finalize: "backupStageFinalize",
  done: "backupStageDone",
  error: "backupFail",
};

const UPLOAD_MAX = 1024 * 1024 * 1024;

function shownError(error: string | undefined, fallback: string) {
  if (!error || error === "confirm" || error === "id" || error === "missing" || error === "job") return fallback;
  return error;
}

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
  const [busy, setBusy] = useState<"create" | "restore" | "delete" | "download" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
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

  const trackJob = async (jobId: string) => {
    let last: BackupJob | null = null;
    for (;;) {
      const j = await api<{ ok?: boolean; job?: BackupJob; error?: string }>(`/api/backup/jobs/${encodeURIComponent(jobId)}`);
      if (!j.ok || !j.job) throw new Error(j.error || "job");
      last = j.job;
      setProgress(j.job.pct);
      setStage(j.job.stage);
      if (j.job.status !== "running") break;
      await new Promise((r) => window.setTimeout(r, POLL_MS));
    }
    return last!;
  };

  const create = async () => {
    setBusy("create");
    setProgress(2);
    setStage("prepare");
    try {
      const started = await api<{ ok?: boolean; jobId?: string; error?: string }>("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: currentLayoutUser() }),
      });
      if (!started.ok || !started.jobId) {
        toast.error(started.error || tx("backupFail"));
        return;
      }
      const job = await trackJob(started.jobId);
      if (job.status !== "ok") {
        toast.error(job.error || tx("backupFail"));
        return;
      }
      setProgress(100);
      setStage("done");
      toast.success(tx("backupOk"));
      pushLog("SYS", `backup ${job.item?.id || ""}`);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      await load();
    } catch {
      toast.error(tx("backupFail"));
    } finally {
      setBusy(null);
      setProgress(0);
      setStage("");
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
    setProgress(2);
    setStage("prepare");
    try {
      const started = await api<{ ok?: boolean; jobId?: string; error?: string }>(
        `/api/backup/${encodeURIComponent(target.id)}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      if (!started.ok || !started.jobId) {
        toast.error(started.error || tx("backupRestoreFail"));
        return;
      }
      const job = await trackJob(started.jobId);
      if (job.status !== "ok") {
        toast.error(job.error || tx("backupRestoreFail"));
        return;
      }
      setProgress(100);
      setStage("done");
      toast.success(tx("backupRestoreOk"));
      pushLog("SYS", `restore ${target.id}`);
      if (job.warnings?.length) toast.message(job.warnings.slice(0, 3).join(" · "));
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setTarget(null);
      setAck(false);
      await load();
    } catch {
      toast.error(tx("backupRestoreFail"));
    } finally {
      setBusy(null);
      setProgress(0);
      setStage("");
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

  const download = async (row: BackupItem) => {
    setBusy("download");
    try {
      const r = await fetch(`/api/backup/${encodeURIComponent(row.id)}/file`, { credentials: "same-origin" });
      if (!r.ok) {
        let message = "";
        try {
          const j = (await r.json()) as { error?: string };
          message = j.error || "";
        } catch {
          message = "";
        }
        toast.error(shownError(message, tx("backupDownloadFail")));
        return;
      }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || `${row.id}.tgz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(tx("backupDownloadFail"));
    } finally {
      setBusy(null);
    }
  };

  const restoreFromFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".tgz")) {
      toast.error(tx("backupFileBad"));
      return;
    }
    if (file.size <= 0 || file.size > UPLOAD_MAX) {
      toast.error(tx("backupFileBig"));
      return;
    }
    if (!window.confirm(tx("backupFileConfirm"))) return;
    setBusy("restore");
    setProgress(2);
    setStage("prepare");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("confirm", "true");
      const r = await fetch("/api/backup/restore-file", { method: "POST", body: fd, credentials: "same-origin" });
      const started = (await r.json()) as { ok?: boolean; jobId?: string; error?: string };
      if (!r.ok || !started.ok || !started.jobId) {
        toast.error(shownError(started.error, tx("backupRestoreFail")));
        return;
      }
      const job = await trackJob(started.jobId);
      if (job.status !== "ok") {
        toast.error(shownError(job.error, tx("backupRestoreFail")));
        return;
      }
      setProgress(100);
      setStage("done");
      toast.success(tx("backupRestoreOk"));
      pushLog("SYS", `restore arquivo ${file.name}`);
      if (job.warnings?.length) toast.message(job.warnings.slice(0, 3).join(" · "));
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      await load();
    } catch {
      toast.error(tx("backupRestoreFail"));
    } finally {
      setBusy(null);
      setProgress(0);
      setStage("");
    }
  };

  const barLabel = stage && STAGE_KEY[stage] ? tx(STAGE_KEY[stage]) : tx("updProgress");

  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("backup")} title={tx("backupTitle")} />}
      <Panel>
        <PanelTitle>{tx("backupTitle")}</PanelTitle>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("backupHelp")}</p>
        <p className="mb-4 font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">
          {tx("backupFolder")}: {folder}
        </p>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex shrink-0 flex-wrap gap-2">
            <PrimaryBtn disabled={busy !== null} onClick={() => void create()}>
              <span className="inline-flex items-center gap-2">
                <Archive size={16} />
                {busy === "create" ? tx("backupRunning") : tx("backupRun")}
              </span>
            </PrimaryBtn>
            <GhostBtn disabled={busy !== null || items.length === 0} onClick={() => openRestore(items[0])}>
              {tx("backupRestore")}
            </GhostBtn>
            <GhostBtn disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === "restore" && !target ? tx("backupRestoring") : tx("backupRestoreFile")}
            </GhostBtn>
            <input
              ref={fileRef}
              type="file"
              accept=".tgz,application/gzip"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void restoreFromFile(file);
              }}
            />
          </div>
          <ActionProgress active={busy === "create" || (busy === "restore" && !target)} value={progress} label={barLabel} />
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
                            title={tx("backupDownload")}
                            aria-label={tx("backupDownload")}
                            disabled={busy !== null}
                            className="grid h-9 w-9 place-items-center rounded-md text-[#4fc3f7] hover:bg-[#4fc3f7]/10 disabled:opacity-40"
                            onClick={() => void download(row)}
                          >
                            <Download size={16} />
                          </button>
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
            <div className="mt-5 flex items-center gap-3">
              <div className="flex shrink-0 justify-end gap-2">
                <GhostBtn disabled={busy === "restore"} onClick={() => (setTarget(null), setAck(false))}>
                  {tx("cancelEdit")}
                </GhostBtn>
                <PrimaryBtn disabled={!ack || busy === "restore"} onClick={() => void restore()}>
                  {busy === "restore" ? tx("backupRestoring") : tx("backupDlgGo")}
                </PrimaryBtn>
              </div>
              <ActionProgress active={busy === "restore"} value={progress} label={barLabel} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
