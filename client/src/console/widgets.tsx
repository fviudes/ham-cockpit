import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, KeyRound, LogOut, User } from "lucide-react";
import type { UpdateId } from "@shared/const";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { APP_LOGO_LG } from "@shared/brand";
import type { I18nKey, Lang } from "./i18n";
import { useConsole } from "./state";

export function Panel({
  className,
  children,
  id,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  id?: string;
  onClick?: () => void;
}) {
  return (
    <div
      id={id}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-[rgba(79,195,247,0.14)] bg-[#0b1520] p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 font-['Space_Grotesk'] text-sm font-semibold tracking-wide text-[#ffb300]">
      {children}
    </h2>
  );
}

function isNativeFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(document.fullscreenElement || d.webkitFullscreenElement);
}

function headingLogoVisible(root: HTMLElement | null) {
  const overlayFs = Boolean(root?.closest(".console-page-fs"));
  return overlayFs || isNativeFullscreen();
}

export function PageHead({
  kicker,
  title,
  aside,
  logo,
}: {
  kicker: string;
  title: string;
  aside?: ReactNode;
  logo?: boolean;
}) {
  const headRef = useRef<HTMLDivElement>(null);
  const [showLogo, setShowLogo] = useState(false);

  useLayoutEffect(() => {
    if (!logo) {
      setShowLogo(false);
      return;
    }
    setShowLogo(headingLogoVisible(headRef.current));
  });

  useLayoutEffect(() => {
    if (!logo) return;
    const measure = () => setShowLogo(headingLogoVisible(headRef.current));
    document.addEventListener("fullscreenchange", measure);
    document.addEventListener("webkitfullscreenchange", measure);
    return () => {
      document.removeEventListener("fullscreenchange", measure);
      document.removeEventListener("webkitfullscreenchange", measure);
    };
  }, [logo]);

  return (
    <div
      ref={headRef}
      className={cn("mb-6 flex flex-wrap justify-between gap-3", logo ? "items-center" : "items-end")}
    >
      <div className="flex items-center gap-3">
        {logo && showLogo ? (
          <img src={APP_LOGO_LG} alt="" className="size-[113px] shrink-0 object-contain" />
        ) : null}
        <div>
          <p className="font-['IBM_Plex_Mono'] text-[11px] font-semibold tracking-[0.18em] text-[#4fc3f7]/70 uppercase">
            {kicker}
          </p>
          <h1 className="font-['Space_Grotesk'] text-2xl font-semibold text-white">{title}</h1>
        </div>
      </div>
      {aside}
    </div>
  );
}

export function Led({
  on,
  tone = "green",
  label,
}: {
  on: boolean;
  tone?: "green" | "red" | "amber" | "cyan";
  label?: string;
}) {
  const color = {
    green: on ? "bg-[#34d399]" : "bg-[#1c2a32]",
    red: on ? "bg-[#f87171]" : "bg-[#1c2a32]",
    amber: on ? "bg-[#ffb300]" : "bg-[#1c2a32]",
    cyan: on ? "bg-[#4fc3f7]" : "bg-[#1c2a32]",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn("size-2.5 rounded-full", color)} />
      {label ? <span className="text-[10px] text-[#8ea0b3]">{label}</span> : null}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  tone = "cyan",
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  tone?: "cyan" | "amber" | "danger" | "ok";
}) {
  const activeCls = {
    cyan: "bg-[#4fc3f7] text-[#071018] border-[#4fc3f7]",
    amber: "bg-[#ffb300] text-[#071018] border-[#ffb300]",
    danger: "bg-[#ef4444] text-white border-[#ef4444]",
    ok: "bg-[#10b981] text-[#071018] border-[#10b981]",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 whitespace-nowrap rounded-md border px-2.5 text-[11px] font-semibold transition-colors sm:px-3 sm:text-xs",
        active
          ? activeCls
          : "border-[rgba(79,195,247,0.22)] bg-transparent text-[#c5d4e0] hover:border-[#4fc3f7] hover:text-[#4fc3f7]"
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium tracking-wide text-[#8ea0b3] uppercase">{label}</span>
      {children}
    </label>
  );
}

export function ConsoleInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 text-sm text-[#e8eef4] outline-none placeholder:text-[#5d7184] focus:border-[#4fc3f7]",
        props.className
      )}
    />
  );
}

export function ConsoleSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 text-sm text-[#e8eef4] outline-none focus:border-[#4fc3f7]",
        props.className
      )}
    />
  );
}

