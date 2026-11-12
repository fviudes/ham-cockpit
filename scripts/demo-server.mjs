#!/usr/bin/env node
/**
 * Servidor de DEMONSTRAÇÃO do console Ham Cockpit (só para capturar telas do manual).
 *
 *   HC_DEMO=1 node scripts/demo-server.mjs            # http://127.0.0.1:3100/console
 *
 * - Só liga com HC_DEMO=1 (nunca roda no aparelho: não faz parte do server/ nem da OTA).
 * - Escuta apenas em 127.0.0.1.
 * - Serve o build do console (padrão tmp/demo-public, ver scripts/capture-manual.mjs) e
 *   devolve dados FICTÍCIOS e coerentes em /api/*: rádio IC-705 por LAN, rigctld/ser2net,
 *   SPE, LDG, LP-100A, Lextel, Wavelog + banco, WaveLogGate, MMDVM + Nextion, Status, OTA...
 * - O terminal (/ws/term) é um shell de mentira: não executa nada.
 * - Cena (para as capturas): POST /__demo/scene { tx?: boolean, update?: "idle"|"available"|"running" }.
 *
 * Nenhum dado real (senha, IP, indicativo, serial) aparece aqui.
 */
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

if (process.env.HC_DEMO !== "1") {
  console.error("[demo] recusado: defina HC_DEMO=1 para iniciar o servidor de demonstração.");
  process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.resolve(process.env.HC_DEMO_DIST || path.join(ROOT, "tmp", "demo-public"));
const PORT = Number(process.env.HC_DEMO_PORT || 3100);

// ─────────────────────────────── cena ────────────────────────────────
const scene = { tx: false, update: "available" };
const t0 = Date.now();
const rnd = (seed) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const wave = (period, amp = 1) => Math.sin(((Date.now() - t0) / period) * Math.PI * 2) * amp;

// ───────────────────────────── dados base ────────────────────────────
const CALL = "PY2XYZ";
const DMR_ID = "7249999";
const IP_LAN = "192.168.1.50";

const radios = [
  {
    id: "ic705lan",
    name: "Icom · IC-705 (LAN)",
    maker: "icom",
    link: "network",
    device: "",
    deviceName: "IC-705",
    proto: "civ",
    port: "50001",
    baud: 0,
    civAddr: "0xA4",
    connected: true,
    primary: true,
    error: "",
    equipmentId: "icom-ic-705",
    host: "192.168.1.60",
    netProfile: "icom-lan-udp",
    netUser: "hamcockpit",
    hasNetPassword: true,
  },
  {
    id: "ftx1usb",
    name: "Yaesu · FTX-1 (USB / CAT)",
    maker: "yaesu",
    link: "usb",
    device: "/dev/serial/by-id/usb-Silicon_Labs_CP2105_Dual_USB_to_UART-if00-port0",
    deviceName: "FTX-1",
    proto: "cat",
    port: "/dev/ttyUSB0",
    baud: 38400,
    civAddr: "",
    connected: false,
    primary: false,
    error: "",
    equipmentId: "yaesu-ftx-1",
  },
];

const serials = [
  { path: "/dev/serial/by-id/usb-Silicon_Labs_CP2105_Dual_USB_to_UART-if00-port0", label: "Silicon Labs CP2105 (rádio CAT)", kind: "usb" },
  { path: "/dev/serial/by-id/usb-FTDI_FT232R_SPE-if00-port0", label: "FTDI FT232R · SPE Expert", kind: "usb" },
  { path: "/dev/serial/by-id/usb-FTDI_FT232R_LDG-if00-port0", label: "FTDI FT232R · LDG AT-1000ProII", kind: "usb" },
  { path: "/dev/serial/by-id/usb-Prolific_PL2303_LP100A-if00-port0", label: "Prolific PL2303 · TelePost LP-100A", kind: "usb" },
  { path: "/dev/ttyAMA0", label: "ttyAMA0 (HAT MMDVM)", kind: "serial" },
];

let ser2net = {
  ok: true,
  folder: "/opt/ser2net",
  bind: "127.0.0.1",
  running: true,
  services: [
    { id: "s2n-radio", name: "FTX-1 CAT", serial: serials[0].path, tcpPort: 4001, baud: 38400, device: "radio" },
    { id: "s2n-spe", name: "SPE Expert 1.3K-FA", serial: serials[1].path, tcpPort: 4004, baud: 9600, device: "spe" },
    { id: "s2n-ldg", name: "LDG AT-1000ProII", serial: serials[2].path, tcpPort: 4003, baud: 38400, device: "ldg" },
    { id: "s2n-lp", name: "TelePost LP-100A", serial: serials[3].path, tcpPort: 4005, baud: 115200, device: "lp100a" },
  ],
};

const SERVICES = [
  ["ser2net", "ser2net.service", true],
  ["wavelog", "wavelog.service", true],
  ["db", "wavelog-db", true],
  ["wlg", "waveloggate.service", true],
  ["mmdvm", "mmdvmhost.service", true],
  ["radio", "", true],
  ["spe", "ampctld@spe.service", true],
  ["hamplus", "", false],
  ["palstar", "", false],
  ["ldg", "", true],
  ["lp100a", "", true],
  ["acom", "", false],
  ["lextel", "", true],
  ["wifi", "ham-cockpit-ap.service", false],
  ["bluetooth", "bluetooth.service", true],
  ["dhcp", "", false],
  ["web", "ham-cockpit.service", false],
];
const POWER = new Set(["ser2net", "wavelog", "db", "wlg", "mmdvm", "spe", "bluetooth", "radio", "lextel", "ldg", "lp100a"]);
const svcState = Object.fromEntries(
  SERVICES.map(([id]) => [id, { autostart: !["hamplus", "palstar", "acom"].includes(id), running: !["hamplus", "palstar", "acom", "dhcp"].includes(id) }]),
);
svcState.radio.running = true;
svcState.wifi.running = true;
svcState.dhcp.running = true;

const mmdvmBase = {
  callsign: CALL,
  dmrId: DMR_ID,
  duplex: false,
  rxHz: 438_800_000,
  txHz: 438_800_000,
  colorCode: 1,
  latitude: "-23.5505",
  longitude: "-46.6333",
  location: "Shack demonstração, SP",
  modemBoard: "mmdvmhshat",
  modemPort: "/dev/ttyAMA0",
  uartSpeed: 115200,
  remotePort: 7642,
  dstarReflector: "REF001",
  dstarModule: "C",
  ysfStartup: "FCS00120",
  displayType: "Nextion",
  displayPort: "modem",
  screenLayout: 4,
  brightness: 50,
  idleBrightness: 20,
  nextionDriver: true,
  oledType: 3,
  modes: { dstar: true, dmr: true, ysf: true, p25: false, nxdn: false, m17: false, pocsag: false },
  networks: [
    { id: "bm", section: "DMR Network 1", name: "BrandMeister", enabled: true, address: "3104.master.brandmeister.network", port: 62031, password: "" },
    { id: "dmrplus", section: "DMR Network 2", name: "DMR+", enabled: false, address: "dmrplus.example.net", port: 8880, password: "" },
    { id: "tgif", section: "DMR Network 3", name: "TGIF", enabled: false, address: "tgif.network", port: 62031, password: "" },
    { id: "xlx", section: "XLX Network", name: "XLX", enabled: false, address: "xlx.example.net", port: 62030, password: "" },
  ],
  ok: true,
  installed: true,
  appliance: true,
  hostRunning: true,
  gatewayRunning: true,
  ysfRunning: true,
  dstarRunning: true,
  nextionRunning: true,
  hostBinary: "/usr/local/bin/MMDVMHost",
  gatewayBinary: "/usr/local/bin/DMRGateway",
  ysfBinary: "/usr/local/bin/YSFGateway",
  dstarBinary: "/usr/local/bin/ircddbgatewayd",
  nextionBinary: "/usr/local/sbin/NextionDriver",
  hostIni: "/opt/ham-cockpit/mmdvm/mmdvmhost.ini",
  gatewayIni: "/opt/ham-cockpit/mmdvm/dmrgateway.ini",
  ysfIni: "/opt/ham-cockpit/mmdvm/ysfgateway.ini",
  dstarIni: "/opt/ham-cockpit/mmdvm/ircddbgateway",
  logDir: "/var/log/mmdvm",
  tx: false,
  currentMode: "DMR",
  paused: { dstar: false, dmr: false, ysf: false, p25: false, nxdn: false, m17: false, pocsag: false },
  error: "",
};
function hhmm(minAgo) {
  const d = new Date(Date.now() - minAgo * 60000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}
const heard = [
  ["DMR Slot 2", "PU2ABC", "TG 724", "Net", "12.4s", "0%", "0.4%", "-68 dBm"],
  ["YSF", "PY1DEF", "FCS001-20", "Net", "8.1s", "0%", "0.0%", "-71 dBm"],
  ["DMR Slot 2", "PY5GHI", "TG 72451", "RF", "5.7s", "1%", "1.2%", "-62 dBm"],
  ["D-Star", "PP5JKL", "CQCQCQ", "Net", "20.3s", "0%", "—", "—"],
  ["DMR Slot 1", "PY3MNO", "TG 91", "Net", "31.0s", "0%", "0.6%", "-74 dBm"],
  ["DMR Slot 2", "PU4PQR", "TG 724", "Net", "3.9s", "2%", "1.9%", "-80 dBm"],
  ["YSF", "PY2STU", "FCS001-20", "Net", "14.2s", "0%", "0.0%", "-66 dBm"],
  ["DMR Slot 2", "PY7VWX", "TG 72451", "RF", "9.6s", "0%", "0.8%", "-58 dBm"],
].map((r, i) => ({ timeUtc: hhmm(i * 3 + 1), mode: r[0], callsign: r[1], target: r[2], src: r[3], duration: r[4], loss: r[5], ber: r[6], rssi: r[7] }));

function mmdvmStatus() {
  return {
    ...mmdvmBase,
    tx: scene.tx,
    lastHeard: heard,
    nextion: {
      page: "dmr",
      status: "DMR · TG 724",
      callsign: CALL,
      dmrId: DMR_ID,
      ip: IP_LAN,
      location: "São Paulo",
      rxHz: mmdvmBase.rxHz,
      txHz: mmdvmBase.txHz,
      cpuTempC: 47.2,
      diskFreePct: 78,
      duplex: false,
      qso: [
        { mode: "DMR", slot: 2, src: "Net", callsign: "PU2ABC", name: "Marcos", target: "TG 724", tgName: "Brasil", ber: "0.4%", rssi: "-68 dBm", loss: "0%" },
      ],
    },
  };
}

// Histórico de CPU/RAM/rede/temperatura (60 amostras de 5 s = 5 min).
function hostStatus() {
  const now = Date.now();
  const samples = [];
  for (let i = 59; i >= 0; i--) {
    const t = now - i * 5000;
    const k = t / 5000;
    const cpu = Math.max(2, Math.min(96, 18 + Math.sin(k / 6) * 9 + rnd(k) * 12 + (scene.tx ? 8 : 0)));
    samples.push({
      t,
      cpuPct: Math.round(cpu * 10) / 10,
      ramPct: Math.round((23 + Math.sin(k / 30) * 1.2 + rnd(k + 7) * 0.8) * 10) / 10,
      ramUsedBytes: 1_950_000_000,
      ramTotalBytes: 8_320_000_000,
      cpuTempC: Math.round((47 + Math.sin(k / 12) * 3 + cpu * 0.08) * 10) / 10,
      netRxBps: Math.round(18_000 + rnd(k + 3) * 90_000 + Math.max(0, Math.sin(k / 9)) * 120_000),
      netTxBps: Math.round(6_000 + rnd(k + 5) * 30_000 + Math.max(0, Math.sin(k / 11)) * 40_000),
    });
  }
  const last = samples[samples.length - 1];
  return {
    ok: true,
    cpuTempC: last.cpuTempC,
    diskTotalBytes: 62_000_000_000,
    diskFreeBytes: 47_500_000_000,
    diskUsedBytes: 14_500_000_000,
    diskPath: "/",
    error: "",
    hardware: "Raspberry Pi 5 Model B Rev 1.0",
    soc: "Broadcom BCM2712 · 4×2.4 GHz",
    osPretty: "Ubuntu 24.04.3 LTS",
    appVersion: "0.1.06.02",
    uptimeSec: 3 * 86400 + 5 * 3600 + 1260,
    cpuPct: last.cpuPct,
    ramPct: last.ramPct,
    ramUsedBytes: last.ramUsedBytes,
    ramTotalBytes: last.ramTotalBytes,
    netRxBps: last.netRxBps,
    netTxBps: last.netTxBps,
    sampleMs: 5000,
    windowMs: 300000,
    samples,
  };
}

function net() {
  return {
    ok: true,
    folder: "/opt/ham-cockpit/net",
    hostname: "ham-cockpit",
    liveHostname: "ham-cockpit",
    link: "wifi",
    dhcp: true,
    ip: "",
    mask: "255.255.255.0",
    gw: "",
    dns1: "1.1.1.1",
    dns2: "8.8.8.8",
    staSsid: "Shack-Fibra",
    staConnected: true,
    staPassSet: true,
    apSsid: "Ham-Cockpit-A1B2",
    apPassSet: true,
    ethConnected: false,
    ethName: "eth0",
    wlanName: "wlan0",
    liveIp: IP_LAN,
    liveMask: "255.255.255.0",
    liveGw: "192.168.1.1",
    scan: [
      { ssid: "Shack-Fibra", rssi: -48, open: false },
      { ssid: "Vizinho_2G", rssi: -71, open: false },
      { ssid: "Clube-Radioamador", rssi: -77, open: false },
      { ssid: "Cafe-Livre", rssi: -83, open: true },
    ],
    managed: [{ ssid: "Shack-Fibra" }, { ssid: "Clube-Radioamador" }],
    error: "",
    note: "",
  };
}

function lextel() {
  const tx = scene.tx;
  const pep = tx ? 1180 + wave(900, 40) : 0;
  const avg = tx ? 640 + wave(700, 30) : 0;
  return {
    ok: true,
    folder: "/opt/ham-cockpit/lextel",
    sppUuid: "00001101-0000-1000-8000-00805f9b34fb",
    phase: "streaming",
    connected: true,
    decoded: true,
    addr: "00:11:22:33:44:55",
    name: "MS-2000",
    pin: "1234",
    channel: 1,
    autoConnect: true,
    path: "/dev/rfcomm0",
    error: "",
    hex: "",
    layout: "ms2000",
    bytes: 48211,
    updatedAt: Date.now(),
    pep: Math.round(pep),
    avg: Math.round(avg),
    ref: tx ? Math.round(14 + wave(500, 3)) : 0,
    swr: tx ? 1.18 : 1,
    vdc: 13.8,
    z: tx ? 51.4 : 0,
    mod: tx ? 82 : 0,
    alarms: [],
    devices: [
      { addr: "00:11:22:33:44:55", name: "MS-2000", paired: true, kind: "bt", likely: true },
      { addr: "AA:BB:CC:DD:EE:FF", name: "Headset BT", paired: false, kind: "bt", likely: false },
    ],
    ascii: "",
    note: "",
    captureBytes: 0,
    period: 100,
  };
}

function ldg() {
  const tx = scene.tx;
  return {
    ok: true,
    model: "at1000pro2",
    port: serials[2].path,
    baud: 38400,
    autoConnect: true,
    connected: true,
    hardware: true,
    phase: "ready",
    error: "",
    ant: 1,
    mode: "AUTO",
    match: "T",
    tuning: false,
    fwd: tx ? 612 : 0,
    ref: tx ? 12 : 0,
    swr: tx ? 1.14 : 1,
    lastRx: "",
    serialOk: true,
    maxW: 1000,
    label: "AT-1000ProII",
    folder: "/opt/ham-cockpit/ldg",
  };
}

function lp100a() {
  const tx = scene.tx;
  return {
    ok: true,
    port: serials[3].path,
    autoConnect: true,
    connected: true,
    hardware: true,
    phase: "ready",
    error: "",
    fwd: tx ? 87.4 : 0,
    ref: tx ? 1.2 : 0,
    swr: tx ? 1.12 : 1,
    z: tx ? 52.1 : 0,
    phaseDeg: tx ? 8.4 : 0,
    dbm: tx ? 49.4 : -99,
    alarm: 2,
    callsign: CALL,
    range: "HIGH",
    meter: "PEAK",
    tx,
    lastRx: "",
    baud: 115200,
    folder: "/opt/ham-cockpit/lp100a",
  };
}

let updateJob = null; // { id, start }
function updatesStatus() {
  const base = (id, current, available, note) => ({
    id,
    current,
    available,
    updatable: false,
    applying: false,
    error: "",
    note,
    progress: 0,
    stage: "",
    determinate: false,
    bytes: 0,
    totalBytes: 0,
    etaSec: 0,
  });
  const upd = scene.update;
  const items = [
    base("app", upd === "idle" ? "0.1.06.02" : "0.1.06.01", "0.1.06.02", "github.com/fviudes/ham-cockpit/update"),
    base("os", "Ubuntu 24.04.3 LTS", upd === "idle" ? "Ubuntu 24.04.3 LTS" : "Ubuntu 24.04.4 LTS", "Ubuntu Server"),
    base("ser2net", "4.6.1", "4.6.1", "apt ser2net"),
    base("hamlib", "4.5.5", "4.5.5", "apt libhamlib-utils"),
    base("wavelog", "2.0.4", upd === "idle" ? "2.0.4" : "2.1.0", "docker ghcr.io/wavelog/wavelog"),
    base("wlg", "1.0.1", "1.0.1", "WaveLogGate headless"),
  ];
  const jobs = [];
  if (upd === "running") {
    const pct = 63;
    items[0].applying = true;
    items[0].progress = pct;
    items[0].determinate = true;
    items[0].stage = "Baixando pacote da atualização…";
    items[0].bytes = 9_400_000;
    items[0].totalBytes = 14_900_000;
    items[0].etaSec = 12;
    jobs.push({ id: "app", status: "running", pct, determinate: true, stage: items[0].stage, error: "", bytes: items[0].bytes, totalBytes: items[0].totalBytes, etaSec: 12 });
    items[4].applying = true;
    items[4].progress = 28;
    items[4].determinate = true;
    items[4].stage = "Baixando imagem do Wavelog…";
    items[4].bytes = 82_000_000;
    items[4].totalBytes = 290_000_000;
    items[4].etaSec = 95;
    jobs.push({ id: "wavelog", status: "running", pct: 28, determinate: true, stage: items[4].stage, error: "", bytes: items[4].bytes, totalBytes: items[4].totalBytes, etaSec: 95 });
  }
  const pending = items.filter((i) => i.current !== i.available).length;
  return { ok: true, os: "Ubuntu 24.04.3 LTS", pending, items, jobs, error: "" };
}

const wavelogDb = {
  ok: true,
  running: true,
  connected: true,
  health: "healthy",
  deploy: "docker",
  compose: "/opt/wavelog/docker-compose.yml",
  envFile: "/opt/wavelog/.env",
  passwordSource: "env",
  queryVia: "user",
  host: "wavelog-db",
  port: 3306,
  published: false,
  name: "wavelog",
  user: "wavelog",
  password: "",
  version: "11.4.3-MariaDB",
  charset: "utf8mb4",
  collation: "utf8mb4_general_ci",
  engine: "InnoDB",
  tables: 96,
  sizeBytes: 18_700_000,
  url: `http://${IP_LAN}:8086/`,
  network: "wavelog",
  volume: "wavelog-dbdata",
  image: "mariadb:11.4",
};

const backups = [
  {
    id: "hamcockpit-20261110-221500-a1b2c3d4",
    user: "admin",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    size: 4_820_000,
    parts: ["station:ser2net", "station:radios", "station:layouts", "station:ldg", "station:net", "station:services", "station:lextel", "station:users", "wavelog", "wlg", "mmdvm"],
    warnings: [],
  },
  {
    id: "hamcockpit-20261105-090000-e5f6a7b8",
    user: "admin",
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    size: 4_310_000,
    parts: ["station:ser2net", "station:radios", "station:net", "station:services", "wavelog"],
    warnings: [],
  },
];

// ─────────────────────────────── app ─────────────────────────────────
const app = express();
const server = createServer(app);
app.use(express.json({ limit: "64kb" }));

const ok = (res, body = {}) => res.json({ ok: true, ...body });
const radiosBody = () => ({
  ok: true,
  folder: "/opt/ham-cockpit/radios",
  radios,
  usb: serials.filter((d) => d.kind === "usb").map((d) => ({ id: d.path, path: d.path, label: d.label, kind: "usb" })),
  bluetooth: [{ id: "10:20:30:40:50:60", path: "10:20:30:40:50:60", label: "ICOM BT(IC-705) (10:20:30:40:50:60)", kind: "bluetooth" }],
});

app.post("/__demo/scene", (req, res) => {
  if (typeof req.body?.tx === "boolean") scene.tx = req.body.tx;
  if (["idle", "available", "running"].includes(req.body?.update)) scene.update = req.body.update;
  res.json({ ok: true, scene });
});

app.get("/api/radios", (_req, res) => res.json(radiosBody()));
app.put("/api/radios", (_req, res) => res.json(radiosBody()));
app.post("/api/radios", (_req, res) => res.json(radiosBody()));
app.post("/api/radios/connect", (_req, res) => res.json(radiosBody()));
app.post("/api/radios/primary", (_req, res) => res.json(radiosBody()));
app.post("/api/radios/disconnect", (_req, res) => res.json(radiosBody()));
app.post("/api/radios/ble", (_req, res) => res.json(radiosBody()));
app.delete("/api/radios/:id", (_req, res) => res.json(radiosBody()));
app.get("/api/radios/lan", (_req, res) => ok(res, { connected: true, host: "192.168.1.60", model: "IC-705", civAddr: "0xA4" }));
app.post("/api/radios/civ", (req, res) => {
  if (req.body?.cmd === "setPtt") scene.tx = Boolean(req.body.on);
  ok(res);
});
app.post("/api/hamlib/cmd", (req, res) => ok(res, { reply: "RPRT 0\n", command: String(req.body?.command || "") }));

app.get("/api/ser2net", (_req, res) => res.json(ser2net));
app.put("/api/ser2net", (req, res) => {
  if (Array.isArray(req.body?.services)) ser2net = { ...ser2net, services: req.body.services };
  res.json(ser2net);
});
app.get("/api/serials", (_req, res) => res.json({ devices: serials }));

app.get("/api/lextel", (_req, res) => res.json(lextel()));
for (const p of ["scan", "connect", "disconnect", "keepalive", "learn", "bluetooth"]) {
  app.post(`/api/lextel/${p}`, (_req, res) => res.json(lextel()));
}
app.put("/api/lextel", (_req, res) => res.json(lextel()));

app.get("/api/ldg", (_req, res) => res.json(ldg()));
app.put("/api/ldg", (_req, res) => res.json(ldg()));
app.post("/api/ldg/:a", (_req, res) => res.json(ldg()));
app.get("/api/lp100a", (_req, res) => res.json(lp100a()));
app.put("/api/lp100a", (_req, res) => res.json(lp100a()));
app.post("/api/lp100a/:a", (_req, res) => res.json(lp100a()));

app.get("/api/net", (_req, res) => res.json(net()));
app.put("/api/net", (_req, res) => res.json(net()));
app.post("/api/net/:a", (_req, res) => res.json(net()));

app.get("/api/services", (_req, res) =>
  res.json({
    ok: true,
    folder: "/opt/ham-cockpit/services",
    error: "",
    items: SERVICES.map(([id, unit]) => ({ id, unit, power: POWER.has(id), ...svcState[id] })),
  }),
);
app.post("/api/services", (req, res) => {
  const id = String(req.body?.id || "");
  if (svcState[id]) svcState[id].autostart = Boolean(req.body?.autostart);
  res.json({ ok: true, folder: "", error: "", items: SERVICES.map(([i, unit]) => ({ id: i, unit, power: POWER.has(i), ...svcState[i] })) });
});
app.post("/api/services/power", (req, res) => {
  const id = String(req.body?.id || "");
  if (svcState[id]) svcState[id].running = Boolean(req.body?.on);
  res.json({ ok: true, folder: "", error: "", items: SERVICES.map(([i, unit]) => ({ id: i, unit, power: POWER.has(i), ...svcState[i] })) });
});

app.get("/api/updates", (_req, res) => res.json(updatesStatus()));
app.post("/api/updates/check", (_req, res) => res.json(updatesStatus()));
app.post("/api/updates", (_req, res) => res.json(updatesStatus()));

app.get("/api/host", (_req, res) => res.json(hostStatus()));

app.get("/api/wavelog/status", (_req, res) =>
  res.json({ ok: true, url: `http://${IP_LAN}:8086/`, port: 8086, docker: true, compose: "/opt/wavelog", reason: "ok", httpStatus: 200 }),
);
app.post("/api/wavelog/up", (_req, res) =>
  res.json({ ok: true, url: `http://${IP_LAN}:8086/`, port: 8086, docker: true, compose: "/opt/wavelog", reason: "ok", httpStatus: 200 }),
);
app.post("/api/wavelog/down", (_req, res) =>
  res.json({ ok: false, url: `http://${IP_LAN}:8086/`, port: 8086, docker: true, compose: "/opt/wavelog", reason: "down" }),
);
app.get("/api/wavelog/database", (_req, res) => res.json(wavelogDb));
app.get("/api/wavelog/database/password", (_req, res) => res.status(404).json({ ok: false, password: "" }));
app.post("/api/wavelog/db/up", (_req, res) => res.json(wavelogDb));
app.post("/api/wavelog/db/down", (_req, res) => res.json({ ...wavelogDb, running: false, connected: false, health: "exited" }));
app.post("/api/wavelog/db-update", (_req, res) => res.json({ ...wavelogDb, updated: true }));

app.get("/api/wlg/status", (_req, res) => res.json({ ok: true, udpPort: 2333, qsyPort: 54321, reason: "ok" }));
app.post("/api/wlg/up", (_req, res) => res.json({ ok: true, udpPort: 2333, qsyPort: 54321, reason: "ok" }));
app.post("/api/wlg/down", (_req, res) => res.json({ ok: false, udpPort: 2333, qsyPort: 54321, reason: "down" }));

app.get("/api/mmdvm", (_req, res) => res.json(mmdvmStatus()));
app.put("/api/mmdvm", (_req, res) => res.json(mmdvmStatus()));
app.post("/api/mmdvm/remote", (_req, res) => ok(res));
app.post("/api/mmdvm/*", (_req, res) => res.json(mmdvmStatus()));

app.get("/api/layout", (_req, res) => res.status(404).json({ ok: false, tiles: [] }));
app.put("/api/layout", (req, res) => res.json({ ok: true, tiles: req.body?.tiles || [] }));

app.get("/api/users", (_req, res) =>
  res.json({
    users: [
      { name: "hamcockpit", sudo: true },
      { name: "admin", sudo: true },
      { name: "operador", sudo: false },
    ],
    ssh: { ok: true },
  }),
);
app.post("/api/users", (_req, res) => ok(res));
app.delete("/api/users/:name", (_req, res) => ok(res));

app.get("/api/backup", (_req, res) => res.json({ ok: true, folder: "/opt/ham-cockpit/backup", items: backups }));
app.post("/api/backup", (_req, res) => ok(res, { item: backups[0] }));
app.delete("/api/backup/:id", (_req, res) => ok(res));
app.post("/api/backup/:id/restore", (_req, res) => ok(res));

app.get("/api/equipment", (_req, res) => res.json({ ok: true, equipment: [] }));
app.get("/api/hamlib", (_req, res) => res.json({ ok: true, bindings: [], plans: [] }));
app.post("/api/vfo-display/exit", (_req, res) => ok(res));

app.use("/api", (_req, res) => res.status(404).json({ ok: false, error: "API não encontrada (demonstração)" }));
app.use(express.static(DIST));
app.get("*", (_req, res) => res.sendFile(path.join(DIST, "index.html")));

// Terminal de mentira: não executa nada.
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (req.url?.split("?")[0] !== "/ws/term") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const prompt = "\x1b[1;32mroot@ham-cockpit\x1b[0m:\x1b[1;34m~\x1b[0m# ";
    ws.send("Ham Cockpit · shell root (demonstração)\r\n");
    ws.send(`${prompt}`);
    let line = "";
    const canned = {
      "uname -a": "Linux ham-cockpit 6.8.0-1017-raspi #19-Ubuntu SMP PREEMPT_DYNAMIC aarch64 GNU/Linux",
      uptime: " 13:08:41 up 3 days,  5:21,  1 user,  load average: 0.21, 0.18, 0.15",
      "systemctl status ser2net --no-pager": "● ser2net.service - Serial to Network Proxy\r\n     Active: \x1b[1;32mactive (running)\x1b[0m since Mon 2026-11-09 07:47:12 -03; 3 days ago",
      "docker ps": "CONTAINER ID   IMAGE                      STATUS                  NAMES\r\n3f1c2a9d8e11   ghcr.io/wavelog/wavelog    Up 3 days               wavelog\r\n7b0e5d4c2a90   mariadb:11.4               Up 3 days (healthy)     wavelog-db",
    };
    ws.on("message", (raw) => {
      const txt = raw.toString();
      if (txt.startsWith("{")) return;
      for (const ch of txt) {
        if (ch === "\r" || ch === "\n") {
          const out = canned[line.trim()];
          ws.send("\r\n");
          if (out) ws.send(`${out}\r\n`);
          else if (line.trim()) ws.send(`(demonstração) comando não executado: ${line.trim()}\r\n`);
          ws.send(prompt);
          line = "";
        } else if (ch === "\x7f") {
          if (line) {
            line = line.slice(0, -1);
            ws.send("\b \b");
          }
        } else if (ch >= " ") {
          line += ch;
          ws.send(ch);
        }
      }
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[demo] Ham Cockpit (demonstração) em http://127.0.0.1:${PORT}/console  ·  estáticos: ${DIST}`);
});
