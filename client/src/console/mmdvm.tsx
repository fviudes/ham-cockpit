import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConsole } from "./state";
import { Chip, ConsoleInput, ConsoleSelect, Field, GhostBtn, Lcd, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

const MODES = [
  { id: "dmr", label: "DMR" },
  { id: "dstar", label: "D-Star" },
  { id: "ysf", label: "YSF" },
  { id: "p25", label: "P25" },
  { id: "nxdn", label: "NXDN" },
  { id: "m17", label: "M17" },
  { id: "pocsag", label: "POCSAG" },
] as const;

type ModeId = (typeof MODES)[number]["id"];

type Network = {
  id: "bm" | "dmrplus" | "tgif" | "xlx";
  section: string;
  name: string;
  enabled: boolean;
  address: string;
  port: number;
  password: string;
};

type Heard = {
  timeUtc: string;
  mode: string;
  callsign: string;
  target: string;
  src: "RF" | "Net";
  duration: string;
  loss: string;
  ber: string;
  rssi?: string;
};

type MmdvmApi = {
  ok: boolean;
  installed: boolean;
  appliance?: boolean;
  hostRunning: boolean;
  gatewayRunning: boolean;
  ysfRunning: boolean;
  dstarRunning: boolean;
  nextionRunning: boolean;
  hostBinary: string;
  gatewayBinary: string;
  ysfBinary: string;
  dstarBinary: string;
  nextionBinary: string;
  hostIni: string;
  gatewayIni: string;
  ysfIni: string;
  dstarIni: string;
  logDir: string;
  callsign: string;
  dmrId: string;
  duplex: boolean;
  rxHz: number;
  txHz: number;
  colorCode: number;
  latitude: string;
  longitude: string;
  location: string;
  modemBoard: string;
  modemPort: string;
  uartSpeed: number;
  remotePort: number;
  dstarReflector: string;
  dstarModule: string;
  ysfStartup: string;
  displayType: "None" | "Nextion" | "OLED";
  displayPort: string;
  screenLayout: number;
  brightness: number;
  idleBrightness: number;
  nextionDriver: boolean;
  oledType: number;
  modes: Record<ModeId, boolean>;
  networks: Network[];
  paused: Record<ModeId, boolean>;
  tx: boolean;
  currentMode: string;
  lastHeard: Heard[];
  error: string;
};

const CORE_MODES: ModeId[] = ["dmr", "dstar", "ysf"];
const LATER_MODES: ModeId[] = ["p25", "nxdn", "m17", "pocsag"];

/** Presets WPSD/Pi-Star (Hardware=) — espelha server/mmdvm.ts. */
const BOARD_PRESETS = [
  { id: "custom", label: "Personalizado (porta/baud manuais)", port: "", uartSpeed: 0, duplex: null as boolean | null },
  { id: "mmdvmhshat", label: "MMDVM_HS_Hat (DB9MAT & DF2ET) GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false },
  // WPSD Hardware=mmdvmhsdualhatgpio — Duplex ADF7021 @ 115200 / ttyAMA0 (não confundir com cartão dvmpis/ttyACM0).
  { id: "mmdvmhsdualhatgpio", label: "MMDVM HS Dual (v1.3 / HAT)", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: true },
  { id: "mmdvmhsdualbandgpio", label: "MMDVM_HS_Dual_Band GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false },
  { id: "zumspotgpio", label: "ZUMspot HAT simplex GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false },
  { id: "zumspotduplexgpio", label: "ZUMspot HAT duplex GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: true },
  { id: "zumspotusb", label: "ZUMspot USB Stick", port: "/dev/ttyACM0", uartSpeed: 115200, duplex: false },
  { id: "zumspotlibre", label: "ZUMspot Libre (USB)", port: "/dev/ttyACM0", uartSpeed: 115200, duplex: false },
  { id: "dvmpis", label: "DVMEGA / STM32-DVM Pi (dvmpis)", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false },
  { id: "stm32dvm", label: "STM32-DVM / MMDVM_HS HAT GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: null },
  { id: "stm32usb", label: "STM32-DVM (USB)", port: "/dev/ttyUSB0", uartSpeed: 115200, duplex: null },
  { id: "nanodv", label: "NanoDV / NanoPi AIR GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false },
  { id: "rptrbldrv3v4v5", label: "Repeater Builder v3/v4/v5 115200 GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false },
  { id: "rptrbldrv3v4v5hs", label: "Repeater Builder v3/v4/v5 460800 GPIO", port: "/dev/ttyAMA0", uartSpeed: 460800, duplex: false },
  { id: "opengd77", label: "OpenGD77 hotspot (USB)", port: "/dev/ttyACM0", uartSpeed: 115200, duplex: false },
] as const;

type SerialsApi = { devices?: { path: string; label: string }[] };

const emptyModes = (): Record<ModeId, boolean> => ({
  dmr: true,
  dstar: false,
  ysf: false,
  p25: false,
  nxdn: false,
  m17: false,
  pocsag: false,
});

const emptyPaused = (): Record<ModeId, boolean> => ({
  dmr: false,
  dstar: false,
  ysf: false,
  p25: false,
  nxdn: false,
  m17: false,
  pocsag: false,
});

function mhz(hz: number) {
  return (hz / 1_000_000).toFixed(4);
}

/** Callsign D-Star em 8 chars: 7 à esquerda + letra do módulo (B/C/G…). */
function dstarRpt(callsign: string, module: string) {
  const base = callsign.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  const mod = (module || "B").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1) || "B";
  return `${base.padEnd(7, " ")}${mod}`;
}

/** Aceita 433.475 ou 433,475 durante a digitação; não arredonda enquanto incompleto. */
function fromMhz(v: string, fallback: number) {
  const cleaned = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned || cleaned === "." || cleaned.endsWith(".")) return fallback;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 1_000_000);
}

function normalizeCallInput(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

async function callMmdvm(path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json()) as MmdvmApi & { error?: string };
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

export function MmdvmPage() {
  const { tx, pushLog, setS } = useConsole();
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<MmdvmApi | null>(null);
  const [serials, setSerials] = useState<string[]>([]);
  const [tg, setTg] = useState("91");
  const [slot, setSlot] = useState("2");
  /** Rascunho MHz enquanto o campo está em foco — evita toFixed a cada tecla. */
  const [rxDraft, setRxDraft] = useState<string | null>(null);
  const [txDraft, setTxDraft] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const syncSidebar = (j: MmdvmApi) => {
    setS((p) => ({
      ...p,
      mmdvm: {
        ...p.mmdvm,
        running: Boolean(j.hostRunning),
        gatewayRunning: Boolean(j.gatewayRunning),
        callsign: j.callsign || p.mmdvm.callsign,
        dmrId: j.dmrId || p.mmdvm.dmrId,
      },
    }));
  };

  /** Aplica estado completo do servidor (load inicial / após salvar). */
  const applyFull = (j: MmdvmApi) => {
    dirtyRef.current = false;
    setSt({
      ...j,
      paused: j.paused ?? emptyPaused(),
      modes: j.modes ?? emptyModes(),
      displayType: j.displayType ?? "Nextion",
      displayPort: j.displayPort ?? "modem",
      screenLayout: j.screenLayout ?? 2,
      brightness: j.brightness ?? 50,
      idleBrightness: j.idleBrightness ?? 20,
      nextionDriver: j.nextionDriver ?? true,
          oledType: j.oledType ?? 3,
          dstarReflector: j.dstarReflector ?? "",
          dstarModule: j.dstarModule ?? "B",
          ysfStartup: j.ysfStartup ?? "",
          modemBoard: j.modemBoard ?? "mmdvmhshat",
        });
        syncSidebar(j);
      };

  /** Poll: só telemetria — não apaga campos que o usuário está editando. */
  const applyLive = (j: MmdvmApi) => {
    syncSidebar(j);
    setSt((p) => {
      if (!p) {
        return {
          ...j,
          paused: j.paused ?? emptyPaused(),
          modes: j.modes ?? emptyModes(),
          displayType: j.displayType ?? "Nextion",
          displayPort: j.displayPort ?? "modem",
          screenLayout: j.screenLayout ?? 2,
          brightness: j.brightness ?? 50,
          idleBrightness: j.idleBrightness ?? 20,
          nextionDriver: j.nextionDriver ?? true,
          oledType: j.oledType ?? 3,
        };
      }
      if (dirtyRef.current) {
        return {
          ...p,
          appliance: j.appliance,
          hostRunning: j.hostRunning,
          gatewayRunning: j.gatewayRunning,
          ysfRunning: j.ysfRunning,
          dstarRunning: j.dstarRunning,
          nextionRunning: j.nextionRunning,
          hostBinary: j.hostBinary,
          gatewayBinary: j.gatewayBinary,
          ysfBinary: j.ysfBinary,
          dstarBinary: j.dstarBinary,
          nextionBinary: j.nextionBinary,
          lastHeard: j.lastHeard,
          tx: j.tx,
          currentMode: j.currentMode,
          error: j.error,
          paused: j.paused ?? p.paused,
        };
      }
      return {
        ...j,
        paused: j.paused ?? emptyPaused(),
        modes: j.modes ?? emptyModes(),
        displayType: j.displayType ?? "Nextion",
        displayPort: j.displayPort ?? "modem",
        screenLayout: j.screenLayout ?? 2,
        brightness: j.brightness ?? 50,
        idleBrightness: j.idleBrightness ?? 20,
        nextionDriver: j.nextionDriver ?? true,
        oledType: j.oledType ?? 3,
      };
    });
  };

  const pull = (full = false) =>
    callMmdvm("/api/mmdvm")
      .then((j) => (full || !dirtyRef.current ? applyFull(j) : applyLive(j)))
      .catch(() => undefined);

  useEffect(() => {
    void pull(true);
    void fetch("/api/serials")
      .then((r) => r.json() as Promise<SerialsApi>)
      .then((j) => {
        const paths = (j.devices ?? []).map((d) => d.path);
        setSerials(paths);
      })
      .catch(() => undefined);
    const id = window.setInterval(() => void pull(false), 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll while the tab is open
  }, []);

  const patch = (partial: Partial<MmdvmApi>) => {
    dirtyRef.current = true;
    setSt((p) => (p ? { ...p, ...partial } : p));
  };

  const save = async (restart = false) => {
    if (!st) return;
    setBusy(true);
    try {
      const callsign = normalizeCallInput(st.callsign || "");
      if (!callsign) {
        toast.error(tx("mmdvmCallsignBad"));
        return;
      }
      // Fecha rascunhos MHz antes de gravar.
      const rxHz = rxDraft != null ? fromMhz(rxDraft, st.rxHz) : st.rxHz;
      const txHz = txDraft != null ? fromMhz(txDraft, st.txHz) : st.txHz;
      setRxDraft(null);
      setTxDraft(null);
      const next = await callMmdvm("/api/mmdvm", "PUT", {
        callsign,
        dmrId: st.dmrId,
        duplex: st.duplex,
        rxHz,
        txHz,
        colorCode: st.colorCode,
        latitude: st.latitude,
        longitude: st.longitude,
        location: st.location,
        modemBoard: st.modemBoard,
        modemPort: st.modemPort,
        uartSpeed: st.uartSpeed,
        remotePort: st.remotePort,
        dstarReflector: st.dstarReflector,
        dstarModule: st.dstarModule,
        ysfStartup: st.ysfStartup,
        displayType: st.displayType,
        displayPort: st.displayPort,
        screenLayout: st.screenLayout,
        brightness: st.brightness,
        idleBrightness: st.idleBrightness,
        nextionDriver: st.nextionDriver,
        oledType: st.oledType,
        modes: st.modes,
        networks: st.networks,
      });
      if (next.error) {
        toast.error(next.error);
        return;
      }
      applyFull(next);
      if (restart) {
        const rst = await callMmdvm("/api/mmdvm/restart", "POST");
        if (rst.error) {
          toast.error(rst.error);
          applyFull(rst);
          return;
        }
        applyFull(rst);
        pushLog("MMDVM", `${callsign} · INI salvo · host+gateway reiniciados`);
        toast.success(tx("mmdvmRestarted"));
      } else {
        pushLog("MMDVM", `${callsign} · ${next.hostIni || st.hostIni}`);
        toast.success(tx("mmdvmSaved"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleModePause = async (mode: ModeId) => {
    setBusy(true);
    try {
      const paused = Boolean(st?.paused?.[mode]);
      const path = paused ? `/api/mmdvm/mode/${mode}/resume` : `/api/mmdvm/mode/${mode}/pause`;
      applyFull(await callMmdvm(path, "POST"));
      pushLog("MMDVM", `${mode} ${paused ? "resume" : "pause"}`);
      toast.success(paused ? tx("mmdvmResume") : tx("mmdvmPause"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleNetworkLive = async (n: Network) => {
    setBusy(true);
    try {
      applyFull(
        await callMmdvm("/api/mmdvm/network", "POST", {
          id: n.id,
          enabled: !n.enabled,
        }),
      );
      pushLog("MMDVM", `${n.name} ${!n.enabled ? "on" : "off"}`);
      toast.success(tx("mmdvmNetToggled"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const modes = st?.modes ?? emptyModes();
  const paused = st?.paused ?? emptyPaused();
  const nets = st?.networks ?? [];
  const heard = st?.lastHeard ?? [];
  const mhzRx = rxDraft ?? mhz(st?.rxHz ?? 433_475_000);
  const mhzTx = txDraft ?? mhz(st?.txHz ?? 433_475_000);
  const ports = Array.from(new Set(["/dev/ttyAMA0", "/dev/ttyUSB0", "/dev/ttyACM0", st?.modemPort ?? "", ...serials].filter(Boolean)));
  const anyPaused = MODES.some((m) => paused[m.id]);

  return (
    <div>
      <PageHead kicker={tx("mmdvm")} title={tx("mmdvmTitle")} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("mmdvmHelp")}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Tile label={tx("mmdvmHost")} value={st?.hostRunning ? tx("svcRunning") : tx("svcStopped")} on={Boolean(st?.hostRunning)} />
        <Tile label={tx("mmdvmGateway")} value={st?.gatewayRunning ? tx("svcRunning") : tx("svcStopped")} on={Boolean(st?.gatewayRunning)} />
        <Tile label={tx("mmdvmYsfGw")} value={st?.ysfRunning ? tx("svcRunning") : tx("svcStopped")} on={Boolean(st?.ysfRunning)} />
        <Tile label={tx("mmdvmDstarGw")} value={st?.dstarRunning ? tx("svcRunning") : tx("svcStopped")} on={Boolean(st?.dstarRunning)} />
        <Tile label={tx("mmdvmNextion")} value={st?.nextionRunning ? tx("svcRunning") : tx("svcStopped")} on={Boolean(st?.nextionRunning)} />
        <Tile label={tx("mmdvmModem")} value={st?.modemPort || "—"} on={Boolean(st?.hostRunning)} />
        <Tile label={tx("mmdvmDisplayType")} value={st?.displayType || "None"} on={st?.displayType !== "None"} />
        <Tile
          label={st?.tx ? tx("tx") : tx("rx")}
          value={st?.currentMode || (st?.duplex ? tx("mmdvmDuplex") : tx("mmdvmSimplex"))}
          on={Boolean(st?.hostRunning)}
          amber={Boolean(st?.tx)}
        />
      </div>

      {st && !st.hostBinary ? (
        <p className="mt-4 text-sm text-[#fbbf24]">{tx(st.appliance ? "mmdvmNoHost" : "mmdvmNoHostDev")}</p>
      ) : null}
      {st?.error && st.hostBinary ? <p className="mt-4 text-sm text-[#f87171]">{st.error}</p> : null}

      <Panel className="mt-4">
        <PanelTitle>{tx("mmdvmModes")}</PanelTitle>
        <div className="flex flex-wrap gap-2">
          {MODES.filter((m) => CORE_MODES.includes(m.id)).map((m) => (
            <Chip
              key={m.id}
              active={modes[m.id]}
              tone={m.id === "dmr" ? "amber" : "cyan"}
              onClick={() => patch({ modes: { ...modes, [m.id]: !modes[m.id] } })}
            >
              {m.label}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 opacity-45">
          {MODES.filter((m) => LATER_MODES.includes(m.id)).map((m) => (
            <Chip key={m.id} active={false} tone="cyan">
              {m.label}
            </Chip>
          ))}
        </div>
        <p className="mt-3 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">{tx("mmdvmModesHint")}</p>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("mmdvmDisplay")}</PanelTitle>
        <p className="mb-3 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("mmdvmDisplayHint")}</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label={tx("mmdvmDisplayType")}>
            <ConsoleSelect
              value={st?.displayType ?? "Nextion"}
              onChange={(e) =>
                patch({
                  displayType: e.target.value as "None" | "Nextion" | "OLED",
                  nextionDriver: e.target.value === "Nextion" ? true : st?.nextionDriver,
                })
              }
            >
              <option value="Nextion">Nextion (LCD HAT)</option>
              <option value="OLED">OLED (I2C)</option>
              <option value="None">None</option>
            </ConsoleSelect>
          </Field>
          <Field label={tx("mmdvmDisplayPort")}>
            <ConsoleSelect
              value={st?.displayPort ?? "modem"}
              onChange={(e) => patch({ displayPort: e.target.value })}
            >
              <option value="modem">modem (header do HAT)</option>
              <option value="/dev/ttyNextionDriver">/dev/ttyNextionDriver</option>
              <option value="/dev/ttyUSB0">/dev/ttyUSB0</option>
              <option value="/dev/ttyUSB1">/dev/ttyUSB1</option>
              <option value="/dev/ttyAMA0">/dev/ttyAMA0</option>
            </ConsoleSelect>
          </Field>
          <Field label={tx("mmdvmScreenLayout")}>
            <ConsoleSelect
              value={String(st?.screenLayout ?? 2)}
              disabled={st?.displayType !== "Nextion"}
              onChange={(e) => patch({ screenLayout: Number(e.target.value) })}
            >
              <option value="0">0 — G4KLX</option>
              <option value="2">2 — ON7LDS high speed</option>
              <option value="3">3 — ON7LDS</option>
              <option value="4">4 — ON7LDS DB</option>
            </ConsoleSelect>
          </Field>
          <Field label={tx("mmdvmBrightness")}>
            <ConsoleInput
              type="number"
              min={0}
              max={100}
              value={st?.brightness ?? 50}
              disabled={st?.displayType !== "Nextion"}
              onChange={(e) => patch({ brightness: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label={tx("mmdvmIdleBrightness")}>
            <ConsoleInput
              type="number"
              min={0}
              max={100}
              value={st?.idleBrightness ?? 20}
              disabled={st?.displayType !== "Nextion"}
              onChange={(e) => patch({ idleBrightness: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label={tx("mmdvmOledType")}>
            <ConsoleSelect
              value={String(st?.oledType ?? 3)}
              disabled={st?.displayType !== "OLED"}
              onChange={(e) => patch({ oledType: Number(e.target.value) })}
            >
              <option value="3">3 — SSD1306 0.96"</option>
              <option value="5">5 — SSD1306 1.3"</option>
              <option value="6">6 — SH1106 1.3"</option>
            </ConsoleSelect>
          </Field>
          <Field label={tx("mmdvmNextionDriver")}>
            <ConsoleSelect
              value={st?.nextionDriver ? "1" : "0"}
              disabled={st?.displayType !== "Nextion"}
              onChange={(e) => patch({ nextionDriver: e.target.value === "1" })}
            >
              <option value="1">Enable (WPSD / ON7LDS)</option>
              <option value="0">Disable</option>
            </ConsoleSelect>
          </Field>
        </div>
        {st?.displayType === "Nextion" && !st.nextionBinary ? (
          <p className="mt-3 text-sm text-[#fbbf24]">{tx(st.appliance ? "mmdvmNoNextion" : "mmdvmNoNextionDev")}</p>
        ) : null}
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("mmdvmImm")}</PanelTitle>
        <p className="mb-3 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("mmdvmImmHint")}</p>
        <div className="flex flex-wrap gap-2">
          {MODES.filter((m) => modes[m.id] || paused[m.id]).map((m) => (
            <GhostBtn key={m.id} disabled={busy} onClick={() => void toggleModePause(m.id)}>
              {m.label}: {paused[m.id] ? tx("mmdvmResume") : tx("mmdvmPause")}
              {paused[m.id] ? ` · ${tx("mmdvmPaused")}` : ""}
            </GhostBtn>
          ))}
          {anyPaused ? (
            <PrimaryBtn
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  applyFull(await callMmdvm("/api/mmdvm/modes/resume-all", "POST"));
                  toast.success(tx("mmdvmResumeAll"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tx("mmdvmResumeAll")}
            </PrimaryBtn>
          ) : null}
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("station")}</PanelTitle>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label={tx("mmdvmCallsign")}>
            <ConsoleInput
              value={st?.callsign ?? ""}
              maxLength={8}
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => patch({ callsign: normalizeCallInput(e.target.value) })}
            />
          </Field>
          <Field label={tx("mmdvmId")}>
            <ConsoleInput value={st?.dmrId ?? ""} onChange={(e) => patch({ dmrId: e.target.value.replace(/\D/g, "").slice(0, 9) })} />
          </Field>
          <Field label={tx("mmdvmColor")}>
            <ConsoleInput
              type="number"
              min={0}
              max={15}
              value={st?.colorCode ?? 1}
              onChange={(e) => patch({ colorCode: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label={`${tx("mmdvmRx")} (MHz)`}>
            <ConsoleInput
              inputMode="decimal"
              value={mhzRx}
              onFocus={() => setRxDraft(mhz(st?.rxHz ?? 433_475_000))}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, "");
                setRxDraft(raw);
                dirtyRef.current = true;
                const hz = fromMhz(raw, st?.rxHz ?? 433_475_000);
                if (raw.trim() && !raw.endsWith(".") && !raw.endsWith(",")) {
                  setSt((p) => (p ? { ...p, rxHz: hz } : p));
                }
              }}
              onBlur={() => {
                const hz = fromMhz(rxDraft ?? "", st?.rxHz ?? 433_475_000);
                patch({ rxHz: hz });
                setRxDraft(null);
              }}
            />
          </Field>
          <Field label={`${tx("mmdvmTx")} (MHz)`}>
            <ConsoleInput
              inputMode="decimal"
              value={mhzTx}
              onFocus={() => setTxDraft(mhz(st?.txHz ?? 433_475_000))}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.,]/g, "");
                setTxDraft(raw);
                dirtyRef.current = true;
                const hz = fromMhz(raw, st?.txHz ?? 433_475_000);
                if (raw.trim() && !raw.endsWith(".") && !raw.endsWith(",")) {
                  setSt((p) => (p ? { ...p, txHz: hz } : p));
                }
              }}
              onBlur={() => {
                const hz = fromMhz(txDraft ?? "", st?.txHz ?? 433_475_000);
                patch({ txHz: hz });
                setTxDraft(null);
              }}
            />
          </Field>
          <Field label={tx("mmdvmDuplex")}>
            <ConsoleSelect
              value={st?.duplex ? "1" : "0"}
              onChange={(e) => {
                const duplex = e.target.value === "1";
                // Simplex: sugere TX=RX, mas o campo TX continua editável.
                patch({ duplex, txHz: duplex ? st?.txHz ?? st?.rxHz ?? 433_475_000 : st?.rxHz ?? 433_475_000 });
                setTxDraft(null);
              }}
            >
              <option value="0">{tx("mmdvmSimplex")}</option>
              <option value="1">{tx("mmdvmDuplex")}</option>
            </ConsoleSelect>
          </Field>
          <Field label={tx("mmdvmBoard")}>
            <ConsoleSelect
              value={st?.modemBoard ?? "mmdvmhshat"}
              onChange={(e) => {
                const id = e.target.value;
                const preset = BOARD_PRESETS.find((p) => p.id === id);
                if (!preset || preset.id === "custom") {
                  patch({ modemBoard: "custom" });
                  return;
                }
                patch({
                  modemBoard: preset.id,
                  modemPort: preset.port,
                  uartSpeed: preset.uartSpeed,
                  duplex: preset.duplex === null ? st?.duplex : preset.duplex,
                  txHz: preset.duplex === false ? st?.rxHz ?? 433_475_000 : st?.txHz ?? st?.rxHz ?? 433_475_000,
                });
              }}
            >
              {BOARD_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <p className="md:col-span-2 lg:col-span-3 -mt-2 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">{tx("mmdvmBoardHint")}</p>
          <Field label={tx("mmdvmPort")}>
            <ConsoleSelect
              value={st?.modemPort ?? "/dev/ttyAMA0"}
              disabled={(st?.modemBoard ?? "mmdvmhshat") !== "custom"}
              onChange={(e) => patch({ modemPort: e.target.value, modemBoard: "custom" })}
            >
              {ports.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <Field label={tx("mmdvmSpeed")}>
            <ConsoleSelect
              value={String(st?.uartSpeed ?? 115200)}
              disabled={(st?.modemBoard ?? "mmdvmhshat") !== "custom"}
              onChange={(e) => patch({ uartSpeed: Number(e.target.value), modemBoard: "custom" })}
            >
              {[9600, 38400, 57600, 115200, 230400, 460800].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <Field label={tx("mmdvmLocation")}>
            <ConsoleInput value={st?.location ?? ""} onChange={(e) => patch({ location: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn disabled={busy} onClick={() => void save(false)}>
            {tx("save")}
          </PrimaryBtn>
          <PrimaryBtn disabled={busy} onClick={() => void save(true)}>
            {tx("mmdvmRestart")}
          </PrimaryBtn>
          <GhostBtn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                applyFull(await callMmdvm("/api/mmdvm/up", "POST"));
                pushLog("MMDVM", "mmdvmhost + dmrgateway start");
                toast.success(tx("mmdvmStarted"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("startService")}
          </GhostBtn>
          <GhostBtn
            danger
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                applyFull(await callMmdvm("/api/mmdvm/down", "POST"));
                pushLog("MMDVM", "mmdvmhost + dmrgateway stop");
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("stopService")}
          </GhostBtn>
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("mmdvmYsfMgr")}</PanelTitle>
        <p className="mb-3 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("mmdvmYsfHint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={tx("mmdvmYsfStartup")}>
            <ConsoleInput
              value={st?.ysfStartup ?? ""}
              placeholder="FCS00120"
              onChange={(e) => patch({ ysfStartup: e.target.value })}
            />
          </Field>
          <GhostBtn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                applyFull(await callMmdvm("/api/mmdvm/link", "POST", { mode: "ysf", target: st?.ysfStartup || "" }));
                toast.success(tx("mmdvmLinked"));
                pushLog("MMDVM", `YSF startup ${st?.ysfStartup || "(clear)"}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("mmdvmLinkNow")}
          </GhostBtn>
          <GhostBtn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                patch({ ysfStartup: "" });
                applyFull(await callMmdvm("/api/mmdvm/link", "POST", { mode: "ysf", target: "" }));
                toast.success(tx("mmdvmUnlink"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("mmdvmUnlink")}
          </GhostBtn>
        </div>
        <p className="mt-2 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">
          {st?.ysfIni || "/opt/ham-cockpit/mmdvm/ysfgateway.ini"}
          {st && !st.ysfBinary ? ` · ${tx(st.appliance ? "mmdvmNoYsf" : "mmdvmNoYsfDev")}` : ""}
        </p>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("mmdvmDstarMgr")}</PanelTitle>
        <p className="mb-3 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("mmdvmDstarHint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={tx("mmdvmDstarRef")}>
            <ConsoleInput
              value={st?.dstarReflector ?? ""}
              placeholder="REF001"
              maxLength={8}
              onChange={(e) => patch({ dstarReflector: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label={tx("mmdvmDstarMod")}>
            <ConsoleSelect
              value={st?.dstarModule || "B"}
              onChange={(e) => patch({ dstarModule: e.target.value })}
            >
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <GhostBtn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                applyFull(
                  await callMmdvm("/api/mmdvm/link", "POST", {
                    mode: "dstar",
                    target: st?.dstarReflector || "",
                    module: st?.dstarModule || "B",
                  }),
                );
                toast.success(tx("mmdvmLinked"));
                pushLog("MMDVM", `D-Star ${st?.dstarReflector || "(clear)"} ${st?.dstarModule || "B"}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("mmdvmLinkNow")}
          </GhostBtn>
          <GhostBtn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                patch({ dstarReflector: "" });
                applyFull(await callMmdvm("/api/mmdvm/link", "POST", { mode: "dstar", target: "", module: st?.dstarModule || "B" }));
                toast.success(tx("mmdvmUnlink"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("mmdvmUnlink")}
          </GhostBtn>
        </div>
        <p className="mt-2 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">
          {(() => {
            const call = (st?.callsign || "N0CALL").toUpperCase();
            const mod = (st?.dstarModule || "B").toUpperCase().slice(0, 1);
            const ref = (st?.dstarReflector || "REF000").toUpperCase().slice(0, 6);
            return tx("mmdvmDstarRadio")
              .replace("{rpt1}", dstarRpt(call, mod))
              .replace("{rpt2}", dstarRpt(call, "G"))
              .replace("{ref}", ref.padEnd(6, " "))
              .replace("{mod}", mod);
          })()}
        </p>
        <p className="mt-1 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">
          {st?.dstarIni || "/opt/ham-cockpit/mmdvm/ircddbgateway.conf"}
          {st && !st.dstarBinary ? ` · ${tx(st.appliance ? "mmdvmNoDstar" : "mmdvmNoDstarDev")}` : ""}
        </p>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("mmdvmNetworks")}</PanelTitle>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("mmdvmNetworksHint")}</p>
        <div className="grid gap-3">
          {nets.map((n, i) => (
            <div key={n.id} className="grid gap-3 rounded-lg border border-[rgba(79,195,247,0.12)] bg-[#101c28] p-3 md:grid-cols-[auto_1fr_7rem_1fr]">
              <Chip active={n.enabled} tone="ok" onClick={() => void toggleNetworkLive(n)}>
                {n.name}
              </Chip>
              <ConsoleInput
                value={n.address}
                placeholder="host"
                onChange={(e) => patch({ networks: nets.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)) })}
              />
              <ConsoleInput
                type="number"
                value={n.port}
                onChange={(e) => patch({ networks: nets.map((x, j) => (j === i ? { ...x, port: Number(e.target.value) || x.port } : x)) })}
              />
              <ConsoleInput
                type="password"
                value={n.password}
                placeholder="password"
                onChange={(e) => patch({ networks: nets.map((x, j) => (j === i ? { ...x, password: e.target.value } : x)) })}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label={tx("mmdvmTalkgroup")}>
            <ConsoleInput value={tg} onChange={(e) => setTg(e.target.value.replace(/\D/g, "").slice(0, 8))} />
          </Field>
          <Field label={tx("mmdvmSlot")}>
            <ConsoleSelect value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="1">1</option>
              <option value="2">2</option>
            </ConsoleSelect>
          </Field>
          <GhostBtn
            disabled={busy || !tg}
            onClick={async () => {
              try {
                const res = await fetch("/api/mmdvm/remote", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ cmd: `talkgroup ${slot} ${tg}` }),
                });
                const j = (await res.json()) as { ok?: boolean; error?: string; reply?: string };
                if (j.ok) {
                  toast.success(`${tx("mmdvmLinkTg")} TS${slot} ${tg}`);
                  pushLog("MMDVM", `RemoteCommand talkgroup ${slot} ${tg}${j.reply ? ` · ${j.reply}` : ""}`);
                } else toast.error(j.error || tx("apiFail"));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            {tx("mmdvmLinkTg")}
          </GhostBtn>
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("mmdvmLastHeard")}</PanelTitle>
        <Lcd className="mb-3">
          <p className="text-[11px] tracking-widest text-[#4fc3f7]/70 uppercase">{tx("mmdvmLive")}</p>
          <p className="mt-1 text-lg text-[#7ee0ff]">
            {heard[0] ? `${heard[0].callsign} → ${heard[0].target} · ${heard[0].mode}` : tx("mmdvmEmptyHeard")}
          </p>
        </Lcd>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
              <tr>
                <th className="py-2">{tx("mmdvmColTime")}</th>
                <th>{tx("mmdvmColCall")}</th>
                <th>{tx("mode")}</th>
                <th>{tx("mmdvmColTarget")}</th>
                <th>{tx("mmdvmColSrc")}</th>
                <th>{tx("mmdvmColDur")}</th>
                <th>{tx("mmdvmColLoss")}</th>
              </tr>
            </thead>
            <tbody className="font-['IBM_Plex_Mono'] text-[#c5d4e0]">
              {heard.length === 0 ? (
                <tr>
                  <td className="py-3 text-[#8ea0b3]" colSpan={7}>
                    {tx("mmdvmEmptyHeard")}
                  </td>
                </tr>
              ) : (
                heard.map((row, i) => (
                  <tr key={`${row.timeUtc}-${row.callsign}-${i}`} className="border-t border-[rgba(79,195,247,0.08)]">
                    <td className="py-2 text-[#8ea0b3]">{row.timeUtc.slice(11)}</td>
                    <td className="text-[#4fc3f7]">{row.callsign}</td>
                    <td>{row.mode}</td>
                    <td>{row.target}</td>
                    <td className={row.src === "RF" ? "text-[#ffb300]" : "text-[#34d399]"}>{row.src}</td>
                    <td>{row.duration || (st?.tx ? "TX" : "—")}</td>
                    <td>{row.loss || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">
          {st?.hostIni || "/opt/ham-cockpit/mmdvm/mmdvmhost.ini"} · {st?.logDir || "/var/log/mmdvm"} · Remote {st?.remotePort ?? 7642}
        </p>
      </Panel>
    </div>
  );
}

function Tile({
  label,
  value,
  on,
  amber,
}: {
  label: string;
  value: string;
  on?: boolean;
  amber?: boolean;
}) {
  const color = amber ? "text-[#ffb300]" : on ? "text-[#34d399]" : "text-[#f87171]";
  return (
    <Panel>
      <p className="text-[11px] tracking-wide text-[#8ea0b3] uppercase">{label}</p>
      <p className={`mt-1 truncate font-['IBM_Plex_Mono'] text-lg font-semibold ${color}`}>{value}</p>
    </Panel>
  );
}
