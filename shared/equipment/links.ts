import { listEquipmentByMaker } from "./catalog";
import { CONNECTION_LABEL, type LocPair } from "./labels";
import type {
  ConnectionAuth,
  ConnectionKind,
  EquipmentMaker,
  EquipmentPorts,
} from "./types";

/** Transportes de rede / IP no formulário do console. */
export const UI_NETWORK_KINDS: readonly ConnectionKind[] = [
  "icom-lan-udp",
  "flex-tcp",
  "openhpsdr-p1",
  "openhpsdr-p2",
  "sdr-cat-proxy",
  "tci",
  "hamlib-net",
] as const;

export type UiRadioLink = "usb" | "bluetooth" | "network";

export type NetworkProfile = {
  /** Chave estável para o <select> (kind + via). */
  id: string;
  kind: ConnectionKind;
  via?: string;
  auth: ConnectionAuth;
  ports?: EquipmentPorts;
  hamlibReady: boolean;
  label: LocPair;
};

function isNetworkKind(kind: ConnectionKind): boolean {
  return (UI_NETWORK_KINDS as readonly string[]).includes(kind);
}

/** Porta principal editável no formulário Rede. */
export function primaryNetPort(ports?: EquipmentPorts): number | undefined {
  if (!ports) return undefined;
  return ports.control ?? ports.cat ?? ports.serial ?? ports.discover ?? ports.tci;
}

function profileId(kind: ConnectionKind, via?: string): string {
  return via ? `${kind}::${via}` : kind;
}

function profileLabel(kind: ConnectionKind, via?: string, ports?: EquipmentPorts): LocPair {
  const base = CONNECTION_LABEL[kind];
  const port = primaryNetPort(ports);
  const viaBit = via
    ? via === "thetis"
      ? "Thetis"
      : via === "pihpsdr"
        ? "piHPSDR"
        : via.replace(/\|/g, " / ")
    : "";
  const portBit = port != null ? `:${port}` : "";
  if (!viaBit && !portBit) return base;
  const extra = [viaBit, portBit].filter(Boolean).join(" ");
  return {
    pt: `${base.pt}${extra ? ` · ${extra}` : ""}`,
    en: `${base.en}${extra ? ` · ${extra}` : ""}`,
  };
}

/** Opções de modo de conexão disponíveis para o fabricante (catálogo). */
export function makerLinkOptions(maker: EquipmentMaker): UiRadioLink[] {
  const eqs = listEquipmentByMaker(maker);
  const kinds = Array.from(new Set(eqs.flatMap((e) => e.connections.map((c) => c.kind))));
  const out: UiRadioLink[] = [];
  if (kinds.some((k) => k === "usb-serial")) out.push("usb");
  if (kinds.some((k) => k === "bluetooth-gatt" || k === "bluetooth-spp")) out.push("bluetooth");
  if (kinds.some((k) => isNetworkKind(k))) out.push("network");
  return out.length ? out : ["usb"];
}

/** Perfis de rede únicos (kind + via) para o fabricante. */
export function makerNetworkProfiles(maker: EquipmentMaker): NetworkProfile[] {
  const eqs = listEquipmentByMaker(maker);
  const map = new Map<string, NetworkProfile>();
  for (const eq of eqs) {
    for (const c of eq.connections) {
      if (!isNetworkKind(c.kind)) continue;
      const id = profileId(c.kind, c.via);
      const prev = map.get(id);
      if (prev && !c.preferred) continue;
      map.set(id, {
        id,
        kind: c.kind,
        via: c.via,
        auth: c.auth || "none",
        ports: c.ports,
        hamlibReady: Boolean(c.hamlibReady),
        label: profileLabel(c.kind, c.via, c.ports),
      });
    }
  }
  return Array.from(map.values());
}

export function parseNetworkProfileId(id: string): { kind: ConnectionKind; via?: string } {
  const [kind, via] = id.split("::");
  return { kind: (kind || "sdr-cat-proxy") as ConnectionKind, via: via || undefined };
}

export function defaultNetworkProfile(maker: EquipmentMaker): NetworkProfile | undefined {
  const list = makerNetworkProfiles(maker);
  return list.find((p) => p.hamlibReady) || list[0];
}

export function makerSupportsNetwork(maker: EquipmentMaker): boolean {
  return makerLinkOptions(maker).includes("network");
}
