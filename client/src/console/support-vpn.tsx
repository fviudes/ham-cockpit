import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConsole } from "./state";
import { GhostBtn, Panel, PanelTitle, PrimaryBtn } from "./widgets";

type VpnPhase = "off" | "connecting" | "on" | "error";

type VpnStatus = {
  ok?: boolean;
  state?: VpnPhase;
  enabled?: boolean;
  originalIp?: string;
  tunnelIface?: string;
  tunnelIp?: string;
  rxBytes?: number;
  txBytes?: number;
  rxBps?: number;
  txBps?: number;
  pingMs?: number;
  error?: string;
};

function fmtBytes(n: number): string {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const text = i === 0 ? String(Math.round(value)) : value.toLocaleString("pt-BR", { maximumFractionDigits: value >= 10 ? 0 : 1 });
  return `${text} ${units[i]}`;
}

function fmtRate(n: number): string {
  return `${fmtBytes(n)}/s`;
}

async function readVpn(): Promise<{ status: number; body: VpnStatus }> {
  const r = await fetch("/api/support/vpn", { credentials: "same-origin" });
  const body = (await r.json()) as VpnStatus;
  return { status: r.status, body };
}

export function SupportVpnPage() {
  const { tx } = useConsole();
  const [vpn, setVpn] = useState<VpnStatus>({ state: "off" });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const holdError = useRef(false);
  const phase: VpnPhase = vpn.state || "off";
  const connecting = phase === "connecting" || busy;

  const apply = (status: number, body: VpnStatus, fromUserOff = false) => {
    if (status === 401) {
      holdError.current = true;
      setVpn({ state: "error", error: tx("supportAuth") });
      return;
    }
    if (fromUserOff) holdError.current = false;
    if (body.state === "error") holdError.current = true;
    if (body.state === "on" || body.state === "connecting") holdError.current = false;
    if (body.state === "off" && holdError.current) return;
    setVpn(body.state ? body : { state: "error", error: body.error || tx("supportFail") });
  };

  useEffect(() => {
    let stop = false;
    const tick = () => {
      if (busyRef.current) return;
      void readVpn()
        .then(({ status, body }) => {
          if (!stop && !busyRef.current) apply(status, body);
        })
        .catch(() => {
          if (!stop) {
            holdError.current = true;
            setVpn({ state: "error", error: tx("supportFail") });
          }
        });
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [tx]);

  const setEnabled = async (enabled: boolean) => {
    if (enabled) {
      holdError.current = false;
      setVpn((prev) => ({ ...prev, state: "connecting", error: undefined }));
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/support/vpn", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = (await r.json()) as VpnStatus;
      apply(r.status, body, !enabled);
      if (r.status === 401) toast.error(tx("supportAuth"));
      else if (!r.ok || body.state === "error") toast.error(body.error || tx("supportFail"));
    } catch {
      holdError.current = true;
      setVpn({ state: "error", error: tx("supportFail") });
      toast.error(tx("supportFail"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const showStats = phase === "on";

  return (
    <Panel>
      <PanelTitle>{tx("supportTitle")}</PanelTitle>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("supportHint")}</p>
      <p className="mb-4 font-['IBM_Plex_Mono'] text-sm text-[#e8eef4]" data-testid="support-vpn-state">
        {phase === "on" ? tx("supportOn") : phase === "connecting" ? tx("supportConnecting") : phase === "error" ? vpn.error || tx("supportFail") : tx("supportOff")}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <PrimaryBtn disabled={connecting || phase === "on"} onClick={() => void setEnabled(true)}>
          {tx("supportConnect")}
        </PrimaryBtn>
        {phase !== "off" ? (
          <GhostBtn danger disabled={busy && phase !== "connecting"} onClick={() => void setEnabled(false)}>
            {tx("supportDisconnect")}
          </GhostBtn>
        ) : null}
      </div>
      {showStats ? (
        <dl className="grid max-w-xl gap-2 text-sm">
          {vpn.originalIp ? (
            <div className="flex items-baseline justify-between gap-4 rounded-lg bg-[#101c28] px-3 py-2">
              <dt className="text-[#8ea0b3]">{tx("supportOriginal")}</dt>
              <dd className="font-['IBM_Plex_Mono'] text-[#4fc3f7]">{vpn.originalIp}</dd>
            </div>
          ) : null}
          {vpn.pingMs !== undefined ? (
            <div className="flex items-baseline justify-between gap-4 rounded-lg bg-[#101c28] px-3 py-2">
              <dt className="text-[#8ea0b3]">{tx("supportLatency")}</dt>
              <dd className="font-['IBM_Plex_Mono'] text-[#e8eef4]">{vpn.pingMs.toLocaleString("pt-BR")} ms</dd>
            </div>
          ) : null}
          {vpn.rxBps !== undefined ? (
            <div className="flex items-baseline justify-between gap-4 rounded-lg bg-[#101c28] px-3 py-2">
              <dt className="text-[#8ea0b3]">{tx("supportDown")}</dt>
              <dd className="font-['IBM_Plex_Mono'] text-[#e8eef4]">{fmtRate(vpn.rxBps)}</dd>
            </div>
          ) : null}
          {vpn.txBps !== undefined ? (
            <div className="flex items-baseline justify-between gap-4 rounded-lg bg-[#101c28] px-3 py-2">
              <dt className="text-[#8ea0b3]">{tx("supportUp")}</dt>
              <dd className="font-['IBM_Plex_Mono'] text-[#e8eef4]">{fmtRate(vpn.txBps)}</dd>
            </div>
          ) : null}
          {vpn.rxBytes !== undefined ? (
            <div className="flex items-baseline justify-between gap-4 rounded-lg bg-[#101c28] px-3 py-2">
              <dt className="text-[#8ea0b3]">{tx("supportRx")}</dt>
              <dd className="font-['IBM_Plex_Mono'] text-[#e8eef4]">{fmtBytes(vpn.rxBytes)}</dd>
            </div>
          ) : null}
          {vpn.txBytes !== undefined ? (
            <div className="flex items-baseline justify-between gap-4 rounded-lg bg-[#101c28] px-3 py-2">
              <dt className="text-[#8ea0b3]">{tx("supportTx")}</dt>
              <dd className="font-['IBM_Plex_Mono'] text-[#e8eef4]">{fmtBytes(vpn.txBytes)}</dd>
            </div>
          ) : null}
          {vpn.tunnelIp ? (
            <div className="flex items-baseline justify-between gap-4 px-3 py-1 text-xs text-[#5d7184]">
              <dt>{tx("supportTunnel")}</dt>
              <dd className="font-['IBM_Plex_Mono']">
                {vpn.tunnelIp}
                {vpn.tunnelIface ? ` · ${vpn.tunnelIface}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </Panel>
  );
}
