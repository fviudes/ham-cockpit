import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CATALOG_NAMES = [
  "DPlus_Hosts.txt",
  "DExtra_Hosts.txt",
  "DCS_Hosts.txt",
  "CCS_Hosts.txt",
  "DMR_Hosts.txt",
  "YSFHosts.txt",
  "FCSHosts.txt",
  "groups.txt",
] as const;

const LINUX_ETC = "/usr/local/etc";
const LINUX_IRCDDB = "/usr/share/ircddbgateway";

export type MmdvmDmrMaster = {
  id: string;
  label: string;
  address: string;
  password: string;
  port: number;
  /** Valor WPSD: address,password,port,name */
  value: string;
};

export type MmdvmCatalog = {
  dstarReflectors: { id: string; label: string; kind: string }[];
  bmMasters: MmdvmDmrMaster[];
  dmrPlusMasters: MmdvmDmrMaster[];
  tgifMasters: MmdvmDmrMaster[];
  xlxMasters: MmdvmDmrMaster[];
  ysfServers: { id: string; label: string; value: string }[];
  talkgroups: { id: string; label: string }[];
  sources: Record<string, string>;
};

function repoCatalog(name: string): string {
  return join(ROOT, "data", "mmdvm", "catalog", name);
}

/** Pi: /usr/local/etc e /usr/share/ircddbgateway; dev: data/mmdvm/catalog. */
export function catalogPath(name: string): string {
  const etc = join(LINUX_ETC, name);
  if (existsSync(etc)) return etc;
  const irc = join(LINUX_IRCDDB, name);
  if (existsSync(irc)) return irc;
  const local = repoCatalog(name);
  if (existsSync(local)) return local;
  return "";
}

function readCatalogText(name: string): { text: string; source: string } {
  const path = catalogPath(name);
  if (!path) return { text: "", source: "" };
  try {
    return { text: readFileSync(path, "utf8"), source: path };
  } catch {
    return { text: "", source: path };
  }
}

function parseDstarReflectors(files: { name: string; kind: string }[]): { id: string; label: string; kind: string }[] {
  const out: { id: string; label: string; kind: string }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const { text } = readCatalogText(f.name);
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith(";")) continue;
      const id = line.split(/\s+/)[0]?.toUpperCase().slice(0, 8) ?? "";
      if (!id || id.length < 3) continue;
      if (!/^(REF|XRF|DCS|CCS|XLX)/i.test(id)) continue;
      const key = id.slice(0, 6);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: key, label: key, kind: f.kind });
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function dmrMasterFromParts(parts: string[]): MmdvmDmrMaster | null {
  if (parts.length < 5) return null;
  const label = parts[0]!;
  const address = parts[2]!;
  const password = parts[3]!.replace(/^"|"$/g, "");
  const port = Number(parts[4]);
  if (!address || !Number.isFinite(port)) return null;
  return {
    id: label,
    label: label.replace(/_/g, " "),
    address,
    password,
    port,
    value: `${address},${password},${port},${label}`,
  };
}

function isBmName(name: string) {
  return name.startsWith("BM") && !name.startsWith("#");
}

function isTgifName(name: string) {
  return name.startsWith("TGIF_") || name === "TGIF" || name.startsWith("TGIF");
}

function isXlxName(name: string) {
  return name.startsWith("XLX");
}

function isDmrPlusName(name: string) {
  if (!name || name.startsWith("#")) return false;
  if (isBmName(name) || isTgifName(name) || isXlxName(name)) return false;
  const skip =
    name === "DMRGateway" ||
    name === "DMR2YSF" ||
    name === "DMR2NXDN" ||
    name.startsWith("SystemX_");
  return !skip;
}

export function parseDmrHosts(text: string): {
  bm: MmdvmDmrMaster[];
  dmrplus: MmdvmDmrMaster[];
  tgif: MmdvmDmrMaster[];
  xlx: MmdvmDmrMaster[];
} {
  const bm: MmdvmDmrMaster[] = [];
  const dmrplus: MmdvmDmrMaster[] = [];
  const tgif: MmdvmDmrMaster[] = [];
  const xlx: MmdvmDmrMaster[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const row = dmrMasterFromParts(parts);
    if (!row) continue;
    const name = parts[0]!;
    if (isBmName(name)) bm.push(row);
    else if (isTgifName(name)) tgif.push(row);
    else if (isXlxName(name)) xlx.push(row);
    else if (isDmrPlusName(name)) dmrplus.push(row);
  }
  return { bm, dmrplus, tgif, xlx };
}

function parseYsfHosts(text: string, prefix: "YSF" | "FCS"): { id: string; label: string; value: string }[] {
  const out: { id: string; label: string; value: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(";");
    if (parts.length < 2) continue;
    const room = parts[0]!.trim();
    const name = parts[1]!.trim();
    if (!room || !name) continue;
    if (prefix === "FCS" && !room.startsWith("FCS")) continue;
    const value = prefix === "FCS" ? room : `YSF${room}`;
    const id = prefix === "FCS" ? room : `YSF${room}`;
    const extra = parts[2]?.trim();
    const label = extra ? `${id} — ${name} — ${extra}` : `${id} — ${name}`;
    out.push({ id, label, value });
  }
  return out;
}

export function parseTalkgroups(text: string): { id: string; label: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, string>;
      return Object.entries(obj)
        .map(([id, label]) => ({ id, label: `${id} — ${label}` }))
        .sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
    } catch {
      return [];
    }
  }
  const out: { id: string; label: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const m = line.match(/^(\d+)\s*[:=]\s*(.+)$/) || line.match(/^(\d+)\s+(.+)$/);
    if (m) out.push({ id: m[1]!, label: `${m[1]} — ${m[2]!.trim()}` });
  }
  return out;
}

export function loadMmdvmCatalog(): MmdvmCatalog {
  const sources: Record<string, string> = {};
  for (const name of CATALOG_NAMES) {
    const p = catalogPath(name);
    if (p) sources[name] = p;
  }
  const dstarReflectors = parseDstarReflectors([
    { name: "DPlus_Hosts.txt", kind: "DPlus" },
    { name: "DExtra_Hosts.txt", kind: "DExtra" },
    { name: "DCS_Hosts.txt", kind: "DCS" },
    { name: "CCS_Hosts.txt", kind: "CCS" },
  ]);
  const dmrText = readCatalogText("DMR_Hosts.txt").text;
  const { bm, dmrplus, tgif, xlx } = parseDmrHosts(dmrText);
  const ysf = [
    ...parseYsfHosts(readCatalogText("YSFHosts.txt").text, "YSF"),
    ...parseYsfHosts(readCatalogText("FCSHosts.txt").text, "FCS"),
  ];
  const talkgroups = parseTalkgroups(readCatalogText("groups.txt").text);
  return {
    dstarReflectors,
    bmMasters: bm,
    dmrPlusMasters: dmrplus,
    tgifMasters: tgif,
    xlxMasters: xlx,
    ysfServers: ysf,
    talkgroups,
    sources,
  };
}