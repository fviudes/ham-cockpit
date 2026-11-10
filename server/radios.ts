import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { SER2NET_RADIO_ID } from "../shared/const";
import { EQUIPMENT_MAKERS, getEquipment, type EquipmentMaker } from "../shared/equipment";
import { icomLanConnect, icomLanDisconnect, icomLanLive, icomLanStatus, resolveIcomLanModel } from "./icom-lan";
import { listSerialDevices } from "./list-serials";
import { loadSer2net, saveSer2net } from "./ser2net-store";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPT_DIR = "/opt/ham-cockpit/radios";
const LEGACY_DIR = "/opt/radios";
const BAUDS = new Set([1200, 4800, 9600, 19200, 38400, 57600, 115200, 230400]);

export type RadioMaker = EquipmentMaker;
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
  hsUuid: string;
  paired: boolean;
  connected: boolean;
  primary: boolean;
  error: string;
  /** Id no catálogo shared/equipment (opcional). */
  equipmentId?: string;
  /** Host/IP quando link === network. */
  host?: string;
  /** Perfil de rede (kind::via) do catálogo. */
  netProfile?: string;
  /** Network User / login Icom LAN. */
  netUser?: string;
  netPassword?: string;
  /** Senha gravada (não ecoa o valor). */
  hasNetPassword?: boolean;
};

export type RadioPick = {
  id: string;
  label: string;
  kind: RadioLink;
  path: string;
};

export type RadiosSnapshot = {
  ok: boolean;
  folder: string;
  radios: StationRadio[];
  /** Ausente em respostas rápidas (ex.: disconnect) — o cliente mantém a lista anterior. */
  usb?: RadioPick[];
  bluetooth?: RadioPick[];
  error?: string;
  needBle?: boolean;
  bleAddr?: string;
};

const MAKERS: RadioMaker[] = [...EQUIPMENT_MAKERS];

function dataDir(): string {
  // No appliance o bundle fica em /opt/ham-cockpit; ROOT vira /opt e
  // data/radios cairia em /opt/data/radios (EACCES). Grava sob /opt/ham-cockpit.
  if (existsSync("/opt/ham-cockpit")) {
    if (existsSync(LEGACY_DIR) && !existsSync(OPT_DIR)) return LEGACY_DIR;
    mkdirSync(OPT_DIR, { recursive: true });
    return OPT_DIR;
  }
  const local = join(ROOT, "data", "radios");
  mkdirSync(local, { recursive: true });
  return local;
}

function jsonPath() {
  return join(dataDir(), "radios.json");
}

function newId() {
  return randomBytes(4).toString("hex");
}

function writeAtomic(file: string, body: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { encoding: "utf8" });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows / FS sem chmod */
  }
}

/** Remove senha da resposta HTTP; mantém flag hasNetPassword. */
function publicRadio(r: StationRadio): StationRadio {
  const { netPassword, ...rest } = r;
  if (r.link !== "network") return rest;
  return {
    ...rest,
    ...(netPassword ? { hasNetPassword: true } : {}),
  };
}

function publicList(list: StationRadio[]): StationRadio[] {
  return list.map(publicRadio);
}

function isIcomLan(row: StationRadio): boolean {
  if (row.link !== "network" || row.maker !== "icom") return false;
  if (row.netProfile?.startsWith("icom-lan-udp")) return true;
  // Sem perfil explícito: Icom Rede = LAN UDP (padrão da UI).
  return !row.netProfile || row.netProfile.includes("icom");
}

function hamlibModelFor(row: StationRadio): number {
  if (row.equipmentId) {
    const eq = getEquipment(row.equipmentId);
    if (eq?.hamlibModel) return eq.hamlibModel;
  }
  const model = resolveIcomLanModel(row.equipmentId, `${row.name} ${row.deviceName}`);
  if (model === "IC-705") return 3085;
  if (model === "IC-9700") return 3081;
  if (model === "IC-7610") return 3078;
  if (model === "IC-7300" || model === "IC-7300MK2") return 3073;
  return 3085;
}

