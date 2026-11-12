import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { t, type I18nKey, type Lang } from "./i18n";
import { applyHtmlLang, LANG_EVENT, readLang, writeLang } from "./lang-store";
import { bleAvailable, bleErrorMessage, ic705Ble, isBleCancel, looksLikeBleId, type BlePhase } from "./ic705-ble";
import { SERVICE_IDS, UPDATE_IDS, asSer2netDevice, type ServiceId, type UpdateId, type Ser2netDevice } from "@shared/const";
import { isNewerVersion } from "@shared/version";

export const BANDS = [
  { id: "160m", hz: 1_810_000 },
  { id: "80m", hz: 3_530_000 },
  { id: "40m", hz: 7_100_000 },
  { id: "30m", hz: 10_125_000 },
  { id: "20m", hz: 14_200_000 },
  { id: "17m", hz: 18_068_000 },
  { id: "15m", hz: 21_000_000 },
  { id: "12m", hz: 24_940_000 },
  { id: "10m", hz: 28_000_000 },
  { id: "2m", hz: 144_000_000 },
  { id: "70cm", hz: 430_000_000 },
] as const;

export const MODES = ["USB", "USB-D", "LSB", "LSB-D", "CW", "AM", "FM", "DV"] as const;
export type Mode = (typeof MODES)[number];
export type LdgModel = "at100pro2" | "at600pro2" | "at1000pro2";
export type LdgPhase = "idle" | "connecting" | "ready" | "tuning" | "error";
export type Lp100aPhase = "idle" | "connecting" | "ready" | "error";
export type Lp100aMeter = "AVG" | "PEAK" | "TUNE";
export type Lp100aRange = "HIGH" | "MID" | "LOW";

export type Proto =
  | "Icom CI-V"
  | "SPE"
  | "Yaesu"
  | "Kenwood"
  | "Hamplus"
  | "FlexRadio"
  | "Palstar"
  | "ACOM 2000A";

export type Port = {
  id: number;
  label: string;
  device: string;
  enabled: boolean;
  proto: Proto;
  baud: number;
  civ: string;
  tcpPort: number;
  hamlibPort: number;
  hamlibModel: number;
};

export type WifiNet = { ssid: string; rssi: number; open: boolean };
export type NetLink = "wifi" | "ethernet";
export type LogKind = "BLE" | "CIV" | "IC705" | "RADIO" | "WiFi" | "SYS" | "WLOG" | "S2N" | "ACOM" | "LEXTEL" | "LDG" | "LP100A" | "MMDVM" | "ERRO";
export type RadioMaker = "icom" | "kenwood" | "yaesu" | "flex" | "tentec" | "xiegu" | "hermes" | "anan";
export type RadioLink = "usb" | "bluetooth" | "network";
export type RadioProto = "cat" | "civ";
export type StationRadio = {
  id: string;
  name: string;
  maker: RadioMaker;
  link: RadioLink;
  device: string;
  deviceName: string;
  proto: RadioProto;
  port: string;
  baud: number;
  civAddr: string;
  hsUuid?: string;
  paired?: boolean;
  connected: boolean;
  primary: boolean;
  error: string;
  equipmentId?: string;
  /** Host/IP quando link === network. */
  host?: string;
  /** Perfil de rede (kind::via) do catálogo. */
  netProfile?: string;
  /** Network User / login Icom LAN. */
  netUser?: string;
  netPassword?: string;
  /** Senha gravada no Pi (valor nunca volta na API). */
  hasNetPassword?: boolean;
};
export type RadioPick = { id: string; label: string; kind: RadioLink; path: string };
export type LextelPhase = "idle" | "scanning" | "pairing" | "connecting" | "streaming" | "error";
export type LextelDev = { addr: string; name: string; paired: boolean; kind: "bt" | "serial"; likely: boolean };
export type LogRow = { ts: string; kind: LogKind; msg: string };

export type Ser2netSvc = {
  id: string;
  name: string;
  serial: string;
  tcpPort: number;
  baud: number;
  device: Ser2netDevice;
};

export type SerialDev = {
  path: string;
  label: string;
  kind: "usb" | "serial";
};

