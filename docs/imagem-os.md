# Imagem Ham Cockpit OS

A distribuição gravável é um disco Ubuntu Server 24.04 LTS ARM64 para o Raspberry Pi Imager gravar no microSD ou SSD USB.

## Porque o bake em QEMU no x64 foi abandonado

Assar a imagem num runner `ubuntu-latest` (x86) com `qemu-user-static` emula cada `apt-get` do ARM. Isso:

- leva 1–2 horas
- trava no esbuild/pnpm
- estoura o disco do runner quando ainda se pré-carregam tarballs Docker

Neste PC Windows não há WSL nem Docker, então o bake local também não roda.

## Caminho actual

GitHub Actions em **`ubuntu-24.04-arm`** (runner ARM nativo, disponível em repositório privado):

1. Compila o console (Vite + esbuild nativos)
2. Descarrega `ubuntu-24.04.4-preinstalled-server-arm64+raspi.img.xz`
3. Faz chroot **sem QEMU** e instala Docker, ser2net, Hamlib, nginx, Node, o console
4. Publica `ham-cockpit-<versão>-raspi.img.xz` na Release

Wavelog/MariaDB fazem `docker compose pull` no primeiro boot com Ethernet (não vão em tarball, para caber no disco de 14 GB do runner e acelerar o bake).

Tempo típico: **20–35 min** no runner ARM. O `vite build` de produção usa `vite.config.prod.ts` para o Node sair depois de gerar o `dist` (o config de desenvolvimento importa o Lextel e ficava preso no CI).

```
sudo bash image/appliance/build.sh
```

`SKIP_DOCKER_CACHE=1` é o omissão. Para embutir os `.tar` do Wavelog: `SKIP_DOCKER_CACHE=0`.

Artefato: Release `v<versão>` em `fviudes/ham-cockpit`. O `.img.xz` não entra no Git.