function asMaker(v: unknown): RadioMaker {
  return MAKERS.includes(v as RadioMaker) ? (v as RadioMaker) : "icom";
}

function asLink(v: unknown): RadioLink {
  if (v === "bluetooth") return "bluetooth";
  if (v === "network") return "network";
  return "usb";
}

function asProto(maker: RadioMaker, v: unknown): RadioProto {
  if (maker === "icom" || maker === "xiegu") return v === "cat" ? "cat" : "civ";
  return "cat";
}

function asBaud(v: unknown, fallback: number) {
  const n = Number(v);
  if (n === 0) return 0;
  return BAUDS.has(n) ? n : fallback;
}

function defaultBaud(maker: RadioMaker, link: RadioLink) {
  if (link === "bluetooth" && maker !== "icom") return 9600;
  if (maker === "kenwood" || maker === "yaesu") return 38400;
  if (maker === "tentec") return 57600;
  if (maker === "xiegu") return 19200;
  return 115200;
}

function defaultName(maker: RadioMaker, deviceName: string) {
  const brand: Record<RadioMaker, string> = {
    icom: "Icom",
    kenwood: "Kenwood",
    yaesu: "Yaesu",
    flex: "Flex",
    tentec: "Ten-Tec",
    xiegu: "Xiegu",
    hermes: "Hermes Lite",
    anan: "Anan",
  };
  return deviceName.trim() || brand[maker];
}

function sanitize(raw: Partial<StationRadio>, fallback?: StationRadio): StationRadio {
  const maker = asMaker(raw.maker ?? fallback?.maker);
  const link = asLink(raw.link ?? fallback?.link);
  const proto = asProto(maker, raw.proto ?? fallback?.proto);
  const baud = link === "network" ? 0 : asBaud(raw.baud ?? fallback?.baud, defaultBaud(maker, link));
  const device = String(raw.device ?? fallback?.device ?? "").trim();
  const deviceName = String(raw.deviceName ?? fallback?.deviceName ?? "").trim();
  const host = String(raw.host ?? fallback?.host ?? "").trim();
  const netProfile = String(raw.netProfile ?? fallback?.netProfile ?? "").trim();
  const netUser = String(raw.netUser ?? fallback?.netUser ?? "").trim();
  // Senha vazia no payload = manter a gravada (formulário não reenvia).
  const incomingPass = raw.netPassword;
  const netPassword =
    incomingPass === undefined || incomingPass === null
      ? String(fallback?.netPassword ?? "")
      : String(incomingPass) === "" && fallback?.netPassword
        ? String(fallback.netPassword)
        : String(incomingPass);
  const port =
    link === "network"
      ? String(raw.port ?? fallback?.port ?? "").trim()
      : String(raw.port ?? fallback?.port ?? device).trim() || device;
  const civAddr = String(raw.civAddr ?? fallback?.civAddr ?? "0xA4").trim() || "0xA4";
  const endpoint = link === "network" && host ? `${host}${port ? `:${port}` : ""}` : "";
  const name =
    String(raw.name ?? fallback?.name ?? "").trim() ||
    defaultName(maker, deviceName || endpoint || port || device);
  const hsUuid = String(raw.hsUuid ?? fallback?.hsUuid ?? "").trim().toUpperCase();
  const equipmentId = String(raw.equipmentId ?? fallback?.equipmentId ?? "").trim();
  return {
    id: String(raw.id ?? fallback?.id ?? newId()),
    name,
    maker,
    link,
    device: link === "network" ? host || device : device,
    deviceName: link === "network" ? deviceName || endpoint || host : deviceName,
    proto,
    port,
    baud,
    civAddr: /^0x[0-9A-Fa-f]{2}$/.test(civAddr) ? civAddr.toUpperCase().replace("0X", "0x") : "0xA4",
    hsUuid: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(hsUuid) ? hsUuid : "",
    paired: Boolean(raw.paired ?? fallback?.paired),
    connected: Boolean(raw.connected ?? fallback?.connected),
    primary: Boolean(raw.primary ?? fallback?.primary),
    error: String(raw.error ?? fallback?.error ?? ""),
    ...(equipmentId ? { equipmentId } : {}),
    ...(link === "network"
      ? {
          host,
          ...(netProfile ? { netProfile } : {}),
          ...(netUser ? { netUser } : {}),
          ...(netPassword ? { netPassword } : {}),
        }
      : {}),
  };
}