export type Station = {
  freq: number;
  freqB: number;
  mode: Mode;
  modeB: Mode;
  vfo: "A" | "B";
  ptt: boolean;
  power: boolean;
  split: boolean;
  agc: "OFF" | "FAST" | "MID" | "SLOW";
  pre: "OFF" | "ON1" | "ON2";
  att: boolean;
  nr: boolean;
  nb: boolean;
  rfGain: number;
  afGain: number;
  smeter: number;
  po: number;
  swr: number;
  ic705: {
    usb: boolean;
    ble: boolean;
    bleName: string;
    civ: boolean;
    paired: boolean;
    cat: boolean;
    addr: string;
    phase: BlePhase;
    error: string;
    lastHex: string;
  };
  spe: {
    operate: boolean;
    tx: boolean;
    bank: "A" | "B";
    pout: number;
    pwr: "L" | "M" | "H";
    swrAtu: number;
    swrAnt: number;
    vpa: number;
    ipa: number;
    band: string;
    ant: number;
    input: number;
    temp: number;
    alarm: string;
    ledAl: boolean;
    ledTune: boolean;
    ledOn: boolean;
  };
  hamplus: { pwr: boolean; send: boolean; split: boolean; rotor: 1 | 2; deg: number; ant: number; radio: number };
  palstar: {
    mode: "AUTO" | "MANUAL" | "BYPASS";
    ant: "COAX" | "BAL";
    fwd: number;
    ref: number;
    swr: number;
    l: number;
    c: number;
    tune: boolean;
    match: boolean;
  };
  ldg: {
    model: LdgModel;
    port: string;
    autoConnect: boolean;
    connected: boolean;
    hardware: boolean;
    serialOk: boolean;
    maxW: number;
    label: string;
    phase: LdgPhase;
    error: string;
    ant: 1 | 2;
    mode: "AUTO" | "MANUAL" | "BYPASS";
    match: "" | "T" | "M" | "F";
    tuning: boolean;
    fwd: number;
    ref: number;
    swr: number;
    lastRx: string;
  };
  lp100a: {
    port: string;
    autoConnect: boolean;
    connected: boolean;
    hardware: boolean;
    phase: Lp100aPhase;
    error: string;
    fwd: number;
    ref: number;
    swr: number;
    z: number;
    phaseDeg: number;
    dbm: number;
    alarm: number;
    callsign: string;
    range: Lp100aRange;
    meter: Lp100aMeter;
    tx: boolean;
    lastRx: string;
  };
  acom: {
    on: boolean;
    comm: boolean;
    operate: boolean;
    tx: boolean;
    rpon: boolean;
    warmup: number;
    fwd: number;
    ref: number;
    hv: number;
    temp: number;
    band: string;
    ant: number;
    segment: number;
    fault: string;
  };
  lextel: {
    phase: LextelPhase;
    connected: boolean;
    decoded: boolean;
    addr: string;
    name: string;
    pin: string;
    channel: number;
    autoConnect: boolean;
    path: string;
    error: string;
    hex: string;
    layout: string;
    pep: number;
    avg: number;
    ref: number;
    swr: number;
    vdc: number;
    z: number;
    mod: number;
    alarms: string[];
    devices: LextelDev[];
    ascii: string;
    note: string;
    captureBytes: number;
    period: number | null;
  };
  wifi: {
    hostname: string;
    liveHostname: string;
    link: NetLink;
    apSsid: string;
    apPass: string;
    staSsid: string;
    dhcp: boolean;
    ip: string;
    gw: string;
    mask: string;
    dns1: string;
    dns2: string;
    staConnected: boolean;
    staPassSet: boolean;
    apPassSet: boolean;
    ethConnected: boolean;
    ethName: string;
    wlanName: string;
    liveIp: string;
    liveMask: string;
    liveGw: string;
    managed: { ssid: string }[];
    scan: WifiNet[];
    error: string;
    note: string;
  };
  ble: { name: string; pin: string; connected: boolean };
  wavelog: {
    folder: string;
    port: number;
    url: string;
    running: boolean;
    apiKey: string;
    stationId: string;
  };
  wlg: {
    folder: string;
    running: boolean;
    radioName: string;
    hamlibHost: string;
    hamlibPort: number;
    udpPort: number;
    qsyPort: number;
    wsPort: number;
    publishCat: boolean;
  };
  mmdvm: {
    running: boolean;
    gatewayRunning: boolean;
    callsign: string;
    dmrId: string;
  };
  radios: {
    folder: string;
    items: StationRadio[];
    usb: RadioPick[];
    bluetooth: RadioPick[];
  };
  ser2net: {
    folder: string;
    running: boolean;
    hamlibRunning: boolean;
    bind: string;
    services: Ser2netSvc[];
    serials: SerialDev[];
  };
  ports: Port[];
  logs: LogRow[];
  users: { name: string }[];
  services: { id: ServiceId; autostart: boolean; running: boolean }[];
  updates: {
    pending: number;
    os: string;
    jobs: {
      id: UpdateId;
      status: "running" | "ok" | "error";
      pct: number;
      determinate: boolean;
      stage: string;
      error: string;
      bytes?: number;
      totalBytes?: number;
      etaSec?: number;
    }[];
    items: {
      id: UpdateId;
      current: string;
      available: string;
      updatable: boolean;
      applying: boolean;
      error: string;
      note: string;
      progress: number;
      stage: string;
      determinate: boolean;
      bytes: number;
      totalBytes: number;
      etaSec: number;
    }[];
  };
};

