#!/usr/bin/env node
/**
 * WaveLogGate headless — escuta UDP (WSJT-X/JTDX/FLDigi) e cadastra o QSO no Wavelog.
 * Sem WebKit / DISPLAY: roda no Raspberry Pi OS Lite via systemd.
 */
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { Socket } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAGIC = 0xadbccbda;
const QUEUE = join(HERE, "queue.jsonl");

function loadEnv() {
  for (const f of [process.env.WAVELOG_GATE_ENV, join(HERE, "wavelog-gate.env"), "/opt/wavelog-gate/wavelog-gate.env"]) {
    if (!f || !existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnv();

const CFG = {
  url: (process.env.WAVELOG_URL || "http://127.0.0.1:8086/index.php").replace(/\/+$/, ""),
  key: process.env.WAVELOG_API_KEY || "",
  station: process.env.WAVELOG_STATION_ID || "1",
  radio: process.env.RADIO_NAME || "IC-705",
  hamlibHost: process.env.HAMLIB_HOST || "127.0.0.1",
  hamlibPort: Number(process.env.HAMLIB_PORT || 4532),
  udpPort: Number(process.env.UDP_PORT || 2333),
  qsyPort: Number(process.env.QSY_PORT || 54321),
  publishCat: /^(1|true|yes)$/i.test(process.env.PUBLISH_CAT || "1"),
};

const recent = new Map();

function log(msg) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

class R {
  constructor(buf) {
    this.b = buf;
    this.i = 0;
  }
  left() {
    return this.b.length - this.i;
  }
  u32() {
    const v = this.b.readUInt32BE(this.i);
    this.i += 4;
    return v;
  }
  u64() {
    const v = this.b.readBigUInt64BE(this.i);
    this.i += 8;
    return v;
  }
  u8() {
    return this.b[this.i++];
  }
  str() {
    if (this.left() < 4) return "";
    const n = this.b.readInt32BE(this.i);
    this.i += 4;
    if (n < 0) return "";
    const s = this.b.subarray(this.i, this.i + n).toString("utf8");
    this.i += n;
    return s;
  }
  qdt() {
    if (this.left() < 13) return null;
    const jd = Number(this.u64());
    const msec = this.b.readUInt32BE(this.i);
    this.i += 4;
    const spec = this.u8();
    if (spec === 2 && this.left() >= 4) this.i += 4;
    const unix = (jd - 2440588) * 86400 + msec / 1000;
    return new Date(unix * 1000);
  }
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`,
  };
}

function adifField(name, value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return `<${name}:${Buffer.byteLength(v)}>${v}`;
}

function qsoToAdif(q) {
  const on = q.on ? ymd(q.on) : q.off ? ymd(q.off) : ymd(new Date());
  const off = q.off ? ymd(q.off) : on;
  const mhz = q.hz ? (Number(q.hz) / 1e6).toFixed(6) : "";
  return [
    adifField("call", q.call),
    adifField("gridsquare", q.grid),
    adifField("mode", q.mode),
    adifField("freq", mhz),
    adifField("qso_date", on.date),
    adifField("time_on", on.time),
    adifField("qso_date_off", off.date),
    adifField("time_off", off.time),
    adifField("rst_sent", q.rstSent),
    adifField("rst_rcvd", q.rstRcvd),
    adifField("tx_pwr", q.power),
    adifField("comment", q.comment),
    adifField("name", q.name),
    adifField("operator", q.operator),
    adifField("station_callsign", q.myCall),
    adifField("my_gridsquare", q.myGrid),
    adifField("stx_string", q.exchSent),
    adifField("srx_string", q.exchRcvd),
    "<eor>",
  ].join("");
}

function parseWsjtx(buf) {
  if (buf.length < 12) return null;
  const r = new R(buf);
  if (r.u32() !== MAGIC) return null;
  r.u32();
  const type = r.u32();
  if (type === 12) {
    r.str();
    const adif = r.str();
    return adif ? { adif } : null;
  }
  if (type !== 5) return null;
  r.str();
  const off = r.qdt();
  const call = r.str();
  const grid = r.str();
  const hz = r.left() >= 8 ? Number(r.u64()) : 0;
  const mode = r.str();
  const rstSent = r.str();
  const rstRcvd = r.str();
  const power = r.str();
  const comment = r.str();
  const name = r.str();
  const on = r.qdt();
  const operator = r.str();
  const myCall = r.str();
  const myGrid = r.str();
  const exchSent = r.str();
  const exchRcvd = r.str();
  if (!call) return null;
  return {
    adif: qsoToAdif({
      call,
      grid,
      hz,
      mode,
      rstSent,
      rstRcvd,
      power,
      comment,
      name,
      on,
      off,
      operator,
      myCall,
      myGrid,
      exchSent,
      exchRcvd,
    }),
  };
}

function looksAdif(s) {
  return /<\s*(call|eor|eoh|adif)/i.test(s);
}

function dupKey(adif) {
  const call = adif.match(/<call:\d+>([^<]+)/i)?.[1] ?? "";
  const date = adif.match(/<qso_date:\d+>([^<]+)/i)?.[1] ?? "";
  const mode = adif.match(/<mode:\d+>([^<]+)/i)?.[1] ?? "";
  return `${call}|${date}|${mode}`.toUpperCase();
}

function seen(adif) {
  const k = dupKey(adif);
  const now = Date.now();
  for (const [key, ts] of recent) {
    if (now - ts > 15_000) recent.delete(key);
  }
  if (recent.has(k)) return true;
  recent.set(k, now);
  return false;
}

function apiUrl(path) {
  const base = CFG.url.endsWith("index.php") ? CFG.url : `${CFG.url}/index.php`;
  return `${base}/${path.replace(/^\//, "")}`;
}

async function postJson(path, body) {
  const url = apiUrl(path);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 180)}`);
  return text;
}

async function sendQso(adif) {
  if (!CFG.key) throw new Error("WAVELOG_API_KEY vazia");
  await postJson("api/qso", {
    key: CFG.key,
    station_profile_id: String(CFG.station),
    type: "adif",
    string: adif,
  });
}

function enqueue(adif) {
  try {
    appendFileSync(QUEUE, `${JSON.stringify({ ts: Date.now(), adif })}\n`);
  } catch (err) {
    log(`fila: ${err.message}`);
  }
}

async function flushQueue() {
  if (!existsSync(QUEUE) || !CFG.key) return;
  const lines = readFileSync(QUEUE, "utf8").split(/\n/).filter(Boolean);
  if (!lines.length) return;
  const keep = [];
  for (const line of lines) {
    try {
      const { adif } = JSON.parse(line);
      await sendQso(adif);
      log("fila → Wavelog OK");
    } catch {
      keep.push(line);
    }
  }
  writeFileSync(QUEUE, keep.length ? `${keep.join("\n")}\n` : "");
}

async function handlePayload(buf) {
  let adif = "";
  const bin = parseWsjtx(buf);
  if (bin?.adif) adif = bin.adif;
  else {
    const text = buf.toString("utf8").replace(/^\uFEFF/, "").trim();
    if (looksAdif(text)) adif = text.includes("<eor>") ? text : `${text}<eor>`;
  }
  if (!adif) return;
  if (seen(adif)) {
    log("QSO duplicado ignorado");
    return;
  }
  try {
    await sendQso(adif);
    log("QSO → Wavelog");
  } catch (err) {
    log(`Wavelog falhou (${err.message}) — na fila`);
    enqueue(adif);
  }
}

function hamlib(cmd) {
  return new Promise((resolve, reject) => {
    const s = new Socket();
    let out = "";
    const t = setTimeout(() => {
      s.destroy();
      reject(new Error("hamlib timeout"));
    }, 2500);
    s.connect(CFG.hamlibPort, CFG.hamlibHost, () => s.write(`${cmd}\n`));
    s.on("data", (d) => {
      out += d.toString("utf8");
      if (out.includes("\n")) {
        clearTimeout(t);
        s.end();
        resolve(out.trim().split(/\n/)[0].replace(/^RPRT.*$/, "").trim());
      }
    });
    s.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

async function publishCat() {
  if (!CFG.publishCat || !CFG.key) return;
  try {
    const freq = Number((await hamlib("f")).replace(/[^\d.]/g, ""));
    const modeLine = await hamlib("m");
    const mode = modeLine.split(/\s+/)[0] || "";
    if (!freq) return;
    await postJson("api/radio", {
      key: CFG.key,
      radio: CFG.radio,
      frequency: freq,
      mode,
    });
  } catch {
    /* hamlib/wavelog ainda não prontos */
  }
}

function qsy(freqHz, mode) {
  const f = String(Math.round(Number(freqHz)));
  const m = String(mode || "USB").toUpperCase();
  return hamlib(`F ${f}`).then(() => hamlib(`M ${m} 0`));
}

mkdirSync(HERE, { recursive: true });

const udp = createSocket("udp4");
udp.on("message", (msg) => {
  void handlePayload(msg);
});
udp.on("error", (err) => log(`udp: ${err.message}`));
udp.bind(CFG.udpPort, "0.0.0.0", () => log(`UDP :${CFG.udpPort} → ${CFG.url}`));

const http = createServer((req, res) => {
  const url = req.url?.split("?")[0] || "/";
  if (url === "/" || url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, udp: CFG.udpPort, qsy: CFG.qsyPort, wavelog: CFG.url }));
    return;
  }
  const m = url.match(/^\/(\d{4,12})\/([A-Za-z0-9+-]+)$/);
  if (m) {
    void qsy(m[1], m[2])
      .then(() => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      })
      .catch((err) => {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end(String(err.message));
      });
    return;
  }
  res.writeHead(404);
  res.end();
});
http.listen(CFG.qsyPort, "0.0.0.0", () => log(`QSY http://0.0.0.0:${CFG.qsyPort}/{freq}/{mode}`));

setInterval(() => void flushQueue(), 20_000);
setTimeout(() => void flushQueue(), 4000);
if (CFG.publishCat) setInterval(() => void publishCat(), 4000);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    udp.close();
    http.close();
    process.exit(0);
  });
}
