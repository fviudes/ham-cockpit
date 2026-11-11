import { useEffect, useState } from "react";
import { useConsole } from "./state";
import { Lcd, PanelTitle } from "./widgets";

type Qso = {
  mode: string;
  slot: number | null;
  src: "RF" | "Net";
  callsign: string;
  name: string;
  target: string;
  tgName: string;
  ber: string;
  rssi: string;
  loss: string;
};

type NextionSnap = {
  page: "idle" | "dmr" | "dstar" | "ysf" | "p25" | "nxdn" | "m17" | "pocsag";
  status: string;
  callsign: string;
  dmrId: string;
  ip: string;
  location: string;
  rxHz: number;
  txHz: number;
  cpuTempC: number | null;
  diskFreePct: number | null;
  duplex: boolean;
  qso: Qso[];
};

type MmdvmApi = {
  hostRunning?: boolean;
  nextionRunning?: boolean;
  callsign?: string;
  dmrId?: string;
  location?: string;
  rxHz?: number;
  txHz?: number;
  duplex?: boolean;
  nextion?: NextionSnap;
};

function fromApi(j: MmdvmApi): NextionSnap {
  if (j.nextion) return j.nextion;
  return {
    page: "idle",
    status: "MMDVM IDLE",
    callsign: j.callsign || "N0CALL",
    dmrId: j.dmrId || "",
    ip: "",
    location: j.location || "",
    rxHz: j.rxHz || 0,
    txHz: j.txHz || 0,
    cpuTempC: null,
    diskFreePct: null,
    duplex: Boolean(j.duplex),
    qso: [],
  };
}

function mhz(hz: number) {
  if (!hz) return "—";
  return `${(hz / 1_000_000).toFixed(4)}`;
}

function clockNow() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function rssiBars(rssi: string) {
  const m = rssi.match(/-?\d+/);
  if (!m) return 0;
  const dbm = Number(m[0]);
  if (!Number.isFinite(dbm)) return 0;
  const n = Math.round(((Math.min(-50, Math.max(-125, dbm)) + 125) / 75) * 12);
  return Math.max(0, Math.min(12, n));
}

function modeLabel(page: NextionSnap["page"], qso: Qso[]) {
  if (qso[0]) {
    const m = qso[0].mode.replace(/\s+Slot\s+\d/i, "").trim();
    return m || "DMR";
  }
  if (page === "idle") return "MMDVM";
  return page.toUpperCase();
}