function initial(): Station {
  return {
    freq: 7_100_000,
    freqB: 14_200_000,
    mode: "USB",
    modeB: "USB",
    vfo: "A",
    ptt: false,
    power: true,
    split: false,
    agc: "FAST",
    pre: "OFF",
    att: false,
    nr: false,
    nb: false,
    rfGain: 180,
    afGain: 90,
    smeter: 5.2,
    po: 0,
    swr: 1,
    ic705: {
      usb: false,
      ble: false,
      bleName: "",
      civ: false,
      paired: false,
      cat: true,
      addr: "0xA4",
      phase: "idle",
      error: "",
      lastHex: "",
    },
    spe: {
      operate: false,
      tx: false,
      bank: "A",
      pout: 0,
      pwr: "L",
      swrAtu: 1.05,
      swrAnt: 1.12,
      vpa: 48.2,
      ipa: 0.1,
      band: "40m",
      ant: 1,
      input: 1,
      temp: 28,
      alarm: "",
      ledAl: false,
      ledTune: false,
      ledOn: true,
    },
    hamplus: { pwr: true, send: false, split: false, rotor: 1, deg: 42, ant: 1, radio: 1 },
    palstar: { mode: "AUTO", ant: "COAX", fwd: 0, ref: 0, swr: 1.1, l: 12, c: 48, tune: false, match: true },
    ldg: {
      model: "at1000pro2",
      port: "",
      autoConnect: true,
      connected: false,
      hardware: false,
      serialOk: true,
      maxW: 1000,
      label: "AT-1000ProII",
      phase: "idle",
      error: "",
      ant: 1,
      mode: "AUTO",
      match: "",
      tuning: false,
      fwd: 0,
      ref: 0,
      swr: 1,
      lastRx: "",
    },
    lp100a: {
      port: "",
      autoConnect: true,
      connected: false,
      hardware: false,
      phase: "idle",
      error: "",
      fwd: 0,
      ref: 0,
      swr: 1,
      z: 0,
      phaseDeg: 0,
      dbm: -99,
      alarm: 2,
      callsign: "",
      range: "HIGH",
      meter: "PEAK",
      tx: false,
      lastRx: "",
    },
    acom: {
      on: false,
      comm: false,
      operate: false,
      tx: false,
      rpon: true,
      warmup: 0,
      fwd: 0,
      ref: 0,
      hv: 0,
      temp: 32,
      band: "40m",
      ant: 1,
      segment: 1,
      fault: "",
    },
    lextel: {
      phase: "idle",
      connected: false,
      decoded: false,
      addr: "",
      name: "",
      pin: "1234",
      channel: 1,
      autoConnect: true,
      path: "",
      error: "",
      hex: "",
      layout: "",
      pep: 0,
      avg: 0,
      ref: 0,
      swr: 1,
      vdc: 0,
      z: 0,
      mod: 0,
      alarms: [],
      devices: [],
      ascii: "",
      note: "",
      captureBytes: 0,
      period: null,
    },
    wifi: {
      hostname: "ham-cockpit",
      liveHostname: "",
      link: "wifi",
      apSsid: "Ham-Cockpit",
      apPass: "",
      staSsid: "",
      dhcp: true,
      ip: "",
      gw: "",
      mask: "255.255.255.0",
      dns1: "1.1.1.1",
      dns2: "8.8.8.8",
      staConnected: false,
      staPassSet: false,
      apPassSet: false,
      ethConnected: false,
      ethName: "",
      wlanName: "",
      liveIp: "",
      liveMask: "",
      liveGw: "",
      managed: [],
      scan: [],
      error: "",
      note: "",
    },
    ble: { name: "Ham Cockpit", pin: "••••", connected: false },
    wavelog: {
      folder: "/opt/wavelog",
      port: 8086,
      url: "http://127.0.0.1:8086/index.php",
      running: false,
      apiKey: "",
      stationId: "1",
    },
    wlg: {
      folder: "/opt/wavelog-gate",
      running: false,
      radioName: "IC-705",
      hamlibHost: "127.0.0.1",
      hamlibPort: 4532,
      udpPort: 2333,
      qsyPort: 54321,
      wsPort: 54322,
      publishCat: true,
    },
    mmdvm: {
      running: false,
      gatewayRunning: false,
      callsign: "N0CALL",
      dmrId: "0000000",
    },
    radios: {
      folder: "/opt/ham-cockpit/radios",
      items: [],
      usb: [],
      bluetooth: [],
    },
    ser2net: {
      folder: "/opt/ser2net",
      running: false,
      hamlibRunning: false,
      bind: "127.0.0.1",
      services: [],
      serials: [],
    },
    ports: [
      { id: 1, label: "PORT 1", device: "/dev/serial/by-id/usb-IC-705-if00", enabled: true, proto: "Icom CI-V", baud: 115200, civ: "0xA4", tcpPort: 4001, hamlibPort: 4532, hamlibModel: 3085 },
      { id: 2, label: "PORT 2", device: "/dev/ttyAMA2", enabled: true, proto: "Yaesu", baud: 38400, civ: "0x94", tcpPort: 4002, hamlibPort: 4534, hamlibModel: 1021 },
      { id: 3, label: "PORT 3", device: "/dev/ttyAMA3", enabled: true, proto: "Palstar", baud: 9600, civ: "0x94", tcpPort: 4003, hamlibPort: 0, hamlibModel: 0 },
      { id: 4, label: "PORT 4", device: "/dev/serial/by-id/usb-FTDI-SPE", enabled: true, proto: "SPE", baud: 9600, civ: "0x94", tcpPort: 4004, hamlibPort: 4531, hamlibModel: 401 },
      { id: 5, label: "PORT 5", device: "/dev/serial/by-id/usb-FTDI-ACOM2000A-if00", enabled: true, proto: "ACOM 2000A", baud: 1200, civ: "0x94", tcpPort: 4005, hamlibPort: 0, hamlibModel: 0 },
    ],
    logs: [
      { ts: "14:01:02", kind: "SYS", msg: "Ham Cockpit pronto · http://192.168.4.1" },
      { ts: "14:01:06", kind: "WiFi", msg: "STA Shack-Fiber 192.168.1.48" },
      { ts: "14:01:08", kind: "IC705", msg: "Aguardando Bluetooth / USB" },
      { ts: "14:01:11", kind: "CIV", msg: "FREQ 7.100.000 USB" },
      { ts: "14:02:40", kind: "SYS", msg: "ampctld :4531 SPE 1.3K-FA" },
      { ts: "14:02:48", kind: "ACOM", msg: "RS232 1200 8N1 · ser2net :4005 (sem ampctld)" },
      { ts: "14:03:02", kind: "LEXTEL", msg: "MS-2000 · Bluetooth Classic SPP (não BLE)" },
    ],
    users: [{ name: "admin" }, { name: "op" }],
    services: SERVICE_IDS.map((id) => ({ id, autostart: true, running: id === "web" })),
    updates: {
      pending: 0,
      os: "Ubuntu Server 24.04 LTS",
      jobs: [],
      items: UPDATE_IDS.map((id) => ({
        id,
        current: "—",
        available: "—",
        updatable: false,
        applying: false,
        error: "",
        note: "",
        progress: 0,
        stage: "",
        determinate: false,
        bytes: 0,
        totalBytes: 0,
        etaSec: 0,
      })),
    },
  };
}

function simLp100a(cur: Station["lp100a"], tx: boolean): Station["lp100a"] {
  if (!cur.connected || cur.hardware) return cur;
  if (!tx) return { ...cur, fwd: 0, ref: 0, swr: 1, dbm: -99, tx: false };
  return { ...cur, fwd: 87.4, ref: 1.2, swr: 1.12, z: 52.1, phaseDeg: 8.4, dbm: 49.4, tx: true };
}

/** Após Desconectar manual, o autostart não deve religar o primary até Conectar. */
let primaryHoldOff = false;
export function holdPrimaryRadio(hold: boolean) {
  primaryHoldOff = hold;
}
export function isPrimaryHeld() {
  return primaryHoldOff;
}

export function mergeLp100a(cur: Station["lp100a"], j: Record<string, unknown>): Station["lp100a"] {
  const meter = j.meter === "AVG" || j.meter === "PEAK" || j.meter === "TUNE" ? j.meter : cur.meter;
  const range = j.range === "HIGH" || j.range === "MID" || j.range === "LOW" ? j.range : cur.range;
  const phase =
    j.phase === "idle" || j.phase === "connecting" || j.phase === "ready" || j.phase === "error" ? j.phase : cur.phase;
  return {
    ...cur,
    port: typeof j.port === "string" ? j.port : cur.port,
    autoConnect: typeof j.autoConnect === "boolean" ? j.autoConnect : cur.autoConnect,
    connected: Boolean(j.connected),
    hardware: Boolean(j.hardware),
    phase,
    error: typeof j.error === "string" ? j.error : cur.error,
    fwd: Number.isFinite(Number(j.fwd)) ? Number(j.fwd) : cur.fwd,
    ref: Number.isFinite(Number(j.ref)) ? Number(j.ref) : cur.ref,
    swr: Number.isFinite(Number(j.swr)) && Number(j.swr) > 0 ? Number(j.swr) : cur.swr,
    z: Number.isFinite(Number(j.z)) ? Number(j.z) : cur.z,
    phaseDeg: Number.isFinite(Number(j.phaseDeg)) ? Number(j.phaseDeg) : cur.phaseDeg,
    dbm: Number.isFinite(Number(j.dbm)) ? Number(j.dbm) : cur.dbm,
    alarm: Number.isFinite(Number(j.alarm)) ? Math.max(0, Math.min(5, Math.trunc(Number(j.alarm)))) : cur.alarm,
    callsign: typeof j.callsign === "string" ? j.callsign : cur.callsign,
    range,
    meter,
    tx: Boolean(j.tx),
    lastRx: typeof j.lastRx === "string" ? j.lastRx : cur.lastRx,
  };
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  tx: (key: I18nKey) => string;
  s: Station;
  setS: React.Dispatch<React.SetStateAction<Station>>;
  pushLog: (kind: LogKind, msg: string) => void;
  setFreq: (hz: number) => void;
  kickPrimary: (opts?: { picker?: boolean; gesture?: boolean }) => Promise<void>;
};

