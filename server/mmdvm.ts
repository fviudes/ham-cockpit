import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import { hostStatus } from "./host-status";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = "/opt/ham-cockpit/bin/mmdvm-ctl";

export const MMDVM_MODES = ["dstar", "dmr", "ysf", "p25", "nxdn", "m17", "pocsag"] as const;
export type MmdvmMode = (typeof MMDVM_MODES)[number];

/**
 * Presets de placa/modem no estilo Pi-Star / WPSD (configure.php → Hardware=).
 * Gravamos Port/UARTPort/Protocol/UARTSpeed (+ Duplex/Slot1 quando o preset define).
 * Invert/Offset ficam nos defaults do Host (HS ADF7021 ignora Invert).
 */
export type MmdvmBoardId =
  | "custom"
  | "mmdvmhshat"
  | "mmdvmhsdualhatgpio"
  | "mmdvmhsdualbandgpio"
  | "zumspotgpio"
  | "zumspotduplexgpio"
  | "zumspotusb"
  | "zumspotlibre"
  | "dvmpis"
  | "stm32dvm"
  | "stm32usb"
  | "nanodv"
  | "rptrbldrv3v4v5"
  | "rptrbldrv3v4v5hs"
  | "opengd77";

export type MmdvmBoardPreset = {
  id: MmdvmBoardId;
  /** Rótulo pt-BR (UI). */
  label: string;
  port: string;
  uartSpeed: number;
  /** null = não força Duplex ao aplicar o preset. */
  duplex: boolean | null;
  /** Simplex hotspot: Slot1=0 no DMR Network (WPSD/Pi-Star). null = não mexe. */
  slot1: boolean | null;
};

