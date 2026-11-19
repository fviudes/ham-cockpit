import { cn } from "@/lib/utils";
import type { I18nKey } from "./i18n";
import { useConsole } from "./state";

const LAMP =
  "lcd-lamp lcd-14 shrink-0 rounded border px-1 py-0 font-['IBM_Plex_Mono'] text-[8px] font-semibold leading-none tracking-wide";

export function PanelMonitorButton({
  on,
  busy,
  disabled,
  onClick,
  title,
}: {
  on: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: I18nKey;
}) {
  const { tx } = useConsole();
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-pressed={on}
      title={tx(title ?? (on ? "pcMonitorOn" : "pcMonitorOff"))}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        LAMP,
        on
          ? "lcd-lamp-rx border-emerald-500/55 bg-emerald-500/20 text-emerald-200"
          : "border-[rgba(79,195,247,0.22)] bg-[#0b1520] text-[#5d7184] hover:border-[#4fc3f7]/50 hover:text-[#8ea0b3]",
        (disabled || busy) && "opacity-50",
      )}
    >
      {tx("panelMonitor")}
    </button>
  );
}