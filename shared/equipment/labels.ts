import type { ConnectionKind, EquipmentMaker, EquipmentProtocol } from "./types";

export type LocPair = { pt: string; en: string };

export const MAKER_LABEL: Record<EquipmentMaker, LocPair> = {
  icom: { pt: "Icom", en: "Icom" },
  kenwood: { pt: "Kenwood", en: "Kenwood" },
  elecraft: { pt: "Elecraft", en: "Elecraft" },
  yaesu: { pt: "Yaesu", en: "Yaesu" },
  flex: { pt: "FlexRadio", en: "FlexRadio" },
  tentec: { pt: "Ten-Tec", en: "Ten-Tec" },
  xiegu: { pt: "Xiegu", en: "Xiegu" },
  hermes: { pt: "Hermes Lite", en: "Hermes Lite" },
  anan: { pt: "Apache Labs Anan", en: "Apache Labs Anan" },
};

export const MAKER_BLURB: Record<EquipmentMaker, LocPair> = {
  icom: {
    pt: "CI-V (USB, Bluetooth GATT no IC-705, LAN UDP 50001–50003 nos modelos com Network Control).",
    en: "CI-V (USB, Bluetooth GATT on the IC-705, LAN UDP 50001–50003 on Network Control models).",
  },
  kenwood: {
    pt: "CAT serial ASCII via USB → ser2net → Hamlib.",
    en: "ASCII serial CAT via USB → ser2net → Hamlib.",
  },
  elecraft: {
    pt: "CAT serial (K2, K3, KX2, KX3, K4) via USB → ser2net → Hamlib.",
    en: "Serial CAT (K2, K3, KX2, KX3, K4) via USB → ser2net → Hamlib.",
  },
  yaesu: {
    pt: "CAT serial via USB → ser2net → Hamlib (FT-991A, FTDX, FT-710…).",
    en: "Serial CAT via USB → ser2net → Hamlib (FT-991A, FTDX, FT-710…).",
  },
  flex: {
    pt: "SmartSDR Ethernet: discovery/comandos TCP·UDP 4992, stream VITA UDP 4991. CAT via proxy até o driver nativo.",
    en: "SmartSDR Ethernet: discovery/commands TCP·UDP 4992, VITA stream UDP 4991. CAT via proxy until the native driver.",
  },
  tentec: {
    pt: "CAT serial (baud típico 57600) → ser2net → Hamlib.",
    en: "Serial CAT (typical baud 57600) → ser2net → Hamlib.",
  },
  xiegu: {
    pt: "CI-V no DEV USB SERIAL-B a 19200. Bluetooth/Wi‑Fi não são o caminho CAT principal.",
    en: "CI-V on DEV USB SERIAL-B at 19200. Bluetooth/Wi‑Fi are not the main CAT path.",
  },
  hermes: {
    pt: "OpenHPSDR Protocol 1 (Metis) UDP 1024/1025. Sem CAT no hardware — Hamlib fala com Thetis/piHPSDR.",
    en: "OpenHPSDR Protocol 1 (Metis) UDP 1024/1025. No CAT on the board — Hamlib talks to Thetis/piHPSDR.",
  },
  anan: {
    pt: "OpenHPSDR Protocol 2 UDP 1024+. CAT via Thetis/piHPSDR (proxy). PureSignal nos modelos com feedback.",
    en: "OpenHPSDR Protocol 2 UDP 1024+. CAT via Thetis/piHPSDR (proxy). PureSignal on feedback-capable models.",
  },
};

export const PROTOCOL_LABEL: Record<EquipmentProtocol, LocPair> = {
  civ: { pt: "CI-V", en: "CI-V" },
  cat: { pt: "CAT serial", en: "Serial CAT" },
  smartsdr: { pt: "SmartSDR API", en: "SmartSDR API" },
  "icom-lan": { pt: "Icom LAN (UDP)", en: "Icom LAN (UDP)" },
  "openhpsdr-p1": { pt: "OpenHPSDR P1 / Metis", en: "OpenHPSDR P1 / Metis" },
  "openhpsdr-p2": { pt: "OpenHPSDR P2", en: "OpenHPSDR P2" },
  tci: { pt: "TCI", en: "TCI" },
};

export const CONNECTION_LABEL: Record<ConnectionKind, LocPair> = {
  "usb-serial": { pt: "USB / serial (ser2net)", en: "USB / serial (ser2net)" },
  "bluetooth-gatt": { pt: "Bluetooth GATT (Chrome)", en: "Bluetooth GATT (Chrome)" },
  "bluetooth-spp": { pt: "Bluetooth Classic SPP", en: "Bluetooth Classic SPP" },
  "icom-lan-udp": { pt: "Icom LAN UDP", en: "Icom LAN UDP" },
  "flex-tcp": { pt: "Flex SmartSDR TCP/UDP", en: "Flex SmartSDR TCP/UDP" },
  "openhpsdr-p1": { pt: "OpenHPSDR P1 (UDP)", en: "OpenHPSDR P1 (UDP)" },
  "openhpsdr-p2": { pt: "OpenHPSDR P2 (UDP)", en: "OpenHPSDR P2 (UDP)" },
  "sdr-cat-proxy": { pt: "Proxy CAT (Thetis / piHPSDR)", en: "CAT proxy (Thetis / piHPSDR)" },
  tci: { pt: "TCI (app SDR)", en: "TCI (SDR app)" },
  "hamlib-net": { pt: "Hamlib NET remoto", en: "Remote Hamlib NET" },
};

export function formatPorts(ports?: {
  control?: number;
  serial?: number;
  audio?: number;
  discover?: number;
  stream?: number;
  cat?: number;
  tci?: number;
  hamlibListen?: number;
}): string {
  if (!ports) return "—";
  const bits: string[] = [];
  if (ports.control != null) bits.push(`ctrl ${ports.control}`);
  if (ports.serial != null) bits.push(`serial ${ports.serial}`);
  if (ports.audio != null) bits.push(`audio ${ports.audio}`);
  if (ports.discover != null) bits.push(`discover ${ports.discover}`);
  if (ports.stream != null) bits.push(`stream ${ports.stream}`);
  if (ports.cat != null) bits.push(`CAT ${ports.cat}`);
  if (ports.tci != null) bits.push(`TCI ${ports.tci}`);
  if (ports.hamlibListen != null) bits.push(`rigctld ${ports.hamlibListen}`);
  return bits.length ? bits.join(" · ") : "—";
}