function normalizePrimary() {
  const hits = radios.filter((r) => r.primary);
  if (hits.length === 1) return;
  if (hits.length === 0 && radios.length === 1) {
    radios[0] = { ...radios[0]!, primary: true };
    return;
  }
  if (hits.length > 1) {
    const keep = hits[hits.length - 1]!.id;
    radios = radios.map((r) => ({ ...r, primary: r.id === keep }));
  }
}

let radios: StationRadio[] = [];

function persist() {
  writeAtomic(jsonPath(), `${JSON.stringify({ radios }, null, 2)}\n`);
}

function load() {
  try {
    const raw = JSON.parse(readFileSync(jsonPath(), "utf8")) as { radios?: unknown };
    if (Array.isArray(raw.radios)) radios = raw.radios.map((r) => sanitize(r as Partial<StationRadio>));
    const before = radios.map((r) => `${r.id}:${r.primary}:${r.connected}`).join();
    normalizePrimary();
    radios = radios.map((r) =>
      r.link === "bluetooth" && r.proto === "civ" && r.connected ? { ...r, connected: false } : r
    );
    const after = radios.map((r) => `${r.id}:${r.primary}:${r.connected}`).join();
    if (before !== after) persist();
  } catch {
    radios = [];
  }
}

load();

async function listBluetooth(): Promise<RadioPick[]> {
  const out: RadioPick[] = [];
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "reg",
        ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\BTHPORT\\Parameters\\Devices"],
        { windowsHide: true, timeout: 8000 },
      );
      const keys = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\\Devices\\[0-9a-fA-F]{12}$/.test(l));
      for (const key of keys) {
        const hex = (key.split("\\").pop() || "").toUpperCase();
        if (!hex || hex === "000000000000") continue;
        const addr = hex.match(/.{2}/g)?.join(":") ?? hex;
        let name = "Bluetooth";
        try {
          const { stdout: det } = await execFileAsync("reg", ["query", key, "/v", "Name"], { windowsHide: true, timeout: 4000 });
          const m = det.match(/Name\s+REG_BINARY\s+([0-9A-Fa-f ]+)/i);
          if (m) {
            const raw = Buffer.from(m[1].replace(/\s+/g, ""), "hex");
            name = raw.toString("ascii").replace(/\0/g, "").trim() || raw.toString("utf16le").replace(/\0/g, "").trim() || name;
          }
        } catch {
          /* */
        }
        out.push({ id: addr, path: addr, label: `${name} (${addr})`, kind: "bluetooth" });
      }
    } catch {
      /* */
    }
    try {
      const script = [
        "Get-PnpDevice -Class Ports -Status OK -ErrorAction SilentlyContinue | ForEach-Object {",
        "  $com = [regex]::Match($_.FriendlyName,'COM\\d+').Value",
        "  if (-not $com -or $_.InstanceId -notmatch 'BTHENUM') { return }",
        "  $m = [regex]::Match($_.InstanceId, '([0-9A-Fa-f]{12})_')",
        "  $hex = if ($m.Success) { $m.Groups[1].Value.ToUpper() } else { '' }",
        "  if ($hex -eq '000000000000' -or $hex -eq '') { return }",
        "  \"$com`t$hex`t$($_.FriendlyName)\"",
        "}",
      ].join(" ");
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        windowsHide: true,
        timeout: 8000,
      });
      for (const line of stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
        const [com, hex, friendly] = line.split("\t");
        if (!com) continue;
        const addr = (hex || "").match(/.{2}/g)?.join(":") ?? hex ?? "";
        const label = `${com} · ${friendly || addr}`;
        if (!out.some((d) => d.path === com)) out.push({ id: com, path: com, label, kind: "bluetooth" });
        const byMac = out.find((d) => d.path === addr);
        if (byMac && !byMac.label.includes(com)) byMac.label = `${byMac.label} · ${com}`;
      }
    } catch {
      /* */
    }
  }
  if (process.platform === "linux") {
    try {
      const { stdout } = await execFileAsync("bluetoothctl", ["devices"], { timeout: 8000, windowsHide: true });
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^Device\s+([0-9A-Fa-f:]{11,17})\s+(.*)$/);
        if (!m) continue;
        const addr = m[1].toUpperCase();
        const name = m[2].trim() || addr;
        out.push({ id: addr, path: addr, label: `${name} (${addr})`, kind: "bluetooth" });
      }
    } catch {
      /* bluez optional */
    }
  }
  const uniq = new Map<string, RadioPick>();
  for (const d of out) uniq.set(d.path, d);
  return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label));
}

