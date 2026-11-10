#!/bin/bash
# Grava Ham Cockpit OS no cartão. Uso: sudo bash flash.sh /dev/sdX [Ham Cockpit.img.xz]
set -euo pipefail
DEV="${1:?uso: $0 /dev/sdX [Ham Cockpit.img.xz]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
IMG="${2:-}"
if [[ -z $IMG ]]; then
  IMG="$(find "$REPO/image/out" "$REPO/instaladores" "$HERE" -maxdepth 2 -name 'ham-cockpit-*-raspi.img*' 2>/dev/null | head -n 1 || true)"
fi
[[ -n ${IMG:-} && -f $IMG ]] || { echo "gere a imagem: bash image/appliance/build.sh"; exit 1; }

echo "gravando $IMG → $DEV"
if [[ $IMG == *.xz ]]; then
  xz -dc "$IMG" | dd of="$DEV" bs=8M status=progress conv=fsync
else
  dd if="$IMG" of="$DEV" bs=8M status=progress conv=fsync
fi
echo "cartão pronto · Pi 3/4/5 · SSID Ham-Cockpit-XXXX (2,4 GHz) · http://192.168.4.1"
