import type { ReactNode } from "react";
import type { I18nKey } from "@/console/i18n";
import type { Station } from "@/console/state";
import { SVC_LABEL } from "@/console/services-ui";

export type HeaderChip = {
  key: string;
  label: string;
  className: string;
  onClick?: () => void;
  disabled?: boolean;
};

const CHIP_BASE =
  "min-w-0 w-full truncate rounded border px-0.5 py-0.5 text-center font-['IBM_Plex_Mono'] text-[8px] font-semibold leading-tight @[22rem]:px-1 @[22rem]:text-[9px] @[28rem]:text-[10px]";

function lampCls(on: boolean) {
  return on
    ? `${CHIP_BASE} lcd-lamp lcd-lamp-rx border-emerald-500/55 bg-emerald-500/20 text-emerald-200`
    : `${CHIP_BASE} lcd-lamp border-[rgba(79,195,247,0.22)] bg-[#0b1520] text-[#5d7184]`;
}

function HeaderChipView({ chip }: { chip: HeaderChip }) {
  if (chip.onClick) {
    return (
      <button type="button" title={chip.label} disabled={chip.disabled} onClick={chip.onClick} className={chip.className}>
        {chip.label}
      </button>
    );
  }
  return (
    <span title={chip.label} className={chip.className}>
      {chip.label}
    </span>
  );
}

export function HeaderServiceRows({
  chips,
  identity,
  notices,
}: {
  chips: HeaderChip[];
  identity?: ReactNode;
  notices?: ReactNode;
}) {
  return (
    <div className="@container col-start-3 row-span-2 flex h-full w-full min-w-0 items-stretch justify-end gap-2 overflow-hidden">
      <div className="min-h-0 min-w-0 max-w-[15.5rem] flex-1 overflow-hidden rounded-md border border-[rgba(79,195,247,0.28)] bg-[#0b1520] px-1 py-0.5 @[26rem]:max-w-[16.5rem]">
        <div className="grid h-full grid-flow-col grid-rows-3 auto-cols-fr items-center justify-items-stretch gap-x-1 gap-y-0.5">
          {chips.map((chip) => (
            <HeaderChipView key={chip.key} chip={chip} />
          ))}
        </div>
      </div>
      <div className="flex h-full min-h-0 shrink-0 items-stretch gap-2">
        <div aria-hidden="true" className="w-px shrink-0 self-stretch bg-[rgba(79,195,247,0.4)]" />
        <div className="grid shrink-0 grid-rows-2 items-center justify-items-end gap-1 pr-0.5">
          <div className="flex flex-nowrap items-center justify-end gap-2">{identity}</div>
          <div className="flex min-h-0 flex-nowrap items-center justify-end gap-1.5">{notices}</div>
        </div>
      </div>
    </div>
  );
}

type HeaderServicesProps = {
  s: Station;
  tx: (k: I18nKey) => string;
  menusOpen: boolean;
  onNavigate: (path: string) => void;
};

/** Ícones fixos do topo: 8 serviços, 3 por coluna, estilo lâmpada. */
export function buildHeaderServiceChips({ s, tx, menusOpen, onNavigate }: HeaderServicesProps): HeaderChip[] {
  const running = (id: (typeof s.services)[number]["id"]) => s.services.find((row) => row.id === id)?.running ?? false;
  const go = (path: string) => {
    if (menusOpen) onNavigate(path);
  };
  const chip = (key: string, label: string, on: boolean, path?: string): HeaderChip => ({
    key,
    label,
    className: lampCls(on),
    disabled: !menusOpen,
    onClick: path ? () => go(path) : undefined,
  });
  return [
    chip("lextel", "Lextel", s.lextel.connected, "/console/lextel"),
    chip("wavelog", tx(SVC_LABEL.wavelog), s.wavelog.running, "/console/wavelog"),
    chip("db", tx(SVC_LABEL.db), running("db"), "/console/wavelog"),
    chip("wlg", tx(SVC_LABEL.wlg), s.wlg.running, "/console/wavelog"),
    chip("hamlib", tx(SVC_LABEL.hamlib), s.ser2net.hamlibRunning, "/console/ser2net"),
    chip("ser2net", tx(SVC_LABEL.ser2net), s.ser2net.running, "/console/ser2net"),
    chip(
      "wifi",
      tx(SVC_LABEL.wifi),
      s.wifi.ethConnected || s.wifi.staConnected,
      "/console/wifi",
    ),
    chip("bluetooth", tx(SVC_LABEL.bluetooth), running("bluetooth") || s.ble.connected, "/console/bluetooth"),
  ];
}