export function PrimaryBtn({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-10 rounded-md bg-[#4fc3f7] px-4 text-sm font-semibold text-[#071018] transition-colors hover:bg-[#80d8ff] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1 rounded-md border px-4 text-sm font-semibold transition-colors",
        "disabled:opacity-40",
        danger
          ? "border-[#ef4444]/50 text-[#f87171] hover:bg-[#ef4444]/10"
          : "border-[rgba(79,195,247,0.28)] text-[#4fc3f7] hover:bg-[#4fc3f7]/10"
      )}
    >
      {children}
    </button>
  );
}

export function Lcd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-[#143048] bg-[#03080d] p-[3px]", className)}>
      <div className="relative overflow-hidden rounded-md border border-[#0a2838] bg-[#041018] px-3 py-2.5 font-['IBM_Plex_Mono']">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,0.55) 2px 3px)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(79,195,247,0.08),transparent_55%)]" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function FlagBr() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0 rounded-[1px]" aria-hidden>
      <rect width="20" height="14" fill="#009b3a" />
      <polygon points="10,1.2 18.6,7 10,12.8 1.4,7" fill="#fedf00" />
      <circle cx="10" cy="7" r="3.1" fill="#002776" />
    </svg>
  );
}

function FlagUs() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0 rounded-[1px]" aria-hidden>
      <rect width="20" height="14" fill="#bf0a30" />
      {[2, 4, 6, 8, 10, 12].map((y) => (
        <rect key={y} y={y} width="20" height="1.1" fill="#fff" />
      ))}
      <rect width="8.2" height="7.5" fill="#002868" />
    </svg>
  );
}

const LANGS: { id: Lang; Flag: () => ReactNode; label: "langPtName" | "langEnName" }[] = [
  { id: "pt", Flag: FlagBr, label: "langPtName" },
  { id: "en", Flag: FlagUs, label: "langEnName" },
];

const menuBox =
  "z-50 min-w-[11rem] rounded-md border border-[rgba(79,195,247,0.22)] bg-[#0b1520] p-1 text-[#c5d4e0] shadow-lg";