export function NextionViz() {
  const { tx } = useConsole();
  const [clock, setClock] = useState(clockNow);
  const [hostOn, setHostOn] = useState(false);
  const [nxOn, setNxOn] = useState(false);
  const [lcd, setLcd] = useState<NextionSnap | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setClock(clockNow()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    const pull = () =>
      fetch("/api/mmdvm")
        .then((r) => r.json() as Promise<MmdvmApi>)
        .then((j) => {
          if (!live) return;
          setHostOn(Boolean(j.hostRunning));
          setNxOn(Boolean(j.nextionRunning));
          setLcd(fromApi(j));
        })
        .catch(() => undefined);
    void pull();
    const id = window.setInterval(() => void pull(), 3000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const qso = lcd?.qso ?? [];
  const liveQso = qso.length > 0;
  const page = lcd?.page ?? "idle";
  const call = (lcd?.callsign || "N0CALL").toUpperCase();
  const id = lcd?.dmrId || "—";
  const ip = lcd?.ip || tx("nextionNoIp");
  const dim = !hostOn;
  const rxOn = liveQso && qso.some((q) => q.src === "Net");
  const txOn = liveQso && qso.some((q) => q.src === "RF");
  const mode = modeLabel(page, qso);
  const bars = rssiBars(qso[0]?.rssi ?? "");

  return (
    <div>
      <PanelTitle>{tx("panelNextion")}</PanelTitle>
      <Lcd>
        <div className={dim ? "opacity-70" : ""}>
          <div className="mb-2 flex items-center justify-between border-b border-[#0c2236] pb-2">
            <span className="text-[10px] font-semibold tracking-[0.22em] text-[#4fc3f7]">NEXTION</span>
            <span className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${rxOn ? "bg-[#4fc3f7] shadow-[0_0_8px_#4fc3f7]" : "bg-[#1c2a32]"}`} />
              <span className="text-[9px] tracking-wide text-[#8ea0b3]">{tx("rx")}</span>
              <span className={`size-1.5 rounded-full ${hostOn ? "bg-[#4fc3f7] shadow-[0_0_8px_#4fc3f7]" : "bg-[#1c2a32]"}`} />
              <span className="text-[9px] tracking-wide text-[#8ea0b3]">{mode}</span>
              <span className={`size-1.5 rounded-full ${txOn ? "bg-[#ffb300] shadow-[0_0_8px_#ffb300]" : "bg-[#1c2a32]"}`} />
              <span className="text-[9px] tracking-wide text-[#8ea0b3]">{tx("tx")}</span>
            </span>
          </div>

          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-2xl font-semibold leading-none tracking-wide text-[#ffb300]">{call}</p>
            <p className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">{clock}</p>
          </div>
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="text-[#4fc3f7]">ID {id}</span>
            <span className="text-[#8ea0b3]">{ip}</span>
          </div>

          {!liveQso ? (
            <>
              <div className="mb-2 grid grid-cols-2 gap-2 border-t border-[#0c2236] pt-2">
                <div>
                  <p className="text-[9px] tracking-wide text-[#5d7184]">RX</p>
                  <p className="text-sm text-[#e8eef4]">{mhz(lcd?.rxHz ?? 0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] tracking-wide text-[#5d7184]">TX</p>
                  <p className="text-sm text-[#e8eef4]">{mhz(lcd?.txHz ?? 0)}</p>
                </div>
              </div>
              <p className="truncate text-[11px] text-[#8ea0b3]">{lcd?.location || " "}</p>
              <p className="mt-1 text-sm font-semibold tracking-[0.18em] text-[#4fc3f7]">{tx("nextionIdle")}</p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-[#5d7184]">
                <span>{lcd?.cpuTempC != null ? `${lcd.cpuTempC.toFixed(1)} °C` : " "}</span>
                <span>{lcd?.diskFreePct != null ? `${lcd.diskFreePct}%` : ""}</span>
                <span className={nxOn ? "text-[#34d399]" : "text-[#5d7184]"}>
                  {nxOn ? tx("mmdvmNextion") : hostOn ? tx("nextionDriverOff") : tx("nextionHostOff")}
                </span>
              </div>
            </>
          ) : (
            <div className="border-t border-[#0c2236] pt-2">
              {qso.map((q, i) => (
                <div key={`${q.slot}-${q.callsign}-${i}`} className={i > 0 ? "mt-2 border-t border-[#0c2236] pt-2" : ""}>
                  <p className="text-sm font-semibold text-[#ffb300]">
                    {q.slot ?? i + 1} {q.src === "RF" ? "RF" : "net"} {q.callsign}
                  </p>
                  <p className="text-[12px] text-[#4fc3f7]">{q.target || " "}</p>
                  {q.name ? <p className="truncate text-[12px] text-[#e8eef4]">{q.name}</p> : null}
                  {q.tgName ? <p className="truncate text-[11px] text-[#8ea0b3]">{q.tgName}</p> : null}
                  <div className="mt-1 flex justify-between text-[10px] text-[#8ea0b3]">
                    <span>
                      {tx("nextionBer")} {q.ber || "—"}
                    </span>
                    <span>
                      {tx("nextionRssi")} {q.rssi || "—"}
                    </span>
                  </div>
                </div>
              ))}
              <div className="mt-2 flex h-2 gap-px">
                {Array.from({ length: 12 }, (_, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-sm ${
                      i < bars ? (i > 9 ? "bg-[#f87171]" : i > 7 ? "bg-[#ffb300]" : "bg-[#34d399]") : "bg-[#1c2a32]"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Lcd>
    </div>
  );
}
