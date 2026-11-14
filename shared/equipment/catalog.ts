import type { EquipmentConnection, EquipmentRadio } from "./types";
import { HAMLIB_SERIAL_RADIOS } from "./hamlib-rigs";

const CAP_BASIC = { vfo: true, ptt: true, mode: true, meter: true, split: true } as const;
const CAP_SDR = {
  vfo: true,
  ptt: true,
  mode: true,
  meter: true,
  split: true,
  panadapter: true,
  audioNet: true,
} as const;

const LAN: EquipmentConnection = {
  kind: "icom-lan-udp",
  auth: "network-user",
  ports: { control: 50001, serial: 50002, audio: 50003 },
  hamlibReady: true,
  notes: "Network Control (UDP). O gateway autentica e expõe CI-V em 127.0.0.1:45002 para o rigctld.",
};

function overlay(
  id: string,
  connections: EquipmentConnection[],
  notes?: string,
): EquipmentRadio | undefined {
  const base = HAMLIB_SERIAL_RADIOS.find((r) => r.id === id);
  if (!base) return undefined;
  return { ...base, connections, ...(notes ? { notes } : {}) };
}

const ic705 = overlay(
  "icom-ic-705",
  [
    {
      kind: "bluetooth-gatt",
      preferred: true,
      auth: "none",
      hamlibReady: false,
      notes: "Web Bluetooth GATT no Chrome; CI-V no navegador. Hamlib usa o caminho USB/ser2net.",
    },
    {
      kind: "usb-serial",
      auth: "none",
      defaultBaud: 115200,
      hamlibReady: true,
      notes: "USB CI-V a 115200. ser2net TCP cru, rigctld -m 3085, sem -s. -c só se o CI-V da estação divergir de 0xA4.",
    },
    { ...LAN, notes: "WLAN do IC-705. Gateway para 127.0.0.1:45002 e rigctld -m 3085." },
  ],
  "Endereço CI-V padrão 0xA4. Standby: item 1A 05 0073 = 01 e quadro 0x18 0x00. O 0x18 0x02 volta NAK.",
);

const ic7610 = overlay("icom-ic-7610", [
  { kind: "usb-serial", preferred: true, auth: "none", defaultBaud: 115200, hamlibReady: true },
  { ...LAN, notes: "Ethernet do IC-7610. CI-V padrão deste -m é 0x98." },
]);

const ic9700 = overlay("icom-ic-9700", [
  { kind: "usb-serial", preferred: true, auth: "none", defaultBaud: 38400, hamlibReady: true },
  { ...LAN, notes: "Ethernet do IC-9700. CI-V padrão deste -m é 0xA2." },
]);

const x6100 = overlay("xiegu-x6100", [
  {
    kind: "usb-serial",
    preferred: true,
    auth: "none",
    defaultBaud: 19200,
    hamlibReady: true,
    notes: "DEV USB SERIAL-B. Hamlib 4.6.5: -m 3087.",
  },
  {
    kind: "bluetooth-spp",
    auth: "none",
    hamlibReady: false,
    notes: "BT no X6100 é sobretudo periférico; CAT estável = USB.",
  },
]);

const ic905 = overlay("icom-ic-905", [
  { kind: "usb-serial", preferred: true, auth: "none", defaultBaud: 230400, hamlibReady: true },
  { ...LAN, notes: "Ethernet do IC-905. CI-V padrão deste -m é 0xAC." },
]);

const ic7760 = overlay("icom-ic-7760", [
  { kind: "usb-serial", preferred: true, auth: "none", defaultBaud: 19200, hamlibReady: true },
  { ...LAN, notes: "Rede do IC-7760. CI-V padrão deste -m é 0xB2." },
]);

const x6200 = overlay("xiegu-x6200", [
  {
    kind: "usb-serial",
    preferred: true,
    auth: "none",
    defaultBaud: 19200,
    hamlibReady: true,
    notes: "DEV USB SERIAL-B CI-V. Hamlib 4.6.5: -m 3091.",
  },
  { kind: "bluetooth-spp", auth: "none", hamlibReady: false },
]);

const OVERRIDES = new Map(
  [ic705, ic7610, ic9700, ic905, ic7760, x6100, x6200]
    .filter((r): r is EquipmentRadio => Boolean(r))
    .map((r) => [r.id, r]),
);

