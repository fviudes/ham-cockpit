#!/bin/bash
# Grava Ham Cockpit OS no cartão ou SSD USB. Uso: sudo bash flash.sh /dev/sdX [ham-cockpit-*.img.xz]
set -euo pipefail
DEV="${1:?uso: $0 /dev/sdX [ham-cockpit-VERSION-raspi.img.xz]}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
IMG="${2:-}"
if [[ -z $IMG ]]; then
  IMG="$(find "$HERE" "$REPO/image/out" -maxdepth 1 -name 'ham-cockpit-*-raspi.img*' 2>/dev/null | head -n 1 || true)"
fi
[[ -n ${IMG:-} && -f $IMG ]] || {
  echo "baixe a imagem: gh release download --repo fviudes/ham-cockpit --pattern 'ham-cockpit-*-raspi.img.xz' --dir instaladores" >&2
  exit 1
}

echo "gravando $IMG → $DEV"
if [[ $IMG == *.xz ]]; then
  xz -dc "$IMG" | dd of="$DEV" bs=8M status=progress conv=fsync
else
  dd if="$IMG" of="$DEV" bs=8M status=progress conv=fsync
fi
echo "pronto · Pi 3/4/5 · Ubuntu Server 24.04 · SSID Ham-Cockpit-XXXX (2,4 GHz) · http://192.168.4.1/console"
