import { BluetoothPage, WifiPage } from "@/console/network";
import { AcomPage, HamplusPage, Ic705Page, LdgPage, LextelPage, Lp100aPage, PalstarPage, SpePage } from "@/console/devices";
import { DEFAULT_PASS, DEFAULT_USER, type I18nKey } from "@/console/i18n";
import { resolvePrimaryRoute, sendPrimaryCmd } from "@/console/radio-cmd";
import { ConsoleProvider, useConsole } from "@/console/state";
import { SVC_LABEL, serviceLive } from "@/console/services-ui";
import { HeaderSMeter } from "@/console/header-smeter";
import { LangToggle, UpdatesMenu, UserMenu } from "@/console/widgets";
import { RadioPage } from "@/console/radio";
import { ManualPage } from "@/console/manual";
import { AdminPage, StatusPage } from "@/console/system";
import { Ser2netPage } from "@/console/ser2net";
import { WizardPage } from "@/console/wizard";
import { WavelogPage } from "@/console/wavelog";
import { MmdvmPage } from "@/console/mmdvm";
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
  Menu,
  Radio,
  Settings,
  SlidersHorizontal,
  Shield,
  TowerControl,
  WandSparkles,
  Waves,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useLocation } from "wouter";
import { APP_LOGO, APP_VERSION } from "@shared/brand";
import { licenseGateOf, licenseMenusOpen, type LicenseGate } from "@shared/license";

const AUTH_KEY = "hamcockpit.auth";
const AUTH_USER_KEY = "hamcockpit.user";
/** Após login, sempre aterrissa em /console/license uma vez. */
const POST_LOGIN_KEY = "hamcockpit.postLogin";

type PageId =
  | "wizard"
  | "radio"
  | "ic705"
  | "spe"
  | "hamplus"
  | "palstar"
  | "ldg"
  | "lp100a"
  | "acom"
  | "lextel"
  | "wifi"
  | "bluetooth"
  | "wavelog"
  | "mmdvm"
  | "ser2net"
  | "logs"
  | "admin"
  | "services"
  | "processes"
  | "updates"
  | "backup"
  | "license"
  | "status"
  | "term"
  | "manual"
  | "support";

type NavPageId = Extract<PageId, I18nKey>;

