# Patch do license-guard (modo observação)

Nesta entrega o bloqueio está **OFF**. O Node já expõe `/api/license*` e a aba Licença;
o `server/license-guard.ts` só avalia e grava o veredito.

## O que ainda não vai no OTA/install automaticamente

Para não misturar com a estabilização do Pi, as units systemd **não** foram ligadas em
`install-station.sh` / `ota-hooks.sh` / `pack-update.mjs`. Quando for seguro:

1. Compilar ou copiar `license-guard.js` (entrada `server/license-guard.ts`) para `/opt/ham-cockpit/`.
2. Criar `license-guard.service` + `license-guard.timer` (boot + a cada 5 min) chamando
   `node /opt/ham-cockpit/license-guard.js`.
3. Em modo observação o processo **sempre** sai 0 e **não** para serviços.

Até lá, o veredito é atualizado a cada chamada de `/api/license` pelo console.