/**
 * IC-7300MK2: o Hamlib 4.6.5 não registra caps próprio.
 * 3073 é o IC-7300 (CI-V 0x94). Não reutilizar esse -m.
 */
const IC7300MK2: EquipmentRadio = {
  id: "icom-ic-7300mk2",
  maker: "icom",
  family: "IC-7300MK2",
  label: "Icom IC-7300MK2",
  protocol: "civ",
  hamlibModel: null,
  hamlibBackend: "none",
  defaultBaud: 115200,
  connections: [
    {
      kind: "usb-serial",
      preferred: true,
      auth: "none",
      defaultBaud: 115200,
      hamlibReady: false,
      notes: "Sem -m no Hamlib 4.6.5. A ponte não sobe com o 3073 do IC-7300.",
    },
    {
      kind: "icom-lan-udp",
      auth: "network-user",
      ports: { control: 50001, serial: 50002, audio: 50003 },
      hamlibReady: false,
      notes: "A LAN CI-V do console fala com o rádio. O rigctld não assume o modelo 3073.",
    },
  ],
  capabilities: { ...CAP_BASIC, audioNet: true },
  notes: "Hamlib 4.6.5 não tem IC-7300MK2. O -m 3073 fica só no IC-7300.",
};

/**
 * Catálogo da estação.
 * Seriais: lista do Hamlib 4.6.5 (riglist.h, o que `rigctl -l` dessa versão imprime).
 * Flex, Hermes e Anan continuam proxy SDR — não são ser2net.
 */
