import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { UPDATE_IDS, type UpdateId } from "@shared/const";
import { SERVICE_IDS, SVC_HINT, SVC_LABEL, serviceLive, type ServiceId } from "./services-ui";
import type { I18nKey } from "./i18n";
import { formatWatts, useConsole, type LogKind } from "./state";
import { TermPage } from "./term";
import { BackupPage } from "./backup";
import { Chip, ConsoleInput, Field, GhostBtn, MeterBar, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

type LinuxUser = { name: string; sudo: boolean };

const KINDS: LogKind[] = ["BLE", "CIV", "IC705", "RADIO", "WiFi", "SYS", "WLOG", "S2N", "ACOM", "LEXTEL", "LDG", "ERRO"];

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
  const { s, tx, pushLog, setS } = useConsole();
  const [loc, navigate] = useLocation();
  const path = loc.replace(/^\/console\/?/, "").split(/[?#]/)[0] || "admin";
  const tab =
    path === "logs" || path === "term" || path === "services" || path === "updates" || path === "password" || path === "backup"
      ? path
      : "admin";
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
                  : tab === "password"
                    ? tx("changePass")
                    : tab === "backup"
                      ? tx("backupTitle")
                      : tx("adminTitle")
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={tab === "admin"} onClick={() => navigate("/console/admin")}>
          {tx("admin")}
        </Chip>
        <Chip active={tab === "password"} onClick={() => navigate("/console/password")}>
          {tx("changePass")}
        </Chip>
        <Chip active={tab === "services"} onClick={() => navigate("/console/services")}>
          {tx("services")}
        </Chip>
        <Chip active={tab === "updates"} onClick={() => navigate("/console/updates")}>
          {tx("update")}
        </Chip>
        <Chip active={tab === "backup"} onClick={() => navigate("/console/backup")}>
          {tx("backup")}
        </Chip>
        <Chip active={tab === "logs"} onClick={() => navigate("/console/logs")}>
          {tx("logs")}
        </Chip>
        <Chip active={tab === "term"} onClick={() => navigate("/console/term")}>
          {tx("term")}
        </Chip>
      </div>
      {tab === "password" ? <ChangePassPanel /> : null}
      {tab === "services" ? <ServicesPage embedded /> : null}
      {tab === "updates" ? <UpdatesPage embedded /> : null}
      {tab === "backup" ? <BackupPage embedded /> : null}
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
  return { busy, setAutostart };
}

export function ServicesPage({ embedded = false }: { embedded?: boolean }) {
  const { s, tx } = useConsole();
  const { busy, setAutostart } = useServiceAutostart();
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
  const [busy, setBusy] = useState<UpdateId | null>(null);

  const applySnap = (j: {
    ok?: boolean;
    os?: string;
    pending?: number;
    error?: string;
    items?: {
      id: UpdateId;
      current?: string;
      available?: string;
      updatable?: boolean;
      applying?: boolean;
      error?: string;
      note?: string;
    }[];
  }) => {
    if (!Array.isArray(j.items)) return;
    const items = UPDATE_IDS.map((id) => {
      const hit = j.items!.find((row) => row.id === id);
      return {
        id,
        current: String(hit?.current || "—"),
        available: String(hit?.available || hit?.current || "—"),
        updatable: Boolean(hit?.updatable),
        applying: Boolean(hit?.applying),
        error: String(hit?.error || ""),
        note: String(hit?.note || ""),
      };
    });
    setS((p) => ({
      ...p,
      updates: { pending: items.filter((row) => row.updatable).length, os: String(j.os || p.updates.os), items },
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
    setBusy(id);
    setS((p) => ({
      ...p,
      updates: {
        ...p.updates,
        items: p.updates.items.map((row) => (row.id === id ? { ...row, applying: true } : row)),
      },
    }));
    try {
      const r = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await r.json()) as Parameters<typeof applySnap>[0] & { error?: string };
      applySnap(j);
      if (!r.ok || j.ok === false) {
        toast.error(j.error || tx("updFail"));
        return;
      }
      toast.success(tx("updOk"));
      pushLog("SYS", `${tx(UPD_LABEL[id])} → ${j.items?.find((row) => row.id === id)?.current || ""}`);
    } catch {
      toast.error(tx("updFail"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("admin")} title={tx("update")} />}
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("updateHelp")}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <GhostBtn disabled={checking} onClick={() => void checkNow()}>
          {checking ? tx("updApplying") : tx("updCheck")}
        </GhostBtn>
        {s.updates.pending > 0 ? (
          <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#ffb300]">
            {s.updates.pending} {tx("updPendingN")}
          </span>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {s.updates.items.map((row) => (
          <Panel key={row.id} className={row.updatable ? "border-[#ffb300]/40" : undefined}>
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
            <PrimaryBtn disabled={!row.updatable || busy === row.id || row.applying} onClick={() => void applyOne(row.id)}>
              {busy === row.id || row.applying ? tx("updApplying") : tx("updApply")}
            </PrimaryBtn>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function StatusPage() {
  const { s, tx } = useConsole();
  const cpu = 18;
  const ram = 32;
  const net = 11;
  const hist = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        x: i,
        cpu: 12 + Math.round(Math.sin(i / 4) * 8 + (i % 5)),
        ram: 28 + Math.round(Math.cos(i / 6) * 6),
        net: 8 + (i % 7),
      })),
    []
  );
  return (
    <div>
      <PageHead kicker={tx("status")} title={tx("statusTitle")} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini k={tx("hardware")} v="Ubuntu Server" />
        <Mini k="SoC" v="BCM2711 · 4×1.8 GHz" />
        <Mini k="Uptime" v="14h 22m" />
        <Mini k="Firmware" v="Ham Cockpit 0.1.00" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelTitle>CPU</PanelTitle>
          <p className="mb-2 font-['IBM_Plex_Mono'] text-2xl text-[#4fc3f7]">{cpu}%</p>
          <MeterBar value={cpu} max={100} />
        </Panel>
        <Panel>
          <PanelTitle>RAM</PanelTitle>
          <p className="mb-2 font-['IBM_Plex_Mono'] text-2xl text-[#34d399]">{ram}% · 2.5 / 8 GB</p>
          <MeterBar value={ram} max={100} />
        </Panel>
        <Panel>
          <PanelTitle>{tx("network")}</PanelTitle>
          <p className="mb-2 font-['IBM_Plex_Mono'] text-2xl text-[#ffb300]">{net}%</p>
          <MeterBar value={net} max={100} />
        </Panel>
      </div>
      <Panel className="mt-4">
        <PanelTitle>{tx("healthHist")}</PanelTitle>
        <Spark rows={hist} />
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
          <Mini k="WaveLogGate" v={s.wlg.running ? `UDP ${s.wlg.udpPort}` : tx("disconnected")} />
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

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[#101c28] px-3 py-2">
      <p className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{k}</p>
      <p className="font-['IBM_Plex_Mono'] text-sm text-[#4fc3f7]">{v}</p>
    </div>
  );
}

function Spark({
  rows,
}: {
  rows: { x: number; cpu: number; ram: number; net: number }[];
}) {
  const w = 640;
  const h = 120;
  const path = (key: "cpu" | "ram" | "net", max: number) =>
    rows.map((r, i) => `${i === 0 ? "M" : "L"} ${(i / (rows.length - 1)) * w} ${h - (r[key] / max) * (h - 8)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label="CPU RAM rede">
      <path d={path("cpu", 40)} fill="none" stroke="#4fc3f7" strokeWidth="2" />
      <path d={path("ram", 50)} fill="none" stroke="#34d399" strokeWidth="2" />
      <path d={path("net", 20)} fill="none" stroke="#ffb300" strokeWidth="2" />
    </svg>
  );
}