async function listUsb(): Promise<RadioPick[]> {
  const list = await listSerialDevices();
  return list.map((d) => ({
    id: d.path,
    path: d.path,
    label: d.label || d.path,
    kind: "usb" as const,
  }));
}

function lanOverlay(list: StationRadio[]): StationRadio[] {
  // Espelha sessão LAN ao vivo na lista (sem persistir a cada poll).
  const lan = icomLanStatus();
  return list.map((r) => {
    if (!isIcomLan(r)) return r;
    if (lan.connected && lan.radioId === r.id) {
      return { ...r, connected: true, error: "", ...(lan.civAddr ? { civAddr: lan.civAddr } : {}) };
    }
    if (lan.connected && lan.radioId && lan.radioId !== r.id) {
      return { ...r, connected: false };
    }
    if (!lan.connected && r.connected && !icomLanLive()) {
      return { ...r, connected: false };
    }
    return r;
  });
}

/** Snapshot rápido (sem enumerar USB/BT) — usado em disconnect para não segurar o HTTP. */
function radiosSnapshotFast(): RadiosSnapshot {
  return { ok: true, folder: dataDir(), radios: publicList(lanOverlay(radios)) };
}

export async function radiosStatus(): Promise<RadiosSnapshot> {
  let usb: RadioPick[] = [];
  let bluetooth: RadioPick[] = [];
  try {
    usb = await listUsb();
  } catch {
    usb = [];
  }
  try {
    bluetooth = await listBluetooth();
  } catch {
    bluetooth = [];
  }
  return { ok: true, folder: dataDir(), radios: publicList(lanOverlay(radios)), usb, bluetooth };
}

export async function radiosSave(body: { radios?: unknown }): Promise<RadiosSnapshot> {
  if (Array.isArray(body.radios)) {
    radios = body.radios.map((r) => sanitize(r as Partial<StationRadio>));
    normalizePrimary();
    persist();
  }
  return radiosStatus();
}

export async function radiosUpsert(raw: Partial<StationRadio>): Promise<RadiosSnapshot> {
  const next = sanitize(raw, radios.find((r) => r.id === raw.id));
  if (next.primary) radios = radios.map((r) => ({ ...r, primary: r.id === next.id }));
  else if (!radios.some((r) => r.primary && r.id !== next.id)) next.primary = radios.length === 0 || radios.every((r) => r.id === next.id);
  const idx = radios.findIndex((r) => r.id === next.id);
  if (idx >= 0) radios[idx] = { ...radios[idx], ...next, id: radios[idx].id };
  else radios.push(next);
  normalizePrimary();
  persist();
  return radiosStatus();
}

export async function radiosSetPrimary(id: string): Promise<RadiosSnapshot> {
  if (!id || !radios.some((r) => r.id === id)) return radiosStatus();
  radios = radios.map((r) => ({ ...r, primary: r.id === id }));
  persist();
  return radiosStatus();
}

