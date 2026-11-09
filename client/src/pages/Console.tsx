import { BluetoothPage, WifiPage } from "@/console/network";
import { AcomPage, HamplusPage, Ic705Page, LdgPage, LextelPage, PalstarPage, SpePage } from "@/console/devices";
import { DEFAULT_PASS, DEFAULT_USER, type I18nKey } from "@/console/i18n";
import { ic705Ble } from "@/console/ic705-ble";
import { ConsoleProvider, formatVfo, useConsole } from "@/console/state";
import { SVC_LABEL, serviceLive } from "@/console/services-ui";
import { LangToggle, UserMenu } from "@/console/widgets";
import { RadioPage } from "@/console/radio";
import { ManualPage } from "@/console/manual";
import { AdminPage, StatusPage } from "@/console/system";
import { Ser2netPage } from "@/console/ser2net";
import { WizardPage } from "@/console/wizard";
import { WavelogPage } from "@/console/wavelog";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  Antenna,
  Bluetooth,
  BookMarked,
  BookOpen,
  Cable,
  Cpu,
  Gauge,
  LayoutDashboard,
  LogOut,
  AlertTriangle,
  Menu,
  Radio,
  Settings,
  SlidersHorizontal,
  Shield,
  WandSparkles,
  Waves,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useLocation } from "wouter";

const AUTH_KEY = "hamcockpit.auth";
const AUTH_USER_KEY = "hamcockpit.user";

type PageId =
  | "wizard"
  | "radio"
  | "ic705"
  | "spe"
  | "hamplus"
  | "palstar"
  | "ldg"
  | "acom"
  | "lextel"
  | "wifi"
  | "bluetooth"
  | "wavelog"
  | "ser2net"
  | "logs"
  | "admin"
  | "password"
  | "services"
  | "updates"
  | "backup"
  | "status"
  | "term"
  | "manual";

type NavPageId = Extract<PageId, I18nKey>;

const NAV: { group: "navSetup" | "navOp" | "navDev" | "navNet" | "navSys"; items: { id: NavPageId; icon: ComponentType<{ size?: number }> }[] }[] = [
  { group: "navSetup", items: [{ id: "wizard", icon: WandSparkles }] },
  {
    group: "navOp",
    items: [
      { id: "radio", icon: Radio },
      { id: "wavelog", icon: BookMarked },
      { id: "ser2net", icon: Cable },
    ],
  },
  {
    group: "navDev",
    items: [
      { id: "ic705", icon: Antenna },
      { id: "spe", icon: Activity },
      { id: "hamplus", icon: LayoutDashboard },
      { id: "palstar", icon: Cpu },
      { id: "ldg", icon: SlidersHorizontal },
      { id: "acom", icon: Gauge },
      { id: "lextel", icon: Waves },
    ],
  },
  { group: "navNet", items: [{ id: "wifi", icon: Wifi }, { id: "bluetooth", icon: Bluetooth }] },
  {
    group: "navSys",
    items: [
      { id: "status", icon: Shield },
      { id: "admin", icon: Settings },
      { id: "manual", icon: BookOpen },
    ],
  },
];

const PAGES: Record<PageId, ComponentType> = {
  wizard: WizardPage,
  radio: RadioPage,
  ic705: Ic705Page,
  spe: SpePage,
  hamplus: HamplusPage,
  palstar: PalstarPage,
  ldg: LdgPage,
  acom: AcomPage,
  lextel: LextelPage,
  wifi: WifiPage,
  bluetooth: BluetoothPage,
  wavelog: WavelogPage,
  ser2net: Ser2netPage,
  logs: AdminPage,
  admin: AdminPage,
  password: AdminPage,
  services: AdminPage,
  updates: AdminPage,
  backup: AdminPage,
  status: StatusPage,
  term: AdminPage,
  manual: ManualPage,
};

export default function Console() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");
  return (
    <ConsoleProvider active={authed}>
      {authed ? (
        <Shell
          onLogout={() => {
            sessionStorage.removeItem(AUTH_KEY);
            sessionStorage.removeItem(AUTH_USER_KEY);
            setAuthed(false);
          }}
        />
      ) : (
        <Login
          onOk={(name) => {
            sessionStorage.setItem(AUTH_KEY, "1");
            sessionStorage.setItem(AUTH_USER_KEY, name);
            setAuthed(true);
          }}
        />
      )}
    </ConsoleProvider>
  );
}