export const MMDVM_BOARD_PRESETS: readonly MmdvmBoardPreset[] = [
  { id: "custom", label: "Personalizado (porta/baud manuais)", port: "", uartSpeed: 0, duplex: null, slot1: null },
  { id: "mmdvmhshat", label: "MMDVM_HS_Hat (DB9MAT & DF2ET) GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false, slot1: false },
  // WPSD Hardware=mmdvmhsdualhatgpio → MMDVM_HS_Dual_Hat (ADF7021 duplex) @ 115200 / ttyAMA0.
  // Cartão WPSD conhecido (PY2MED) era Hardware=dvmpis + Port=/dev/ttyACM0 + Duplex=0 — outro perfil; não copiar para este preset.
  { id: "mmdvmhsdualhatgpio", label: "MMDVM HS Dual (v1.3 / HAT)", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: true, slot1: true },
  { id: "mmdvmhsdualbandgpio", label: "MMDVM_HS_Dual_Band GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false, slot1: false },
  { id: "zumspotgpio", label: "ZUMspot HAT simplex GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false, slot1: false },
  { id: "zumspotduplexgpio", label: "ZUMspot HAT duplex GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: true, slot1: true },
  { id: "zumspotusb", label: "ZUMspot USB Stick", port: "/dev/ttyACM0", uartSpeed: 115200, duplex: false, slot1: false },
  { id: "zumspotlibre", label: "ZUMspot Libre (USB)", port: "/dev/ttyACM0", uartSpeed: 115200, duplex: false, slot1: false },
  // WPSD/Pi-Star Hardware=dvmpis → DVMEGA/STM32 GPIO simplex (Port padrão ttyAMA0; alguns hats USB usam ttyACM0).
  { id: "dvmpis", label: "DVMEGA / STM32-DVM Pi (dvmpis)", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false, slot1: false },
  { id: "stm32dvm", label: "STM32-DVM / MMDVM_HS HAT GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: null, slot1: null },
  { id: "stm32usb", label: "STM32-DVM (USB)", port: "/dev/ttyUSB0", uartSpeed: 115200, duplex: null, slot1: null },
  { id: "nanodv", label: "NanoDV / NanoPi AIR GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false, slot1: false },
  { id: "rptrbldrv3v4v5", label: "Repeater Builder v3/v4/v5 115200 GPIO", port: "/dev/ttyAMA0", uartSpeed: 115200, duplex: false, slot1: false },
  { id: "rptrbldrv3v4v5hs", label: "Repeater Builder v3/v4/v5 460800 GPIO", port: "/dev/ttyAMA0", uartSpeed: 460800, duplex: false, slot1: false },
  { id: "opengd77", label: "OpenGD77 hotspot (USB)", port: "/dev/ttyACM0", uartSpeed: 115200, duplex: false, slot1: false },
] as const;

const MODE_INI: Record<MmdvmMode, { section: string; net: string }> = {
  dstar: { section: "D-Star", net: "D-Star Network" },
  dmr: { section: "DMR", net: "DMR Network" },
  ysf: { section: "System Fusion", net: "System Fusion Network" },
  p25: { section: "P25", net: "P25 Network" },
  nxdn: { section: "NXDN", net: "NXDN Network" },
  m17: { section: "M17", net: "M17 Network" },
  pocsag: { section: "POCSAG", net: "POCSAG Network" },
};

export type MmdvmHeard = {
  timeUtc: string;
  mode: string;
  callsign: string;
  target: string;
  src: "RF" | "Net";
  duration: string;
  loss: string;
  ber: string;
  rssi: string;
};

/** Snapshot da página Nextion ScreenLayout 4 (ON7LDS DIY HS) — idle vs QSO ao vivo. */
export type MmdvmNextionPage = "idle" | "dmr" | "dstar" | "ysf" | "p25" | "nxdn" | "m17" | "pocsag";

export type MmdvmNextionQso = {
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

export type MmdvmNextion = {
  page: MmdvmNextionPage;
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
  qso: MmdvmNextionQso[];
};

export type MmdvmNetwork = {
  id: "bm" | "dmrplus" | "tgif" | "xlx";
  section: string;
  name: string;
  enabled: boolean;
  address: string;
  port: number;
  password: string;
};

export type MmdvmConfig = {
  callsign: string;
  dmrId: string;
  duplex: boolean;
  rxHz: number;
  txHz: number;
  colorCode: number;
  latitude: string;
  longitude: string;
  location: string;
  /** Id do preset WPSD/Pi-Star (Hardware=); custom = porta/baud manuais. */
  modemBoard: MmdvmBoardId;
  modemPort: string;
  uartSpeed: number;
  remotePort: number;
  /** D-Star reflector (ex. REF001 / XRF002 / DCS003) — ircDDBGateway. */
  dstarReflector: string;
  /** Módulo D-Star A–Z. */
  dstarModule: string;
  /** YSF/FCS startup room (ex. FCS00120 ou nome YSFHosts). */
  ysfStartup: string;
  /**
   * Saída de vídeo dedicada do HAT (WPSD/Pi-Star):
   * None | Nextion (LCD no header do modem) | OLED (I2C SSD1306).
   */
  displayType: "None" | "Nextion" | "OLED";
  /** Porta da tela: modem (HAT), /dev/ttyNextionDriver, /dev/ttyUSB0, … */
  displayPort: string;
  /** ScreenLayout Nextion: 0=G4KLX, 2=ON7LDS high, 3=ON7LDS, 4=ON7LDS DB. */
  screenLayout: number;
  brightness: number;
  idleBrightness: number;
  /** NextionDriver ON7LDS (obrigatório para LCD no header modem com Transparent Data). */
  nextionDriver: boolean;
  /** OLED Type: 3=0.96" SSD1306 típico WPSD. */
  oledType: number;
  modes: Record<MmdvmMode, boolean>;
  networks: MmdvmNetwork[];
};

export type GwUnit = "mmdvmhost" | "dmrgateway" | "ysfgateway" | "ircddbgateway" | "nextiondriver";

export type MmdvmStatus = MmdvmConfig & {
  ok: boolean;
  installed: boolean;
  /** true = Ubuntu da estação (binários/systemd esperados). */
  appliance: boolean;
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
  tx: boolean;
  currentMode: string;
  lastHeard: MmdvmHeard[];
  /** Campos da emulação LCD Nextion (layout 4). */
  nextion: MmdvmNextion;
  /** Instant Mode Manager — pause runtime (não grava Enable permanente no INI). */
  paused: Record<MmdvmMode, boolean>;
  error: string;
};

type Ini = Record<string, Record<string, string>>;

function linux() {
  return process.platform === "linux";
}

function dataDir(): string {
  if (existsSync("/opt/ham-cockpit")) {
    const dir = "/opt/ham-cockpit/mmdvm";
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  const local = join(ROOT, "data", "mmdvm");
  mkdirSync(local, { recursive: true });
  return local;
}

function shippedHostIni() {
  return join(ROOT, "deploy", "mmdvm", "mmdvmhost.ini");
}

function shippedGwIni() {
  return join(ROOT, "deploy", "mmdvm", "dmrgateway.ini");
}

function shippedYsfIni() {
  return join(ROOT, "deploy", "mmdvm", "ysfgateway.ini");
}

function shippedDstarConf() {
  return join(ROOT, "deploy", "mmdvm", "ircddbgateway.conf");
}

function firstExisting(paths: string[]): string {
  return paths.find((p) => existsSync(p)) ?? "";
}

/** Caminho editável (nunca o template em deploy/). */
function editablePath(etcPath: string, localName: string, shipped: string): string {
  if (existsSync(etcPath)) return etcPath;
  const local = join(dataDir(), localName);
  if (!existsSync(local) && existsSync(shipped)) {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(local, readFileSync(shipped, "utf8"), "utf8");
  }
  return local;
}

export function hostIniPath(): string {
  return editablePath("/etc/mmdvmhost", "mmdvmhost.ini", shippedHostIni());
}

export function gatewayIniPath(): string {
  return editablePath("/etc/dmrgateway", "dmrgateway.ini", shippedGwIni());
}

export function ysfIniPath(): string {
  return editablePath("/etc/ysfgateway", "ysfgateway.ini", shippedYsfIni());
}

export function dstarIniPath(): string {
  if (existsSync("/etc/ircddbgateway")) return "/etc/ircddbgateway";
  const dir = dataDir();
  const noext = join(dir, "ircddbgateway");
  const conf = join(dir, "ircddbgateway.conf");
  if (!existsSync(noext) && !existsSync(conf) && existsSync(shippedDstarConf())) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(conf, readFileSync(shippedDstarConf(), "utf8"), "utf8");
  }
  if (existsSync(conf) && !existsSync(noext)) {
    try {
      copyFileSync(conf, noext);
    } catch {
      try {
        writeFileSync(noext, readFileSync(conf, "utf8"), "utf8");
      } catch {
        /* ignore */
      }
    }
  }
  if (existsSync(noext)) return noext;
  return editablePath("/etc/ircddbgateway", "ircddbgateway.conf", shippedDstarConf());
}

function hostBinary(): string {
  return firstExisting(["/usr/local/bin/MMDVMHost", "/usr/bin/MMDVMHost", "/opt/MMDVMHost/MMDVMHost"]);
}

function gatewayBinary(): string {
  return firstExisting(["/usr/local/bin/DMRGateway", "/usr/bin/DMRGateway", "/opt/DMRGateway/DMRGateway"]);
}

function ysfBinary(): string {
  return firstExisting(["/usr/local/bin/YSFGateway", "/usr/bin/YSFGateway"]);
}

function dstarBinary(): string {
  return firstExisting(["/usr/local/bin/ircddbgatewayd", "/usr/bin/ircddbgatewayd", "/usr/local/bin/ircDDBGateway"]);
}

function nextionBinary(): string {
  return firstExisting(["/usr/local/bin/NextionDriver", "/usr/bin/NextionDriver", "/opt/NextionDriver/NextionDriver"]);
}

type Conf = Record<string, string>;

function parseConf(text: string): Conf {
  const out: Conf = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

function parseConfFile(path: string): Conf {
  try {
    if (!existsSync(path)) return {};
    return parseConf(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function stringifyConf(conf: Conf, header = ""): string {
  const lines: string[] = [];
  if (header) lines.push(header, "");
  for (const [k, v] of Object.entries(conf)) lines.push(`${k}=${v}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

function localNameForDest(dest: string): string {
  if (dest.includes("ysf")) return "ysfgateway.ini";
  if (dest.includes("ircddb") || dest.includes("dstar")) return "ircddbgateway.conf";
  if (dest.includes("dmr")) return "dmrgateway.ini";
  return "mmdvmhost.ini";
}

function logDir(): string {
  const fromIni = parseIniFile(hostIniPath())["Log"]?.FilePath?.replace(/^"|"$/g, "") ?? "";
  return firstExisting([fromIni, "/var/log/pi-star", "/var/log/mmdvm", join(dataDir(), "logs")]) || join(dataDir(), "logs");
}

function parseIni(text: string): Ini {
  const out: Ini = {};
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1]!;
      if (!out[section]) out[section] = {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 1 || !section) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!out[section]) out[section] = {};
    out[section]![key] = value;
  }
  return out;
}

function parseIniFile(path: string): Ini {
  try {
    if (!existsSync(path)) return {};
    return parseIni(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function stringifyIni(ini: Ini): string {
  const lines: string[] = [
    "; Ham Cockpit MMDVM — layout WPSD / Pi-Star (MMDVMHost + DMRGateway).",
    "; Canonical stack: https://wpsd.radio  ·  g4klx/MMDVMHost  ·  g4klx/DMRGateway",
    "",
  ];
  for (const [section, kv] of Object.entries(ini)) {
    lines.push(`[${section}]`);
    for (const [k, v] of Object.entries(kv)) {
      const needsQuote = /[\s#;]/.test(v) && !/^".*"$/.test(v);
      lines.push(`${k}=${needsQuote ? `"${v}"` : v}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function iniGet(ini: Ini, section: string, key: string, fallback = ""): string {
  return ini[section]?.[key] ?? fallback;
}

function iniNum(ini: Ini, section: string, key: string, fallback: number): number {
  const n = Number(iniGet(ini, section, key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

function iniOn(ini: Ini, section: string, key = "Enable"): boolean {
  return iniGet(ini, section, key, "0") === "1";
}

function setKv(ini: Ini, section: string, key: string, value: string) {
  if (!ini[section]) ini[section] = {};
  ini[section]![key] = value;
}

function defaultConfig(): MmdvmConfig {
  return {
    callsign: "N0CALL",
    dmrId: "0000000",
    duplex: false,
    rxHz: 433_475_000,
    txHz: 433_475_000,
    colorCode: 1,
    latitude: "0.0",
    longitude: "0.0",
    location: "Ham Cockpit",
    modemBoard: "mmdvmhshat",
    modemPort: "/dev/ttyAMA0",
    uartSpeed: 115200,
    remotePort: 7642,
    dstarReflector: "",
    dstarModule: "B",
    ysfStartup: "",
    displayType: "Nextion",
    displayPort: "modem",
    screenLayout: 4,
    brightness: 50,
    idleBrightness: 20,
    nextionDriver: true,
    oledType: 3,
    modes: { dstar: false, dmr: true, ysf: false, p25: false, nxdn: false, m17: false, pocsag: false },
    networks: [
      { id: "bm", section: "DMR Network 1", name: "BrandMeister", enabled: true, address: "3101.repeater.net", port: 62031, password: "passw0rd" },
      { id: "dmrplus", section: "DMR Network 2", name: "DMR+", enabled: false, address: "94.198.196.128", port: 8880, password: "passw0rd" },
      { id: "tgif", section: "DMR Network 3", name: "TGIF", enabled: false, address: "tgif.network", port: 62031, password: "passw0rd" },
      { id: "xlx", section: "XLX Network", name: "XLX", enabled: false, address: "xlx.example.net", port: 62030, password: "" },
    ],
  };
}

function configFromFiles(): MmdvmConfig {
  const host = parseIniFile(hostIniPath());
  const gw = parseIniFile(gatewayIniPath());
  const ysf = parseIniFile(ysfIniPath());
  const dstar = parseConfFile(dstarIniPath());
  const base = defaultConfig();
  const modemPort = iniGet(host, "Modem", "UARTPort") || iniGet(host, "Modem", "Port") || base.modemPort;
  const nets: MmdvmNetwork[] = base.networks.map((n) => {
    const sec = gw[n.section] ?? {};
    return {
      ...n,
      name: sec.Name || n.name,
      enabled: (sec.Enabled ?? sec.Enable ?? "0") === "1",
      address: sec.Address || n.address,
      port: Number(sec.Port) || n.port,
      password: sec.Password || n.password,
    };
  });
  const modes = { ...base.modes };
  for (const mode of MMDVM_MODES) {
    modes[mode] = iniOn(host, MODE_INI[mode].section);
  }
  const module = iniGet(host, "D-Star", "Module", base.dstarModule) || dstar.module || base.dstarModule;
  return {
    callsign: iniGet(host, "General", "Callsign", base.callsign),
    dmrId: iniGet(host, "General", "Id", base.dmrId),
    duplex: iniGet(host, "General", "Duplex", "0") === "1",
    rxHz: iniNum(host, "Info", "RXFrequency", base.rxHz),
    txHz: iniNum(host, "Info", "TXFrequency", base.txHz),
    colorCode: iniNum(host, "DMR", "ColorCode", base.colorCode),
    latitude: iniGet(host, "Info", "Latitude", base.latitude),
    longitude: iniGet(host, "Info", "Longitude", base.longitude),
    location: iniGet(host, "Info", "Location", base.location).replace(/^"|"$/g, ""),
    modemBoard: readModemBoard(),
    modemPort,
    uartSpeed: iniNum(host, "Modem", "UARTSpeed", base.uartSpeed),
    remotePort: iniNum(host, "Remote Control", "Port", base.remotePort),
    dstarReflector: (dstar.reflector1 || "").toUpperCase(),
    dstarModule: String(module || "B").toUpperCase().slice(0, 1),
    ysfStartup: iniGet(ysf, "Network", "Startup", base.ysfStartup),
    displayType: (() => {
      const d = iniGet(host, "General", "Display", base.displayType);
      if (d === "Nextion" || d === "OLED" || d === "None") return d;
      return base.displayType;
    })(),
    displayPort: (() => {
      const drv = iniGet(host, "NextionDriver", "Port", "");
      const nx = iniGet(host, "Nextion", "Port", "");
      if (drv && drv !== "/dev/ttyNextionDriver") return drv;
      if (nx && nx !== "/dev/ttyNextionDriver") return nx;
      return base.displayPort;
    })(),
    screenLayout: iniNum(host, "Nextion", "ScreenLayout", base.screenLayout),
    brightness: iniNum(host, "Nextion", "Brightness", base.brightness),
    idleBrightness: iniNum(host, "Nextion", "IdleBrightness", base.idleBrightness),
    nextionDriver:
      iniGet(host, "NextionDriver", "Enable", "") === "1" ||
      iniGet(host, "Nextion", "Port", "").includes("ttyNextionDriver"),
    oledType: iniNum(host, "OLED", "Type", base.oledType),
    modes,
    networks: nets,
  };
}

function applyConfig(host: Ini, gw: Ini, ysf: Ini, dstar: Conf, cfg: Partial<MmdvmConfig>) {
  const cur = { ...defaultConfig(), ...configFromFiles(), ...cfg };
  // Preferir o callsign enviado no PUT; nunca voltar ao placeholder se o operador mandou outro.
  const rawCall = String(cfg.callsign ?? cur.callsign ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const call = rawCall || cur.callsign.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "N0CALL";
  const id = cur.dmrId.replace(/\D/g, "").slice(0, 9) || "0000000";
  const mod = (cur.dstarModule || "B").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1) || "B";
  const rxHz = Number.isFinite(cur.rxHz) && cur.rxHz > 0 ? Math.round(cur.rxHz) : 433_475_000;
  const txHz = Number.isFinite(cur.txHz) && cur.txHz > 0 ? Math.round(cur.txHz) : rxHz;
  setKv(host, "General", "Callsign", call);
  setKv(host, "General", "Id", id);
  setKv(host, "General", "Duplex", cur.duplex ? "1" : "0");
  setKv(host, "Info", "RXFrequency", String(rxHz));
  // TX é sempre persistido (editável no console); não forçar TX=RX no save.
  setKv(host, "Info", "TXFrequency", String(txHz));
  setKv(host, "Info", "Latitude", cur.latitude);
  setKv(host, "Info", "Longitude", cur.longitude);
  setKv(host, "Info", "Location", cur.location);
  setKv(host, "DMR", "Id", id);
  setKv(host, "DMR", "ColorCode", String(Math.min(15, Math.max(0, cur.colorCode))));
  setKv(host, "D-Star", "Module", mod);
  // Preset de placa (WPSD/Pi-Star Hardware=): aplica Port/Speed/Duplex/Slot1.
  const board = boardPreset(cur.modemBoard || "custom");
  writeModemBoard(board.id);
  let modemPort = cur.modemPort || "/dev/ttyAMA0";
  let uartSpeed = cur.uartSpeed || 115200;
  if (board.id !== "custom") {
    if (board.port) modemPort = board.port;
    if (board.uartSpeed > 0) uartSpeed = board.uartSpeed;
    if (board.duplex !== null) {
      setKv(host, "General", "Duplex", board.duplex ? "1" : "0");
      // Não sobrescrever TXFrequency aqui — o valor do console já foi gravado acima.
    }
    if (board.slot1 === false) setKv(host, "DMR Network", "Slot1", "0");
    if (board.slot1 === true) setKv(host, "DMR Network", "Slot1", "1");
  }
  setKv(host, "Modem", "Port", modemPort);
  setKv(host, "Modem", "UARTPort", modemPort);
  setKv(host, "Modem", "Protocol", "uart");
  setKv(host, "Modem", "UARTSpeed", String(uartSpeed));
  // Defaults WPSD para HAT/USB HS (Invert sem efeito no ADF7021; Trace off).
  if (!iniGet(host, "Modem", "TXInvert")) setKv(host, "Modem", "TXInvert", "1");
  if (!iniGet(host, "Modem", "RXInvert")) setKv(host, "Modem", "RXInvert", "0");
  if (!iniGet(host, "Modem", "PTTInvert")) setKv(host, "Modem", "PTTInvert", "0");
  if (!iniGet(host, "Modem", "Trace")) setKv(host, "Modem", "Trace", "0");
  setKv(host, "Remote Control", "Enable", "1");
  setKv(host, "Remote Control", "Port", String(cur.remotePort || 7642));
  setKv(host, "DMR Network", "Type", "Gateway");
  setKv(host, "DMR Network", "Address", "127.0.0.1");
  setKv(host, "DMR Network", "Port", "62031");
  setKv(host, "DMR Network", "Local", "62032");
  setKv(host, "DMR Network", "RemoteAddress", "127.0.0.1");
  setKv(host, "DMR Network", "RemotePort", "62031");
  setKv(host, "DMR Network", "LocalPort", "62032");
  setKv(host, "D-Star Network", "GatewayAddress", "127.0.0.1");
  setKv(host, "D-Star Network", "GatewayPort", "20010");
  setKv(host, "D-Star Network", "LocalPort", "20011");
  setKv(host, "System Fusion Network", "LocalAddress", "127.0.0.1");
  setKv(host, "System Fusion Network", "LocalPort", "3200");
  setKv(host, "System Fusion Network", "GatewayAddress", "127.0.0.1");
  setKv(host, "System Fusion Network", "GatewayPort", "4200");
  for (const mode of MMDVM_MODES) {
    const on = cur.modes[mode] ? "1" : "0";
    setKv(host, MODE_INI[mode].section, "Enable", on);
    setKv(host, MODE_INI[mode].net, "Enable", on);
  }
  setKv(gw, "General", "Callsign", call);
  setKv(gw, "General", "Id", id);
  setKv(gw, "General", "RptAddress", "127.0.0.1");
  setKv(gw, "General", "RptPort", "62032");
  setKv(gw, "General", "LocalAddress", "127.0.0.1");
  setKv(gw, "General", "LocalPort", "62031");
  const nets = cfg.networks ?? cur.networks;
  for (const n of nets) {
    setKv(gw, n.section, "Enabled", n.enabled ? "1" : "0");
    setKv(gw, n.section, "Name", n.name);
    setKv(gw, n.section, "Address", n.address);
    setKv(gw, n.section, "Port", String(n.port));
    if (n.password !== undefined) setKv(gw, n.section, "Password", n.password);
    if (n.id !== "xlx") setKv(gw, n.section, "Id", id);
  }
  setKv(ysf, "General", "Callsign", call);
  setKv(ysf, "General", "Id", id);
  setKv(ysf, "General", "RptAddress", "127.0.0.1");
  setKv(ysf, "General", "RptPort", "3200");
  setKv(ysf, "General", "LocalAddress", "127.0.0.1");
  setKv(ysf, "General", "LocalPort", "4200");
  setKv(ysf, "Info", "RXFrequency", String(rxHz));
  setKv(ysf, "Info", "TXFrequency", String(txHz));
  setKv(ysf, "Info", "Latitude", cur.latitude);
  setKv(ysf, "Info", "Longitude", cur.longitude);
  setKv(ysf, "Info", "Name", cur.location || "Ham Cockpit");
  setKv(ysf, "Network", "Startup", cur.ysfStartup || "");
  setKv(ysf, "Remote Commands", "Enable", "1");
  setKv(ysf, "Remote Commands", "Port", "6073");
  dstar.gatewayCallsign = call;
  dstar.dplusLogin = call;
  // DPlus/DExtra: não bindar só em 127.0.0.1 (lab: UDP 20001 em localhost bloqueava REF*).
  dstar.gatewayAddress = "0.0.0.0";
  dstar.localAddress = "0.0.0.0";
  dstar.dplusEnabled = "1";
  dstar.latitude = cur.latitude;
  dstar.longitude = cur.longitude;
  dstar.latitude1 = cur.latitude;
  dstar.longitude1 = cur.longitude;
  dstar.frequency1 = (rxHz / 1_000_000).toFixed(6);
  dstar.reflector1 = (cur.dstarReflector || "").toUpperCase().slice(0, 8);
  dstar.atStartup1 = cur.dstarReflector ? "1" : "0";
  dstar.reconnect1 = cur.dstarReflector ? "2" : "0";
  dstar.name = cur.location || "Ham Cockpit";
  dstar.remoteEnabled = "1";
  dstar.remotePort = "7643";
  dstar.logPath = "/var/log/mmdvm";

  // Display dedicado (Nextion no HAT / OLED I2C) — padrão WPSD + ON7LDS NextionDriver.
  const dtype = cur.displayType || "None";
  setKv(host, "General", "Display", dtype);
  const physPort = (cur.displayPort || "modem").trim() || "modem";
  const useDriver = dtype === "Nextion" && cur.nextionDriver;
  const nextionHostPort = useDriver ? "/dev/ttyNextionDriver" : physPort === "modem" ? "modem" : physPort;
  setKv(host, "Nextion", "Port", nextionHostPort);
  setKv(host, "Nextion", "Brightness", String(Math.min(100, Math.max(0, cur.brightness ?? 50))));
  setKv(host, "Nextion", "IdleBrightness", String(Math.min(100, Math.max(0, cur.idleBrightness ?? 20))));
  setKv(host, "Nextion", "ScreenLayout", String(cur.screenLayout ?? 4));
  setKv(host, "Nextion", "DisplayClock", "1");
  setKv(host, "Nextion", "UTC", "0");
  setKv(host, "OLED", "Type", String(cur.oledType ?? 3));
  setKv(host, "OLED", "Scroll", "1");
  setKv(host, "OLED", "LogoScreensaver", "1");
  // Transparent Data obrigatório quando a LCD está no header serial do modem (Port=modem).
  const transparent = useDriver && (physPort === "modem" || physPort === "/dev/ttyNextionDriver");
  setKv(host, "Transparent Data", "Enable", transparent || (dtype === "Nextion" && physPort === "modem") ? "1" : "0");
  setKv(host, "Transparent Data", "RemoteAddress", "127.0.0.1");
  setKv(host, "Transparent Data", "RemotePort", "40094");
  setKv(host, "Transparent Data", "LocalPort", "40095");
  setKv(host, "Transparent Data", "SendFrameType", "1");
  setKv(host, "NextionDriver", "Enable", useDriver ? "1" : "0");
  setKv(host, "NextionDriver", "Port", useDriver ? (physPort === "/dev/ttyNextionDriver" ? "modem" : physPort) : physPort);
  setKv(host, "NextionDriver", "DataFilesPath", "/usr/local/etc/");
  setKv(host, "NextionDriver", "LogLevel", "2");
  setKv(host, "NextionDriver", "GroupsFile", "groups.txt");
  setKv(host, "NextionDriver", "DMRidFile", "users.csv");
  setKv(host, "NextionDriver", "WaitForLan", "0");
  setKv(host, "TFT Serial", "Port", physPort === "modem" ? "modem" : physPort);
}

async function helper(cmd: string, ...args: string[]): Promise<string> {
  if (!existsSync(HELPER)) return "";
  try {
    if (cmd === "start" || cmd === "stop" || cmd === "restart") unitCache = null;
    const { stdout } = await execFileAsync("sudo", ["-n", HELPER, cmd, ...args], {
      timeout: cmd === "is-active-all" || cmd === "is-active" ? 8_000 : 90_000,
      windowsHide: true,
    });
    if (cmd === "start" || cmd === "stop" || cmd === "restart") unitCache = null;
    return String(stdout || "").trim();
  } catch {
    return "";
  }
}

const UNIT_NAMES = ["mmdvmhost", "dmrgateway", "ysfgateway", "ircddbgateway", "nextiondriver"] as const;
let unitCache: { at: number; map: Record<string, string> } | null = null;
let unitInflight: Promise<Record<string, string>> | null = null;

/** Um único spawn (sudo mmdvm-ctl is-active-all) com cache curto — antes eram 5–10 por poll. */
async function unitStates(): Promise<Record<string, string>> {
  if (unitCache && Date.now() - unitCache.at < 2500) return unitCache.map;
  if (unitInflight) return unitInflight;
  unitInflight = (async () => {
    const map: Record<string, string> = {};
    const out = await helper("is-active-all");
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^(\w+)=(\S+)/);
      if (m) map[m[1]] = m[2];
    }
    if (!UNIT_NAMES.every((n) => n in map)) {
      try {
        const { stdout } = await execFileAsync(
          "systemctl",
          ["is-active", ...UNIT_NAMES.map((n) => `${n}.service`)],
          { timeout: 4000, windowsHide: true },
        );
        String(stdout).split(/\r?\n/).forEach((v, i) => {
          if (UNIT_NAMES[i] && v.trim()) map[UNIT_NAMES[i]] = v.trim();
        });
      } catch (err) {
        // is-active sai ≠0 se algum estiver inativo, mas o stdout traz todos.
        const out2 = String((err as { stdout?: string }).stdout || "");
        out2.split(/\r?\n/).forEach((v, i) => {
          if (UNIT_NAMES[i] && v.trim()) map[UNIT_NAMES[i]] = v.trim();
        });
      }
    }
    unitCache = { at: Date.now(), map };
    return map;
  })().finally(() => {
    unitInflight = null;
  });
  return unitInflight;
}

async function unitActive(unit: GwUnit): Promise<boolean> {
  if (!linux()) return false;
  return (await unitStates())[unit] === "active";
}

function logDate(offsetSec = 0): string {
  const d = new Date(Date.now() - offsetSec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readLogTail(dir: string, prefix: string, maxBytes = 400_000): string {
  const names = [`${prefix}-${logDate()}.log`, `${prefix}-${logDate(86_340)}.log`];
  let buf = "";
  for (const name of names) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf8");
      buf += raw.length > maxBytes ? raw.slice(-maxBytes) : raw;
      buf += "\n";
    } catch {
      /* ignore */
    }
  }
  if (buf) return buf;
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(".log"))
      .sort();
    const last = files[files.length - 1];
    if (!last) return "";
    const raw = readFileSync(join(dir, last), "utf8");
    return raw.length > maxBytes ? raw.slice(-maxBytes) : raw;
  } catch {
    return "";
  }
}

function pausedPath(): string {
  return join(dataDir(), "paused-modes.json");
}

function boardPath(): string {
  return join(dataDir(), "modem-board.json");
}

function readModemBoard(): MmdvmBoardId {
  try {
    const raw = JSON.parse(readFileSync(boardPath(), "utf8")) as { board?: string };
    const id = String(raw.board || "");
    if (MMDVM_BOARD_PRESETS.some((p) => p.id === id)) return id as MmdvmBoardId;
  } catch {
    /* missing */
  }
  return "mmdvmhshat";
}

function writeModemBoard(board: MmdvmBoardId) {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(boardPath(), `${JSON.stringify({ board }, null, 2)}\n`, "utf8");
}

function boardPreset(id: MmdvmBoardId): MmdvmBoardPreset {
  return MMDVM_BOARD_PRESETS.find((p) => p.id === id) ?? MMDVM_BOARD_PRESETS[0]!;
}

function emptyPaused(): Record<MmdvmMode, boolean> {
  return { dstar: false, dmr: false, ysf: false, p25: false, nxdn: false, m17: false, pocsag: false };
}

function readPaused(): Record<MmdvmMode, boolean> {
  const out = emptyPaused();
  try {
    const raw = JSON.parse(readFileSync(pausedPath(), "utf8")) as Record<string, unknown>;
    for (const mode of MMDVM_MODES) {
      if (typeof raw[mode] === "boolean") out[mode] = raw[mode] as boolean;
    }
  } catch {
    /* missing = none paused */
  }
  return out;
}

function writePaused(paused: Record<MmdvmMode, boolean>) {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(pausedPath(), `${JSON.stringify(paused, null, 2)}\n`, "utf8");
}

/** Unit systemd do gateway do modo (WPSD Instant Mode Manager). */
function modeGatewayTarget(mode: MmdvmMode): GwUnit | "host" {
  if (mode === "dmr") return "dmrgateway";
  if (mode === "ysf") return "ysfgateway";
  if (mode === "dstar") return "ircddbgateway";
  return "host";
}

/** WPSD/Pi-Star last-heard: MMDVMHost M: lines with from/to (see WPSD-WebCode mmdvmhost/functions.php getHeardList). */
export function parseLastHeard(logText: string, limit = 40): MmdvmHeard[] {
  const rows: MmdvmHeard[] = [];
  const seen = new Map<string, MmdvmHeard>();
  const lines = logText.split(/\r?\n/).reverse();
  const skip =
    /BS_Dwn_Act|invalid access|packet received from an invalid source|received RF header for wrong repeater|unable to decode the network CSBK|overflow in the DMR slot RF queue|overflow in the System Fusion RF queue|non repeater RF header|Embedded Talker Alias|DMR Talker Alias|CSBK Preamble|Preamble CSBK|Downlink/i;
  for (const line of lines) {
    if (!line.startsWith("M:")) continue;
    if (skip.test(line)) continue;
    if (!/\bfrom\b/i.test(line) || !/\bto\b/i.test(line)) continue;
    const m = line.match(
      /^M:\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\.\d+\s+([^,]+),\s+received\s+(RF|network)\b.+?\bfrom\s+(.+?)\s+to\s+(.+)$/i,
    );
    if (!m) continue;
    const mode = m[2]!.trim();
    const src: "RF" | "Net" = m[3]!.toLowerCase() === "rf" ? "RF" : "Net";
    let callsign = m[4]!.trim();
    if (callsign.includes("/")) callsign = callsign.split("/").pop()!.trim();
    const extra = m[5]!.trim().split(",").map((s) => s.trim());
    const target = (extra[0] ?? "").replace(/\s+via\s+.*$/i, "").trim();
    let duration = "";
    let loss = "";
    let ber = "";
    let rssi = "";
    for (const part of extra.slice(1)) {
      if (/seconds/i.test(part)) duration = part.replace(/\s*seconds.*/i, "").trim();
      else if (/RSSI/i.test(part)) rssi = part.replace(/^RSSI:\s*/i, "").trim();
      else if (/loss/i.test(part) || /packet loss/i.test(part)) loss = part.replace(/\s*packet loss.*/i, "").trim();
      else if (/BER/i.test(part)) ber = part.replace(/^BER:\s*/i, "").trim();
    }
    const kind =
      mode.startsWith("DMR") ||
      mode.startsWith("D-Star") ||
      mode.startsWith("YSF") ||
      mode.startsWith("P25") ||
      mode.startsWith("NXDN") ||
      mode.startsWith("M17") ||
      mode.startsWith("POCSAG");
    if (!kind || !callsign || callsign === "??????") continue;
    const uuid = `${callsign}#${mode}#${src}`;
    const row: MmdvmHeard = { timeUtc: m[1]!, mode, callsign, target, src, duration, loss, ber, rssi };
    const prev = seen.get(uuid);
    // Preferir fim de QSO (com duração), como getLastHeard do WPSD.
    if (!prev || (!prev.duration && row.duration)) seen.set(uuid, row);
    if (seen.size >= limit * 2) break;
  }
  for (const row of Array.from(seen.values())) {
    rows.push(row);
    if (rows.length >= limit) break;
  }
  return rows;
}

function currentTx(rows: MmdvmHeard[]): boolean {
  return rows.some((r) => !r.duration);
}

function lanIpv4(): string {
  const ifs = networkInterfaces();
  const preferred = ["eth0", "enp0s3", "enp1s0", "wlan0", "wlp2s0", "Ethernet", "Wi-Fi"];
  const skip = /^(lo|docker|br-|veth|virbr|tailscale|vmnet|vEthernet)/i;
  const pick = (name: string) => {
    for (const a of ifs[name] ?? []) {
      const family = String(a.family);
      if ((family === "IPv4" || family === "4") && !a.internal) return a.address;
    }
    return "";
  };
  for (const name of preferred) {
    const ip = pick(name);
    if (ip) return ip;
  }
  for (const [name, addrs] of Object.entries(ifs)) {
    if (skip.test(name)) continue;
    for (const a of addrs ?? []) {
      const family = String(a.family);
      if ((family === "IPv4" || family === "4") && !a.internal) return a.address;
    }
  }
  return "";
}

type LutFile = { mtime: number; size: number; byId: Map<string, string>; byCall: Map<string, string> };
const lutCache = new Map<string, LutFile>();
const LUT_MAX_BYTES = 12 * 1024 * 1024;

function lutPaths(): string[] {
  const host = existsSync(hostIniPath()) ? parseIniFile(hostIniPath()) : {};
  const raw = iniGet(host, "NextionDriver", "DataFilesPath", "/usr/local/etc/");
  const dir = raw.replace(/[/\\]+$/, "") || "/usr/local/etc";
  return [dir, "/usr/local/etc", join(dataDir()), join(ROOT, "deploy", "mmdvm")];
}

function findLutFile(name: string): string {
  for (const dir of lutPaths()) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return "";
}

function loadLut(path: string, kind: "users" | "groups"): LutFile {
  const st = statSync(path);
  const prev = lutCache.get(path);
  if (prev && prev.mtime === st.mtimeMs && prev.size === st.size) return prev;
  const byId = new Map<string, string>();
  const byCall = new Map<string, string>();
  if (st.size > 0 && st.size <= LUT_MAX_BYTES) {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const cols = line.split(/[,;\t]/);
      const id = (cols[0] ?? "").trim();
      if (!id || !/^\d+$/.test(id)) continue;
      if (kind === "groups") {
        const name = (cols[1] ?? "").trim();
        if (name) byId.set(id, name);
        continue;
      }
      const call = (cols[1] ?? "").trim().toUpperCase();
      const name = (cols[2] ?? "").trim();
      if (name) byId.set(id, name);
      if (call && name) byCall.set(call, name);
    }
  }
  const next = { mtime: st.mtimeMs, size: st.size, byId, byCall };
  lutCache.set(path, next);
  return next;
}

function lookupUser(callOrId: string): string {
  const path = findLutFile("users.csv");
  if (!path) return "";
  try {
    const lut = loadLut(path, "users");
    const raw = callOrId.trim();
    if (/^\d+$/.test(raw)) return lut.byId.get(raw) ?? "";
    return lut.byCall.get(raw.toUpperCase()) ?? "";
  } catch {
    return "";
  }
}

function lookupGroup(target: string): string {
  const path = findLutFile("groups.txt");
  if (!path) return "";
  const id = (target.match(/\d{2,}/) ?? [])[0] ?? "";
  if (!id) return "";
  try {
    return loadLut(path, "groups").byId.get(id) ?? "";
  } catch {
    return "";
  }
}

function heardPage(mode: string): MmdvmNextionPage {
  const m = mode.toUpperCase();
  if (m.startsWith("DMR")) return "dmr";
  if (m.startsWith("D-STAR") || m.startsWith("DSTAR")) return "dstar";
  if (m.startsWith("YSF") || m.includes("FUSION")) return "ysf";
  if (m.startsWith("P25")) return "p25";
  if (m.startsWith("NXDN")) return "nxdn";
  if (m.startsWith("M17")) return "m17";
  if (m.startsWith("POCSAG")) return "pocsag";
  return "idle";
}

function heardSlot(mode: string): number | null {
  const m = mode.match(/slot\s+(\d)/i);
  return m ? Number(m[1]) : null;
}

function toQso(row: MmdvmHeard): MmdvmNextionQso {
  return {
    mode: row.mode,
    slot: heardSlot(row.mode),
    src: row.src,
    callsign: row.callsign,
    name: lookupUser(row.callsign),
    target: row.target,
    tgName: lookupGroup(row.target),
    ber: row.ber,
    rssi: row.rssi,
    loss: row.loss,
  };
}

async function buildNextion(cfg: MmdvmConfig, heard: MmdvmHeard[], hostRunning: boolean): Promise<MmdvmNextion> {
  const live = heard.filter((r) => !r.duration).slice(0, 2);
  const page = hostRunning && live[0] ? heardPage(live[0].mode) : "idle";
  let status = "MMDVM IDLE";
  if (!hostRunning) status = "MMDVM IDLE";
  else if (live[0]) status = `${live[0].src === "RF" ? "RF" : "net"} ${live[0].callsign}`;
  let cpuTempC: number | null = null;
  let diskFreePct: number | null = null;
  if (linux()) {
    try {
      const hs = await hostStatus();
      cpuTempC = hs.cpuTempC;
      if (hs.diskTotalBytes > 0) diskFreePct = Math.round((hs.diskFreeBytes / hs.diskTotalBytes) * 100);
    } catch {
      /* t20/t23 só no Pi */
    }
  }
  return {
    page,
    status,
    callsign: cfg.callsign,
    dmrId: cfg.dmrId,
    ip: lanIpv4(),
    location: cfg.location,
    rxHz: cfg.rxHz,
    txHz: cfg.txHz,
    cpuTempC,
    diskFreePct,
    duplex: cfg.duplex,
    qso: live.map(toQso),
  };
}

async function writeProtected(dest: string, body: string): Promise<void> {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const localName = localNameForDest(dest);
  let target = dest;
  if (dest.includes("deploy\\mmdvm") || dest.includes("deploy/mmdvm")) {
    target = join(dir, localName);
  }
  const tmp = join(dir, `.${localName}.${process.pid}.tmp`);
  writeFileSync(tmp, body, "utf8");
  if (linux() && target.startsWith("/etc/") && existsSync(HELPER)) {
    const out = await helper("install-ini", tmp, target);
    if (!out) {
      try {
        writeFileSync(target, body, "utf8");
      } catch {
        renameSync(tmp, join(dir, localName));
        return;
      }
    }
    try {
      writeFileSync(join(dir, localName), body, "utf8");
    } catch {
      /* mirror optional */
    }
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  renameSync(tmp, target);
}

/** g4klx lê <confdir>/ircddbgateway (sem .conf); o console também grava .conf. */
async function writeDstarConf(primary: string, body: string): Promise<void> {
  await writeProtected(primary, body);
  const noext = primary.endsWith(".conf") ? primary.slice(0, -5) : primary;
  const withConf = primary.endsWith(".conf") ? primary : `${primary}.conf`;
  for (const extra of [noext, withConf]) {
    if (extra === primary) continue;
    try {
      writeFileSync(extra, body, "utf8");
    } catch {
      /* mirror opcional */
    }
  }
}

/** Junta seções de display do template se o INI local for antigo (sem [Nextion]). */
function upgradeHostDisplaySections(hostPath: string) {
  if (!existsSync(hostPath) || !existsSync(shippedHostIni())) return;
  const host = parseIniFile(hostPath);
  const shipped = parseIniFile(shippedHostIni());
  let changed = false;
  for (const sec of ["Nextion", "OLED", "Transparent Data", "NextionDriver", "TFT Serial", "HD44780", "LCDproc"]) {
    if (!host[sec] && shipped[sec]) {
      host[sec] = { ...shipped[sec] };
      changed = true;
    }
  }
  // INI antigo com Display=None → default HAT LCD (WPSD) quando há seção Nextion.
  const display = host.General?.Display ?? "";
  if ((!display || display === "None") && (host.Nextion || shipped.Nextion)) {
    if (!host.General) host.General = {};
    host.General.Display = "Nextion";
    if (!host.Nextion && shipped.Nextion) host.Nextion = { ...shipped.Nextion };
    if (!host.NextionDriver && shipped.NextionDriver) host.NextionDriver = { ...shipped.NextionDriver };
    if (!host["Transparent Data"] && shipped["Transparent Data"]) host["Transparent Data"] = { ...shipped["Transparent Data"] };
    if (host.NextionDriver) host.NextionDriver.Enable = "1";
    if (host["Transparent Data"]) host["Transparent Data"].Enable = "1";
    changed = true;
  }
  if (changed) writeFileSync(hostPath, stringifyIni(host), "utf8");
}

function seedIfMissing() {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const seeds: Array<[string, string, string]> = [
    ["/etc/mmdvmhost", "mmdvmhost.ini", shippedHostIni()],
    ["/etc/dmrgateway", "dmrgateway.ini", shippedGwIni()],
    ["/etc/ysfgateway", "ysfgateway.ini", shippedYsfIni()],
    ["/etc/ircddbgateway", "ircddbgateway.conf", shippedDstarConf()],
  ];
  for (const [etc, name, shipped] of seeds) {
    if (!existsSync(etc) && !existsSync(join(dir, name)) && existsSync(shipped)) {
      writeFileSync(join(dir, name), readFileSync(shipped, "utf8"), "utf8");
    }
  }
  const dstarConf = join(dir, "ircddbgateway.conf");
  const dstarNoext = join(dir, "ircddbgateway");
  if (existsSync(dstarConf) && !existsSync(dstarNoext)) {
    try {
      copyFileSync(dstarConf, dstarNoext);
    } catch {
      /* ignore */
    }
  }
  const hostPath = hostIniPath();
  if (!hostPath.includes(`${join("deploy", "mmdvm")}`)) upgradeHostDisplaySections(hostPath);
}

export async function mmdvmStatus(): Promise<MmdvmStatus> {
  seedIfMissing();
  const cfg = configFromFiles();
  const hostBin = hostBinary();
  const gwBin = gatewayBinary();
  const ysfBin = ysfBinary();
  const dstarBin = dstarBinary();
  const nxBin = nextionBinary();
  const hostIni = hostIniPath();
  const gwIni = gatewayIniPath();
  const ysfIni = ysfIniPath();
  const dstarIni = dstarIniPath();
  const logs = logDir();
  const heard = parseLastHeard(readLogTail(logs, "MMDVM"));
  const hostRunning = await unitActive("mmdvmhost");
  const gatewayRunning = await unitActive("dmrgateway");
  const ysfRunning = await unitActive("ysfgateway");
  const dstarRunning = await unitActive("ircddbgateway");
  const nextionRunning = await unitActive("nextiondriver");
  const paused = readPaused();
  const onAppliance = linux();
  const installed = Boolean(hostBin) || existsSync(hostIni);
  const nextion = await buildNextion(cfg, heard, hostRunning);
  return {
    ...cfg,
    ok: hostRunning,
    installed,
    appliance: onAppliance,
    hostRunning,
    gatewayRunning,
    ysfRunning,
    dstarRunning,
    nextionRunning,
    hostBinary: hostBin,
    gatewayBinary: gwBin,
    ysfBinary: ysfBin,
    dstarBinary: dstarBin,
    nextionBinary: nxBin,
    hostIni,
    gatewayIni: gwIni,
    ysfIni,
    dstarIni,
    logDir: logs,
    tx: currentTx(heard),
    currentMode: heard[0]?.mode ?? "",
    lastHeard: heard,
    nextion,
    paused,
    // Só alerta de binário ausente no Pi; no Windows/dev a console edita INI sem Host local.
    error: hostBin || !onAppliance ? "" : "MMDVM Host não está neste host — instale o binário WPSD/g4klx em /usr/local/bin/MMDVMHost",
  };
}

function pickConfig(body: Record<string, unknown>): Partial<MmdvmConfig> {
  const cur = configFromFiles();
  const str = (k: string, fb: string) => (typeof body[k] === "string" ? String(body[k]) : fb);
  const num = (k: string, fb: number) => {
    const n = Number(body[k]);
    return Number.isFinite(n) ? n : fb;
  };
  const modes = { ...cur.modes };
  if (body.modes && typeof body.modes === "object") {
    for (const mode of MMDVM_MODES) {
      const v = (body.modes as Record<string, unknown>)[mode];
      if (typeof v === "boolean") modes[mode] = v;
    }
  }
  let networks = cur.networks;
  if (Array.isArray(body.networks)) {
    networks = cur.networks.map((n) => {
      const hit = (body.networks as Record<string, unknown>[]).find((x) => x && (x.id === n.id || x.section === n.section));
      if (!hit) return n;
      return {
        ...n,
        name: typeof hit.name === "string" ? hit.name : n.name,
        enabled: typeof hit.enabled === "boolean" ? hit.enabled : n.enabled,
        address: typeof hit.address === "string" ? hit.address : n.address,
        port: Number.isFinite(Number(hit.port)) ? Number(hit.port) : n.port,
        password: typeof hit.password === "string" ? hit.password : n.password,
      };
    });
  }
  return {
    callsign: str("callsign", cur.callsign),
    dmrId: str("dmrId", cur.dmrId),
    duplex: typeof body.duplex === "boolean" ? body.duplex : cur.duplex,
    rxHz: num("rxHz", cur.rxHz),
    txHz: num("txHz", cur.txHz),
    colorCode: num("colorCode", cur.colorCode),
    latitude: str("latitude", cur.latitude),
    longitude: str("longitude", cur.longitude),
    location: str("location", cur.location),
    modemBoard: (() => {
      const id = str("modemBoard", cur.modemBoard);
      return MMDVM_BOARD_PRESETS.some((p) => p.id === id) ? (id as MmdvmBoardId) : cur.modemBoard;
    })(),
    modemPort: str("modemPort", cur.modemPort),
    uartSpeed: num("uartSpeed", cur.uartSpeed),
    remotePort: num("remotePort", cur.remotePort),
    dstarReflector: str("dstarReflector", cur.dstarReflector).toUpperCase(),
    dstarModule: str("dstarModule", cur.dstarModule).toUpperCase().slice(0, 1) || "B",
    ysfStartup: str("ysfStartup", cur.ysfStartup),
    displayType: (() => {
      const d = str("displayType", cur.displayType);
      if (d === "Nextion" || d === "OLED" || d === "None") return d;
      return cur.displayType;
    })(),
    displayPort: str("displayPort", cur.displayPort),
    screenLayout: num("screenLayout", cur.screenLayout),
    brightness: num("brightness", cur.brightness),
    idleBrightness: num("idleBrightness", cur.idleBrightness),
    nextionDriver: typeof body.nextionDriver === "boolean" ? body.nextionDriver : cur.nextionDriver,
    oledType: num("oledType", cur.oledType),
    modes,
    networks,
  };
}

export async function mmdvmSave(body: Record<string, unknown>): Promise<MmdvmStatus> {
  seedIfMissing();
  // Grava no mesmo caminho que a leitura (hostIniPath), nunca no template deploy/.
  const hostPath = hostIniPath();
  const gwPath = gatewayIniPath();
  const ysfPath = ysfIniPath();
  const dstarPath = dstarIniPath();
  const host = parseIniFile(existsSync(hostPath) ? hostPath : shippedHostIni());
  const gw = parseIniFile(existsSync(gwPath) ? gwPath : shippedGwIni());
  const ysf = parseIniFile(existsSync(ysfPath) ? ysfPath : shippedYsfIni());
  const dstar = parseConfFile(existsSync(dstarPath) ? dstarPath : shippedDstarConf());
  const cfg = pickConfig(body);
  const call = String(cfg.callsign ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  if (!call) {
    const st = await mmdvmStatus();
    return { ...st, error: "Informe um indicativo" };
  }
  cfg.callsign = call;
  // MMDVMHost rejeita Id 0 / ≤1000 (CCS/DMR); placeholder de fábrica não pode ir para produção.
  const idNum = Number(String(cfg.dmrId ?? "").replace(/\D/g, "") || "0");
  if (!Number.isFinite(idNum) || idNum <= 1000) {
    const st = await mmdvmStatus();
    return { ...st, error: "Id DMR deve ser maior que 1000 (não use 0 / 0000000)" };
  }
  applyConfig(host, gw, ysf, dstar, cfg);
  await writeProtected(hostPath, stringifyIni(host));
  await writeProtected(gwPath, stringifyIni(gw));
  await writeProtected(ysfPath, stringifyIni(ysf));
  await writeDstarConf(dstarPath, stringifyConf(dstar, "# Ham Cockpit ircDDBGateway"));
  // Liga/desliga NextionDriver conforme a config salva.
  if (linux()) {
    if (cfg.displayType === "Nextion" && cfg.nextionDriver) await controlUnit("restart", "nextiondriver");
    else await controlUnit("stop", "nextiondriver");
  }
  return mmdvmStatus();
}

export async function mmdvmControl(action: "start" | "stop" | "restart"): Promise<MmdvmStatus> {
  if (linux()) {
    const out = await helper(action, "all");
    if (!out) await controlUnit(action, "all");
  }
  if (action === "start" || action === "restart") writePaused(emptyPaused());
  return mmdvmStatus();
}

async function controlUnit(
  action: "start" | "stop" | "restart",
  target: GwUnit | "host" | "all",
) {
  if (!linux()) return;
  const map: Record<string, string> = {
    host: "host",
    mmdvmhost: "host",
    dmrgateway: "dmr",
    ysfgateway: "ysf",
    ircddbgateway: "dstar",
    nextiondriver: "nextion",
    all: "all",
  };
  const out = await helper(action, map[target] || "all");
  if (out) return;
  const units =
    target === "all"
      ? [
          "nextiondriver.service",
          "mmdvmhost.service",
          "dmrgateway.service",
          "ysfgateway.service",
          "ircddbgateway.service",
        ]
      : target === "host"
        ? ["mmdvmhost.service"]
        : [`${target}.service`];
  for (const u of units) {
    try {
      await execFileAsync("systemctl", [action, u], { timeout: 15_000, windowsHide: true });
    } catch {
      /* unit may be absent */
    }
  }
}

/** Instant Mode Manager (WPSD): pause/resume sem Apply completo da Configuration. */
export async function mmdvmModePause(mode: string, pause: boolean): Promise<MmdvmStatus> {
  const id = mode.toLowerCase() as MmdvmMode;
  if (!MMDVM_MODES.includes(id)) {
    const st = await mmdvmStatus();
    return { ...st, error: `modo inválido: ${mode}` };
  }
  seedIfMissing();
  const paused = readPaused();
  paused[id] = pause;
  writePaused(paused);

  const target = modeGatewayTarget(id);
  if (target !== "host") {
    await controlUnit(pause ? "stop" : "start", target);
  } else {
    const hostPath = hostIniPath();
    const host = parseIniFile(existsSync(hostPath) ? hostPath : shippedHostIni());
    const permanent = configFromFiles().modes[id];
    const value = pause ? "0" : permanent ? "1" : "0";
    setKv(host, MODE_INI[id].section, "Enable", value);
    setKv(host, MODE_INI[id].net, "Enable", value);
    await writeProtected(hostPath, stringifyIni(host));
    await controlUnit("restart", "host");
  }
  return mmdvmStatus();
}

export async function mmdvmModeResumeAll(): Promise<MmdvmStatus> {
  const paused = readPaused();
  for (const mode of MMDVM_MODES) {
    if (paused[mode]) await mmdvmModePause(mode, false);
  }
  writePaused(emptyPaused());
  return mmdvmStatus();
}

/** DMR Network Manager (WPSD): liga/desliga uma rede e reinicia só o DMRGateway. */
export async function mmdvmNetworkSet(body: { id?: string; section?: string; enabled?: boolean }): Promise<MmdvmStatus> {
  seedIfMissing();
  const gwPath = gatewayIniPath();
  const gw = parseIniFile(existsSync(gwPath) ? gwPath : shippedGwIni());
  const cur = configFromFiles();
  const hit = cur.networks.find((n) => n.id === body.id || n.section === body.section);
  if (!hit) {
    const st = await mmdvmStatus();
    return { ...st, error: "rede DMR desconhecida" };
  }
  if (typeof body.enabled !== "boolean") {
    const st = await mmdvmStatus();
    return { ...st, error: "enabled obrigatório" };
  }
  setKv(gw, hit.section, "Enabled", body.enabled ? "1" : "0");
  await writeProtected(
    gwPath.startsWith("/etc/") ? "/etc/dmrgateway" : join(dataDir(), "dmrgateway.ini"),
    stringifyIni(gw),
  );
  await controlUnit("restart", "dmrgateway");
  return mmdvmStatus();
}

/** YSF / D-Star Manager: define startup/reflector e reinicia só o gateway do modo. */
export async function mmdvmLink(body: {
  mode?: string;
  target?: string;
  module?: string;
}): Promise<MmdvmStatus> {
  seedIfMissing();
  const mode = String(body.mode || "").toLowerCase();
  const target = String(body.target || "").trim();
  if (mode === "ysf") {
    const ysfPath = ysfIniPath();
    const ysf = parseIniFile(existsSync(ysfPath) ? ysfPath : shippedYsfIni());
    setKv(ysf, "Network", "Startup", target);
    await writeProtected(ysfPath, stringifyIni(ysf));
    await controlUnit("restart", "ysfgateway");
    return mmdvmStatus();
  }
  if (mode === "dstar") {
    const dstarPath = dstarIniPath();
    const dstar = parseConfFile(existsSync(dstarPath) ? dstarPath : shippedDstarConf());
    const mod = String(body.module || configFromFiles().dstarModule || "B")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 1) || "B";
    const reflector = target.toUpperCase().slice(0, 8);
    dstar.reflector1 = reflector;
    dstar.atStartup1 = reflector ? "1" : "0";
    dstar.reconnect1 = reflector ? "2" : "0";
    const hostPath = hostIniPath();
    const host = parseIniFile(existsSync(hostPath) ? hostPath : shippedHostIni());
    setKv(host, "D-Star", "Module", mod);
    await writeProtected(hostPath, stringifyIni(host));
    await writeDstarConf(dstarPath, stringifyConf(dstar, "# Ham Cockpit ircDDBGateway"));
    await controlUnit("restart", "ircddbgateway");
    // Tentativa de link imediato via remote do ircDDBGateway (se ativo).
    if (reflector) {
      await remoteTcp(7643, `link ${reflector} ${mod}`).catch(() => undefined);
    }
    return mmdvmStatus();
  }
  const st = await mmdvmStatus();
  return { ...st, error: "mode deve ser ysf ou dstar" };
}

function remoteTcp(port: number, line: string): Promise<{ ok: boolean; reply: string; error?: string }> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: "127.0.0.1", port, timeout: 2500 });
    let reply = "";
    let settled = false;
    const done = (ok: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, reply: reply.trim(), error });
    };
    sock.on("data", (d) => {
      reply += d.toString("utf8");
    });
    sock.on("connect", () => {
      sock.write(`${line}\n`);
      setTimeout(() => done(true), 500);
    });
    sock.on("error", (err) => done(false, err.message));
    sock.on("timeout", () => done(Boolean(reply.trim()), reply.trim() ? undefined : "timeout"));
  });
}

export async function mmdvmRemote(cmd: string): Promise<{ ok: boolean; reply: string; error?: string }> {
  const port = configFromFiles().remotePort || 7642;
  let line = cmd.replace(/[\r\n]/g, " ").trim();
  if (!line) return { ok: false, reply: "", error: "comando vazio" };
  // Atalhos amigáveis → Remote Control do MMDVMHost (g4klx).
  const tgOnly = line.match(/^tg(?:\s+|:)(\d{1,8})(?:\s+(\d))?$/i);
  const talkgroup = line.match(/^talkgroup\s+(\d)\s+(\d{1,8})$/i);
  if (tgOnly) {
    const slot = tgOnly[2] || "2";
    line = `talkgroup ${slot} ${tgOnly[1]}`;
  } else if (talkgroup) {
    line = `talkgroup ${talkgroup[1]} ${talkgroup[2]}`;
  } else if (/^page\s+/i.test(line)) {
    /* POCSAG page — keep as-is */
  }
  return remoteTcp(port, line);
}
