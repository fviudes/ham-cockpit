export const MMDVM_MODE_IDS = ["dmr", "dstar", "ysf", "p25", "nxdn", "m17", "pocsag"] as const;
export type ModeId = (typeof MMDVM_MODE_IDS)[number];

export type NetworkId = "bm" | "dmrplus" | "tgif" | "xlx";

export type Network = {
  id: NetworkId;
  section: string;
  name: string;
  enabled: boolean;
  address: string;
  port: number;
  password: string;
};

export type Heard = {
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

export type NetworkLinkStatus = "conectado" | "conectando" | "desconectado";

export type MmdvmApi = {
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
  networkBeacon?: boolean;
  bmApiKey?: string;
  voiceLanguage?: string;
  paused: Record<ModeId, boolean>;
  networkStatus?: Record<NetworkId, NetworkLinkStatus>;
  tx: boolean;
  currentMode: string;
  lastHeard: Heard[];
  error: string;
};

export type MmdvmCatalog = {
  dstarReflectors: { id: string; label: string; kind: string }[];
  bmMasters: { id: string; label: string; address: string; password: string; port: number; value: string }[];
  dmrPlusMasters: { id: string; label: string; address: string; password: string; port: number; value: string }[];
  tgifMasters: { id: string; label: string; address: string; password: string; port: number; value: string }[];
  xlxMasters: { id: string; label: string; address: string; password: string; port: number; value: string }[];
  ysfServers: { id: string; label: string; value: string }[];
  talkgroups: { id: string; label: string }[];
  sources: Record<string, string>;
};

export function parseDmrMasterValue(value: string) {
  const [address, password, port, name] = value.split(",");
  return {
    address: address || "",
    password: password || "",
    port: Number(port) || 0,
    name: name || "",
  };
}

export function dmrMasterValue(n: Pick<Network, "address" | "password" | "port" | "name">) {
  return `${n.address},${n.password},${n.port},${n.name.replace(/\s/g, "_")}`;
}