#!/bin/bash
# Prepara o payload do cartão (deploy + dist) e, se o pi-gen existir, gera o .img.
# Uso: bash image/build-image.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/image/out"
mkdir -p "$OUT/payload/hamcockpit"

if [[ ! -d $ROOT/dist ]]; then
  echo "compilando Ham Cockpit..."
  (cd "$ROOT" && pnpm install && pnpm build)
fi

cp -a "$ROOT/deploy" "$ROOT/dist" "$ROOT/package.json" "$ROOT/VERSION" "$ROOT/update" "$ROOT/image/firstrun.sh" "$OUT/payload/hamcockpit/"
cp -a "$ROOT/image/firstrun.sh" "$OUT/payload/"
echo "payload em $OUT/payload"
echo "No Windows: image/installer/flash.ps1 (grava o SO e copia o payload para o boot)."
echo "ISO:        image/installer/make-iso.ps1"