function findRadio(id: string) {
  return radios.find((r) => r.id === id);
}

export async function radiosRemove(id: string): Promise<RadiosSnapshot> {
  const row = findRadio(id);
  radios = radios.map((r) => (r.id === id ? { ...r, connected: false } : r)).filter((r) => r.id !== id);
  normalizePrimary();
  persist();
  if (row && (isIcomLan(row) || icomLanStatus().radioId === id)) {
    try {
      await icomLanDisconnect();
    } catch {
      /* */
    }
  }
  return radiosSnapshotFast();
}

export async function radiosConnect(raw: Partial<StationRadio>): Promise<RadiosSnapshot> {
  const next = sanitize(raw, radios.find((r) => r.id === raw.id));
  next.error = "";
  const ble = next.link === "bluetooth" && next.maker === "icom" && next.proto === "civ";
  if (next.link === "network") {
    if (!next.host) {
      next.connected = false;
      next.error = "Informe o IP ou hostname do rádio / proxy CAT";
    } else if (!next.port || !/^\d{1,5}$/.test(next.port) || Number(next.port) < 1 || Number(next.port) > 65535) {
      next.connected = false;
      next.error = "Informe a porta de rede (1–65535)";
    } else if (isIcomLan(next) && !next.netUser) {
      next.connected = false;
      next.error = "Informe o Network User do Icom LAN";
    } else if (isIcomLan(next)) {
      next.device = next.host;
      next.deviceName = next.deviceName || `${next.host}:${next.port}`;
      const lan = await icomLanConnect({
        radioId: next.id,
        host: next.host,
        controlPort: Number(next.port) || 50001,
        userName: next.netUser || "",
        password: next.netPassword || "",
        civAddr: next.civAddr,
        hamlibModel: hamlibModelFor(next),
        equipmentId: next.equipmentId,
        deviceName: next.deviceName || next.name,
      });
      if (lan.connected) {
        next.connected = true;
        next.error = "";
        if (lan.civAddr) next.civAddr = lan.civAddr;
        if (lan.deviceName) next.deviceName = lan.deviceName;
        radios = radios.map((r) => (r.id === next.id ? r : { ...r, connected: false }));
      } else {
        next.connected = false;
        next.error = lan.error || "Falha ao autenticar no Icom LAN (UDP 50001)";
      }
    } else {
      // Flex / HL2 / Anan: ainda sem driver nativo — marca conectado só se host:porta ok.
      next.device = next.host;
      next.deviceName = next.deviceName || `${next.host}:${next.port}`;
      next.connected = true;
      next.error = "";
    }
    const idx = radios.findIndex((r) => r.id === next.id);
    if (idx >= 0) radios[idx] = next;
    else radios.push(next);
    persist();
    const snap = await radiosStatus();
    if (next.error) {
      snap.ok = false;
      snap.error = next.error;
    }
    return snap;
  }
  if (!next.device && !next.port && !ble) {
    next.connected = false;
    next.error = next.link === "usb" ? "Selecione uma conexão ser2net" : "Selecione o dispositivo Bluetooth";
    const idx = radios.findIndex((r) => r.id === next.id);
    if (idx >= 0) radios[idx] = next;
    else radios.push(next);
    persist();
    const snap = await radiosStatus();
    snap.ok = false;
    snap.error = next.error;
    return snap;
  }
  if (ble) {
    next.connected = false;
    const idx = radios.findIndex((r) => r.id === next.id);
    if (idx >= 0) radios[idx] = next;
    else radios.push(next);
    persist();
    const snap = await radiosStatus();
    snap.needBle = true;
    snap.bleAddr = next.civAddr;
    return snap;
  }

  if (next.link === "usb") {
    const cfg = await loadSer2net();
    const svc =
      cfg.services.find((x) => x.id === next.device) ||
      cfg.services.find((x) => `${cfg.bind}:${x.tcpPort}` === next.port) ||
      cfg.services.find((x) => x.device === SER2NET_RADIO_ID);
    const taken = Boolean(svc?.device && svc.device !== SER2NET_RADIO_ID);
    if (!svc || taken) {
      next.error = "Selecione uma conexão ser2net (IP/porta/serial) já cadastrada";
      next.connected = false;
    } else {
      next.device = svc.id;
      next.deviceName = svc.name || next.deviceName;
      next.port = `${cfg.bind}:${svc.tcpPort}`;
      next.baud = svc.baud;
      next.connected = true;
      radios = radios.map((r) => (r.id === next.id ? r : { ...r, connected: r.link === "usb" ? false : r.connected }));
      if (svc.device !== SER2NET_RADIO_ID) {
        await saveSer2net({
          bind: cfg.bind,
          folder: cfg.folder,
          services: cfg.services.map((x) => ({
            ...x,
            device: x.id === svc.id ? SER2NET_RADIO_ID : x.device === SER2NET_RADIO_ID ? "" : x.device,
          })),
        });
      }
    }
  } else {
    next.connected = true;
  }

  const idx = radios.findIndex((r) => r.id === next.id);
  if (idx >= 0) radios[idx] = next;
  else radios.push(next);
  persist();
  const snap = await radiosStatus();
  if (next.error) {
    snap.ok = false;
    snap.error = next.error;
  }
  return snap;
}