const menuItem =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[#c5d4e0] outline-none focus:bg-[#4fc3f7]/15 focus:text-[#4fc3f7]";

export function LangToggle() {
  const { lang, setLang, tx } = useConsole();
  const current = LANGS.find((row) => row.id === lang) || LANGS[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-2 text-[12px] font-semibold text-[#c5d4e0] outline-none hover:border-[#4fc3f7]"
          aria-label={tx("langMenu")}
        >
          <current.Flag />
          <span className="hidden sm:inline">{tx(current.label)}</span>
          <ChevronDown size={14} className="text-[#8ea0b3]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuBox}>
        {LANGS.map((row) => (
          <DropdownMenuItem
            key={row.id}
            className={cn(menuItem, lang === row.id && "bg-[#4fc3f7]/15 text-[#4fc3f7]")}
            onSelect={() => setLang(row.id)}
          >
            <row.Flag />
            {tx(row.label)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

const UPD_STAGE: Record<string, I18nKey> = {
  queued: "updStageQueued",
  prepare: "updStagePrepare",
  update: "updStageIndexes",
  download: "updStageDownload",
  install: "updStageInstall",
  restart: "updStageRestart",
  done: "updStageDone",
  error: "updFail",
};

export function stageLabel(tx: (k: I18nKey) => string, stage: string): string {
  const key = UPD_STAGE[stage];
  return key ? tx(key) : stage;
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function progressHint(row: {
  stage?: string;
  bytes?: number;
  totalBytes?: number;
  etaSec?: number;
}): string {
  const bits: string[] = [];
  const got = Number(row.bytes || 0);
  const total = Number(row.totalBytes || 0);
  if (total > 0) bits.push(`${fmtBytes(got)} / ${fmtBytes(total)}`);
  else if (got > 0) bits.push(fmtBytes(got));
  const eta = Number(row.etaSec || 0);
  if (eta > 0) {
    const m = Math.floor(eta / 60);
    const s = eta % 60;
    bits.push(m > 0 ? `~${m} min ${s} s` : `~${s} s`);
  }
  return bits.join(" · ");
}

export function UpdatesMenu() {
  const { s, tx } = useConsole();
  const [, navigate] = useLocation();
  const jobs = s.updates.jobs.filter((row) => row.status === "running");
  const applying = s.updates.items.filter((row) => row.applying);
  const live = jobs.length ? jobs : applying.map((row) => ({
    id: row.id,
    status: "running" as const,
    pct: row.progress,
    determinate: row.determinate,
    stage: row.stage,
    error: row.error,
  }));
  if (s.updates.pending <= 0 && live.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative grid size-8 shrink-0 place-items-center rounded-md border border-[#ffb300]/50 bg-[#ffb300]/15 text-[#ffb300] outline-none"
          aria-label={tx("updPending")}
          title={tx("updPending")}
        >
          <AlertTriangle size={16} className={live.length ? "" : "animate-pulse"} />
          {live.length > 0 ? (
            <span className="absolute inset-x-1 bottom-0.5 flex flex-col gap-px">
              {live.slice(0, 3).map((job) => (
                <span key={job.id} className="h-0.5 overflow-hidden rounded-full bg-[#071018]/70">
                  <span
                    className={`block h-full rounded-full bg-[#ffb300] ${job.determinate ? "" : "animate-pulse"}`}
                    style={{ width: `${Math.max(8, Math.min(100, job.pct || 8))}%` }}
                  />
                </span>
              ))}
            </span>
          ) : null}
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[#ffb300] px-1 font-['IBM_Plex_Mono'] text-[9px] font-bold text-[#071018]">
            {live.length > 0 ? live.length : s.updates.pending}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(menuBox, "min-w-[18rem]")}>
        {live.length > 0 ? (
          live.map((job) => (
            <DropdownMenuItem
              key={job.id}
              className={cn(menuItem, "cursor-default flex-col items-stretch gap-1 py-2")}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex items-center justify-between gap-2">
                <span>{tx(UPD_LABEL[job.id] || "updApp")}</span>
                <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">{Math.round(job.pct)}%</span>
              </span>
              <span className="text-[11px] text-[#8ea0b3]">{stageLabel(tx, job.stage) || tx("updApplying")}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[#16232e]">
                <span
                  className={`block h-full rounded-full bg-[#4fc3f7] ${job.determinate ? "" : "animate-pulse"}`}
                  style={{ width: `${Math.max(4, Math.min(100, job.pct || 8))}%` }}
                />
              </span>
              {job.error ? <span className="text-[11px] text-[#f87171]">{job.error}</span> : null}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem className={menuItem} onSelect={() => navigate("/console/updates")}>
            {s.updates.pending} {tx("updPendingN")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={menuItem} onSelect={() => navigate("/console/updates")}>
          {tx("update")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ name, onLogout }: { name: string; onLogout: () => void }) {
  const { tx } = useConsole();
  const [, navigate] = useLocation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 max-w-[10rem] items-center gap-1.5 rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-2 text-[12px] font-semibold text-[#c5d4e0] outline-none hover:border-[#4fc3f7]"
        >
          <User size={14} className="shrink-0 text-[#4fc3f7]" />
          <span className="truncate">{name}</span>
          <ChevronDown size={14} className="shrink-0 text-[#8ea0b3]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={menuBox}>
        <DropdownMenuItem className={menuItem} onSelect={() => navigate("/console/password")}>
          <KeyRound size={14} />
          {tx("changePass")}
        </DropdownMenuItem>
        <DropdownMenuItem className={cn(menuItem, "text-[#f87171] focus:text-[#f87171]")} onSelect={onLogout}>
          <LogOut size={14} />
          {tx("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MeterBar({ value, max = 9 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const tone = pct > 85 ? "bg-[#ef4444]" : pct > 65 ? "bg-[#ffb300]" : "bg-[#4fc3f7]";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#16232e]">
      <div className={cn("h-full rounded-full transition-[width] duration-300", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Barra de progresso de ação longa (Atualizações / Backup) — tema escuro, cyan. */
export function ActionProgress({
  active,
  value,
  label,
  hint = "",
  determinate = true,
}: {
  active: boolean;
  value: number;
  label: string;
  hint?: string;
  determinate?: boolean;
}) {
  if (!active) return null;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="min-w-0 flex-1"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? pct : undefined}
      aria-label={label}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] tracking-wide text-[#8ea0b3] uppercase">
          {label}
          {hint ? <span className="ml-2 font-['IBM_Plex_Mono'] normal-case tracking-normal">{hint}</span> : null}
        </span>
        <span className="shrink-0 font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#16232e]">
        {determinate ? (
          <div className="h-full rounded-full bg-[#4fc3f7] transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-2/5 animate-pulse rounded-full bg-[#4fc3f7]" />
        )}
      </div>
    </div>
  );
}
