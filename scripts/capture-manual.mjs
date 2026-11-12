#!/usr/bin/env node
/**
 * Captura as telas reais do console para o manual (portal e dispositivo).
 *
 *   node scripts/capture-manual.mjs                # build + demo-server + captura tudo
 *   node scripts/capture-manual.mjs --only status  # só as capturas cujo nome contém "status"
 *   node scripts/capture-manual.mjs --no-build     # reaproveita tmp/demo-public
 *   node scripts/capture-manual.mjs --list         # lista as capturas
 *
 * Usa o Edge/Chrome já instalado (headless, via DevTools Protocol com o pacote `ws`) — não
 * adiciona dependência. Dados 100% fictícios vindos de scripts/demo-server.mjs (HC_DEMO=1).
 * Saída: client/public/telas/*.webp (servido como /telas/... no portal e no aparelho).
 * Documentação: docs/capturas-manual.md
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "client", "public", "telas");
const DIST = path.join(ROOT, "tmp", "demo-public");
const PORT = Number(process.env.HC_DEMO_PORT || 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────── lista de capturas ─────────────────────────────
/**
 * Operações de preparo (prep):
 *   { warm: [rotas] }          visita rotas antes (hidrata o estado do console)
 *   { select: [n, valor] }     troca o n-ésimo <select> de <main>
 *   { fill: [placeholder, v] } preenche o campo com esse placeholder
 *   { click: "texto" }         clica no botão cujo texto/aria-label contém "texto"
 *   { scrollText: "texto" }    rola até o título com esse texto
 *   { term: true }             digita comandos de exemplo no terminal
 * @type {{name:string, route:string, w?:number, h?:number, mobile?:boolean, scene?:object, prep?:object[], full?:boolean, maxH?:number, wait?:number, auth?:boolean}[]}
 */
export const SHOTS = [
  { name: "console-login", route: "/console", auth: false, h: 700 },
  { name: "console-painel", route: "/console/radio", h: 1000, wait: 1800 },
  { name: "console-painel-tx", route: "/console/radio", h: 1000, prep: [{ click: "PTT OFF" }], wait: 1500 },
  { name: "console-menu-celular", route: "/console/radio", mobile: true, prep: [{ click: "menu" }], wait: 1200 },
  { name: "console-status", route: "/console/status", full: true, prep: [{ warm: ["/console/wavelog", "/console/mmdvm"] }], wait: 3000 },
  { name: "console-status-celular", route: "/console/status", mobile: true, full: true, maxH: 1700, prep: [{ warm: ["/console/wavelog", "/console/mmdvm"] }], wait: 3000 },
  { name: "console-servicos", route: "/console/services", full: true, prep: [{ warm: ["/console/wavelog", "/console/mmdvm"] }], wait: 2000 },
  { name: "console-atualizacoes", route: "/console/updates", full: true, scene: { update: "available" }, wait: 1500 },
  { name: "console-atualizacoes-progresso", route: "/console/updates", full: true, scene: { update: "running" }, wait: 2500 },
  { name: "console-admin", route: "/console/admin", full: true, wait: 1500 },
  { name: "console-backup", route: "/console/backup", full: true, wait: 1500 },
  { name: "console-terminal", route: "/console/term", h: 760, wait: 1800, prep: [{ term: true }] },
  { name: "console-logs", route: "/console/logs", full: true, wait: 1200 },
  { name: "console-rede-wifi", route: "/console/wifi", full: true, wait: 1500 },
  { name: "console-bluetooth", route: "/console/bluetooth", full: true, wait: 1500 },
  { name: "console-radio-ic705-lan", route: "/console/ic705", full: true, wait: 1800, prep: [{ select: [1, "network"] }, { fill: ["192.168.1.50", "192.168.1.60"] }, { fill: ["Network User", "hamcockpit"] }] },
  { name: "console-ser2net", route: "/console/ser2net", full: true, wait: 1500 },
  { name: "console-wavelog", route: "/console/wavelog", full: true, maxH: 3000, wait: 2200 },
  { name: "console-mmdvm", route: "/console/mmdvm", h: 1000, wait: 2500 },
  { name: "console-mmdvm-redes", route: "/console/mmdvm", h: 1000, wait: 2500, prep: [{ scrollText: "Redes DMR Gateway" }] },
  { name: "console-mmdvm-ouvidos", route: "/console/mmdvm", h: 1000, wait: 2500, prep: [{ scrollText: "Últimos ouvidos" }] },
  { name: "console-spe", route: "/console/spe", full: true, wait: 1500 },
  { name: "console-ldg", route: "/console/ldg", full: true, scene: { tx: true }, wait: 2000 },
  { name: "console-lp100a", route: "/console/lp100a", full: true, scene: { tx: true }, wait: 2000 },
  { name: "console-lextel", route: "/console/lextel", full: true, scene: { tx: true }, wait: 2000 },
  { name: "console-hamplus", route: "/console/hamplus", full: true, wait: 1500 },
  { name: "console-palstar", route: "/console/palstar", full: true, wait: 1500 },
  { name: "console-acom", route: "/console/acom", full: true, wait: 1500 },
  { name: "console-assistente", route: "/console/wizard", full: true, wait: 1500 },
];