export async function radiosDisconnect(id: string): Promise<RadiosSnapshot> {
  const row = findRadio(id);
  if (!row) return radiosSnapshotFast();

  // Persiste desconectado primeiro: a UI não fica à mercê do teardown LAN/Hamlib.
  row.connected = false;
  row.error = "";
  persist();

  if (isIcomLan(row) || icomLanStatus().radioId === id) {
    try {
      await icomLanDisconnect();
    } catch {
      /* teardown best-effort — nunca derruba a resposta HTTP */
    }
  }

  if (row.link === "usb") {
    try {
      const cfg = await loadSer2net();
      const hit = cfg.services.find((x) => x.id === row.device || x.device === SER2NET_RADIO_ID);
      if (hit?.device === SER2NET_RADIO_ID) {
        await saveSer2net({
          bind: cfg.bind,
          folder: cfg.folder,
          services: cfg.services.map((x) => ({
            ...x,
            device: x.device === SER2NET_RADIO_ID ? "" : x.device,
          })),
        });
      }
    } catch {
      /* ser2net opcional no disconnect */
    }
  }

  // Evita PowerShell/listagem serial no caminho crítico (causa Failed to fetch se o Vite reinicia).
  return radiosSnapshotFast();
}

/** Reabre sessão LAN se o rádio Icom Rede estava marcado conectado no boot. */
export async function radiosResumeIcomLan(): Promise<void> {
  const row = radios.find((r) => r.connected && isIcomLan(r));
  if (!row?.host || !row.netUser) return;
  const lan = await icomLanConnect({
    radioId: row.id,
    host: row.host,
    controlPort: Number(row.port) || 50001,
    userName: row.netUser,
    password: row.netPassword || "",
    civAddr: row.civAddr,
    hamlibModel: hamlibModelFor(row),
    equipmentId: row.equipmentId,
    deviceName: row.deviceName || row.name,
  });
  const idx = radios.findIndex((r) => r.id === row.id);
  if (idx < 0) return;
  if (lan.connected) {
    radios[idx] = {
      ...radios[idx]!,
      connected: true,
      error: "",
      ...(lan.civAddr ? { civAddr: lan.civAddr } : {}),
      ...(lan.deviceName ? { deviceName: lan.deviceName } : {}),
    };
  } else {
    radios[idx] = { ...radios[idx]!, connected: false, error: lan.error || "Icom LAN offline no boot" };
  }
  persist();
}

export async function radiosMarkBle(id: string, connected: boolean, name?: string, error?: string): Promise<RadiosSnapshot> {
  const row = findRadio(id);
  if (row) {
    row.connected = connected;
    if (name) row.deviceName = name;
    row.error = error || "";
    persist();
  }
  return radiosStatus();
}
