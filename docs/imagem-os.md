# Imagem Ham Cockpit OS

A distribuição gravável é um disco Ubuntu Server 24.04 LTS ARM64 (`+raspi`) para Raspberry Pi **3, 4 e 5**. Grave com o Raspberry Pi Imager no microSD ou SSD USB.

## Por que o bake em QEMU no x64 foi abandonado

Gerar a imagem num runner `ubuntu-latest` (x86) com `qemu-user-static` emula cada `apt-get` do ARM. Isso:

- leva 1–2 horas
- trava no esbuild/pnpm
- estoura o disco do runner quando ainda se pré-carregam tarballs Docker

Neste PC Windows não há WSL nem Docker, então o bake local também não roda.

## Caminho atual

GitHub Actions em **`ubuntu-24.04-arm`** (runner ARM nativo, disponível em repositório privado):

1. Compila o console (Vite + esbuild nativos)
2. Baixa `ubuntu-24.04.4-preinstalled-server-arm64+raspi.img.xz`
3. Faz chroot **sem QEMU** e instala Docker, ser2net, Hamlib, nginx, Node, o console
4. Compila nativo (ARM64) e instala em `/usr/local/bin`: `MMDVMHost`, `DMRGateway`, `YSFGateway`, `ircddbgatewayd` (g4klx) e `NextionDriver` (on7lds) via `deploy/mmdvm/build-binaries.sh`
5. Publica `ham-cockpit-<base>-raspi.img.xz` na Release (só 3 partes `x.y.zz`; ver [versionamento.md](versionamento.md))

Wavelog/MariaDB fazem `docker compose pull` no primeiro boot com Ethernet (não vão em tarball, para caber no disco de 14 GB do runner e acelerar o bake).

Tempo típico: **35–60 min** no runner ARM (inclui a compilação MMDVM). O `vite build` de produção usa `vite.config.prod.ts` para o Node sair depois de gerar o `dist` (o config de desenvolvimento importa o Lextel e ficava preso no CI).

### MMDVM / Nextion no bake

- Fontes (compatíveis com WPSD / logs em arquivo + Nextion — **não** o master MQTT do g4klx):
  - `M17-Project/MMDVMHost` ramo `v1.0` → `/usr/local/bin/MMDVMHost`
  - `g4klx/DMRGateway` tag `v1.0` → `DMRGateway`
  - `g4klx/YSFClients` → `YSFGateway`
  - `g4klx/ircDDBGateway` → `ircddbgatewayd`
  - `on7lds/NextionDriver` → `NextionDriver`
- Dependências: `build-essential`, `libwxgtk3.2-dev`, `libmosquitto-dev`, etc. em `deploy/station/packages.list` e no próprio `build-binaries.sh` (só instala pacotes que existem no apt).
- A falha de compilação **aborta** o bake (`MMDVM_BUILD_BINARIES=1` no chroot). Em install manual fora do bake, o aviso é soft para o console ainda gravar INI.
- Após o bake, `MMDVM_PURGE_BUILD=1` remove `/usr/local/src/mmdvm` e os `-dev` (mantém libs runtime de wx/mosquitto).
- **OTA:** o pacote leva o console +, quando existir, `mmdvm-arm64.tgz` (binários ARM64). O `ota-hooks.sh` instala em `/usr/local/bin` se faltar; senão baixa `update/mmdvm-arm64.tgz` do GitHub. Publicação: workflow **MMDVM ARM64 binaries** ou o bake (`image/out/mmdvm-arm64.tgz`). Fallback manual na Pi: `sudo MMDVM_FORCE=1 bash deploy/mmdvm/build-binaries.sh`.

```
sudo bash image/appliance/build.sh
```

`SKIP_DOCKER_CACHE=1` é o padrão. Para embutir os `.tar` do Wavelog: `SKIP_DOCKER_CACHE=0`.

Artefato: Release `v<versão>` em `fviudes/ham-cockpit`. O `.img.xz` não entra no Git.
