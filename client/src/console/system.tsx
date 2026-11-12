import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { APP_VERSION } from "@shared/brand";
import { UPDATE_IDS, type UpdateId } from "@shared/const";
import { licenseGateOf, licenseMenusOpen } from "@shared/license";
import { isNewerVersion } from "@shared/version";
import { copyText as copyTextToClipboard } from "./clipboard";
import { SERVICE_IDS, SVC_HINT, SVC_LABEL, SVC_POWER, serviceLive, type ServiceId } from "./services-ui";
import type { I18nKey } from "./i18n";
import { formatWatts, useConsole, type LogKind } from "./state";
import { TermPage } from "./term";
import { BackupPage } from "./backup";
import { LicensePage } from "./license";
import { ActionProgress, Chip, ConsoleInput, Field, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn, progressHint, stageLabel } from "./widgets";

type LinuxUser = { name: string; sudo: boolean };

const KINDS: LogKind[] = ["BLE", "CIV", "IC705", "RADIO", "WiFi", "SYS", "WLOG", "S2N", "ACOM", "LEXTEL", "LDG", "LP100A", "MMDVM", "ERRO"];

export function LogsPage({ embedded = false }: { embedded?: boolean }) {
  const { s, tx } = useConsole();
  const [on, setOn] = useState<Record<LogKind, boolean>>({
    BLE: true,
    CIV: true,
    IC705: true,
    RADIO: true,
    WiFi: true,
    SYS: true,
    WLOG: true,
    S2N: true,
    ACOM: true,
    LEXTEL: true,
    LDG: true,
    LP100A: true,
    MMDVM: true,
    ERRO: true,
  });
  const rows = s.logs.filter((l) => on[l.kind]);
  const color: Record<LogKind, string> = {
    BLE: "text-[#a78bfa]",
    CIV: "text-[#4fc3f7]",
    IC705: "text-[#34d399]",
    RADIO: "text-[#34d399]",
    WiFi: "text-[#60a5fa]",
    SYS: "text-[#e8eef4]",
    WLOG: "text-[#fbbf24]",
    S2N: "text-[#38bdf8]",
    ACOM: "text-[#fb7185]",
    LEXTEL: "text-[#fbbf24]",
    LDG: "text-[#86efac]",
    LP100A: "text-[#fbbf24]",
    MMDVM: "text-[#4fc3f7]",
    ERRO: "text-[#f87171]",
  };
  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("logs")} title={tx("logsTitle")} />}
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Chip key={k} active={on[k]} onClick={() => setOn((p) => ({ ...p, [k]: !p[k] }))}>
              {k}
            </Chip>
          ))}
        </div>
        <div className="console-scroll max-h-[480px] overflow-auto rounded-lg bg-[#03080d] p-4 font-['IBM_Plex_Mono'] text-xs leading-6">
          {rows.map((l, i) => (
            <div key={`${l.ts}-${i}`}>
              <span className="text-[#5d7184]">{l.ts}</span>{" "}
              <span className={color[l.kind]}>{l.kind.padEnd(6, " ")}</span> {l.msg}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ChangePassPanel() {
  const { tx } = useConsole();
  return (
    <Panel id="change-pass">
      <PanelTitle>{tx("changePass")}</PanelTitle>
      <div className="space-y-3">
        <Field label={tx("user")}>
          <ConsoleInput defaultValue="admin" />
        </Field>
        <Field label={tx("currentPass")}>
          <ConsoleInput type="password" />
        </Field>
        <Field label={tx("newPass")}>
          <ConsoleInput type="password" />
        </Field>
        <PrimaryBtn onClick={() => toast.success(tx("passChanged"))}>{tx("changePass")}</PrimaryBtn>
      </div>
    </Panel>
  );
}

export function AdminPage() {
  const { s, tx, pushLog, setS, license } = useConsole();
  const [loc, navigate] = useLocation();
  const path = loc.replace(/^\/console\/?/, "").split(/[?#]/)[0] || "admin";
  const tab =
    path === "logs" || path === "term" || path === "services" || path === "updates" || path === "backup" || path === "license"
      ? path
      : "admin";
  const menusOpen = licenseMenusOpen(license?.gate ?? licenseGateOf(license?.state));
  const [nu, setNu] = useState("");
  const [np, setNp] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<LinuxUser[]>(s.users.map((u) => ({ name: u.name, sudo: true })));
  const [sshOn, setSshOn] = useState(false);

  const loadUsers = () => {
    void fetch("/api/users")
      .then((r) => r.json())
      .then((j: { users?: LinuxUser[]; ssh?: { ok?: boolean } }) => {
        if (Array.isArray(j.users)) {
          setUsers(j.users);
          setS((prev) => ({ ...prev, users: j.users!.map((u) => ({ name: u.name })) }));
        }
        setSshOn(Boolean(j.ssh?.ok));
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const addUser = async () => {
    const name = nu.trim().toLowerCase();
    if (!name || np.length < 4) {
      toast.error(tx("badUser"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password: np }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        toast.error(j.error || tx("badUser"));
        return;
      }
      setNu("");
      setNp("");
      toast.success(tx("userAdded"));
      pushLog("SYS", `usuário Linux ${name} (sudo)`);
      loadUsers();
    } catch {
      toast.error(tx("badUser"));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (name: string) => {
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(name)}`, { method: "DELETE" });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        toast.error(j.error || tx("userProtected"));
        return;
      }
      toast.success(tx("userRemoved"));
      loadUsers();
    } catch {
      toast.error(tx("userProtected"));
    }
  };

  return (
    <div>
      <PageHead
        kicker={tx("admin")}
        title={
          tab === "logs"
            ? tx("logsTitle")
            : tab === "term"
              ? tx("termTitle")
              : tab === "services"
                ? tx("services")
                : tab === "updates"
                  ? tx("update")
                  : tab === "backup"
                    ? tx("backupTitle")
                    : tab === "license"
                      ? tx("licTab")
                      : tx("adminTitle")
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={tab === "admin"} disabled={!menusOpen} onClick={() => navigate("/console/admin")}>
          {tx("admin")}
        </Chip>
        <Chip active={tab === "services"} disabled={!menusOpen} onClick={() => navigate("/console/services")}>
          {tx("services")}
        </Chip>
        <Chip active={tab === "updates"} disabled={!menusOpen} onClick={() => navigate("/console/updates")}>
          {tx("update")}
        </Chip>
        <Chip active={tab === "backup"} disabled={!menusOpen} onClick={() => navigate("/console/backup")}>
          {tx("backup")}
        </Chip>
        <Chip active={tab === "license"} onClick={() => navigate("/console/license")}>
          {tx("licTab")}
        </Chip>
        <Chip active={tab === "logs"} disabled={!menusOpen} onClick={() => navigate("/console/logs")}>
          {tx("logs")}
        </Chip>
        <Chip active={tab === "term"} disabled={!menusOpen} onClick={() => navigate("/console/term")}>
          {tx("term")}
        </Chip>
      </div>
      {tab === "services" ? <ServicesPage embedded /> : null}
      {tab === "updates" ? <UpdatesPage embedded /> : null}
      {tab === "backup" ? <BackupPage embedded /> : null}
      {tab === "license" ? <LicensePage embedded /> : null}
      {tab === "logs" ? <LogsPage embedded /> : null}
      {tab === "term" ? <TermPage embedded /> : null}
      {tab !== "admin" ? null : (
        <>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("sudoHint")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChangePassPanel />
        <Panel>
          <PanelTitle>{tx("linuxUsers")}</PanelTitle>
          <p className="mb-3 font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">
            SSH :22 · {sshOn ? tx("sshOn") : tx("sshOff")}
          </p>
          <div className="mb-3 space-y-2">
            {users.map((u) => (
              <div key={u.name} className="flex items-center justify-between rounded-lg bg-[#101c28] px-3 py-2 text-sm">
                <span>
                  {u.name}
                  {u.sudo ? <span className="ml-2 text-[10px] tracking-wide text-[#ffb300] uppercase">sudo</span> : null}
                </span>
                {u.name !== "hamcockpit" && u.name !== "catbridge" && u.name !== "root" ? (
                  <GhostBtn danger onClick={() => void removeUser(u.name)}>
                    {tx("remove")}
                  </GhostBtn>
                ) : null}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <ConsoleInput placeholder={tx("newUser")} value={nu} onChange={(e) => setNu(e.target.value)} />
            <ConsoleInput type="password" placeholder={tx("userPass")} value={np} onChange={(e) => setNp(e.target.value)} />
            <PrimaryBtn disabled={busy} onClick={() => void addUser()}>
              {tx("add")}
            </PrimaryBtn>
          </div>
        </Panel>
        <Panel>
          <PanelTitle>{tx("devicePanel")}</PanelTitle>
          <p className="mb-4 text-sm text-[#8ea0b3]">{tx("deviceHelp")}</p>
          <div className="flex flex-wrap gap-2">
            <GhostBtn
              onClick={() => {
                pushLog("SYS", "Reboot pedido");
                toast.message(tx("rebooting"));
              }}
            >
              {tx("reboot")}
            </GhostBtn>
            <GhostBtn
              danger
              onClick={() => {
                pushLog("SYS", "Factory reset");
                toast.error(tx("factoryAsked"));
              }}
            >
              {tx("factory")}
            </GhostBtn>
          </div>
        </Panel>
      </div>
        </>
      )}
    </div>
  );
}

function AutostartSwitch({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-[#10b981]" : "bg-[#243140]"
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function useServiceAutostart() {
  const { setS, tx, pushLog } = useConsole();
  const [busy, setBusy] = useState<ServiceId | null>(null);
  const setAutostart = async (id: ServiceId, autostart: boolean) => {
    setBusy(id);
    try {
      const r = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, autostart }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        items?: { id: ServiceId; autostart?: boolean; running?: boolean }[];
        error?: string;
      };
      if (!r.ok || j.ok === false) {
        toast.error(j.error || tx("svcFail"));
        return;
      }
      if (Array.isArray(j.items)) {
        const items = SERVICE_IDS.map((sid) => {
          const hit = j.items!.find((row) => row.id === sid);
          return { id: sid, autostart: hit?.autostart !== false, running: Boolean(hit?.running) };
        });
        setS((p) => ({ ...p, services: items }));
      }
      pushLog("SYS", `${tx(SVC_LABEL[id])} · ${autostart ? tx("svcAutostart") : "off"}`);
      if (id === "web" && !autostart) toast.message(tx("svcWebWarn"));
      else toast.success(tx("svcSaved"));
    } catch {
      toast.error(tx("svcFail"));
    } finally {
      setBusy(null);
    }
  };
  const [powerBusy, setPowerBusy] = useState<ServiceId | null>(null);
  const setPower = async (id: ServiceId, on: boolean) => {
    setPowerBusy(id);
    try {
      const r = await fetch("/api/services/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, on }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        items?: { id: ServiceId; autostart?: boolean; running?: boolean }[];
        error?: string;
      };
      if (Array.isArray(j.items)) {
        const items = SERVICE_IDS.map((sid) => {
          const hit = j.items!.find((row) => row.id === sid);
          return { id: sid, autostart: hit?.autostart !== false, running: Boolean(hit?.running) };
        });
        setS((p) => ({ ...p, services: items }));
      }
      if (!r.ok || j.ok === false) {
        toast.error(j.error || tx("svcPowerFail"));
        return;
      }
      pushLog("SYS", `${tx(SVC_LABEL[id])} · ${on ? tx("svcPowerOn") : tx("svcPowerOff")}`);
      toast.success(on ? tx("svcPowerOnOk") : tx("svcPowerOffOk"));
    } catch {
      toast.error(tx("svcPowerFail"));
    } finally {
      setPowerBusy(null);
    }
  };
  return { busy, setAutostart, powerBusy, setPower };
}

export function ServicesPage({ embedded = false }: { embedded?: boolean }) {
  const { s, tx } = useConsole();
  const { busy, setAutostart, powerBusy, setPower } = useServiceAutostart();
  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("admin")} title={tx("services")} />}
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("servicesHelp")}</p>
      <Panel>
        <PanelTitle>{tx("servicesTitle")}</PanelTitle>
        <div className="divide-y divide-[rgba(79,195,247,0.08)]">
          {s.services.map((row) => {
            const live = serviceLive(row.id, s, row.running);
            return (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{tx(SVC_LABEL[row.id])}</p>
                  <p className="text-xs text-[#8ea0b3]">{tx(SVC_HINT[row.id])}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Chip active={live} tone={live ? "ok" : "cyan"}>
                    {live ? tx("svcRunning") : tx("svcStopped")}
                  </Chip>
                  {SVC_POWER.has(row.id) ? (
                    <GhostBtn
                      disabled={powerBusy === row.id || busy === row.id}
                      onClick={() => void setPower(row.id, !live)}
                    >
                      {powerBusy === row.id ? "…" : live ? tx("svcPowerOff") : tx("svcPowerOn")}
                    </GhostBtn>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] tracking-wide text-[#8ea0b3] uppercase">{tx("svcAutostart")}</span>
                    <AutostartSwitch
                      on={row.autostart}
                      disabled={busy === row.id}
                      label={`${tx(SVC_LABEL[row.id])} · ${tx("svcAutostart")}`}
                      onChange={(next) => void setAutostart(row.id, next)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

const UPD_LABEL: Record<UpdateId, I18nKey> = {
  app: "updApp",
  os: "updOs",
  ser2net: "updSer2net",
  hamlib: "updHamlib",
  wavelog: "updWavelog",
  wlg: "updWlg",
};

const UPD_HINT: Record<UpdateId, I18nKey> = {
  app: "updAppHint",
  os: "updOsHint",
  ser2net: "updSer2netHint",
  hamlib: "updHamlibHint",
  wavelog: "updWavelogHint",
  wlg: "updWlgHint",
};

export function UpdatesPage({ embedded = false }: { embedded?: boolean }) {
  const { s, tx, setS, pushLog } = useConsole();
  const [checking, setChecking] = useState(false);

  const applySnap = (j: {
    ok?: boolean;
    os?: string;
    pending?: number;
    error?: string;
    jobs?: {
      id: UpdateId;
      status: "running" | "ok" | "error";
      pct: number;
      determinate: boolean;
      stage: string;
      error: string;
      bytes?: number;
      totalBytes?: number;
      etaSec?: number;
    }[];
    items?: {
      id: UpdateId;
      current?: string;
      available?: string;
      updatable?: boolean;
      applying?: boolean;
      error?: string;
      note?: string;
      progress?: number;
      stage?: string;
      determinate?: boolean;
      bytes?: number;
      totalBytes?: number;
      etaSec?: number;
    }[];
  }) => {
    if (!Array.isArray(j.items)) return;
    const jobs = Array.isArray(j.jobs) ? j.jobs : [];
    const items = UPDATE_IDS.map((id) => {
      const hit = j.items!.find((row) => row.id === id);
      const job = jobs.find((row) => row.id === id);
      const current = String(hit?.current || "—");
      const available = String(hit?.available || hit?.current || "—");
      const applying = Boolean(hit?.applying) || job?.status === "running";
      return {
        id,
        current,
        available,
        updatable: isNewerVersion(available, current),
        applying,
        error: String(job?.error || hit?.error || ""),
        note: String(hit?.note || ""),
        progress: Number(hit?.progress ?? job?.pct ?? 0) || 0,
        stage: String(hit?.stage || job?.stage || ""),
        determinate: Boolean(hit?.determinate ?? job?.determinate),
        bytes: Number(hit?.bytes ?? job?.bytes ?? 0) || 0,
        totalBytes: Number(hit?.totalBytes ?? job?.totalBytes ?? 0) || 0,
        etaSec: Number(hit?.etaSec ?? job?.etaSec ?? 0) || 0,
      };
    });
    setS((p) => ({
      ...p,
      updates: {
        pending: items.filter((row) => row.updatable).length,
        os: String(j.os || p.updates.os),
        items,
        jobs,
      },
    }));
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/updates/check", { method: "POST" });
      const j = (await r.json()) as Parameters<typeof applySnap>[0];
      applySnap(j);
      toast.success(tx("updCheck"));
    } catch {
      toast.error(tx("updFail"));
    } finally {
      setChecking(false);
    }
  };

  const applyOne = async (id: UpdateId) => {
    setS((p) => ({
      ...p,
      updates: {
        ...p.updates,
        jobs: [
          ...p.updates.jobs.filter((row) => row.id !== id),
          { id, status: "running", pct: 2, determinate: true, stage: "prepare", error: "" },
        ],
        items: p.updates.items.map((row) =>
          row.id === id ? { ...row, applying: true, progress: 2, stage: "prepare", determinate: true } : row,
        ),
      },
    }));
    window.setTimeout(() => window.dispatchEvent(new Event("hc-updates-wake")), 800);
    try {
      const r = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const text = await r.text();
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        throw new Error(text.slice(0, 120).trim() || `resposta não JSON (${r.status})`);
      }
      const j = JSON.parse(text) as Parameters<typeof applySnap>[0] & { error?: string };
      applySnap(j);
      if (!r.ok || j.ok === false) {
        toast.error(j.error || tx("updFail"));
        return;
      }
      toast.success(tx("updOk"));
      pushLog("SYS", `${tx(UPD_LABEL[id])} → ${j.items?.find((row) => row.id === id)?.current || ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("updFail"));
      setS((p) => ({
        ...p,
        updates: {
          ...p.updates,
          items: p.updates.items.map((row) => (row.id === id ? { ...row, applying: false } : row)),
          jobs: p.updates.jobs.filter((row) => row.id !== id),
        },
      }));
    }
  };

  const ready = s.updates.items.filter(
    (row) => row.updatable && isNewerVersion(row.available, row.current) && !row.applying,
  );
  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("admin")} title={tx("update")} />}
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("updateHelp")}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PrimaryBtn disabled={ready.length === 0} onClick={() => ready.forEach((row) => void applyOne(row.id))}>
          {tx("updApplyAll")}
        </PrimaryBtn>
        <GhostBtn disabled={checking} onClick={() => void checkNow()}>
          {checking ? tx("updChecking") : tx("updCheck")}
        </GhostBtn>
        {s.updates.pending > 0 ? (
          <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#ffb300]">
            {s.updates.pending} {tx("updPendingN")}
          </span>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {s.updates.items.map((row) => {
          const applying = row.applying;
          const barLabel = applying ? stageLabel(tx, row.stage) || tx("updApplying") : tx("updProgress");
          return (
            <Panel key={row.id} className={row.updatable || applying ? "border-[#ffb300]/40" : undefined}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <PanelTitle>{tx(UPD_LABEL[row.id])}</PanelTitle>
                  <p className="-mt-2 text-xs text-[#8ea0b3]">{tx(UPD_HINT[row.id])}</p>
                </div>
                <Chip active={row.updatable} tone={row.updatable ? "amber" : "ok"}>
                  {row.updatable ? tx("updReady") : tx("updNone")}
                </Chip>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#101c28] px-3 py-2">
                  <p className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{tx("updCurrent")}</p>
                  <p className="font-['IBM_Plex_Mono'] text-sm text-[#4fc3f7]">{row.current}</p>
                </div>
                <div className="rounded-lg bg-[#101c28] px-3 py-2">
                  <p className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{tx("updAvailable")}</p>
                  <p className={`font-['IBM_Plex_Mono'] text-sm ${row.updatable ? "text-[#ffb300]" : "text-[#34d399]"}`}>
                    {row.available}
                  </p>
                </div>
              </div>
              {row.error ? <p className="mb-3 text-xs text-[#f87171]">{row.error}</p> : null}
              <div className="flex items-center gap-3">
                <PrimaryBtn
                  disabled={!row.updatable || !isNewerVersion(row.available, row.current) || applying}
                  onClick={() => void applyOne(row.id)}
                >
                  {applying ? tx("updApplying") : tx("updApply")}
                </PrimaryBtn>
                <ActionProgress
                  active={applying}
                  value={row.progress}
                  determinate={row.determinate || row.progress > 0}
                  label={barLabel}
                  hint={progressHint(row)}
                />
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

type HostSample = {
  t: number;
  cpuPct: number | null;
  ramPct: number | null;
  ramUsedBytes: number;
  ramTotalBytes: number;
  cpuTempC: number | null;
  netRxBps?: number | null;
  netTxBps?: number | null;
};

type HostSnap = {
  ok: boolean;
  cpuTempC: number | null;
  diskTotalBytes: number;
  diskFreeBytes: number;
  diskUsedBytes: number;
  diskPath: string;
  error: string;
  hardware?: string;
  soc?: string;
  osPretty?: string;
  appVersion?: string;
  serial?: string | null;
  serialDisplay?: string | null;
  uptimeSec?: number;
  cpuPct?: number | null;
  ramPct?: number | null;
  ramUsedBytes?: number;
  ramTotalBytes?: number;
  netRxBps?: number | null;
  netTxBps?: number | null;
  sampleMs?: number;
  windowMs?: number;
  samples?: HostSample[];
};

type WlDbSnap = {
  running?: boolean;
  connected?: boolean;
  health?: string;
  version?: string;
  tables?: number;
  sizeBytes?: number;
  image?: string;
  queryVia?: string;
};

function formatBps(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function formatUptime(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function slotSeries(
  samples: HostSample[] | undefined,
  windowMs: number,
  sampleMs: number,
  key: keyof Pick<HostSample, "cpuPct" | "ramPct" | "cpuTempC" | "netRxBps" | "netTxBps">,
): Array<number | null> {
  const step = Math.max(1000, sampleMs || 5000);
  const win = Math.max(step, windowMs || 300_000);
  const n = Math.max(1, Math.round(win / step));
  const out: Array<number | null> = Array.from({ length: n }, () => null);
  if (!samples?.length) return out;
  const now = samples[samples.length - 1]?.t ?? Date.now();
  const start = now - win;
  for (const row of samples) {
    const i = Math.floor((row.t - start) / step);
    if (i < 0 || i >= n) continue;
    const v = row[key];
    out[i] = v == null || !Number.isFinite(v) ? null : v;
  }
  return out;
}

export function StatusPage() {
  const { s, tx } = useConsole();
  const [host, setHost] = useState<HostSnap | null>(null);
  const [wlDb, setWlDb] = useState<WlDbSnap | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetch("/api/host")
        .then(async (r) => {
          const text = await r.text();
          if (!(r.headers.get("content-type") || "").includes("json")) throw new Error("host");
          return JSON.parse(text) as HostSnap;
        })
        .then((j: HostSnap) => {
          if (alive) setHost(j);
        })
        .catch(() => {
          if (alive) setHost(null);
        });
      void fetch("/api/wavelog/database")
        .then(async (r) => {
          const text = await r.text();
          if (!(r.headers.get("content-type") || "").includes("json")) throw new Error("db");
          return JSON.parse(text) as WlDbSnap;
        })
        .then((j: WlDbSnap) => {
          if (alive) setWlDb(j);
        })
        .catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const tempC = host?.cpuTempC ?? null;
  const diskTotal = host?.diskTotalBytes ?? 0;
  const diskFree = host?.diskFreeBytes ?? 0;
  const diskUsed = host?.diskUsedBytes ?? Math.max(0, diskTotal - diskFree);
  const sampleMs = host?.sampleMs ?? 5000;
  const windowMs = host?.windowMs ?? 300_000;
  const cpuSeries = slotSeries(host?.samples, windowMs, sampleMs, "cpuPct");
  const ramSeries = slotSeries(host?.samples, windowMs, sampleMs, "ramPct");
  const tempSeries = slotSeries(host?.samples, windowMs, sampleMs, "cpuTempC");
  const netRxSeries = slotSeries(host?.samples, windowMs, sampleMs, "netRxBps");
  const netTxSeries = slotSeries(host?.samples, windowMs, sampleMs, "netTxBps");
  const cpuPct = host?.cpuPct;
  const ramPct = host?.ramPct;
  const netRx = host?.netRxBps ?? null;
  const netTx = host?.netTxBps ?? null;
  const netMax = Math.max(
    8 * 1024,
    ...netRxSeries.filter((v): v is number => v != null),
    ...netTxSeries.filter((v): v is number => v != null),
    netRx ?? 0,
    netTx ?? 0,
  );
  const ramUsed = host?.ramUsedBytes ?? 0;
  const ramTotal = host?.ramTotalBytes ?? 0;
  const osPretty = host?.osPretty?.trim() || "";
  const appVer = host?.appVersion || APP_VERSION;
  const software = osPretty ? `${osPretty} · Ham Cockpit ${appVer}` : `Ham Cockpit ${appVer}`;

  return (
    <div>
      <PageHead kicker={tx("status")} title={tx("statusTitle")} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Mini k={tx("hardware")} v={host?.hardware?.trim() || "—"} />
        <Mini k={tx("software")} v={software} />
        <Mini k="SoC" v={host?.soc?.trim() || "—"} />
        <Mini k="Uptime" v={formatUptime(host?.uptimeSec)} />
        <Mini
          k={tx("deviceSerial")}
          v={host?.serialDisplay?.trim() || host?.serial?.trim() || "—"}
          copyText={host?.serialDisplay?.trim() || host?.serial?.trim() || ""}
          copyable={Boolean(host?.serialDisplay?.trim() || host?.serial?.trim())}
        />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelTitle>CPU</PanelTitle>
          <p className="mb-1 font-['IBM_Plex_Mono'] text-2xl text-[#4fc3f7]">{cpuPct == null ? "—" : `${cpuPct.toFixed(1)}%`}</p>
          <p className="mb-2 text-[10px] tracking-wide text-[#8ea0b3] uppercase">{tx("last5min")}</p>
          <TimeLine values={cpuSeries} max={100} color="#4fc3f7" tickFmt={(n) => `${n}%`} />
        </Panel>
        <Panel>
          <PanelTitle>RAM</PanelTitle>
          <p className="mb-1 font-['IBM_Plex_Mono'] text-2xl text-[#34d399]">
            {ramPct == null ? "—" : `${ramPct.toFixed(1)}% · ${formatBytes(ramUsed)} / ${formatBytes(ramTotal)}`}
          </p>
          <p className="mb-2 text-[10px] tracking-wide text-[#8ea0b3] uppercase">{tx("last5min")}</p>
          <TimeLine values={ramSeries} max={100} color="#34d399" tickFmt={(n) => `${n}%`} />
        </Panel>
        <Panel>
          <PanelTitle>{tx("network")}</PanelTitle>
          <p className="mb-1 font-['IBM_Plex_Mono'] text-2xl text-[#ffb300]">
            {netRx == null && netTx == null
              ? "—"
              : `↓ ${formatBps(netRx ?? 0)} · ↑ ${formatBps(netTx ?? 0)}`}
          </p>
          <p className="mb-2 text-[10px] tracking-wide text-[#8ea0b3] uppercase">{tx("last5min")}</p>
          <TimeLine values={netRxSeries} max={netMax} color="#ffb300" tickFmt={(n) => formatBps(n)} overlay={netTxSeries} overlayColor="#60a5fa" />
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>{tx("cpuTemp")}</PanelTitle>
          <p className="mb-1 font-['IBM_Plex_Mono'] text-2xl text-[#f87171]">
            {tempC == null ? "—" : `${tempC.toFixed(1)} °C`}
          </p>
          <p className="mb-2 text-[10px] tracking-wide text-[#8ea0b3] uppercase">{tx("last5min")}</p>
          <TimeLine values={tempSeries} max={85} color="#f87171" tickFmt={(n) => `${n}°`} />
        </Panel>
        <Panel>
          <PanelTitle>{tx("disk")}</PanelTitle>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <DiskChart used={diskUsed} free={diskFree} usedLabel={tx("diskUsed")} freeLabel={tx("diskFree")} />
            <div className="min-w-0 flex-1 space-y-2">
              <Mini k={tx("diskTotal")} v={formatBytes(diskTotal)} />
              <Mini k={tx("diskFree")} v={formatBytes(diskFree)} />
              <Mini k={tx("diskUsed")} v={formatBytes(diskUsed)} />
            </div>
          </div>
        </Panel>
      </div>
      <Panel className="mt-4 overflow-hidden">
        <PanelTitle>{tx("healthHist")}</PanelTitle>
        <p className="-mt-2 mb-3 text-xs text-[#8ea0b3]">{tx("healthHistHint")}</p>
        {/* -mx-5 cancela o padding do Panel: o SVG vai de ponta a ponta no card. */}
        <div className="-mx-5">
          <Spark
            cpu={cpuSeries}
            ram={ramSeries}
            temp={tempSeries}
            cpuLabel={tx("healthHistCpu")}
            ramLabel={tx("healthHistRam")}
            tempLabel={tx("healthHistTemp")}
          />
        </div>
      </Panel>
      <Panel className="mt-4">
        <PanelTitle>{tx("network")}</PanelTitle>
        <div className="grid gap-2 sm:grid-cols-3">
          <Mini k="AP IP" v="192.168.4.1" />
          <Mini k="Uplink" v={s.wifi.link === "ethernet" ? "Ethernet" : "Wi‑Fi"} />
          <Mini k="STA IP" v={s.wifi.liveIp || s.wifi.ip || "—"} />
          <Mini k="SSID" v={s.wifi.staSsid || "—"} />
          <Mini k="Gateway" v={s.wifi.liveGw || s.wifi.gw || "—"} />
          <Mini k="mDNS" v={`${s.wifi.hostname || "ham-cockpit"}.local`} />
          <Mini k="MAC" v="D8:3A:DD:A4:F2:11" />
          <Mini
            k={tx("ic705")}
            v={
              s.radios.items.find((r) => r.connected)?.name ||
              (s.ic705.phase === "ready" ? s.ic705.bleName || tx("connected") : tx("disconnected"))
            }
          />
          <Mini k="CI-V" v={s.ic705.civ ? s.ic705.addr : "—"} />
          <Mini k="Wavelog" v={s.wavelog.running ? `:${s.wavelog.port}` : tx("disconnected")} />
          <Mini
            k={tx("wlDbTitle")}
            v={
              wlDb == null
                ? "—"
                : wlDb.running
                  ? `${tx("wlDbUp")}${wlDb.health ? ` · ${wlDb.health}` : ""}${wlDb.connected ? ` · ${tx("wlDbConnected")}` : ""}${wlDb.version ? ` · ${wlDb.version}` : ""}`
                  : tx("wlDbDown")
            }
          />
          <Mini k={tx("wlDbTables")} v={wlDb ? String(wlDb.tables ?? 0) : "—"} />
          <Mini k="WaveLogGate" v={s.wlg.running ? `UDP ${s.wlg.udpPort}` : tx("disconnected")} />
          <Mini k="MMDVM" v={s.mmdvm.running ? s.mmdvm.callsign : tx("disconnected")} />
          <Mini k="ser2net" v={s.ser2net.running ? `${s.ser2net.services.length} svc` : tx("disconnected")} />
          <Mini k="Hamlib" v={s.ser2net.hamlibRunning ? ":4532" : tx("disconnected")} />
          <Mini k="ACOM 2000A" v={s.acom.on ? (s.acom.operate ? tx("acomOperate") : tx("acomStby")) : tx("acomOff")} />
          <Mini k="Lextel MS-2000" v={s.lextel.connected ? (s.lextel.decoded ? `${formatWatts(s.lextel.pep)} W` : "SPP") : tx("disconnected")} />
          <Mini k="SSHd" v=":22" />
        </div>
      </Panel>
    </div>
  );
}

function Mini({
  k,
  v,
  copyable = false,
  copyText,
}: {
  k: string;
  v: string;
  copyable?: boolean;
  /** Texto real a copiar (padrão = valor exibido). */
  copyText?: string;
}) {
  const { tx } = useConsole();
  const payload = (copyText ?? v).trim();
  return (
    <div className="rounded-lg bg-[#101c28] px-3 py-2">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <p className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{k}</p>
        {copyable && payload && v !== "—" ? (
          <button
            type="button"
            className="shrink-0 text-[10px] font-semibold tracking-wide text-[#4fc3f7] uppercase hover:text-[#7ee0ff]"
            onClick={() => {
              void copyTextToClipboard(payload).then((ok) => {
                if (ok) toast.success(tx("copied"));
                else toast.error(tx("copyFail"));
              });
            }}
          >
            {tx("licCopy")}
          </button>
        ) : null}
      </div>
      <p className="break-words font-['IBM_Plex_Mono'] text-sm text-[#4fc3f7]">{v}</p>
    </div>
  );
}

function TimeLine({
  values,
  max,
  color,
  tickFmt,
  overlay,
  overlayColor,
}: {
  values: Array<number | null>;
  max: number;
  color: string;
  tickFmt: (n: number) => string;
  overlay?: Array<number | null>;
  overlayColor?: string;
}) {
  const w = 280;
  const h = 96;
  const padL = 2;
  const padR = 40;
  const padT = 8;
  const padB = 4;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const cap = Math.max(1, max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * cap);
  const pathFor = (series: Array<number | null>) => {
    const n = Math.max(1, series.length);
    let d = "";
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = series[i];
      if (v == null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const y = padT + innerH - (Math.min(Math.max(v, 0), cap) / cap) * innerH;
      d += `${started ? "L" : "M"} ${x} ${y} `;
      started = true;
    }
    return d.trim();
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" role="img">
      {ticks.map((t) => {
        const y = padT + innerH - (t / cap) * innerH;
        return (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="rgba(79,195,247,0.18)" strokeWidth="1" />
            <text x={w - padR + 3} y={y + 3} fill="#8ea0b3" fontSize="7" fontFamily="IBM Plex Mono, ui-monospace, monospace">
              {tickFmt(t)}
            </text>
          </g>
        );
      })}
      <path d={pathFor(values)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {overlay ? (
        <path d={pathFor(overlay)} fill="none" stroke={overlayColor || "#60a5fa"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function seriesPath(values: Array<number | null>, max: number, w: number, h: number, pad: number): string {
  const n = values.length;
  if (n < 2) return "";
  const innerH = h - pad * 2;
  let d = "";
  let started = false;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      started = false;
      continue;
    }
    const x = (i / (n - 1)) * w;
    const y = pad + innerH - (Math.min(Math.max(v, 0), max) / max) * innerH;
    d += `${started ? "L" : "M"} ${x} ${y} `;
    started = true;
  }
  return d.trim();
}

function Spark({
  cpu,
  ram,
  temp,
  cpuLabel,
  ramLabel,
  tempLabel,
}: {
  cpu: Array<number | null>;
  ram: Array<number | null>;
  temp: Array<number | null>;
  cpuLabel: string;
  ramLabel: string;
  tempLabel: string;
}) {
  const w = 1000;
  const h = 160;
  const padT = 10;
  const padB = 8;
  const padL = 4;
  const padR = 28; // só o necessário para os números do eixo Y
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const ticks = [0, 25, 50, 75, 100];
  const pathAt = (values: Array<number | null>) => {
    const n = values.length;
    if (n < 2) return "";
    let d = "";
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) {
        started = false;
        continue;
      }
      const x = padL + (i / (n - 1)) * plotW;
      const y = padT + plotH - (Math.min(Math.max(v, 0), 100) / 100) * plotH;
      d += `${started ? "L" : "M"} ${x} ${y} `;
      started = true;
    }
    return d.trim();
  };
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="block h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${cpuLabel} ${ramLabel} ${tempLabel}`}
      >
        {ticks.map((t) => {
          const y = padT + ((100 - t) / 100) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="rgba(79,195,247,0.16)" strokeWidth="1" />
              <text
                x={w - 4}
                y={y + 3}
                textAnchor="end"
                fill="#8ea0b3"
                fontSize="11"
                fontFamily="IBM Plex Mono, ui-monospace, monospace"
              >
                {t}
              </text>
            </g>
          );
        })}
        <path d={pathAt(cpu)} fill="none" stroke="#4fc3f7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={pathAt(ram)} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={pathAt(temp)} fill="none" stroke="#f87171" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 px-5 text-[11px] text-[#8ea0b3]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[#4fc3f7]" />
          {cpuLabel} (%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[#34d399]" />
          {ramLabel} (%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[#f87171]" />
          {tempLabel} (°C)
        </span>
      </div>
    </div>
  );
}

function DiskChart({
  used,
  free,
  usedLabel,
  freeLabel,
}: {
  used: number;
  free: number;
  usedLabel: string;
  freeLabel: string;
}) {
  const total = Math.max(0, used + free);
  const usedPct = total > 0 ? used / total : 0;
  const freePct = total > 0 ? free / total : 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  const usedLen = usedPct * c;
  const freeLen = freePct * c;
  const usedPctLabel = total > 0 ? Math.round(usedPct * 100) : 0;
  return (
    <div className="relative mx-auto h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`${usedLabel} / ${freeLabel}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#16232e" strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="14"
          strokeDasharray={`${usedLen} ${c - usedLen}`}
          strokeDashoffset={0}
          strokeLinecap="butt"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#34d399"
          strokeWidth="14"
          strokeDasharray={`${freeLen} ${c - freeLen}`}
          strokeDashoffset={-usedLen}
          strokeLinecap="butt"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-['IBM_Plex_Mono'] text-xl text-[#4fc3f7]">{usedPctLabel}%</span>
        <span className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{usedLabel}</span>
      </div>
    </div>
  );
}