export const EQUIPMENT_CATALOG: EquipmentRadio[] = [
  ...HAMLIB_SERIAL_RADIOS.map((r) => OVERRIDES.get(r.id) ?? r),
  IC7300MK2,
  // ── FlexRadio ─────────────────────────────────────────────────────
  {
    id: "flex-6400",
    maker: "flex",
    family: "FLEX-6000",
    label: "FlexRadio FLEX-6400",
    protocol: "smartsdr",
    hamlibModel: null,
    hamlibBackend: "none",
    connections: [
      {
        kind: "flex-tcp",
        preferred: true,
        auth: "none",
        ports: { control: 4992, discover: 4992, stream: 4991 },
        hamlibReady: false,
        notes: "SmartSDR TCP 4992 + discovery UDP 4992 + VITA UDP 4991. Driver nativo futuro.",
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "smartsdr-cat|third-party",
        hamlibReady: true,
        notes: "Se um proxy CAT/Hamlib estiver na LAN, use cat-proxy.",
      },
    ],
    capabilities: { ...CAP_SDR },
    notes: "Família Signature 6000. Hub Hamlib só via proxy CAT até o driver SmartSDR.",
  },
  {
    id: "flex-6600",
    maker: "flex",
    family: "FLEX-6000",
    label: "FlexRadio FLEX-6600",
    protocol: "smartsdr",
    hamlibModel: null,
    hamlibBackend: "none",
    connections: [
      {
        kind: "flex-tcp",
        preferred: true,
        auth: "none",
        ports: { control: 4992, discover: 4992, stream: 4991 },
        hamlibReady: false,
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 13013 },
        via: "smartsdr-cat|third-party",
        hamlibReady: true,
      },
    ],
    capabilities: CAP_SDR,
  },
  {
    id: "flex-8600",
    maker: "flex",
    family: "FLEX-8000",
    label: "FlexRadio FLEX-8600",
    protocol: "smartsdr",
    hamlibModel: null,
    hamlibBackend: "none",
    connections: [
      {
        kind: "flex-tcp",
        preferred: true,
        auth: "none",
        ports: { control: 4992, discover: 4992, stream: 4991 },
        hamlibReady: false,
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 13013 },
        via: "smartsdr-cat|third-party",
        hamlibReady: true,
      },
    ],
    capabilities: CAP_SDR,
  },

  // ── Hermes Lite 2 ─────────────────────────────────────────────────
  {
    id: "hermes-lite-2",
    maker: "hermes",
    family: "Hermes-Lite",
    label: "Hermes Lite 2",
    protocol: "openhpsdr-p1",
    hamlibModel: 2054,
    hamlibBackend: "cat-proxy",
    connections: [
      {
        kind: "openhpsdr-p1",
        auth: "none",
        ports: { control: 1024, discover: 1025 },
        hamlibReady: false,
        notes: "Metis Protocol 1 UDP. Sem CAT no hardware — precisa de app SDR.",
      },
      {
        kind: "sdr-cat-proxy",
        preferred: true,
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "thetis",
        hamlibReady: true,
        notes: "Thetis CAT TCP 13013 → rigctld -m 2054 -r host:13013.",
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 19090, hamlibListen: 4532 },
        via: "pihpsdr",
        hamlibReady: true,
        notes: "piHPSDR CAT TCP 19090 → Hamlib model 2040.",
      },
      {
        kind: "tci",
        auth: "none",
        ports: { tci: 40001 },
        via: "pihpsdr|spark",
        hamlibReady: false,
        notes: "TCI do app SDR. Bridge TCI→Hamlib futura; por ora use sdr-cat-proxy.",
      },
    ],
    capabilities: CAP_SDR,
    notes: "Hub Hamlib aponta ao CAT do Thetis/piHPSDR, não ao UDP 1024 do HL2.",
  },

  // ── Anan (Apache Labs) ────────────────────────────────────────────
  {
    id: "anan-10e",
    maker: "anan",
    family: "ANAN-10",
    label: "Apache Labs ANAN-10E",
    protocol: "openhpsdr-p2",
    hamlibModel: 2054,
    hamlibBackend: "cat-proxy",
    connections: [
      {
        kind: "openhpsdr-p2",
        auth: "none",
        ports: { control: 1024 },
        hamlibReady: false,
        notes: "OpenHPSDR Protocol 2. Firmware P2 obrigatório.",
      },
      {
        kind: "sdr-cat-proxy",
        preferred: true,
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "thetis",
        hamlibReady: true,
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 19090 },
        via: "pihpsdr",
        hamlibReady: true,
        notes: "Hamlib model 2040 para piHPSDR.",
      },
      {
        kind: "tci",
        auth: "none",
        ports: { tci: 40001 },
        via: "host-app",
        hamlibReady: false,
      },
    ],
    capabilities: { ...CAP_SDR, puresignal: true },
  },
  {
    id: "anan-100d",
    maker: "anan",
    family: "ANAN-100",
    label: "Apache Labs ANAN-100D",
    protocol: "openhpsdr-p2",
    hamlibModel: 2054,
    hamlibBackend: "cat-proxy",
    connections: [
      { kind: "openhpsdr-p2", auth: "none", ports: { control: 1024 }, hamlibReady: false },
      {
        kind: "sdr-cat-proxy",
        preferred: true,
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "thetis",
        hamlibReady: true,
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 19090 },
        via: "pihpsdr",
        hamlibReady: true,
      },
    ],
    capabilities: { ...CAP_SDR, puresignal: true },
  },
  {
    id: "anan-7000dle",
    maker: "anan",
    family: "ANAN-7000",
    label: "Apache Labs ANAN-7000DLE",
    protocol: "openhpsdr-p2",
    hamlibModel: 2054,
    hamlibBackend: "cat-proxy",
    connections: [
      { kind: "openhpsdr-p2", auth: "none", ports: { control: 1024 }, hamlibReady: false },
      {
        kind: "sdr-cat-proxy",
        preferred: true,
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "thetis",
        hamlibReady: true,
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 19090 },
        via: "pihpsdr",
        hamlibReady: true,
      },
    ],
    capabilities: { ...CAP_SDR, puresignal: true },
  },
  {
    id: "anan-8000dle",
    maker: "anan",
    family: "ANAN-8000",
    label: "Apache Labs ANAN-8000DLE",
    protocol: "openhpsdr-p2",
    hamlibModel: 2054,
    hamlibBackend: "cat-proxy",
    connections: [
      { kind: "openhpsdr-p2", auth: "none", ports: { control: 1024 }, hamlibReady: false },
      {
        kind: "sdr-cat-proxy",
        preferred: true,
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "thetis",
        hamlibReady: true,
      },
    ],
    capabilities: { ...CAP_SDR, puresignal: true },
  },
  {
    id: "anan-g2",
    maker: "anan",
    family: "ANAN-G2",
    label: "Apache Labs ANAN G2",
    protocol: "openhpsdr-p2",
    hamlibModel: 2054,
    hamlibBackend: "cat-proxy",
    connections: [
      { kind: "openhpsdr-p2", auth: "none", ports: { control: 1024 }, hamlibReady: false },
      {
        kind: "sdr-cat-proxy",
        preferred: true,
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "thetis",
        hamlibReady: true,
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 19090 },
        via: "pihpsdr",
        hamlibReady: true,
      },
      {
        kind: "tci",
        auth: "none",
        ports: { tci: 40001 },
        via: "host-app",
        hamlibReady: false,
      },
    ],
    capabilities: { ...CAP_SDR, puresignal: true },
  },
  {
    id: "anan-g2e",
    maker: "anan",
    family: "ANAN-G2",
    label: "Apache Labs ANAN G2E",
    protocol: "openhpsdr-p2",
    hamlibModel: 2054,
    hamlibBackend: "cat-proxy",
    connections: [
      { kind: "openhpsdr-p2", auth: "none", ports: { control: 1024 }, hamlibReady: false },
      {
        kind: "sdr-cat-proxy",
        preferred: true,
        auth: "none",
        ports: { cat: 13013, hamlibListen: 4532 },
        via: "thetis",
        hamlibReady: true,
      },
      {
        kind: "sdr-cat-proxy",
        auth: "none",
        ports: { cat: 19090 },
        via: "pihpsdr",
        hamlibReady: true,
      },
      {
        kind: "tci",
        auth: "none",
        ports: { tci: 40001 },
        via: "host-app",
        hamlibReady: false,
      },
    ],
    capabilities: { ...CAP_SDR, puresignal: true },
  },
];

