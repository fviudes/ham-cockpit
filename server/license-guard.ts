/**
 * license-guard em MODO OBSERVAÇÃO (padrão).
 * Avalia a licença, grava /run/ham-cockpit/license.json e sai 0.
 * Nunca para serviços nesta entrega (bloqueio OFF).
 *
 * Uso futuro no Pi (documentado; units ainda não instaladas pelo OTA):
 *   node /opt/ham-cockpit/license-guard.js
 *   ou: pnpm exec tsx server/license-guard.ts
 */
import { runLicenseGuardOnce } from "./license";

async function main() {
  const body = await runLicenseGuardOnce();
  const line = JSON.stringify({
    ok: true,
    mode: "observe",
    state: body.state,
    locked: body.locked,
    observationOnly: body.observationOnly,
    serial: body.serial,
  });
  console.log(line);
  // Observação: nunca exit != 0 por falta de licença.
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, mode: "observe", error: String(err) }));
  // Falha do guard também não bloqueia a estação nesta fase.
  process.exit(0);
});
