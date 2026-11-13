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
  /** Só no dev, com ?vpnPreview=1. O build de produção elimina este ramo. */
  example?: boolean;
};

type Metric = "pingMs" | "rxBps" | "txBps";

type VpnSample = {
  t: number;
  pingMs?: number;
  rxBps?: number;
  txBps?: number;
};

const WINDOW_MS = 120_000;
const POLL_MS = 3_000;

function finite(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

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

function fmtRateTick(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MiB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KiB`;
  return `${Math.round(n)} B`;
}

function fmtMsTick(n: number): string {
  const text = n >= 10 ? String(Math.round(n)) : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return text;
}

function trimWindow(rows: VpnSample[], now: number): VpnSample[] {
  const cutoff = now - WINDOW_MS;
  return rows.filter((row) => row.t >= cutoff);
}

function pushSample(rows: VpnSample[], body: VpnStatus, now: number): VpnSample[] {
  const kept = trimWindow(rows, now);
  if (body.state !== "on") return [];
  const point: VpnSample = { t: now };
  if (finite(body.pingMs)) point.pingMs = body.pingMs;
  if (finite(body.rxBps)) point.rxBps = body.rxBps;
  if (finite(body.txBps)) point.txBps = body.txBps;
  if (point.pingMs === undefined && point.rxBps === undefined && point.txBps === undefined) return kept;
  return [...kept, point];
}

function latest(rows: VpnSample[], key: Metric): number | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (finite(v)) return v;
  }
  return undefined;
}

function devPreviewOn(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("vpnPreview") === "1";
}

function demoPoint(t: number): VpnSample {
  const step = t / POLL_MS;
  return {
    t,
    pingMs: Math.round((28 + Math.sin(step / 3) * 7 + Math.sin(step / 7) * 3) * 10) / 10,
    rxBps: Math.round(22000 + Math.sin(step / 2.2) * 14000 + Math.cos(step / 5) * 3000),
    txBps: Math.round(6000 + Math.cos(step / 2.6) * 3500),
  };
}

function demoHistory(now: number): VpnSample[] {
  const rows: VpnSample[] = [];
  for (let i = 0; i < WINDOW_MS / POLL_MS; i++) rows.push(demoPoint(now - WINDOW_MS + i * POLL_MS));
  rows.push(demoPoint(now));
  return rows;
}

function demoStatus(now: number): VpnStatus {
  const point = demoPoint(now);
  const sec = Math.floor(now / 1000);
  return {
    ok: true,
    state: "on",
    enabled: true,
    originalIp: "192.168.1.40",
    tunnelIface: "tun0",
    tunnelIp: "10.8.0.14",
    pingMs: point.pingMs,
    rxBps: point.rxBps,
    txBps: point.txBps,
    rxBytes: 5_000_000 + sec * 20_000,
    txBytes: 1_200_000 + sec * 6_000,
    example: true,
  };
}

/** No dev, ?vpnPreview=1 mostra o túnel ligado sem medir. Some no build de produção. */
function withPreview(status: number, body: VpnStatus): VpnStatus {
  if (!import.meta.env.DEV || status === 401 || body.state === "on" || !devPreviewOn()) return body;
  return demoStatus(Date.now());
}

async function readVpn(): Promise<{ status: number; body: VpnStatus }> {
  const r = await fetch("/api/support/vpn", { credentials: "same-origin" });
  const body = (await r.json()) as VpnStatus;
  return { status: r.status, body };
}

function InfoCard({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[#101c28] px-3 py-2">
      <p className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{k}</p>
      <p className="mt-0.5 break-all font-['IBM_Plex_Mono'] text-sm text-[#4fc3f7]">{v || "—"}</p>
    </div>
  );
}

function TraceSvg({
  rows,
  metric,
  color,
  tickFmt,
}: {
  rows: VpnSample[];
  metric: Metric;
  color: string;
  tickFmt: (n: number) => string;
}) {
  const w = 480;
  const h = 96;
  const padL = 2;
  const padR = 46;
  const padT = 10;
  const padB = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const now = rows.length ? rows[rows.length - 1].t : Date.now();
  const start = now - WINDOW_MS;
  const points: Array<{ t: number; v: number }> = [];
  for (const row of rows) {
    const v = row[metric];
    if (!finite(v) || row.t < start) continue;
    points.push({ t: row.t, v });
  }
  let cap = 1;
  for (const point of points) if (point.v > cap) cap = point.v;
  cap = points.length && cap > 0 ? cap * 1.12 : 1;
  const yOf = (v: number) => padT + innerH - (Math.min(Math.max(v, 0), cap) / cap) * innerH;
  const xOf = (t: number) => padL + (Math.min(Math.max(t, start), now) - start) / WINDOW_MS * innerW;
  let d = "";
  let started = false;
  let lastT = 0;
  if (points.length === 1) {
    const x = xOf(points[0].t);
    const y = yOf(points[0].v);
    d = `M ${Math.max(padL, x - 4)} ${y} L ${Math.min(padL + innerW, x + 4)} ${y}`;
  } else {
    for (const point of points) {
      const gap = started && point.t - lastT > POLL_MS * 2.5;
      d += `${!started || gap ? "M" : "L"} ${xOf(point.t)} ${yOf(point.v)} `;
      started = true;
      lastT = point.t;
    }
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * cap);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-24 w-full" preserveAspectRatio="none" role="img">
      {ticks.map((tick, index) => {
        const y = yOf(tick);
        return (
          <g key={index}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="rgba(79,195,247,0.18)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={w - 3}
              y={y + 3}
              textAnchor="end"
              fill="#8ea0b3"
              fontSize="11"
              fontFamily="IBM Plex Mono, ui-monospace, monospace"
            >
              {tickFmt(tick)}
            </text>
          </g>
        );
      })}
      {d ? (
        <path
          d={d.trim()}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

function MetricChart({
  title,
  value,
  rows,
  metric,
  color,
  tickFmt,
  waiting,
  testId,
}: {
  title: string;
  value: string;
  rows: VpnSample[];
  metric: Metric;
  color: string;
  tickFmt: (n: number) => string;
  waiting: string;
  testId: string;
}) {
  const measured = rows.some((row) => finite(row[metric]));
  return (
    <div className="overflow-hidden rounded-lg border border-[rgba(79,195,247,0.14)] bg-[#101c28]" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 px-3 pt-3">
        <p className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{title}</p>
        <p className="font-['IBM_Plex_Mono'] text-sm text-[#e8eef4]">{value}</p>
      </div>
      {measured ? (
        <TraceSvg rows={rows} metric={metric} color={color} tickFmt={tickFmt} />
      ) : (
        <p className="px-3 py-6 text-[11px] text-[#5d7184]">{waiting}</p>
      )}
    </div>
  );
}

export function SupportVpnPage() {
  const { tx } = useConsole();
  const [vpn, setVpn] = useState<VpnStatus>({ state: "off" });
  const [history, setHistory] = useState<VpnSample[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const holdError = useRef(false);
  const historyRef = useRef<VpnSample[]>([]);
  const phase: VpnPhase = vpn.state || "off";
  const connecting = phase === "connecting" || busy;

  const remember = (shown: VpnStatus) => {
    if (shown.state !== "on") {
      historyRef.current = [];
      setHistory([]);
      return;
    }
    if (import.meta.env.DEV && shown.example) {
      const rows = demoHistory(Date.now());
      historyRef.current = rows;
      setHistory(rows);
      return;
    }
    const rows = pushSample(historyRef.current, shown, Date.now());
    historyRef.current = rows;
    setHistory(rows);
  };

  const apply = (status: number, body: VpnStatus, fromUserOff = false) => {
    if (status === 401) {
      holdError.current = true;
      const denied: VpnStatus = { state: "error", error: tx("supportAuth") };
      setVpn(denied);
      remember(denied);
      return;
    }
    if (fromUserOff) holdError.current = false;
    if (body.state === "error") holdError.current = true;
    if (body.state === "on" || body.state === "connecting") holdError.current = false;
    if (body.state === "off" && holdError.current) return;
    const shown = withPreview(status, body.state ? body : { state: "error", error: body.error || tx("supportFail") });
    setVpn(shown);
    remember(shown);
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
            const failed: VpnStatus = { state: "error", error: tx("supportFail") };
            setVpn(failed);
            remember(failed);
          }
        });
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
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
      const failed: VpnStatus = { state: "error", error: tx("supportFail") };
      setVpn(failed);
      remember(failed);
      toast.error(tx("supportFail"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const showStats = phase === "on";
  const ping = latest(history, "pingMs");
  const rx = latest(history, "rxBps");
  const txRate = latest(history, "txBps");

  return (
    <Panel>
      <PanelTitle>{tx("supportTitle")}</PanelTitle>
      <div className={showStats ? "grid items-start gap-6 md:grid-cols-2" : undefined}>
        <div className="min-w-0">
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
        </div>
        {showStats ? (
          <div className="min-w-0 space-y-3" data-testid="support-vpn-side">
            {vpn.example ? <p className="text-xs leading-relaxed text-[#ffb300]">{tx("supportPreview")}</p> : null}
            <div className="grid grid-cols-2 gap-2" data-testid="support-vpn-cards">
              <InfoCard k={tx("supportOriginalCard")} v={vpn.originalIp || "—"} />
              <InfoCard k={tx("supportTunnelCard")} v={vpn.tunnelIp || "—"} />
              <InfoCard k={tx("supportIface")} v={vpn.tunnelIface || "—"} />
              <InfoCard k={tx("supportState")} v={tx("supportOn")} />
            </div>
            <p className="text-[10px] tracking-wide text-[#8ea0b3] uppercase">{tx("supportWindow")}</p>
            <MetricChart
              title={tx("supportLatency")}
              value={ping === undefined ? "—" : `${ping.toLocaleString("pt-BR")} ms`}
              rows={history}
              metric="pingMs"
              color="#f87171"
              tickFmt={fmtMsTick}
              waiting={tx("supportWait")}
              testId="support-vpn-latency"
            />
            <MetricChart
              title={tx("supportDown")}
              value={rx === undefined ? "—" : fmtRate(rx)}
              rows={history}
              metric="rxBps"
              color="#ffb300"
              tickFmt={fmtRateTick}
              waiting={tx("supportWait")}
              testId="support-vpn-rx"
            />
            <MetricChart
              title={tx("supportUp")}
              value={txRate === undefined ? "—" : fmtRate(txRate)}
              rows={history}
              metric="txBps"
              color="#60a5fa"
              tickFmt={fmtRateTick}
              waiting={tx("supportWait")}
              testId="support-vpn-tx"
            />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