const ConsoleCtx = createContext<Ctx | null>(null);

export function ConsoleProvider({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const [s, setS] = useState<Station>(initial);
  const radiosRef = useRef<StationRadio[]>([]);
  const servicesRef = useRef(s.services);
  const applyingRef = useRef(false);
  const inflightPrimary = useRef(false);
  const usbTried = useRef(false);
  const pickerArmed = useRef(false);
  radiosRef.current = s.radios.items;
  servicesRef.current = s.services;

  const setLang = useCallback((l: Lang) => {
    writeLang(l);
    setLangState(l);
  }, []);

  const tx = useCallback((key: I18nKey) => t(lang, key), [lang]);

  useEffect(() => {
    applyHtmlLang(lang);
    const onChange = () => setLangState(readLang());
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, [lang]);

  useEffect(() => {
    void fetch("/api/radios")
      .then((r) => r.json())
      .then((j: { ok?: boolean; folder?: string; radios?: StationRadio[]; usb?: RadioPick[]; bluetooth?: RadioPick[] }) => {
        if (!j || j.ok === false || !Array.isArray(j.radios)) return;
        const usb = Array.isArray(j.usb) ? j.usb : null;
        const bluetooth = Array.isArray(j.bluetooth) ? j.bluetooth : null;
        setS((p) => ({
          ...p,
          radios: {
            folder: typeof j.folder === "string" && j.folder ? j.folder : p.radios.folder,
            items: j.radios as StationRadio[],
            usb: usb ?? p.radios.usb,
            bluetooth: bluetooth ?? p.radios.bluetooth,
          },
        }));
      })
      .catch(() => undefined);
  }, []);

  const kickPrimary = useCallback(async (opts?: { picker?: boolean; gesture?: boolean }) => {
    if (inflightPrimary.current || ic705Ble.connected) return;
    if (!opts?.picker && !opts?.gesture && ic705Ble.busy) return;
    // Desconectar manual: não religar até o usuário clicar Conectar.
    if (primaryHoldOff) return;
    inflightPrimary.current = true;
    const applyList = (items: StationRadio[]) => {
      radiosRef.current = items;
      setS((p) => ({ ...p, radios: { ...p.radios, items } }));
    };
    try {
      let items = radiosRef.current;
      if (!items.length) {
        const r = await fetch("/api/radios");
        const j = (await r.json()) as { ok?: boolean; radios?: StationRadio[] };
        if (!j || j.ok === false || !Array.isArray(j.radios)) return;
        items = j.radios;
        applyList(items);
      }
      const primary = items.find((row) => row.primary) || (items.length === 1 ? items[0] : undefined);
      if (!primary) return;
      const autostart = (id: ServiceId) => servicesRef.current.find((row) => row.id === id)?.autostart !== false;
      if (!autostart("radio")) return;
      const icomBle = primary.link === "bluetooth" && primary.maker === "icom" && primary.proto !== "cat";
      if (icomBle && !autostart("bluetooth")) return;
      if (icomBle) {
        if (!bleAvailable()) return;
        ic705Ble.setCivAddr(primary.civAddr);
        const bleOpts = {
          silent: true as const,
          reconnect: true,
          hsUuid: primary.hsUuid,
          civAddr: primary.civAddr,
          deviceId: looksLikeBleId(primary.device || "") ? primary.device : undefined,
          deviceName: primary.deviceName || primary.name,
        };
        ic705Ble.armAuto(bleOpts);
        try {
          await ic705Ble.connect(bleOpts);
        } catch (err) {
          if (opts?.gesture && bleErrorMessage(err) === "BLE_SILENT") {
            try {
              await ic705Ble.connect({ ...bleOpts, chooser: true, acceptAll: false, silent: false });
            } catch (retry) {
              if (isBleCancel(retry) && !pickerArmed.current) {
                toast.message(t(lang, "radioAutoGrant"));
                pickerArmed.current = true;
              }
              return;
            }
          } else {
            if (isBleCancel(err) && !pickerArmed.current) {
              toast.message(t(lang, "radioAutoGrant"));
              pickerArmed.current = true;
            }
            return;
          }
        }
        pickerArmed.current = false;
        const up = await fetch("/api/radios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...primary,
            connected: true,
            primary: true,
            paired: true,
            hsUuid: ic705Ble.hsUuid || primary.hsUuid,
            device: looksLikeBleId(ic705Ble.deviceId) ? ic705Ble.deviceId : looksLikeBleId(primary.device || "") ? primary.device : "",
            deviceName: ic705Ble.deviceName || primary.deviceName,
          }),
        });
        const saved = (await up.json()) as { radios?: StationRadio[] };
        if (Array.isArray(saved.radios)) applyList(saved.radios);
        return;
      }
      // USB / Rede (Icom LAN): já conectado = ok; senão tenta /api/radios/connect.
      if (primary.connected) {
        usbTried.current = false;
        return;
      }
      if (usbTried.current) return;
      usbTried.current = true;
      const res = await fetch("/api/radios/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...primary, primary: true }),
      });
      const out = (await res.json()) as { radios?: StationRadio[]; ok?: boolean };
      if (Array.isArray(out.radios)) applyList(out.radios);
      if (out.ok === false) usbTried.current = false;
    } catch {
      usbTried.current = false;
    } finally {
      inflightPrimary.current = false;
    }
  }, [lang]);

  useEffect(() => {
    if (!active) return;
    void kickPrimary({ picker: false, gesture: false });
    const kick = window.setTimeout(() => void kickPrimary({ picker: false, gesture: false }), 800);
    const needKick = () => {
      const primary =
        radiosRef.current.find((row) => row.primary) ||
        (radiosRef.current.length === 1 ? radiosRef.current[0] : undefined);
      if (!primary) return false;
      if (primary.link === "bluetooth" && primary.maker === "icom" && primary.proto !== "cat") {
        return !ic705Ble.connected;
      }
      return !primary.connected;
    };
    const id = window.setInterval(() => {
      if (needKick()) {
        usbTried.current = false;
        void kickPrimary({ picker: false, gesture: false });
      }
    }, 3000);
    const onVis = () => {
      if (document.visibilityState === "visible" && needKick()) {
        usbTried.current = false;
        void kickPrimary({ picker: false, gesture: false });
      }
    };
    const onPointer = () => {
      const primary =
        radiosRef.current.find((row) => row.primary) ||
        (radiosRef.current.length === 1 ? radiosRef.current[0] : undefined);
      const icomBle = primary?.link === "bluetooth" && primary.maker === "icom" && primary.proto !== "cat";
      if (icomBle) {
        if (ic705Ble.connected || ic705Ble.busy) return;
      } else if (primary?.connected) {
        return;
      }
      const gesture = pickerArmed.current;
      pickerArmed.current = false;
      void kickPrimary({ picker: false, gesture });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [active, kickPrimary]);

  useEffect(() => {
    void fetch("/api/ser2net")
      .then((r) => r.json())
      .then((j: { ok?: boolean; folder?: string; bind?: string; services?: Ser2netSvc[]; running?: boolean }) => {
        if (!j || j.ok === false || !Array.isArray(j.services)) return;
        const services = j.services.map((row) => ({ ...row, device: asSer2netDevice(row.device) }));
        setS((p) => ({
          ...p,
          ser2net: {
            ...p.ser2net,
            folder: typeof j.folder === "string" && j.folder ? j.folder : p.ser2net.folder,
            bind: typeof j.bind === "string" && j.bind ? j.bind : p.ser2net.bind,
            services,
            running: Boolean(j.running),
          },
        }));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const apply = (j: Record<string, unknown>) => {
      if (!j || typeof j !== "object") return;
      setS((p) => ({
        ...p,
        lextel: {
          ...p.lextel,
          phase: (["idle", "scanning", "pairing", "connecting", "streaming", "error"] as LextelPhase[]).includes(j.phase as LextelPhase)
            ? (j.phase as LextelPhase)
            : p.lextel.phase,
          connected: Boolean(j.connected),
          decoded: Boolean(j.decoded) || (typeof j.layout === "string" && Boolean(j.layout) && Number(j.vdc) > 0),
          addr: typeof j.addr === "string" ? j.addr : p.lextel.addr,
          name: typeof j.name === "string" ? j.name : p.lextel.name,
          pin: typeof j.pin === "string" && j.pin ? j.pin : p.lextel.pin,
          channel: typeof j.channel === "number" && j.channel > 0 ? j.channel : p.lextel.channel,
          autoConnect: typeof j.autoConnect === "boolean" ? j.autoConnect : p.lextel.autoConnect,
          path: typeof j.path === "string" ? j.path : p.lextel.path,
          error: typeof j.error === "string" ? j.error : p.lextel.error,
          hex: typeof j.hex === "string" ? j.hex : p.lextel.hex,
          layout: typeof j.layout === "string" ? j.layout : p.lextel.layout,
          pep: Number.isFinite(Number(j.pep)) ? Number(j.pep) : p.lextel.pep,
          avg: Number.isFinite(Number(j.avg)) ? Number(j.avg) : p.lextel.avg,
          ref: Number.isFinite(Number(j.ref)) ? Number(j.ref) : p.lextel.ref,
          swr: Number.isFinite(Number(j.swr)) && Number(j.swr) > 0 ? Number(j.swr) : p.lextel.swr,
          vdc: Number.isFinite(Number(j.vdc)) ? Number(j.vdc) : p.lextel.vdc,
          z: Number(j.z) || 0,
          mod: Number(j.mod) || 0,
          alarms: Array.isArray(j.alarms) ? j.alarms.map(String) : p.lextel.alarms,
          devices: Array.isArray(j.devices)
            ? (j.devices as LextelDev[]).filter((d) => d && typeof d.addr === "string")
            : p.lextel.devices,
          ascii: typeof j.ascii === "string" ? j.ascii : p.lextel.ascii,
          note: typeof j.note === "string" ? j.note : p.lextel.note,
          captureBytes: typeof j.captureBytes === "number" ? j.captureBytes : p.lextel.captureBytes,
          period: typeof j.period === "number" ? j.period : j.period === null ? null : p.lextel.period,
        },
      }));
    };
    let inflight = false;
    const pull = () => {
      if (inflight) return;
      inflight = true;
      void fetch("/api/lextel")
        .then((r) => r.json())
        .then(apply)
        .catch(() => undefined)
        .finally(() => {
          inflight = false;
        });
    };
    pull();
    const id = window.setInterval(pull, 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const apply = (j: Record<string, unknown>) => {
      if (!j || typeof j !== "object") return;
      setS((p) => ({
        ...p,
        ldg: {
          ...p.ldg,
          model: j.model === "at100pro2" || j.model === "at600pro2" || j.model === "at1000pro2" ? j.model : p.ldg.model,
          port: typeof j.port === "string" ? j.port : p.ldg.port,
          autoConnect: typeof j.autoConnect === "boolean" ? j.autoConnect : p.ldg.autoConnect,
          connected: Boolean(j.connected),
          hardware: Boolean(j.hardware),
          serialOk: typeof j.serialOk === "boolean" ? j.serialOk : p.ldg.serialOk,
          maxW: Number.isFinite(Number(j.maxW)) ? Number(j.maxW) : p.ldg.maxW,
          label: typeof j.label === "string" && j.label ? j.label : p.ldg.label,
          phase:
            j.phase === "idle" || j.phase === "connecting" || j.phase === "ready" || j.phase === "tuning" || j.phase === "error"
              ? j.phase
              : p.ldg.phase,
          error: typeof j.error === "string" ? j.error : p.ldg.error,
          ant: j.ant === 2 ? 2 : 1,
          mode: j.mode === "MANUAL" || j.mode === "BYPASS" ? j.mode : "AUTO",
          match: j.match === "T" || j.match === "M" || j.match === "F" ? j.match : j.match === "" ? "" : p.ldg.match,
          tuning: Boolean(j.tuning),
          fwd: Number.isFinite(Number(j.fwd)) ? Number(j.fwd) : p.ldg.fwd,
          ref: Number.isFinite(Number(j.ref)) ? Number(j.ref) : p.ldg.ref,
          swr: Number.isFinite(Number(j.swr)) && Number(j.swr) > 0 ? Number(j.swr) : p.ldg.swr,
          lastRx: typeof j.lastRx === "string" ? j.lastRx : p.ldg.lastRx,
        },
      }));
    };
    let inflight = false;
    const pull = () => {
      if (inflight) return;
      inflight = true;
      void fetch("/api/ldg")
        .then((r) => r.json())
        .then(apply)
        .catch(() => undefined)
        .finally(() => {
          inflight = false;
        });
    };
    pull();
    const id = window.setInterval(pull, 800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!active) return;
    const tmr = window.setTimeout(() => {
      const row = servicesRef.current.find((r) => r.id === "ldg");
      if (row && row.autostart === false) return;
      void fetch("/api/ldg")
        .then((r) => r.json())
        .then((j: { autoConnect?: boolean; connected?: boolean; port?: string; serialOk?: boolean }) => {
          if (!j.autoConnect || j.connected) return;
          if (!j.port && j.serialOk !== false) return;
          void fetch("/api/ldg/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(
            () => undefined,
          );
        })
        .catch(() => undefined);
    }, 1600);
    return () => window.clearTimeout(tmr);
  }, [active]);

  useEffect(() => {
    const apply = (j: Record<string, unknown>) => {
      if (!j || typeof j !== "object") return;
      setS((p) => ({
        ...p,
        lp100a: mergeLp100a(p.lp100a, j),
      }));
    };
    let inflight = false;
    const pull = () => {
      if (inflight) return;
      inflight = true;
      void fetch("/api/lp100a")
        .then((r) => r.json())
        .then(apply)
        .catch(() => undefined)
        .finally(() => {
          inflight = false;
        });
    };
    pull();
    const id = window.setInterval(pull, 400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!active) return;
    const tmr = window.setTimeout(() => {
      const row = servicesRef.current.find((r) => r.id === "lp100a");
      if (row && row.autostart === false) return;
      void fetch("/api/lp100a")
        .then((r) => r.json())
        .then((j: { autoConnect?: boolean; connected?: boolean; port?: string }) => {
          if (!j.autoConnect || j.connected) return;
          void fetch("/api/lp100a/connect", { method: "POST" }).catch(() => undefined);
        })
        .catch(() => undefined);
    }, 1800);
    return () => window.clearTimeout(tmr);
  }, [active]);

  useEffect(() => {
    const apply = (j: Record<string, unknown>) => {
      if (!j || typeof j !== "object") return;
      setS((p) => ({
        ...p,
        wifi: {
          ...p.wifi,
          hostname: typeof j.hostname === "string" && j.hostname ? j.hostname : p.wifi.hostname,
          liveHostname: typeof j.liveHostname === "string" ? j.liveHostname : p.wifi.liveHostname,
          link: j.link === "ethernet" ? "ethernet" : j.link === "wifi" ? "wifi" : p.wifi.link,
          apSsid: typeof j.apSsid === "string" && j.apSsid ? j.apSsid : p.wifi.apSsid,
          staSsid: typeof j.staSsid === "string" ? j.staSsid : p.wifi.staSsid,
          dhcp: typeof j.dhcp === "boolean" ? j.dhcp : p.wifi.dhcp,
          ip: typeof j.ip === "string" ? j.ip : p.wifi.ip,
          gw: typeof j.gw === "string" ? j.gw : p.wifi.gw,
          mask: typeof j.mask === "string" && j.mask ? j.mask : p.wifi.mask,
          dns1: typeof j.dns1 === "string" ? j.dns1 : p.wifi.dns1,
          dns2: typeof j.dns2 === "string" ? j.dns2 : p.wifi.dns2,
          staConnected: Boolean(j.staConnected),
          staPassSet: Boolean(j.staPassSet),
          apPassSet: Boolean(j.apPassSet),
          ethConnected: Boolean(j.ethConnected),
          ethName: typeof j.ethName === "string" ? j.ethName : p.wifi.ethName,
          wlanName: typeof j.wlanName === "string" ? j.wlanName : p.wifi.wlanName,
          liveIp: typeof j.liveIp === "string" ? j.liveIp : p.wifi.liveIp,
          liveMask: typeof j.liveMask === "string" ? j.liveMask : p.wifi.liveMask,
          liveGw: typeof j.liveGw === "string" ? j.liveGw : p.wifi.liveGw,
          managed: Array.isArray(j.managed) ? (j.managed as { ssid: string }[]).filter((n) => n && n.ssid) : p.wifi.managed,
          scan: Array.isArray(j.scan) ? (j.scan as WifiNet[]).filter((n) => n && n.ssid) : p.wifi.scan,
          error: typeof j.error === "string" ? j.error : p.wifi.error,
          note: typeof j.note === "string" ? j.note : p.wifi.note,
        },
      }));
    };
    const pull = () => {
      void fetch("/api/net")
        .then((r) => r.json())
        .then(apply)
        .catch(() => undefined);
    };
    pull();
    const id = window.setInterval(pull, 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const apply = (j: { items?: { id: ServiceId; autostart?: boolean; running?: boolean }[] }) => {
      if (!j || !Array.isArray(j.items)) return;
      const items = SERVICE_IDS.map((id) => {
        const hit = j.items!.find((row) => row.id === id);
        return { id, autostart: hit?.autostart !== false, running: Boolean(hit?.running) };
      });
      servicesRef.current = items;
      setS((p) => ({ ...p, services: items }));
    };
    const pull = () => {
      void fetch("/api/services")
        .then((r) => r.json())
        .then(apply)
        .catch(() => undefined);
    };
    pull();
    const id = window.setInterval(pull, 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const apply = (j: {
      pending?: number;
      os?: string;
      jobs?: Station["updates"]["jobs"];
      items?: {
        id: UpdateId;
        current?: string;
        available?: string;
        updatable?: boolean;
        applying?: boolean;
        error?: string;
        note?: string;
        progress?: number;
        stage?: string;
        determinate?: boolean;
        bytes?: number;
        totalBytes?: number;
        etaSec?: number;
      }[];
    }) => {
      if (!j || !Array.isArray(j.items)) return;
      const jobs = Array.isArray(j.jobs) ? j.jobs : [];
      const items = UPDATE_IDS.map((id) => {
        const hit = j.items!.find((row) => row.id === id);
        const job = jobs.find((row) => row.id === id);
        const current = String(hit?.current || "—");
        const available = String(hit?.available || hit?.current || "—");
        const applying = Boolean(hit?.applying) || job?.status === "running";
        return {
          id,
          current,
          available,
          updatable: isNewerVersion(available, current),
          applying,
          error: String(job?.error || hit?.error || ""),
          note: String(hit?.note || ""),
          progress: Number(hit?.progress ?? job?.pct ?? 0) || 0,
          stage: String(hit?.stage || job?.stage || ""),
          determinate: Boolean(hit?.determinate ?? job?.determinate),
          bytes: Number(hit?.bytes ?? job?.bytes ?? 0) || 0,
          totalBytes: Number(hit?.totalBytes ?? job?.totalBytes ?? 0) || 0,
          etaSec: Number(hit?.etaSec ?? job?.etaSec ?? 0) || 0,
        };
      });
      const pending = items.filter((row) => row.updatable).length;
      setS((p) => ({ ...p, updates: { pending, os: String(j.os || p.updates.os), items, jobs } }));
      if (pending > 0 && sessionStorage.getItem("hamcockpit.updToast") !== "1") {
        sessionStorage.setItem("hamcockpit.updToast", "1");
        toast.warning(`${t(lang, "updPending")} · ${pending} ${t(lang, "updPendingN")}`);
      }
    };
    // Rápido (500 ms) só enquanto há apply rodando — o servidor responde da memória.
    // Parado: 20 s. Nunca empilha requisições (Pi 3 travava com polling agressivo).
    let stopped = false;
    let timer = 0;
    let busy = false;
    const loop = async () => {
      if (stopped) return;
      if (!busy) {
        busy = true;
        try {
          const r = await fetch("/api/updates");
          const j = await r.json();
          apply(j);
          applyingRef.current = Array.isArray(j?.items) && j.items.some((row: { applying?: boolean }) => row.applying)
            || (Array.isArray(j?.jobs) && j.jobs.some((row: { status?: string }) => row.status === "running"));
        } catch {
          /* ignore */
        } finally {
          busy = false;
        }
      }
      timer = window.setTimeout(loop, applyingRef.current ? 500 : 20_000);
    };
    void loop();
    const wake = () => {
      window.clearTimeout(timer);
      void loop();
    };
    window.addEventListener("hc-updates-wake", wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("hc-updates-wake", wake);
    };
  }, [lang]);

  const pushLog = useCallback((kind: LogKind, msg: string) => {
    const ts = new Date().toLocaleTimeString("pt-BR", { hour12: false });
    setS((prev) => ({ ...prev, logs: [{ ts, kind, msg }, ...prev.logs].slice(0, 80) }));
  }, []);

  const setFreq = useCallback((hz: number) => {
    setS((prev) => ({ ...prev, freq: Math.max(100_000, hz) }));
  }, []);

  useEffect(() => {
    ic705Ble.setListener({
      onPhase: (phase, detail) => {
        setS((p) => ({
          ...p,
          ic705: {
            ...p.ic705,
            phase,
            bleName: detail || p.ic705.bleName,
            error: phase === "error" ? detail || p.ic705.error : "",
            lastHex: phase === "idle" || phase === "scanning" ? "" : p.ic705.lastHex,
            ble: phase === "ready" || phase === "handshake" || phase === "connecting",
            civ: phase === "ready" ? true : phase === "idle" || phase === "error" ? false : p.ic705.civ,
          },
          ble: {
            ...p.ble,
            connected: phase === "ready" || phase === "handshake" || phase === "connecting",
          },
        }));
        if (phase === "connecting") toast.message(t(lang, "bleConnecting"));
        if (phase === "handshake") toast.message(t(lang, "bleHandshake"));
        if (phase === "error" && detail) {
          pushLog("ERRO", detail);
          toast.error(detail);
        }
        if (phase === "connecting" || phase === "ready") {
          void fetch("/api/lextel/keepalive", { method: "POST" }).catch(() => undefined);
        }
        if (phase === "ready") {
          const name = detail || ic705Ble.deviceName;
          pushLog("IC705", `BLE CI-V ${name}`.trim());
          toast.success(t(lang, "bleReady"));
        }
      },
      onPaired: (fresh) => {
        setS((p) => ({ ...p, ic705: { ...p.ic705, paired: true } }));
        pushLog("IC705", fresh ? t(lang, "blePairedNow") : t(lang, "bleAlreadyPaired"));
      },
      onCivGrant: () => {
        setS((p) => ({
          ...p,
          ic705: { ...p.ic705, civ: true, ble: true, usb: false, paired: true },
          ble: { ...p.ble, connected: true },
        }));
      },
      onFrame: (hex) => {
        setS((p) => ({ ...p, ic705: { ...p.ic705, lastHex: hex } }));
        pushLog("CIV", hex);
      },
      onFreq: (hz) => {
        setS((prev) =>
          prev.vfo === "B"
            ? { ...prev, freqB: Math.max(100_000, hz) }
            : { ...prev, freq: Math.max(100_000, hz) }
        );
      },
      onCiv: (patch) => {
        setS((prev) => {
          const next = { ...prev };
          if (patch.freq != null) {
            if (prev.vfo === "B") next.freqB = Math.max(100_000, patch.freq);
            else next.freq = Math.max(100_000, patch.freq);
          }
          if (patch.mode) {
            if (prev.vfo === "B") next.modeB = patch.mode as Mode;
            else next.mode = patch.mode as Mode;
          }
          if (patch.ptt != null) next.ptt = patch.ptt;
          if (patch.smeter != null) next.smeter = patch.smeter;
          if (patch.po != null) next.po = patch.po;
          if (patch.swr != null && !(prev.lextel.connected && prev.lextel.swr >= 1)) next.swr = patch.swr;
          if (patch.agc) next.agc = patch.agc;
          if (patch.pre) next.pre = patch.pre;
          if (patch.att != null) next.att = patch.att;
          if (patch.nr != null) next.nr = patch.nr;
          if (patch.nb != null) next.nb = patch.nb;
          if (patch.split != null) next.split = patch.split;
          if (patch.vfo) next.vfo = patch.vfo;
          return next;
        });
      },
      onDisconnect: () => {
        setS((p) => ({
          ...p,
          ic705: { ...p.ic705, ble: false, civ: false, paired: false, phase: "idle", bleName: "", error: "", lastHex: "" },
          ble: { ...p.ble, connected: false },
        }));
        toast.message(t(lang, "bleLost"));
      },
    });
    return () => ic705Ble.setListener(null);
  }, [lang, pushLog, setFreq]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setS((prev) => {
        if (prev.ic705.phase === "ready") {
          if (prev.ptt) {
            return {
              ...prev,
              spe: { ...prev.spe, tx: prev.spe.operate, pout: prev.spe.operate ? 620 : 0, ipa: prev.spe.operate ? 12.4 : 0.2 },
              palstar: { ...prev.palstar, fwd: prev.spe.operate ? 600 : 8, ref: 4 },
              ldg: {
                ...prev.ldg,
                fwd: prev.ldg.connected && !prev.ldg.hardware ? Math.round(prev.ldg.maxW * 0.62) : prev.ldg.fwd,
                ref: prev.ldg.connected && !prev.ldg.hardware ? Math.round(prev.ldg.maxW * 0.02) : prev.ldg.ref,
                swr: prev.ldg.connected && !prev.ldg.hardware ? 1.12 : prev.ldg.swr,
              },
              lp100a: simLp100a(prev.lp100a, true),
              acom: {
                ...prev.acom,
                tx: prev.acom.operate && prev.acom.on && prev.acom.warmup === 0,
                fwd: prev.acom.operate && prev.acom.on && prev.acom.warmup === 0 ? 1200 : 0,
                ref: prev.acom.operate && prev.acom.on && prev.acom.warmup === 0 ? 18 : 0,
              },
              hamplus: { ...prev.hamplus, send: true },
            };
          }
          return {
            ...prev,
            spe: { ...prev.spe, tx: false, pout: 0, ipa: 0.1 },
            palstar: { ...prev.palstar, fwd: 0, ref: 0 },
            ldg: prev.ldg.hardware ? prev.ldg : { ...prev.ldg, fwd: 0, ref: 0, swr: 1 },
            lp100a: simLp100a(prev.lp100a, false),
            acom: { ...prev.acom, tx: false, fwd: 0, ref: 0 },
            hamplus: { ...prev.hamplus, send: false },
          };
        }
        if (prev.ptt) {
          const po = Math.min(9.8, Math.max(3.2, 7.1 + (Math.random() - 0.32) * 3.4));
          const swr = Math.min(2.4, Math.max(1.02, 1.08 + Math.random() * 0.22));
          return {
            ...prev,
            smeter: 0.4,
            po,
            swr: prev.lextel.connected && prev.lextel.swr >= 1 ? prev.lextel.swr : swr,
            spe: { ...prev.spe, tx: prev.spe.operate, pout: prev.spe.operate ? 620 : 0, ipa: prev.spe.operate ? 12.4 : 0.2 },
            palstar: { ...prev.palstar, fwd: prev.spe.operate ? 600 : 8, ref: 4 },
            ldg: {
              ...prev.ldg,
              fwd: prev.ldg.connected && !prev.ldg.hardware ? Math.round(prev.ldg.maxW * 0.62) : prev.ldg.fwd,
              ref: prev.ldg.connected && !prev.ldg.hardware ? Math.round(prev.ldg.maxW * 0.02) : prev.ldg.ref,
              swr: prev.ldg.connected && !prev.ldg.hardware ? 1.12 : prev.ldg.swr,
            },
            lp100a: simLp100a(prev.lp100a, true),
            acom: {
              ...prev.acom,
              tx: prev.acom.operate && prev.acom.on && prev.acom.warmup === 0,
              fwd: prev.acom.operate && prev.acom.on && prev.acom.warmup === 0 ? 1200 : 0,
              ref: prev.acom.operate && prev.acom.on && prev.acom.warmup === 0 ? 18 : 0,
            },
            hamplus: { ...prev.hamplus, send: true },
          };
        }
        const next = Math.min(9.2, Math.max(1.4, prev.smeter + (Math.random() - 0.5) * 0.8));
        return {
          ...prev,
          smeter: next,
          po: 0,
          swr: 1,
          spe: { ...prev.spe, tx: false, pout: 0, ipa: 0.1 },
          palstar: { ...prev.palstar, fwd: 0, ref: 0 },
          ldg: prev.ldg.hardware ? prev.ldg : { ...prev.ldg, fwd: 0, ref: 0, swr: 1 },
          lp100a: simLp100a(prev.lp100a, false),
          acom: { ...prev.acom, tx: false, fwd: 0, ref: 0 },
          hamplus: { ...prev.hamplus, send: false },
        };
      });
    }, 700);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setS((prev) => {
        if (prev.acom.warmup <= 0) return prev;
        const w = Math.max(0, prev.acom.warmup - 1);
        return {
          ...prev,
          acom: {
            ...prev.acom,
            warmup: w,
            comm: w === 0,
            hv: w === 0 ? prev.acom.hv || 2500 : prev.acom.hv,
          },
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, tx, s, pushLog, setFreq, setS, kickPrimary }),
    [lang, setLang, tx, s, pushLog, setFreq, kickPrimary]
  );
  return <ConsoleCtx.Provider value={value}>{children}</ConsoleCtx.Provider>;
}

export function useConsole() {
  const ctx = useContext(ConsoleCtx);
  if (!ctx) throw new Error("useConsole outside provider");
  return ctx;
}

export function formatVfo(hz: number) {
  const mhz = hz / 1_000_000;
  const [int, frac = "000000"] = mhz.toFixed(6).split(".");
  return { int, khz: frac.slice(0, 3), hz: frac.slice(3, 5) };
}

export function formatWatts(w: number) {
  if (!Number.isFinite(w) || w <= 0) return "0";
  if (w >= 100) return w.toFixed(0);
  if (w >= 1) return w.toFixed(1);
  if (w >= 0.01) return w.toFixed(3);
  return w.toFixed(3);
}

export function sMeterLabel(s: number) {
  if (s >= 9) {
    const over = Math.round((s - 9) * 20);
    return { main: "S9", sub: over > 0 ? `+${over}` : "", dbm: -73 + over };
  }
  return { main: `S${Math.round(s)}`, sub: "", dbm: Math.round(-127 + s * 6) };
}