const NAV: { group: "navSetup" | "navOp" | "navDev" | "navNet" | "navSys"; items: { id: NavPageId; icon: ComponentType<{ size?: number }> }[] }[] = [
  { group: "navSetup", items: [{ id: "wizard", icon: WandSparkles }] },
  {
    group: "navOp",
    items: [
      { id: "radio", icon: Radio },
      { id: "wavelog", icon: BookMarked },
      { id: "mmdvm", icon: TowerControl },
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
      { id: "lp100a", icon: Gauge },
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

type HeaderChip = {
  key: string;
  label: string;
  className: string;
  onClick?: () => void;
  disabled?: boolean;
};

const HEADER_CHIP =
  "min-w-0 max-w-max grow basis-0 shrink truncate rounded-md px-1 py-1 text-left font-['IBM_Plex_Mono'] text-[10px] font-semibold disabled:opacity-40 @[28rem]:px-2 @[28rem]:text-[11px]";

/** Hz → kHz, com os dois dígitos abaixo de 1 kHz que o mostrador já exibia (passo de 10 Hz). */
function formatHeaderKhz(hz: number): string {
  const abs = Math.max(0, Math.round(hz));
  const whole = Math.floor(abs / 1000);
  const frac = Math.floor((abs % 1000) / 10);
  return `${whole}.${String(frac).padStart(2, "0")}`;
}

function LcdSeg({ text }: { text: string }) {
  const ghost = text.replace(/\d/g, "8");
  return (
    <span className="relative inline-block whitespace-nowrap leading-none">
      <span className="lcd-7 lcd-ghost" aria-hidden="true">
        {ghost}
      </span>
      <span className="lcd-7 lcd-on absolute inset-0">{text}</span>
    </span>
  );
}

function LcdDigits({ text }: { text: string }) {
  const [whole, frac] = text.split(".");
  if (!frac) return <LcdSeg text={whole} />;
  return (
    <span className="inline-flex items-end whitespace-nowrap leading-none">
      <LcdSeg text={whole} />
      <span className="sr-only">.</span>
      <span className="lcd-dp" aria-hidden="true" />
      <LcdSeg text={frac} />
    </span>
  );
}

function LcdLamp({ label, tone }: { label: string; tone: "amber" | "rx" | "tx" }) {
  return (
    <span className={`lcd-lamp lcd-14 lcd-lamp-${tone} inline-flex items-center justify-center rounded-full border`}>
      {label}
    </span>
  );
}

/** Serviços em duas linhas; à direita, idioma/usuário em cima e avisos embaixo, cortados por um fio vertical. */
function HeaderServiceRows({
  chips,
  identity,
  notices,
}: {
  chips: HeaderChip[];
  identity?: ReactNode;
  notices?: ReactNode;
}) {
  const mid = Math.ceil(chips.length / 2);
  const rows = [chips.slice(0, mid), chips.slice(mid)];
  return (
    <div className="@container col-start-2 row-span-2 grid h-full min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-2 gap-x-2 gap-y-1 overflow-hidden">
      {rows.map((row, index) => (
        <div
          key={index}
          className={`col-start-1 flex min-h-0 min-w-0 items-center gap-1 overflow-hidden ${index === 0 ? "row-start-1" : "row-start-2"}`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {row.map((chip) => {
              const cls = `${HEADER_CHIP} ${chip.className}`;
              if (chip.onClick) {
                return (
                  <button
                    key={chip.key}
                    type="button"
                    title={chip.label}
                    disabled={chip.disabled}
                    onClick={chip.onClick}
                    className={cls}
                  >
                    {chip.label}
                  </button>
                );
              }
              return (
                <span key={chip.key} title={chip.label} className={cls}>
                  {chip.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div className="col-start-2 row-span-2 row-start-1 flex min-h-0 items-stretch gap-2">
        <div aria-hidden="true" className="w-px shrink-0 self-stretch bg-[rgba(79,195,247,0.4)]" />
        <div className="grid shrink-0 grid-rows-2 items-center justify-items-end gap-1 pr-1">
          <div className="flex items-center justify-end gap-2">{identity}</div>
          <div className="flex min-h-0 items-center justify-end gap-1.5">{notices}</div>
        </div>
      </div>
    </div>
  );
}

const PAGES: Record<PageId, ComponentType> = {
  wizard: WizardPage,
  radio: RadioPage,
  ic705: Ic705Page,
  spe: SpePage,
  hamplus: HamplusPage,
  palstar: PalstarPage,
  ldg: LdgPage,
  lp100a: Lp100aPage,
  acom: AcomPage,
  lextel: LextelPage,
  wifi: WifiPage,
  bluetooth: BluetoothPage,
  wavelog: WavelogPage,
  mmdvm: MmdvmPage,
  ser2net: Ser2netPage,
  logs: AdminPage,
  admin: AdminPage,
  services: AdminPage,
  processes: AdminPage,
  updates: AdminPage,
  backup: AdminPage,
  license: AdminPage,
  status: StatusPage,
  term: AdminPage,
  manual: ManualPage,
  support: AdminPage,
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
            sessionStorage.removeItem(POST_LOGIN_KEY);
            setAuthed(false);
          }}
        />
      ) : (
        <Login
          onOk={(name) => {
            sessionStorage.setItem(AUTH_KEY, "1");
            sessionStorage.setItem(AUTH_USER_KEY, name);
            sessionStorage.setItem(POST_LOGIN_KEY, "1");
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
    <div className="console relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <LangToggle />
      </div>
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <img
            src={APP_LOGO}
            alt={tx("brand")}
            className="mx-auto mb-5 h-[104px] w-[104px] object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
          />
          <h1 className="font-['Space_Grotesk'] text-3xl font-semibold text-white">{tx("brand")}</h1>
          <p className="mt-1 text-sm text-[#8ea0b3]">{tx("tagline")}</p>
        </div>
        <form
          className="rounded-2xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-7"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const u = String(fd.get("user") || "");
            const p = String(fd.get("pass") || "");
            if (u !== DEFAULT_USER || p !== DEFAULT_PASS) {
              setErr(true);
              return;
            }
            void (async () => {
              try {
                const r = await fetch("/api/console/session", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ user: u, password: p }),
                });
                if (!r.ok) {
                  setErr(true);
                  return;
                }
              } catch {
                setErr(true);
                return;
              }
              setErr(false);
              void kickPrimary({ picker: false, gesture: true });
              onOk(u);
            })();
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
  const { tx, s, setFreq, setS, license } = useConsole();
  const headerFreqRef = useRef<HTMLDivElement>(null);
  const [loc, navigate] = useLocation();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const user = sessionStorage.getItem(AUTH_USER_KEY) || DEFAULT_USER;
  const page = (loc.replace(/^\/console\/?/, "").split(/[?#]/)[0] || "radio") as PageId;
  const Page = PAGES[page] ?? RadioPage;
  const vfoLetter = s.vfo === "B" ? "B" : "A";
  const vfoHz = vfoLetter === "B" ? s.freqB : s.freq;
  const vfoKhz = formatHeaderKhz(vfoHz);
  const vfoMode = vfoLetter === "B" ? s.modeB : s.mode;
  const primaryRadio = s.radios.items.find((r) => r.primary);
  const liveRadio = s.radios.items.find((r) => r.connected) || primaryRadio;
  const bleReady = s.ic705.phase === "ready" && s.ic705.ble;
  const route = resolvePrimaryRoute(s.radios.items, { bleReady });
  const liveSignal = route.live && route.transport !== "none";
  const gattUp = s.ic705.phase === "ready" || s.ic705.civ;
  const makerLabel = (r: typeof liveRadio) =>
    !r ? "" : r.maker === "tentec" ? "Ten-Tec" : r.maker[0]!.toUpperCase() + r.maker.slice(1);
  const radioChip =
    route.transport === "lan" && route.live
      ? `${primaryRadio?.deviceName || primaryRadio?.name || tx("ic705")} · LAN CI-V`
      : gattUp || (route.transport === "ble" && route.live)
        ? `${s.ic705.bleName || primaryRadio?.deviceName || liveRadio?.deviceName || tx("ic705")} · CI-V`
        : route.live && route.radio
          ? `${makerLabel(route.radio)} ${route.radio.link === "network" ? "Rede" : route.radio.link === "bluetooth" ? "BT" : "USB"}`
          : liveRadio && !(liveRadio.link === "bluetooth" && liveRadio.proto === "civ")
            ? `${makerLabel(liveRadio)} ${liveRadio.link === "network" ? "Rede" : liveRadio.link === "bluetooth" ? "BT" : "USB"}`
            : `${tx("ic705")} —`;
  const previewAll =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("chips") === "all";
  const liveSvcs = s.services.filter(
    (row) =>
      row.id !== "radio" &&
      row.id !== "lextel" &&
      row.id !== "web" &&
      row.id !== "dhcp" &&
      (previewAll || serviceLive(row.id, s, row.running)),
  );

  useEffect(() => {
    setOpen(false);
  }, [page]);

  const gate: LicenseGate = license?.gate ?? licenseGateOf(license?.state);
  const menusOpen = licenseMenusOpen(gate);
  const licenseReady = license !== null;
  const chipOn = "bg-[#10b981]/15 text-[#34d399]";
  const chipOff = "bg-white/5 text-[#8ea0b3]";
  const radioOn = s.radios.items.some((r) => r.connected) || s.ic705.phase === "ready";
  const headerChips: HeaderChip[] = [
    {
      key: "radio",
      label: radioChip,
      className: radioOn ? chipOn : chipOff,
      disabled: !menusOpen,
      onClick: () => {
        if (menusOpen) navigate("/console/ic705");
      },
    },
    {
      key: "lextel",
      label: `MS-2000 ${s.lextel.connected ? "SPP" : "—"}`,
      className: s.lextel.connected ? chipOn : chipOff,
      disabled: !menusOpen,
      onClick: () => {
        if (menusOpen) navigate("/console/lextel");
      },
    },
    ...liveSvcs.map((row) => ({
      key: row.id,
      label: tx(SVC_LABEL[row.id]),
      className: chipOn,
    })),
  ];

  useEffect(() => {
    if (sessionStorage.getItem(POST_LOGIN_KEY) === "1") {
      sessionStorage.removeItem(POST_LOGIN_KEY);
      navigate("/console/license");
      return;
    }
    if (!licenseReady) return;
    if (!menusOpen && page !== "license") navigate("/console/license");
  }, [licenseReady, menusOpen, page, navigate]);

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
      void sendPrimaryCmd(
        s.radios.items,
        { type: "setFreq", hz: next },
        { bleReady: s.ic705.phase === "ready" && s.ic705.ble, hamlibPort: s.wlg.hamlibPort || 4532 },
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [s.vfo, s.freq, s.freqB, s.radios.items, s.ic705.ble, s.ic705.phase, s.wlg.hamlibPort, setFreq, setS]);

  const licCall = menusOpen && license?.callsign ? license.callsign : null;
  let licBadgeText = tx("licBadgeNone");
  let licBadgeClass = "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#f87171]";
  if (gate === "licensed") {
    licBadgeText = tx("licBadgeLicensed");
    licBadgeClass = "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  } else if (gate === "trial") {
    const days = typeof license?.daysLeft === "number" ? license.daysLeft : null;
    licBadgeText = days != null ? tx("licBadgeTrialDays").replace("{n}", String(days)) : tx("licBadgeTrial");
    licBadgeClass = "border-[#ffb300]/45 bg-[#ffb300]/15 text-[#ffb300]";
  } else if (gate === "trial_expired") {
    licBadgeText = tx("licBadgeExpired");
    licBadgeClass = "border-[#ef4444]/45 bg-[#ef4444]/15 text-[#f87171]";
  }

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="border-b border-[rgba(79,195,247,0.12)] px-5 py-6">
        <div className="flex items-center gap-2">
          <img
            src={APP_LOGO}
            alt="Ham Cockpit"
            className="size-[113px] shrink-0 object-contain"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-2 whitespace-nowrap font-['IBM_Plex_Mono'] text-[10px] tracking-[0.22em] text-[#ffb300] uppercase">
              <span>{tx("station")}</span>
              {licCall ? (
                <span className="rounded border border-[#ffb300]/35 bg-[#ffb300]/10 px-1.5 py-0.5 font-semibold tracking-normal text-[#ffb300] normal-case">
                  {licCall}
                </span>
              ) : null}
            </p>
            <p className="whitespace-nowrap font-['Space_Grotesk'] text-lg font-semibold text-white">{tx("brand")}</p>
            <p className="whitespace-nowrap text-[11px] text-[#8ea0b3]">v{APP_VERSION} · Ubuntu Server</p>
            <p
              className={`mt-2 inline-flex max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${licBadgeClass}`}
              title={licBadgeText}
            >
              {licBadgeText}
            </p>
          </div>
        </div>
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
                    page === "processes" ||
                    page === "updates" ||
                    page === "backup" ||
                    page === "license"
                  : page === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={!menusOpen}
                  onClick={() => {
                    if (!menusOpen) {
                      navigate("/console/license");
                      return;
                    }
                    navigate(`/console/${it.id}`);
                  }}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                    active && menusOpen ? "bg-[#4fc3f7]/15 text-[#4fc3f7]" : "text-[#c5d4e0] hover:bg-white/5"
                  }`}
                >
                  <Icon size={16} />
                  {tx(it.id)}
                </button>
              );
            })}
          </div>
        ))}
        {!menusOpen ? (
          <button
            type="button"
            onClick={() => navigate("/console/license")}
            className="mb-2 flex w-full items-center gap-2.5 rounded-md bg-[#ef4444]/15 px-2.5 py-2 text-sm font-semibold text-[#f87171]"
          >
            <Settings size={16} />
            {tx("licTab")}
          </button>
        ) : null}
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
      {!mobile ? <aside className="sticky top-0 h-screen w-72 shrink-0 border-r border-[rgba(79,195,247,0.12)] bg-[#08131c]">{nav}</aside> : null}
      {mobile && open ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="h-full w-72 bg-[#08131c]">{nav}</div>
          <button type="button" className="flex-1 bg-black/50" aria-label={tx("closeMenu")} onClick={() => setOpen(false)} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-nowrap items-center gap-2 border-b border-[rgba(79,195,247,0.12)] bg-[#071018]/95 px-4 py-2 backdrop-blur-sm">
          {mobile ? (
            <button type="button" onClick={() => setOpen((v) => !v)} className="grid size-9 shrink-0 place-items-center rounded-md border border-[rgba(79,195,247,0.2)] text-[#4fc3f7]" aria-label={tx("menu")}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          ) : null}
          <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[2.85rem_2.85rem] gap-x-2 gap-y-1">
            <div className="row-span-2 flex h-full min-h-0 items-stretch gap-1.5">
            <HeaderSMeter reading={liveSignal ? s.smeter : null} />
            <div
              ref={headerFreqRef}
              title={tx("freqWheel")}
              className="lcd-bezel flex h-full min-h-0 w-max cursor-ns-resize flex-col items-stretch justify-center gap-1 px-2.5"
            >
              <p className="flex items-baseline justify-center gap-1.5 whitespace-nowrap leading-none">
                <LcdDigits text={vfoKhz} />
                <span className="lcd-14 lcd-unit">kHz</span>
              </p>
              <div className="flex items-center justify-center gap-1.5">
                <LcdLamp label={vfoLetter} tone="amber" />
                <LcdLamp label={vfoMode} tone="amber" />
                <LcdLamp label={s.ptt ? tx("tx") : tx("rx")} tone={s.ptt ? "tx" : "rx"} />
              </div>
            </div>
            </div>
            <HeaderServiceRows
              chips={headerChips}
              identity={
                <>
                  <LangToggle />
                  <UserMenu name={user} onLogout={onLogout} menusOpen={menusOpen} />
                </>
              }
              notices={menusOpen || import.meta.env.DEV ? <UpdatesMenu preview={import.meta.env.DEV} /> : null}
            />
          </div>
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
