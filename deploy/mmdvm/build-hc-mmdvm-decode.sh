#!/bin/bash
# Compila hc-mmdvm-decode (mbelib-neo) para ARM64 na estação/imagem.
# Uso: sudo bash deploy/mmdvm/build-hc-mmdvm-decode.sh
set -euo pipefail

PREFIX="${HC_DECODE_PREFIX:-/opt/ham-cockpit}"
SRC="${HC_DECODE_SRC:-/usr/local/src/hc-mmdvm-decode}"
MBE_REPO="${MBE_REPO:-https://github.com/arancormonk/mbelib-neo.git}"
MBE_TAG="${MBE_TAG:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 2)}"

export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    build-essential cmake git pkg-config 2>/dev/null || true
fi

mkdir -p "$SRC" "$PREFIX/bin" "$PREFIX/lib" "$PREFIX/include"
rm -rf "$SRC/build" "$SRC/mbelib-neo"
APP_SRC="$SCRIPT_DIR/hc-mmdvm-decode"
if [[ ! -d "$APP_SRC" && -d /opt/ham-cockpit/mmdvm-decode ]]; then
  APP_SRC=/opt/ham-cockpit/mmdvm-decode
fi
[[ -d "$APP_SRC" ]] || { echo "fontes hc-mmdvm-decode ausentes em $SCRIPT_DIR" >&2; exit 1; }
cp -a "$APP_SRC" "$SRC/app"
cd "$SRC"

if [[ ! -d mbelib-neo/.git ]]; then
  if [[ -n "$MBE_TAG" ]]; then
    git clone --depth 1 --branch "$MBE_TAG" "$MBE_REPO" mbelib-neo
  else
    git clone --depth 1 "$MBE_REPO" mbelib-neo
  fi
fi

cmake -S mbelib-neo -B build/mbelib \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$PREFIX" \
  -DBUILD_SHARED_LIBS=ON \
  -DMBELIB_BUILD_TESTS=OFF \
  -DMBELIB_BUILD_TOOLS=OFF
cmake --build build/mbelib -j"$JOBS"
cmake --install build/mbelib

cmake -S app -B build/hc \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH="$PREFIX" \
  -DCMAKE_INSTALL_PREFIX="$PREFIX"
cmake --build build/hc -j"$JOBS"
cmake --install build/hc

if [[ -x "$PREFIX/bin/hc-mmdvm-decode" ]]; then
  echo "hc-mmdvm-decode → $PREFIX/bin/hc-mmdvm-decode"
  file "$PREFIX/bin/hc-mmdvm-decode"
  exit 0
fi

echo "ERRO: hc-mmdvm-decode não foi gerado" >&2
exit 1