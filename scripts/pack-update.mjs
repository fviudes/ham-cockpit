#!/usr/bin/env node
/**
 * Empacota o console + helpers da estação para o canal OTA (update/).
 *
 * Uso:
 *   node scripts/pack-update.mjs
 *   node scripts/pack-update.mjs --skip-build
 *   node scripts/pack-update.mjs --notes "…"
 *
 * Versão vem de VERSION (3 partes = alinhado à imagem; 4 partes = OTA-only).
 * Ex.: 0.1.05 → ham-cockpit-0.1.05.tgz | 0.1.04.01 → ham-cockpit-0.1.04.01.tgz
 * Ver docs/versionamento.md.
 *
 * Gera update/ham-cockpit-<versão>.tgz e atualiza update/version.json.
 * Não inclui configs da estação (rádios, Wi‑Fi, bindings, layouts…).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATION = join(ROOT, "deploy", "station");
const UPDATE_DIR = join(ROOT, "update");

const BIN_FROM_STATION = [
  "ham-cockpit-ap.sh",
  "first-boot.sh",
  "root-login",
  "station-user",
  "ser2net-ctl",
  "station-net",
  "station-svc",
  "station-upd",
  "station-backup",
  "vfo-display-ctl",
  "vfo-display-kiosk",
  "vfo-display-idle",
  "ldg-serial",
  "hc-tune.sh",
];

const BIN_EXTRA = [
  [join(ROOT, "deploy", "lextel", "lextel-bt"), "lextel-bt"],
  [join(ROOT, "deploy", "mmdvm", "mmdvm-ctl"), "mmdvm-ctl"],
  [join(ROOT, "deploy", "mmdvm", "build-binaries.sh"), "mmdvm-build-binaries.sh"],
  [join(ROOT, "deploy", "hamlib", "ampctld-spe"), "ampctld-spe"],
  [join(ROOT, "deploy", "hamlib", "rigctld-ic705"), "rigctld-ic705"],
  [join(ROOT, "deploy", "hamlib", "build-hamlib.sh"), "build-hamlib.sh"],
  [join(ROOT, "deploy", "wavelog", "wavelog-ctl.sh"), "wavelog-ctl.sh"],
];

const SYSTEMD_UNITS = [
  "ham-cockpit.service",
  "ham-cockpit-ap.service",
  "ham-cockpit.target",
  "ham-cockpit-vfo.service",
  "ham-cockpit-vfo-idle.service",
  "first-boot.service",
];

/** Units fora de deploy/station (caminho relativo ao ROOT). */
const SYSTEMD_EXTRA = [
  ["deploy/wavelog/wavelog.service", "wavelog.service"],
  ["deploy/wavelog-gate/waveloggate.service", "waveloggate.service"],
  ["deploy/ser2net/ser2net.service", "ser2net.service"],
  ["deploy/hamlib/rigctld@ic705.service", "rigctld@ic705.service"],
  ["deploy/hamlib/rigctld@cat2.service", "rigctld@cat2.service"],
  ["deploy/hamlib/ampctld@spe.service", "ampctld@spe.service"],
  ["deploy/mmdvm/mmdvmhost.service", "mmdvmhost.service"],
  ["deploy/mmdvm/dmrgateway.service", "dmrgateway.service"],
  ["deploy/mmdvm/ysfgateway.service", "ysfgateway.service"],
  ["deploy/mmdvm/ircddbgateway.service", "ircddbgateway.service"],
  ["deploy/mmdvm/nextiondriver.service", "nextiondriver.service"],
  ["deploy/mmdvm/ham-cockpit-mmdvm-build.service", "ham-cockpit-mmdvm-build.service"],
];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return "";
  return String(process.argv[i + 1] || "").trim();
}

/** Aceita x.y.zz ou x.y.zz.NN (NN = 00–99). */
const VERSION_RE = /^\d+\.\d+\.\d+(?:\.\d{1,2})?$/;

function readVersion() {
  const fromFile = readFileSync(join(ROOT, "VERSION"), "utf8").trim().replace(/^v/i, "");
  if (fromFile) return fromFile;
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return String(pkg.version || "").replace(/^v/i, "");
}

const BINARY_EXT = /\.(tgz|gz|xz|zip|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|bin|dat|node|so)$/i;

/** Converte CRLF→LF em todo arquivo de texto do stage. Retorna quantos foram alterados. */
function normalizeEolTree(dir) {
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      n += normalizeEolTree(p);
      continue;
    }
    if (!ent.isFile() || BINARY_EXT.test(ent.name)) continue;
    const buf = readFileSync(p);
    if (buf.includes(0)) continue;
    if (!buf.includes(13)) continue;
    const out = Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
    writeFileSync(p, out);
    n += 1;
  }
  return n;
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
}