function Login({ onOk }: { onOk: (name: string) => void }) {
  const { tx, kickPrimary } = useConsole();
  const [err, setErr] = useState(false);
  return (
    <div className="console flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-end">
          <LangToggle />
        </div>
        <div className="mb-8 text-center">
          <p className="font-['IBM_Plex_Mono'] text-[11px] tracking-[0.28em] text-[#ffb300] uppercase">Appliance</p>
          <h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold text-white">{tx("brand")}</h1>
          <p className="mt-1 text-sm text-[#8ea0b3]">{tx("tagline")}</p>
        </div>
        <form
          className="rounded-2xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-7"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const u = String(fd.get("user") || "");
            const p = String(fd.get("pass") || "");
            if (u === DEFAULT_USER && p === DEFAULT_PASS) {
              setErr(false);
              void kickPrimary({ picker: false });
              onOk(u);
            } else setErr(true);
          }}
        >
          <h2 className="mb-5 font-['Space_Grotesk'] text-lg text-white">{tx("loginTitle")}</h2>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-[11px] tracking-wide text-[#8ea0b3] uppercase">{tx("user")}</span>
            <input name="user" autoComplete="username" autoFocus className="h-11 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 text-sm outline-none focus:border-[#4fc3f7]" />
          </label>
          <label className="mb-5 block">
            <span className="mb-1.5 block text-[11px] tracking-wide text-[#8ea0b3] uppercase">{tx("pass")}</span>
            <input name="pass" type="password" autoComplete="current-password" className="h-11 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 text-sm outline-none focus:border-[#4fc3f7]" />
          </label>
          {err ? <p className="mb-3 text-sm text-[#f87171]">{tx("loginError")}</p> : null}
          <button type="submit" className="h-11 w-full rounded-md bg-[#4fc3f7] font-semibold text-[#071018] hover:bg-[#80d8ff]">
            {tx("enter")}
          </button>
          <p className="mt-4 text-center font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">{tx("loginDefault")}</p>
          <p className="mt-1 text-center font-['IBM_Plex_Mono'] text-[11px] text-[#5d7184]">{tx("loginHint")}</p>
        </form>
      </div>
    </div>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { tx, s, setFreq, setS } = useConsole();
  const headerFreqRef = useRef<HTMLParagraphElement>(null);
  const [loc, navigate] = useLocation();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const user = sessionStorage.getItem(AUTH_USER_KEY) || DEFAULT_USER;
  const page = (loc.replace(/^\/console\/?/, "").split(/[?#]/)[0] || "radio") as PageId;
  const Page = PAGES[page] ?? RadioPage;
  const vfoLetter = s.vfo === "B" ? "B" : "A";
  const vfo = formatVfo(vfoLetter === "B" ? s.freqB : s.freq);
  const vfoMode = vfoLetter === "B" ? s.modeB : s.mode;
  const primaryRadio = s.radios.items.find((r) => r.primary);
  const liveRadio = s.radios.items.find((r) => r.connected) || primaryRadio;
  const gattUp = s.ic705.phase === "ready" || s.ic705.civ;
  const radioChip = gattUp
    ? `${s.ic705.bleName || primaryRadio?.deviceName || liveRadio?.deviceName || tx("ic705")} · CI-V`
    : liveRadio && !(liveRadio.link === "bluetooth" && liveRadio.proto === "civ")
      ? `${liveRadio.maker === "tentec" ? "Ten-Tec" : liveRadio.maker[0]!.toUpperCase() + liveRadio.maker.slice(1)} ${liveRadio.link === "bluetooth" ? "BT" : "USB"}`
      : `${tx("ic705")} —`;
  const liveSvcs = s.services.filter(
    (row) =>
      row.id !== "radio" &&
      row.id !== "lextel" &&
      row.id !== "web" &&
      row.id !== "dhcp" &&
      serviceLive(row.id, s, row.running),
  );

  useEffect(() => {
    setOpen(false);
  }, [page]);

  useEffect(() => {
    const el = headerFreqRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY < 0 ? 1 : -1;
      const step = e.shiftKey ? 10_000 : e.ctrlKey || e.altKey || e.metaKey ? 100 : 1_000;
      const which = s.vfo === "B" ? "B" : "A";
      const cur = which === "B" ? s.freqB : s.freq;
      const next = Math.max(100_000, cur + dir * step);
      if (which === "A") setFreq(next);
      else setS((p) => ({ ...p, freqB: next }));
      if (s.ic705.phase === "ready") void ic705Ble.setFreq(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [s.vfo, s.freq, s.freqB, s.ic705.cat, s.ic705.phase, setFreq, setS]);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="border-b border-[rgba(79,195,247,0.12)] px-5 py-5">
        <p className="font-['IBM_Plex_Mono'] text-[10px] tracking-[0.22em] text-[#ffb300] uppercase">{tx("station")}</p>
        <p className="font-['Space_Grotesk'] text-lg font-semibold text-white">{tx("brand")}</p>
        <p className="text-xs text-[#8ea0b3]">{tx("version")} · Ubuntu Server</p>
      </div>
      <div className="console-scroll flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((g) => (
          <div key={g.group} className="mb-5">
            <p className="mb-1.5 px-2 font-['IBM_Plex_Mono'] text-[10px] tracking-[0.16em] text-[#5d7184] uppercase">{tx(g.group)}</p>
            {g.items.map((it) => {
              const Icon = it.icon;
              const active =
                it.id === "admin"
                  ? page === "admin" ||
                    page === "logs" ||
                    page === "term" ||
                    page === "services" ||
                    page === "updates" ||
                    page === "backup" ||
                    page === "password"
                  : page === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => navigate(`/console/${it.id}`)}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                    active ? "bg-[#4fc3f7]/15 text-[#4fc3f7]" : "text-[#c5d4e0] hover:bg-white/5"
                  }`}
                >
                  <Icon size={16} />
                  {tx(it.id)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-[rgba(79,195,247,0.12)] p-3">
        <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[#8ea0b3] hover:text-[#f87171]">
          <LogOut size={16} />
          {tx("logout")}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="console flex min-h-screen">
      {!mobile ? <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-[rgba(79,195,247,0.12)] bg-[#08131c]">{nav}</aside> : null}
      {mobile && open ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="h-full w-64 bg-[#08131c]">{nav}</div>
          <button type="button" className="flex-1 bg-black/50" aria-label={tx("closeMenu")} onClick={() => setOpen(false)} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[rgba(79,195,247,0.12)] bg-[#071018]/95 px-4 py-3 backdrop-blur-sm">
          {mobile ? (
            <button type="button" onClick={() => setOpen((v) => !v)} className="grid size-9 shrink-0 place-items-center rounded-md border border-[rgba(79,195,247,0.2)] text-[#4fc3f7]" aria-label={tx("menu")}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <p
              ref={headerFreqRef}
              title={tx("freqWheel")}
              className="shrink-0 cursor-ns-resize font-['IBM_Plex_Mono'] text-base font-semibold text-[#7ee0ff] md:text-xl"
            >
              {vfo.int}.{vfo.khz}.{vfo.hz}
              <span className="ml-2 text-xs font-normal tracking-widest text-[#8ea0b3]">
                MHz · VFO {vfoLetter} · {vfoMode}
              </span>
            </p>
            <button
              type="button"
              onClick={() => navigate("/console/ic705")}
              className={`shrink-0 rounded-md px-2 py-1 font-['IBM_Plex_Mono'] text-[11px] font-semibold ${
                s.radios.items.some((r) => r.connected) || s.ic705.phase === "ready"
                  ? "bg-[#10b981]/15 text-[#34d399]"
                  : "bg-white/5 text-[#8ea0b3]"
              }`}
            >
              {radioChip}
            </button>
            <button
              type="button"
              onClick={() => navigate("/console/lextel")}
              className={`shrink-0 rounded-md px-2 py-1 font-['IBM_Plex_Mono'] text-[11px] font-semibold ${
                s.lextel.connected ? "bg-[#10b981]/15 text-[#34d399]" : "bg-white/5 text-[#8ea0b3]"
              }`}
            >
              MS-2000 {s.lextel.connected ? "SPP" : "—"}
            </button>
            {liveSvcs.map((row) => (
              <span
                key={row.id}
                className="shrink-0 rounded-md bg-[#10b981]/15 px-2 py-1 font-['IBM_Plex_Mono'] text-[11px] font-semibold text-[#34d399]"
              >
                {tx(SVC_LABEL[row.id])}
              </span>
            ))}
            <span className={`shrink-0 rounded-md px-2 py-1 font-['IBM_Plex_Mono'] text-[11px] font-semibold ${s.ptt ? "bg-[#ef4444]/20 text-[#f87171]" : "bg-[#10b981]/15 text-[#34d399]"}`}>
              {s.ptt ? tx("tx") : tx("rx")}
            </span>
          </div>
          <LangToggle />
          {s.updates.pending > 0 ? (
            <button
              type="button"
              onClick={() => navigate("/console/updates")}
              className="relative grid size-8 shrink-0 place-items-center rounded-md border border-[#ffb300]/50 bg-[#ffb300]/15 text-[#ffb300]"
              aria-label={tx("updPending")}
              title={tx("updPending")}
            >
              <AlertTriangle size={16} className="animate-pulse" />
              <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[#ffb300] px-1 font-['IBM_Plex_Mono'] text-[9px] font-bold text-[#071018]">
                {s.updates.pending}
              </span>
            </button>
          ) : null}
          <UserMenu name={user} onLogout={onLogout} />
        </header>
        <main
          className={
            page === "radio"
              ? "min-w-0 w-full flex-1 px-2 py-4 md:px-3"
              : "mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8"
          }
        >
          <Page />
        </main>
      </div>
    </div>
  );
}

export function ConsoleLink({ children, className }: { children: ReactNode; className?: string }) {
  const [, navigate] = useLocation();
  return (
    <button type="button" className={className} onClick={() => navigate("/console")}>
      {children}
    </button>
  );
}
