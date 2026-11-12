#!/usr/bin/env node
/**
 * Gera um par Ed25519 para as licenças do Ham Cockpit.
 *
 *   node scripts/license-keygen.mjs --out <pasta-fora-do-git> [--label k1]
 *
 * - A chave PRIVADA (PKCS8, base64) é gravada em <pasta>/license-<label>.pkcs8.b64 e NUNCA
 *   é impressa nem vai para o repositório. Ela vira o secret `LICENSE_SIGNING_KEY_<LABEL>` do Pages.
 * - A chave PÚBLICA (32 bytes, base64url) e o `kid` são impressos para colar em shared/license-keys.ts.
 *
 * Sem --out o script recusa gravar a privada (evita vazar por log).
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function arg(name, def = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || "").trim() : def;
}

const out = arg("--out");
const label = (arg("--label", "k1") || "k1").toLowerCase().replace(/[^a-z0-9]/g, "");
if (!out) {
  console.error("Uso: node scripts/license-keygen.mjs --out <pasta fora do repositório> [--label k1]");
  process.exit(2);
}
const dir = resolve(out);
if (/site-esp32-civ/i.test(dir) && !process.argv.includes("--i-know-this-is-inside-the-repo")) {
  console.error("A pasta de saída parece estar dentro do repositório. Use um caminho fora do git.");
  process.exit(2);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const jwk = publicKey.export({ format: "jwk" });
const pub = jwk.x; // 32 bytes, base64url
const kid = pub.slice(0, 8);

mkdirSync(dir, { recursive: true });
const file = join(dir, `license-${label}.pkcs8.b64`);
writeFileSync(file, pkcs8 + "\n", { mode: 0o600 });

console.log(JSON.stringify({ label, kid, pub, privateKeyFile: file, secretName: `LICENSE_SIGNING_KEY_${label.toUpperCase()}` }, null, 2));
