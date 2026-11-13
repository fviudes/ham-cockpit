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
5. Pré-carrega Wavelog + MariaDB (`docker pull` + `docker save | gzip`) em `/opt/wavelog/images/*.tar.gz` — first-boot só faz `docker load` + `compose up --pull=never`
6. Publica `ham-cockpit-<base>-raspi.img.xz` na Release (só 3 partes `x.y.zz`; ver [versionamento.md](versionamento.md))

**Imagem completa (padrão):** MMDVM, apt (Docker, ser2net, Hamlib, mosquitto, nginx…), console e tarballs Docker do Wavelog/DB vão no `.img`. O cartão gravado **não** depende de download externo para subir o core. O runner ARM libera disco agressivamente; os saves vão em `.tar.gz`, a rootfs é zerofill antes do xz `-9e`. Se o `.img.xz` ainda passar de **2 GiB** (limite por asset na Release), o workflow publica `.part00`+`.part01` + `.JOIN.txt` (juntar com `cat` / `copy /b`); o artifact Actions `Ham-Cockpit-OS` guarda o arquivo inteiro. `SKIP_DOCKER_CACHE=1` fica só para debug com pouco disco (aí o first-boot volta a poder fazer pull).

Tempo típico: **45–90 min** no runner ARM (MMDVM + pull/save Docker + xz -9e). O `vite build` de produção usa `vite.config.prod.ts` para o Node sair depois de gerar o `dist` (o config de desenvolvimento importa o Lextel e ficava preso no CI).

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
- **Imagem única:** o `.img.xz` **já traz** Host, gateways, Nextion patched, units, libs runtime e UART Dual Hat. Install limpo (cartão gravado desta imagem) **não** depende de baixar `mmdvm-arm64.tgz` nem de compilar na Pi.
- **`mmdvm-arm64.tgz` não é asset da imagem.** A Release publica só o `.img.xz` (e o checksum). O bake compila os binários na rootfs (`MMDVM_FORCE=1`) e pode deixar uma cópia em `/opt/ham-cockpit/mmdvm-arm64.tgz` **dentro** do disco. O arquivo em `update/mmdvm-arm64.tgz` no Git continua só como ponte para estação antiga (OTA), via workflow **MMDVM ARM64 binaries** — o chroot **não** baixa esse tarball (senão o `build-binaries.sh` pula a compilação). O `ota-hooks.sh` em aparelho já gravado só instala o tarball se faltar binário **ou** se o Nextion estiver sem a marca. **0.1.05.02** corrige o `ota-hooks` que, em 0.1.05.01, apagava a unit Nextion por grep em comentário. Fallback manual na Pi: `sudo MMDVM_FORCE=1 bash deploy/mmdvm/build-binaries.sh`.
- **UART / Dual Hat / primeiro boot:** checklist operacional em [mmdvm-lab-checklist.md](mmdvm-lab-checklist.md) (`enable_uart` + `disable-bt`, getty masked, preset `mmdvmhsdualhatgpio`, Id > 1000, RPT1/RPT2 no rádio, Nextion unit real + patch `fd2`, DPlus `localAddress=0.0.0.0`, sem ciclo systemd Host↔Nextion↔ircDDB).
- **NextionDriver no bake:** `build-binaries.sh` aplica `deploy/mmdvm/patches/nextiondriver-fd2-modem.patch` (fallback `sed` se o upstream ON7LDS mudar linhas). Sem esse guard, Ubuntu 24 aborta com `FD_SETSIZE` quando `Port=modem`. O chroot e o `build.sh` **abortam** se o binário não tiver a marca `HC_FD2_GUARD` ou se faltar `nextiondriver.service`.
- **Instalação limpa não precisa re-fixar** o lab: `install-station.sh` + `first-boot.sh` + `ota-hooks.sh` já instalam unit Nextion real (`/etc/systemd/system` e `/opt/ham-cockpit/systemd`), PTY 660, Host com `ExecStartPre` no PTY (sem `systemctl restart mmdvmhost`), UART Dual `ttyAMA0`, `ircddbgateway` sem extensão + `localAddress=0.0.0.0`, helpers só LF, Wavelog `ensure-db` / compose `MARIADB_USER`+`env_file`, mosquitto/nginx/ser2net/Hamlib/`apt_prepare`. Callsign/Id DMR e link REF* continuam dados do operador no console.

```
sudo bash image/appliance/build.sh
```

`SKIP_DOCKER_CACHE=0` é o padrão do produto (Wavelog/MariaDB embutidos). `SKIP_DOCKER_CACHE=1` pula o pré-load (só debug).

Artefato: Release `v<versão>` em `fviudes/ham-cockpit` (imagem **v0.1.07**: `ham-cockpit-0.1.07-raspi.img.xz`). O `.img.xz` não entra no Git.

O bake instala o stack MMDVM já com os ajustes do lab (NextionDriver 1.26 patched, unit real, INI Dual/Nextion, UART `disable-bt`, `ircddbgateway` sem extensão, mosquitto/libdlt2, hosts REF*, `mmdvm-arm64.tgz` em `/opt/ham-cockpit`). **Não é necessário repetir os fixes do Pi de lab** num cartão gravado desta imagem. Detalhe operacional: [mmdvm-lab-checklist.md](mmdvm-lab-checklist.md).
