#!/bin/bash
# Compila Hamlib ≥4.6 (SPE Expert 401–403) e gera update/hamlib-arm64.tgz.
# Uso no Pi arm64: sudo bash deploy/hamlib/build-hamlib.sh
#   HAMLIB_VER=4.6.5 OUT=/caminho/hamlib-arm64.tgz
set -euo pipefail

VER="${HAMLIB_VER:-4.6.5}"
SRC="${HAMLIB_SRC:-/tmp/hamlib-build}"
STAGE="${HAMLIB_STAGE:-/tmp/hamlib-stage}"
OUT="${OUT:-/tmp/hamlib-arm64.tgz}"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 2)}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  build-essential autoconf automake libtool pkg-config \
  libusb-1.0-0-dev wget ca-certificates

rm -rf "$SRC" "$STAGE"
mkdir -p "$SRC" "$STAGE"
cd "$SRC"

TGZ="hamlib-${VER}.tar.gz"
if [[ ! -f "$TGZ" ]]; then
  wget -q "https://github.com/Hamlib/Hamlib/releases/download/${VER}/${TGZ}" -O "$TGZ" \
    || wget -q "https://sourceforge.net/projects/hamlib/files/hamlib/${VER}/${TGZ}/download" -O "$TGZ"
fi
tar -xzf "$TGZ"
cd "hamlib-${VER}"

./configure --prefix=/usr/local --disable-static --enable-shared
make -j"$JOBS"
make install DESTDIR="$STAGE"

cd "$STAGE/usr/local"
tar -czf "$OUT" bin lib
ls -lh "$OUT"
export LD_LIBRARY_PATH="$STAGE/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
"$STAGE/usr/local/bin/ampctl" -V | head -2
"$STAGE/usr/local/bin/ampctl" -l | grep -iE 'Expert|401|402|403' || {
  echo "ERRO: build sem modelo SPE 401" >&2
  exit 1
}
echo "OK $OUT"
