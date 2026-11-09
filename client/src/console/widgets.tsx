import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChevronDown, KeyRound, LogOut, User } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import type { Lang } from "./i18n";
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

export function PageHead({
  kicker,
  title,
  aside,
}: {
  kicker: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-['IBM_Plex_Mono'] text-[11px] font-semibold tracking-[0.18em] text-[#4fc3f7]/70 uppercase">
          {kicker}
        </p>
        <h1 className="font-['Space_Grotesk'] text-2xl font-semibold text-white">{title}</h1>
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
        "h-8 rounded-md border px-3 text-xs font-semibold transition-colors",
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
        "h-10 rounded-md border px-4 text-sm font-semibold transition-colors",
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
