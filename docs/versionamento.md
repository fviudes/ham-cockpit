# Versionamento — Ham Cockpit

Esquema em duas camadas: **imagem** (cartão/SSD) e **OTA** (Admin → Atualização).

## Formato

| Canal | Formato | Exemplo | Artefato |
| --- | --- | --- | --- |
| Imagem (bake `.img`) | `major.minor.patch` (3 partes) | `0.1.05` | `ham-cockpit-0.1.05-raspi.img.xz` |
| OTA-only | `major.minor.patch.NN` (4 partes) | `0.1.04.01` | `ham-cockpit-0.1.04.01.tgz` |

- `patch` e `NN` usam **dois dígitos** (`04`, `01` … `99`).
- O arquivo `VERSION` na raiz guarda a string **completa** (3 ou 4 partes).
- `shared/brand.ts` → `APP_VERSION` acompanha `VERSION`.
- `APP_IMAGE_VERSION` é só a base de 3 partes (nome da `.img` / release de imagem).

## Regras

1. **Bake de imagem nova** — avance a base (`0.1.04` → `0.1.05`) e **zere** o sufixo OTA (sem `.NN`, ou trate como `.00`). O nome do `.img.xz` usa só as 3 partes.
2. **Release só OTA** — mantenha a base da imagem em campo e acrescente `.01`, `.02`, … `.99` a cada publicação no canal `update/`.
3. Comparação (Admin → Atualizações):  
   `0.1.04` ≡ `0.1.04.00` < `0.1.04.01` < `0.1.04.02` < `0.1.05`.

Helper: [`shared/version.ts`](../shared/version.ts) (`parseVersion`, `compareVersion`, `isNewerVersion`, `bumpOta`, `bumpImage`, `imageBase`).

## Fluxo prático

### OTA-only

```bash
# Ex.: base 0.1.04 já publicada → próximo OTA
# VERSION=0.1.04.01  (e APP_VERSION / package.json / versions.json)
pnpm check
node scripts/pack-update.mjs --notes "Ham Cockpit v0.1.04.01 — …"
git add VERSION shared/brand.ts package.json deploy/station/versions.json update/ client/src/console/i18n.ts …
git commit -m "…"
git push ham-cockpit main
```

Estações com imagem `0.1.04` (ou OTA anterior na mesma base) veem `0.1.04.01` como atualização.

### Nova imagem

```bash
# VERSION=0.1.05  (sem .NN)
# bake → ham-cockpit-0.1.05-raspi.img.xz na Release v0.1.05
# opcional: publique também um OTA 0.1.05 no canal update/ alinhado à imagem
```

Se `VERSION` tiver sufixo OTA no momento do bake, o script de imagem usa só `imageBase()` no nome do `.img` — o fluxo recomendado é bump de imagem **antes** do bake.

## O que cada canal leva

| | Imagem bake | Pacote OTA (`update/*.tgz`) |
| --- | --- | --- |
| Console Node + UI | sim | sim |
| Helpers / units | sim | sim |
| Ubuntu + apt stack | sim | não |
| Binários MMDVM nativos | sim (bake ARM64) | sim, se `mmdvm-arm64.tgz` estiver no pacote / `update/` |

Detalhes do canal OTA: [`update/README.md`](../update/README.md). Bake: [`docs/imagem-os.md`](imagem-os.md).