function main() {
  const skipBuild = process.argv.includes("--skip-build");
  const notesArg = argValue("--notes");
  const version = readVersion();
  if (!VERSION_RE.test(version)) {
    console.error("VERSION inválida (use x.y.zz ou x.y.zz.NN):", version);
    process.exit(1);
  }
  const parts = version.split(".");
  const kind = parts.length === 4 ? "OTA-only (4 partes)" : "base de imagem / OTA alinhado (3 partes)";
  console.log(`versão ${version} — ${kind}`);

  if (!skipBuild) {
    console.log("compilando console (pnpm build)…");
    run("pnpm", ["build"]);
  }

  const distIndex = join(ROOT, "dist", "index.js");
  const distPublic = join(ROOT, "dist", "public");
  if (!existsSync(distIndex) || !existsSync(join(distPublic, "index.html"))) {
    console.error("dist/ incompleto — rode pnpm build antes");
    process.exit(1);
  }

  const stageRoot = join(ROOT, "tmp", "ota-stage");
  const pkgName = `ham-cockpit-${version}`;
  const stage = join(stageRoot, pkgName);
  rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(join(stage, "bin"), { recursive: true });
  mkdirSync(join(stage, "systemd"), { recursive: true });

  cpSync(distIndex, join(stage, "index.js"));
  cpSync(distPublic, join(stage, "public"), { recursive: true });
  cpSync(join(STATION, "runtime-package.json"), join(stage, "package.json"));
  cpSync(join(STATION, "ota-hooks.sh"), join(stage, "ota-hooks.sh"));
  cpSync(join(STATION, "sudoers-hamcockpit"), join(stage, "sudoers-hamcockpit"));
  cpSync(join(ROOT, "VERSION"), join(stage, "VERSION"));
  cpSync(join(STATION, "versions.json"), join(stage, "versions.json"));

  for (const name of BIN_FROM_STATION) {
    const src = join(STATION, name);
    if (!existsSync(src)) {
      console.error("helper ausente:", src);
      process.exit(1);
    }
    cpSync(src, join(stage, "bin", name));
  }
  for (const [src, name] of BIN_EXTRA) {
    if (!existsSync(src)) {
      console.error("helper ausente:", src);
      process.exit(1);
    }
    cpSync(src, join(stage, "bin", name));
  }
  const patchSrc = join(ROOT, "deploy", "mmdvm", "patches");
  if (existsSync(patchSrc)) {
    mkdirSync(join(stage, "bin", "patches"), { recursive: true });
    cpSync(patchSrc, join(stage, "bin", "patches"), { recursive: true });
  }

  for (const name of SYSTEMD_UNITS) {
    const src = join(STATION, name);
    if (!existsSync(src)) continue;
    cpSync(src, join(stage, "systemd", name));
  }
  for (const [rel, name] of SYSTEMD_EXTRA) {
    const src = join(ROOT, rel);
    if (!existsSync(src)) {
      console.error("unit ausente:", src);
      process.exit(1);
    }
    cpSync(src, join(stage, "systemd", name));
  }

  const wavelogCompose = join(ROOT, "deploy", "wavelog", "docker-compose.yml");
  if (existsSync(wavelogCompose)) {
    mkdirSync(join(stage, "wavelog"), { recursive: true });
    cpSync(wavelogCompose, join(stage, "wavelog", "docker-compose.yml"));
  }
  // WaveLogGate é obrigatório no tgz — o apply/hooks esperam em /opt/wavelog-gate.
  const wlgDir = join(ROOT, "deploy", "wavelog-gate");
  const wlgMjs = join(wlgDir, "wavelog-gate.mjs");
  const wlgVer = join(wlgDir, "VERSION");
  if (!existsSync(wlgMjs) || !existsSync(wlgVer)) {
    console.error("deploy/wavelog-gate/{wavelog-gate.mjs,VERSION} obrigatório no pacote OTA");
    process.exit(1);
  }
  mkdirSync(join(stage, "wavelog-gate"), { recursive: true });
  cpSync(wlgMjs, join(stage, "wavelog-gate", "wavelog-gate.mjs"));
  cpSync(wlgVer, join(stage, "wavelog-gate", "VERSION"));

  const ser2netYaml = join(ROOT, "deploy", "ser2net", "ser2net.yaml");
  const ser2netJson = join(ROOT, "deploy", "ser2net", "services.json");
  if (!existsSync(ser2netYaml) || !existsSync(ser2netJson)) {
    console.error("deploy/ser2net/{ser2net.yaml,services.json} obrigatório no pacote OTA");
    process.exit(1);
  }
  mkdirSync(join(stage, "ser2net"), { recursive: true });
  cpSync(ser2netYaml, join(stage, "ser2net", "ser2net.yaml"));
  cpSync(ser2netJson, join(stage, "ser2net", "services.json"));

  // Bridges (~21 MiB) ficam em update/*.tgz no canal — NÃO embutir no pacote a cada OTA.
  // Hooks baixam só se binários faltarem. Use --with-bridges para pacote de reparo.
  const withBridges = process.argv.includes("--with-bridges");
  const mmdvmTgz = join(UPDATE_DIR, "mmdvm-arm64.tgz");
  const hamlibTgz = join(UPDATE_DIR, "hamlib-arm64.tgz");
  if (withBridges) {
    if (existsSync(mmdvmTgz)) {
      cpSync(mmdvmTgz, join(stage, "mmdvm-arm64.tgz"));
      console.log("incluindo mmdvm-arm64.tgz (--with-bridges)");
    } else {
      console.warn("AVISO: --with-bridges mas update/mmdvm-arm64.tgz ausente");
    }
    if (existsSync(hamlibTgz)) {
      cpSync(hamlibTgz, join(stage, "hamlib-arm64.tgz"));
      console.log("incluindo hamlib-arm64.tgz (--with-bridges)");
    } else {
      console.warn("AVISO: --with-bridges mas update/hamlib-arm64.tgz ausente");
    }
  } else {
    console.log(
      "bridges fora do pacote OTA (mmdvm/hamlib ficam em update/ no GitHub; hooks baixam sob demanda)",
    );
    if (!existsSync(mmdvmTgz)) {
      console.warn(
        "AVISO: update/mmdvm-arm64.tgz ausente no canal — estações sem bins não terão fallback OTA",
      );
    }
    if (!existsSync(hamlibTgz)) {
      console.warn(
        "AVISO: update/hamlib-arm64.tgz ausente no canal — ampctld@spe em estações só apt 4.5.5 sem fallback",
      );
    }
  }

  // No Windows o working tree pode ter CRLF; no Pi isso quebra shebang/units (`$'\r': command not found`).
  const fixed = normalizeEolTree(stage);
  if (fixed) console.log(`CRLF→LF em ${fixed} arquivo(s) do pacote`);

  mkdirSync(UPDATE_DIR, { recursive: true });
  const tgzName = `${pkgName}.tgz`;
  const tgzPath = join(UPDATE_DIR, tgzName);
  rmSync(tgzPath, { force: true });

  // bsdtar/Windows tar: -C stageRoot -czf update/….tgz ham-cockpit-x.y.z
  execFileSync(
    "tar",
    ["-C", stageRoot, "-czf", tgzPath, pkgName],
    { cwd: ROOT, stdio: "inherit" },
  );

  const prevNotes = (() => {
    try {
      const j = JSON.parse(readFileSync(join(UPDATE_DIR, "version.json"), "utf8"));
      return String(j.notes || "").trim();
    } catch {
      return "";
    }
  })();

  const notes =
    notesArg ||
    prevNotes ||
    `Ham Cockpit v${version}`;

  const size = readFileSync(tgzPath).byteLength;
  const sha256 = createHash("sha256").update(readFileSync(tgzPath)).digest("hex");

  const meta = {
    version,
    channel: "main",
    file: tgzName,
    sha256,
    bytes: size,
    notes,
  };
  writeFileSync(join(UPDATE_DIR, "version.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  const readme = `# Canal de atualização — Ham Cockpit

Pasta **pública** lida pelo card **Ham Cockpit** em Admin → Atualização.

Versão atual neste canal: **${version}** (\`version.json\`).

## Versionamento

- **Imagem (bake):** base \`x.y.zz\` → \`ham-cockpit-x.y.zz-raspi.img.xz\` (sem sufixo OTA).
- **OTA-only:** mesma base + \`.01\` … \`.99\` → \`ham-cockpit-x.y.zz.NN.tgz\`.
- Comparação: \`0.1.04\` < \`0.1.04.01\` < \`0.1.04.02\` < \`0.1.05\`.

Guia completo: [docs/versionamento.md](../docs/versionamento.md).

## Como o console usa esta pasta

1. Lê \`version.json\` na branch \`main\`.
2. Compara com \`/opt/ham-cockpit/VERSION\` (ou o \`VERSION\` da árvore instalada).
3. Se o número daqui for maior, o botão Atualizar aplica o pacote.

\`\`\`json
${JSON.stringify(meta, null, 2)}
\`\`\`

- \`"file"\` preenchido: baixa \`update/<file>\` desta pasta.
- \`"file"\` vazio: inválido para apply — publique o \`.tgz\` com \`node scripts/pack-update.mjs\`.
- Notas de release: passe \`--notes "…"\` no pack (convenção: \`Ham Cockpit vX.Y.ZZ[.NN] — …\`).

O pacote traz o console compilado (\`index.js\` + \`public/\`), \`package.json\` de runtime, helpers em \`bin/\` e units em \`systemd/\`. **Não** inclui configs da estação (rádios, Wi‑Fi, bindings, layouts, ser2net…).

Instalação e operação: [README na raiz](../README.md). Imagem do cartão: [\`instaladores/\`](../instaladores/).
`;
  writeFileSync(join(UPDATE_DIR, "README.md"), readme, "utf8");

  rmSync(stageRoot, { recursive: true, force: true });

  console.log(`OK ${tgzName} (${(size / 1024 / 1024).toFixed(2)} MiB, sha256=${sha256.slice(0, 12)}…)`);
  console.log(`version.json → ${version} / file=${tgzName}`);
}

main();
