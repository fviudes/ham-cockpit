# Imagem Ham Cockpit OS

A distribuição gravável **não** é uma ISO de aplicação. É um disco Ubuntu Server 24.04 LTS ARM64 (`linux/arm64`) já com a estação, para o Raspberry Pi Imager gravar no microSD ou SSD USB.

## O que vai na imagem

- Base: `ubuntu-24.04.4-preinstalled-server-arm64+raspi.img.xz` (Canonical)
- Pacotes: `deploy/station/packages.list` (Docker, ser2net, Hamlib, nginx, BlueZ, cage/X11; sem snaps Firefox/Chromium)
- Console em `/opt/ham-cockpit` (Node 20 + `dist/`)
- Wavelog: compose em `/opt/wavelog` + tarballs `wavelog` e `mariadb:11.8` em `/opt/wavelog/images/` (load no first-boot)
- WaveLogGate, ser2net, Hamlib, AP, VFO HDMI — units systemd, `ham-cockpit.target` habilitado
- cloud-init: hostname `ham-cockpit`, expande o disco no primeiro boot, SSH com senha

## Como gerar

Não roda neste Windows (precisa loop + qemu ARM64). No GitHub Actions:

```
sudo bash image/appliance/build.sh
```

Workflow: `.github/workflows/appliance-image.yml` (`workflow_dispatch` ou tag `v*`).

Artefato: `image/out/ham-cockpit-<versão>-raspi.img.xz` → Release `v<versão>` em `fviudes/ham-cockpit`.

O `.img.xz` não entra no Git (tamanho). `instaladores/` tem os scripts de gravação e o ponteiro da Release.