if (args.includes("--list")) {
  for (const s of SHOTS) console.log(s.name, s.route);
  process.exit(0);
}

// ───────────────────────────── navegador (CDP) ─────────────────────────────
function findBrowser() {
  const c = [
    process.env.HC_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const hit = c.find((p) => fs.existsSync(p));
  if (!hit) throw new Error("Edge/Chrome não encontrado. Defina HC_BROWSER=/caminho/do/navegador.");
  return hit;
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(`${m.error.message}`));
        else resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval");
    return r.result.value;
  }
}

async function startBrowser() {
  const bin = findBrowser();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hc-capture-"));
  const dbgPort = 9300 + Math.floor(Math.random() * 400);
  const proc = spawn(
    bin,
    [
      `--remote-debugging-port=${dbgPort}`,
      `--user-data-dir=${dir}`,
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-color-profile=srgb",
      "--lang=pt-BR",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let ver;
  for (let i = 0; i < 60; i++) {
    try {
      ver = await (await fetch(`http://127.0.0.1:${dbgPort}/json/version`)).json();
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!ver) throw new Error("navegador não respondeu no DevTools");
  return { proc, dir, dbgPort };
}

async function newPage(b) {
  const t = await (await fetch(`http://127.0.0.1:${b.dbgPort}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((r, j) => {
    ws.on("open", r);
    ws.on("error", j);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return { cdp, id: t.id };
}

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/host`);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    await sleep(250);
  }
  throw new Error("demo-server não respondeu");
}

async function setScene(scene) {
  await fetch(`${BASE}/__demo/scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx: false, update: "available", ...scene }),
  });
}

// ─────────────────────────────── captura ────────────────────────────────
async function runPrep(cdp, op, route) {
  if (op.warm) {
    // Navegação interna (SPA): o console hidrata Wavelog/MMDVM/... só ao visitar a página.
    for (const r of [...op.warm, route]) {
      await cdp.eval(`(()=>{history.pushState({},'',${JSON.stringify(r)});dispatchEvent(new PopStateEvent('popstate'));return true})()`);
      await sleep(2200);
    }
    return;
  }
  if (op.select) {
    const [n, value] = op.select;
    await cdp.eval(`(()=>{const el=document.querySelectorAll('main select')[${n}];if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(el,${JSON.stringify(value)});
      el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  } else if (op.fill) {
    const [ph, value] = op.fill;
    await cdp.eval(`(()=>{const el=[...document.querySelectorAll('main input')].find(x=>x.placeholder===${JSON.stringify(ph)});if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,${JSON.stringify(value)});
      el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  } else if (op.click) {
    await cdp.eval(`(()=>{const k=${JSON.stringify(op.click.toLowerCase())};
      const el=[...document.querySelectorAll('button')].find(x=>((x.textContent||'')+' '+(x.getAttribute('aria-label')||'')).toLowerCase().includes(k));
      if(el)el.click();return !!el})()`);
  } else if (op.scrollText) {
    await cdp.eval(`(()=>{const k=${JSON.stringify(op.scrollText)};
      const el=[...document.querySelectorAll('h2,h3')].find(x=>(x.textContent||'').includes(k));
      if(el){window.scrollTo(0,el.getBoundingClientRect().top+scrollY-90)}return !!el})()`);
  } else if (op.term) {
    await cdp.eval(`(()=>{const el=document.querySelector('.xterm-helper-textarea');if(el)el.focus();return true})()`);
    for (const line of ["uptime", "systemctl status ser2net --no-pager", "docker ps"]) {
      for (const ch of line) await cdp.send("Input.dispatchKeyEvent", { type: "char", text: ch });
      await cdp.send("Input.dispatchKeyEvent", { type: "char", text: "\r" });
      await sleep(250);
    }
  }
  await sleep(700);
}

async function shoot(b, shot) {
  const { cdp, id } = await newPage(b);
  const mobile = Boolean(shot.mobile);
  const w = shot.w || (mobile ? 390 : 1440);
  const h = shot.h || (mobile ? 844 : 900);
  const dsf = mobile ? 2 : 1;
  // Celular: só largura/DPR (o layout do console é responsivo por largura).
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dsf, mobile: false });
  const auth = shot.auth !== false;
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem("hamcockpit.lang","pt");${
      auth ? `sessionStorage.setItem("hamcockpit.auth","1");sessionStorage.setItem("hamcockpit.user","admin");` : ""
    }sessionStorage.setItem("hamcockpit.updToast","1");}catch(e){}`,
  });
  await setScene(shot.scene || {});
  await cdp.send("Page.navigate", { url: BASE + shot.route });
  await sleep(1200);
  await cdp.eval(`document.fonts && document.fonts.ready.then(()=>true)`).catch(() => undefined);
  await sleep(shot.wait ?? 1500);

  for (const op of shot.prep || []) await runPrep(cdp, op, shot.route);

  // Esconde o toast e o cursor para a imagem ficar limpa.
  await cdp.eval(
    `(()=>{const s=document.createElement('style');s.textContent='[data-sonner-toaster]{display:none!important}*{caret-color:transparent!important}';document.head.appendChild(s);return true})()`,
  );

  let finalH = h;
  if (shot.full) {
    // A área rolável do console é a própria página (header sticky + conteúdo).
    const dim = await cdp.eval(`({h:Math.min(document.documentElement.scrollHeight,${shot.maxH || 2600})})`);
    finalH = Math.max(h, dim.h, mobile ? 0 : 1060);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: finalH,
      deviceScaleFactor: dsf,
      mobile: false,
    });
    await sleep(900);
  }
  const { data } = await cdp.send("Page.captureScreenshot", { format: "webp", quality: 82 });
  const buf = Buffer.from(data, "base64");
  const file = path.join(OUT, `${shot.name}.webp`);
  fs.writeFileSync(file, buf);
  cdp.ws.close();
  await fetch(`http://127.0.0.1:${b.dbgPort}/json/close/${id}`).catch(() => undefined);
  return { file, bytes: buf.length, size: [w * dsf, finalH * dsf] };
}

// Tamanhos (largura x altura em pixels) para o <img> não "pular" ao carregar.
const SIZES_FILE = path.join(ROOT, "client", "src", "console", "manual-screens.sizes.ts");
function readSizes() {
  try {
    const m = fs.readFileSync(SIZES_FILE, "utf8").match(/= (\{[\s\S]*?\});/);
    return m ? JSON.parse(m[1]) : {};
  } catch {
    return {};
  }
}
function writeSizes(sizes) {
  const ordered = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
  const body = JSON.stringify(ordered, null, 2);
  fs.writeFileSync(
    SIZES_FILE,
    `// Gerado por scripts/capture-manual.mjs — não edite à mão.\n/** [largura, altura] em pixels de cada captura em client/public/telas/<nome>.webp */\nexport const SCREEN_SIZES: Record<string, [number, number]> = ${body};\n`,
  );
}

// ───────────────────────────────── main ─────────────────────────────────
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!args.includes("--no-build")) {
    console.log("[capture] build do console → tmp/demo-public …");
    const r = spawnSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "vite", "build", "--config", "vite.config.prod.ts", "--outDir", DIST],
      { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
    );
    if (r.status !== 0) throw new Error("build falhou");
  }
  const demo = spawn(process.execPath, [path.join(ROOT, "scripts", "demo-server.mjs")], {
    cwd: ROOT,
    env: { ...process.env, HC_DEMO: "1", HC_DEMO_DIST: DIST, HC_DEMO_PORT: String(PORT) },
    stdio: "inherit",
  });
  let b;
  try {
    await waitServer();
    b = await startBrowser();
    let total = 0;
    const sizes = readSizes();
    for (const shot of SHOTS) {
      if (only && !shot.name.includes(only)) continue;
      let r;
      for (let tentativa = 1; ; tentativa++) {
        try {
          r = await shoot(b, shot);
          break;
        } catch (e) {
          if (tentativa >= 3) throw e;
          console.warn(`[capture] ${shot.name}: ${e.message} — nova tentativa`);
          await sleep(1500);
        }
      }
      total += r.bytes;
      sizes[shot.name] = r.size;
      console.log(`[capture] ${shot.name.padEnd(34)} ${(r.bytes / 1024).toFixed(0).padStart(5)} KB`);
    }
    writeSizes(sizes);
    console.log(`[capture] total ${(total / 1024 / 1024).toFixed(2)} MB em ${path.relative(ROOT, OUT)}`);
  } finally {
    await setScene({}).catch(() => undefined);
    demo.kill();
    if (b) {
      b.proc.kill();
      await sleep(500);
      fs.rmSync(b.dir, { recursive: true, force: true });
    }
  }
}

main().catch((e) => {
  console.error("[capture] erro:", e.message);
  process.exit(1);
});
