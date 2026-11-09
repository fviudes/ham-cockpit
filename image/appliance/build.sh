#!/bin/bash
# Gera Ham Cockpit OS (Raspberry Pi OS Lite 64-bit / Debian Bookworm).
# Pi 3 e Pi 4. Pacotes e serviços já no .img — sem apt no primeiro boot.
# Requer Linux ou WSL com Docker privilegiado.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/image/out"
PIGEN="$OUT/pi-gen"

if ! command -v docker >/dev/null 2>&1; then
  echo "instale Docker (Linux/WSL). No Windows: wsl --install e Docker Engine no WSL." >&2
  exit 1
fi

mkdir -p "$OUT"
if [[ ! -d $ROOT/dist ]]; then
  echo "compilando Ham Cockpit..."
  (cd "$ROOT" && pnpm install && pnpm build)
fi

if [[ ! -d $PIGEN/.git ]]; then
  git clone --depth 1 https://github.com/RPi-Distro/pi-gen.git "$PIGEN"
fi

cp -a "$ROOT/image/appliance/config" "$PIGEN/config"
rm -rf "$PIGEN/stage-ham-cockpit"
cp -a "$ROOT/image/appliance/stage-ham-cockpit" "$PIGEN/stage-ham-cockpit"
chmod +x "$PIGEN/stage-ham-cockpit/00-ham-cockpit/01-run.sh"
touch "$PIGEN/stage-ham-cockpit/EXPORT_IMAGE"

SEED="$PIGEN/stage-ham-cockpit/files/seed"
DOCK="$PIGEN/stage-ham-cockpit/files/docker"
mkdir -p "$SEED/deploy" "$SEED/dist" "$DOCK"
rsync -a "$ROOT/deploy/" "$SEED/deploy/"
rsync -a "$ROOT/dist/" "$SEED/dist/"
cp -a "$ROOT/package.json" "$SEED/package.json"

echo "pré-carregando imagens Docker linux/arm64..."
docker run --privileged --rm tonistiigi/binfmt --install arm64 >/dev/null 2>&1 || true
docker pull --platform linux/arm64 ghcr.io/wavelog/wavelog:latest
docker pull --platform linux/arm64 mariadb:11.8
docker save ghcr.io/wavelog/wavelog:latest -o "$DOCK/wavelog.tar"
docker save mariadb:11.8 -o "$DOCK/mariadb.tar"

echo "pi-gen (Docker) — 30–90 min..."
(cd "$PIGEN" && CONTINUE=0 ./build-docker.sh)

find "$PIGEN/deploy" -name 'Ham-Cockpit*.img.xz' -exec cp -a {} "$OUT/" \;
ls -lh "$OUT"/Ham-Cockpit*.img.xz
echo "cartão: image/installer/flash.ps1 -Image image/out/Ham Cockpit-*.img.xz"
echo "ISO:    image/installer/make-iso.ps1"
