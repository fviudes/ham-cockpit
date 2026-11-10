/**
 * Catálogo de equipamentos de rádio e formas de conexão.
 * A UI / gateway escolhe um modelo daqui; o Hamlib Hub monta o rigctld.
 * Drivers nativos (Icom UDP, Flex SmartSDR, Metis P1/P2) ficam para depois —
 * o hub central é sempre Hamlib NET quando houver modelo.
 */

export const EQUIPMENT_MAKERS = [
  "icom",
  "kenwood",
  "yaesu",
  "flex",
  "tentec",
  "xiegu",
  "hermes",
  "anan",
] as const;

export type EquipmentMaker = (typeof EQUIPMENT_MAKERS)[number];

/** Protocolo de aplicação no fio (além do transporte). */
export const EQUIPMENT_PROTOCOLS = [
  "civ",
  "cat",
  "smartsdr",
  "icom-lan",
  "openhpsdr-p1",
  "openhpsdr-p2",
  "tci",
] as const;

export type EquipmentProtocol = (typeof EQUIPMENT_PROTOCOLS)[number];

/**
 * Transporte físico / lógico.
 * - usb-serial / bluetooth-*: cabo ou BT no host
 * - icom-lan-udp / flex-tcp / openhpsdr-*: nativos (drivers futuros)
 * - sdr-cat-proxy / tci: CAT/TCI do app SDR (Thetis, piHPSDR…) → Hamlib
 * - hamlib-net: já é um rigctld remoto
 */
export const CONNECTION_KINDS = [
  "usb-serial",
  "bluetooth-gatt",
  "bluetooth-spp",
  "icom-lan-udp",
  "flex-tcp",
  "openhpsdr-p1",
  "openhpsdr-p2",
  "sdr-cat-proxy",
  "tci",
  "hamlib-net",
] as const;

export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export type ConnectionAuth = "none" | "network-user" | "pin";

export type EquipmentPorts = {
  /** Porta TCP/UDP principal (controle ou CAT). */
  control?: number;
  /** CI-V / serial encapsulado (Icom LAN 50002). */
  serial?: number;
  /** Áudio (Icom LAN 50003). */
  audio?: number;
  /** Discovery (Flex UDP 4992, HL2 1025…). */
  discover?: number;
  /** Stream IQ / VITA (Flex 4991). */
  stream?: number;
  /** Porta CAT do proxy SDR (Thetis 13013, piHPSDR 19090). */
  cat?: number;
  /** Porta TCI. */
  tci?: number;
  /** Porta de escuta do rigctld que o hub sobe. */
  hamlibListen?: number;
};

export type EquipmentConnection = {
  kind: ConnectionKind;
  /** Preferida na UI quando o modelo é escolhido. */
  preferred?: boolean;
  auth?: ConnectionAuth;
  ports?: EquipmentPorts;
  defaultBaud?: number;
  /** App que fala com o hardware (HL2/Anan). */
  via?: string;
  /** Hamlib consegue falar neste transporte sem driver nativo nosso. */
  hamlibReady?: boolean;
  notes?: string;
};

export type EquipmentCapabilities = {
  vfo: boolean;
  ptt: boolean;
  mode: boolean;
  meter: boolean;
  split?: boolean;
  panadapter?: boolean;
  audioNet?: boolean;
  puresignal?: boolean;
};

/**
 * Como o Hamlib Hub alcança o rádio.
 * ser2net: -r 127.0.0.1:<ser2netPort>
 * cat-proxy: -r <host>:<catPort> (Thetis/piHPSDR)
 * hamlib-net: já é NET; só cliente
 * none: só catálogo / driver futuro
 */
export type HamlibBackend = "ser2net" | "cat-proxy" | "hamlib-net" | "none";

export type EquipmentRadio = {
  id: string;
  maker: EquipmentMaker;
  family: string;
  label: string;
  protocol: EquipmentProtocol;
  /** Modelo Hamlib (`rigctld -m`). null = ainda sem mapeamento. */
  hamlibModel: number | null;
  hamlibBackend: HamlibBackend;
  civAddr?: string;
  defaultBaud?: number;
  connections: EquipmentConnection[];
  capabilities: EquipmentCapabilities;
  notes?: string;
};

/** Ligação concreta na estação (instância), aparte do catálogo. */
export type EquipmentBinding = {
  equipmentId: string;
  connectionKind: ConnectionKind;
  /** Host do rádio ou do app proxy. */
  host?: string;
  /** Override de portas do catálogo. */
  ports?: EquipmentPorts;
  /** Porta TCP do ser2net (quando backend = ser2net). */
  ser2netPort?: number;
  baud?: number;
  civAddr?: string;
  /** Network User Icom / PIN. */
  username?: string;
  password?: string;
  /** Porta onde este hub escuta (`rigctld -t`). */
  hamlibListenPort?: number;
};

export type HamlibPlan = {
  equipmentId: string;
  label: string;
  maker: EquipmentMaker;
  hamlibModel: number;
  backend: HamlibBackend;
  /** Argumentos de `rigctld` (sem o binário). */
  argv: string[];
  /** `-r` resolvido. */
  rigDevice: string;
  listenPort: number;
  baud: number;
  civAddr?: string;
  /** true se dá para subir/usar Hamlib agora. */
  ready: boolean;
  /** Motivo se !ready. */
  deferReason?: string;
  connectionKind: ConnectionKind;
};
