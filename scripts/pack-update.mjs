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
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
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
];

const BIN_EXTRA = [
  [join(ROOT, "deploy", "lextel", "lextel-bt"), "lextel-bt"],
  [join(ROOT, "deploy", "mmdvm", "mmdvm-ctl"), "mmdvm-ctl"],
];

const SYSTEMD_UNITS = [
  "ham-cockpit.service",
  "ham-cockpit-ap.service",
  "ham-cockpit.target",
  "ham-cockpit-vfo.service",
  "ham-cockpit-vfo-idle.service",
  "first-boot.service",
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

  for (const name of SYSTEMD_UNITS) {
    const src = join(STATION, name);
    if (!existsSync(src)) continue;
    cpSync(src, join(stage, "systemd", name));
  }

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

  const meta = {
    version,
    channel: "main",
    file: tgzName,
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

  const size = readFileSync(tgzPath).byteLength;
  console.log(`OK ${tgzName} (${(size / 1024).toFixed(1)} KiB)`);
  console.log(`version.json → ${version} / file=${tgzName}`);
}

main();
