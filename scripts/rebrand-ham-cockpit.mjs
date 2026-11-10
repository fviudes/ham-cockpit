import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SKIP_DIR = new Set([
  "node_modules",
  "dist",
  ".git",
  ".pnpm-store",
  ".manus-logs",
  "data",
  "scripts",
]);
const SKIP_FILE = new Set(["rebrand-ham-cockpit.mjs"]);
const EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".sh",
  ".service",
  ".conf",
  ".txt",
  ".ps1",
  ".yml",
  ".yaml",
  ".md",
  ".html",
  ".list",
  ".ino",
  ".css",
  ".target",
]);

const pairs = [
  ["CAT-Bridge-Web01", "Ham-Cockpit-Web01"],
  ["CAT-Bridge-XXXX", "Ham-Cockpit-XXXX"],
  ["CAT-Bridge-A4F2", "Ham-Cockpit-A4F2"],
  ["CAT-Bridge-Installer", "Ham-Cockpit-Installer"],
  ["CAT-Bridge-OS", "Ham-Cockpit-OS"],
  ["CAT-Bridge OS", "Ham Cockpit OS"],
  ["CAT-Bridge-AP", "Ham-Cockpit-AP"],
  ["CAT-Bridge*.img", "Ham-Cockpit*.img"],
  ["CAT-Bridge/2.0", "Ham-Cockpit/2.0"],
  ["CAT-Bridge", "Ham Cockpit"],
  ["/opt/cat-bridge", "/opt/ham-cockpit"],
  ["/var/lib/catbridge", "/var/lib/hamcockpit"],
  ["catbridge-seed", "ham-cockpit-seed"],
  ["stage-catbridge", "stage-ham-cockpit"],
  ["catbridge.target", "ham-cockpit.target"],
  ["cat-bridge-vfo-idle", "ham-cockpit-vfo-idle"],
  ["cat-bridge-vfo", "ham-cockpit-vfo"],
  ["cat-bridge-ap", "ham-cockpit-ap"],
  ["nginx-cat-bridge", "nginx-ham-cockpit"],
  ["sshd-cat-bridge", "sshd-ham-cockpit"],
  ["sudoers-catbridge", "sudoers-hamcockpit"],
  ["cat-bridge.service", "ham-cockpit.service"],
  ["cat-bridge.local", "ham-cockpit.local"],
  ["CATBRIDGE_CHROOT", "HAMCOCKPIT_CHROOT"],
  ["CATBRIDGE_AP_PSK", "HAMCOCKPIT_AP_PSK"],
  ["catbridge.auth", "hamcockpit.auth"],
  ["catbridge.user", "hamcockpit.user"],
  ["catbridge.panelLayout", "hamcockpit.panelLayout"],
  ["catbridge-", "hamcockpit-"],
  ["id catbridge", "id hamcockpit"],
  ["User=catbridge", "User=hamcockpit"],
  ["Group=catbridge", "Group=hamcockpit"],
  ["passwd catbridge", "passwd hamcockpit"],
  ["chown catbridge", "chown hamcockpit"],
  ["chown -R catbridge", "chown -R hamcockpit"],
  ["-o catbridge -g catbridge", "-o hamcockpit -g hamcockpit"],
  ["-o catbridge -g catbridge", "-o hamcockpit -g hamcockpit"],
  ["catbridge:catbridge", "hamcockpit:hamcockpit"],
  ["usermod -aG sudo,docker,dialout,plugdev,bluetooth,video,input,tty catbridge", "usermod -aG sudo,docker,dialout,plugdev,bluetooth,video,input,tty hamcockpit"],
  ["usermod -aG render catbridge", "usermod -aG render hamcockpit"],
  ["usermod -aG docker catbridge", "usermod -aG docker hamcockpit"],
  ["useradd -m -s /bin/bash -G sudo,dialout,docker,plugdev,bluetooth catbridge", "useradd -m -s /bin/bash -G sudo,dialout,docker,plugdev,bluetooth hamcockpit"],
  ["echo 'catbridge:1234'", "echo 'hamcockpit:1234'"],
  ["linger catbridge", "linger hamcockpit"],
  ["Defaults:catbridge", "Defaults:hamcockpit"],
  ["catbridge ALL=", "hamcockpit ALL="],
  ["name: \"cat-bridge\"", "name: \"ham-cockpit\""],
  ["\"cat-bridge\"", "\"ham-cockpit\""],
  ["'cat-bridge'", "'ham-cockpit'"],
  ["hostname cat-bridge", "hostname ham-cockpit"],
  ["set-hostname cat-bridge", "set-hostname ham-cockpit"],
  ["|| \"cat-bridge\"", "|| \"ham-cockpit\""],
  ["cat-bridge", "ham-cockpit"],
  ["senha catbridge", "senha hamcockpit"],
  ["password catbridge", "password hamcockpit"],
  ["senha: catbridge", "senha: hamcockpit"],
  ["PSK:-catbridge", "PSK:-hamcockpit"],
  ["apPass: \"catbridge\"", "apPass: \"hamcockpit\""],
  ["name: \"catbridge\"", "name: \"hamcockpit\""],
  ["\"catbridge\"", "\"hamcockpit\""],
  ["'catbridge'", "'hamcockpit'"],
  [" / catbridge", " / hamcockpit"],
  ["(catbridge /", "(hamcockpit /"],
  ["SSH: catbridge", "SSH: hamcockpit"],
  ["catbridge / 1234", "hamcockpit / 1234"],
  ["serviço catbridge", "serviço hamcockpit"],
  ["the catbridge service", "the hamcockpit service"],
  ["catbridge", "hamcockpit"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(extname(name)) || name.endsWith(".target") || !extname(name)) {
      if (!SKIP_FILE.has(name)) out.push(p);
    }
  }
  return out;
}

let n = 0;
for (const file of walk(ROOT)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!text.includes("CAT-Bridge") && !text.includes("cat-bridge") && !text.includes("catbridge") && !text.includes("CATBRIDGE")) {
    continue;
  }
  let next = text;
  for (const [a, b] of pairs) next = next.split(a).join(b);
  if (next !== text) {
    writeFileSync(file, next);
    n++;
    console.log(file.slice(ROOT.length + 1));
  }
}
console.log(`updated ${n} files`);