export function getEquipment(id: string): EquipmentRadio | undefined {
  return EQUIPMENT_CATALOG.find((e) => e.id === id);
}

export function normalizeCivAddr(addr?: string): string {
  const m = String(addr || "").trim().match(/^0x([0-9a-fA-F]{2})$/i);
  return m ? `0x${m[1]!.toUpperCase()}` : "";
}

/** CI-V que pertence a um único modelo desta lista. Endereço compartilhado não casa sozinho. */
const CIV_TO_EQUIPMENT: Record<string, string> = (() => {
  const buckets = new Map<string, string>();
  const clash = new Set<string>();
  for (const eq of EQUIPMENT_CATALOG) {
    if (eq.protocol !== "civ" || !eq.civAddr) continue;
    if (buckets.has(eq.civAddr)) clash.add(eq.civAddr);
    else buckets.set(eq.civAddr, eq.id);
  }
  clash.forEach((addr) => buckets.delete(addr));
  return Object.fromEntries(buckets);
})();

/** Casa um rádio já gravado com um id do catálogo. Não inventa modelo. */
export function inferEquipmentId(input: {
  maker?: string;
  equipmentId?: string;
  name?: string;
  deviceName?: string;
  model?: string;
  civAddr?: string;
  proto?: string;
}): string {
  const explicit = String(input.equipmentId || "").trim();
  if (explicit && getEquipment(explicit)) return explicit;
  const blob = `${input.name || ""} ${input.deviceName || ""} ${input.model || ""}`.toLowerCase();
  const list = input.maker ? listEquipmentByMaker(input.maker) : EQUIPMENT_CATALOG;
  const ranked = [...list].sort((a, b) => b.family.length - a.family.length);
  for (const eq of ranked) {
    const fam = eq.family.toLowerCase();
    if (fam && blob.includes(fam)) return eq.id;
  }
  if ((input.maker === "icom" || input.maker === "xiegu" || input.maker === "tentec") && input.proto !== "cat") {
    const hit = CIV_TO_EQUIPMENT[normalizeCivAddr(input.civAddr)];
    if (hit && getEquipment(hit)?.maker === input.maker) return hit;
  }
  return "";
}

export function listEquipmentByMaker(maker: string): EquipmentRadio[] {
  return EQUIPMENT_CATALOG.filter((e) => e.maker === maker);
}

export function listHamlibReady(): EquipmentRadio[] {
  return EQUIPMENT_CATALOG.filter(
    (e) => e.hamlibModel != null && e.connections.some((c) => c.hamlibReady),
  );
}
