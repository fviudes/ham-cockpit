#!/bin/bash
# Compila Hamlib ≥4.6 (SPE Expert 401–403) e gera update/hamlib-arm64.tgz.
# Uso no Pi arm64: sudo bash deploy/hamlib/build-hamlib.sh
#   HAMLIB_VER=4.6.5 OUT=/caminho/hamlib-arm64.tgz
#
# 4.5.5 (apt Ubuntu, src/rig.c) ao ver host:port num backend Icom troca
# RIG_PORT_NETWORK por RIG_PORT_UDP_NETWORK — socket(SOCK_DGRAM). O ser2net
# do rádio é TCP cru e a resposta do CI-V não volta. No 4.6.5 esse bloco
# está em #if 0: host:port fica TCP (SOCK_STREAM), igual ao rig do 166.
# Este script recusa o tarball se a string "Icom rig UDP network enabled"
# voltar a ser compilada na lib.
set -euo pipefail

VER="${HAMLIB_VER:-4.6.5}"
SRC="${HAMLIB_SRC:-/tmp/hamlib-build}"
STAGE="${HAMLIB_STAGE:-/tmp/hamlib-stage}"
OUT="${OUT:-/tmp/hamlib-arm64.tgz}"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 2)}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  build-essential autoconf automake libtool pkg-config patchelf \
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

# Sem isto o binário acha a libhamlib.so.4 do apt (4.5.5, UDP) antes da lib
# do prefixo. $ORIGIN/../lib acompanha o tarball em /opt/ham-cockpit/hamlib.
shopt -s nullglob
for b in "$STAGE/usr/local/bin"/*; do
  [[ -f "$b" && -x "$b" ]] || continue
  if [[ "$(od -An -t x1 -N 4 "$b" | tr -d ' \n')" != "7f454c46" ]]; then
    continue
  fi
  patchelf --set-rpath '$ORIGIN/../lib' "$b"
done
shopt -u nullglob

if grep -a -q -F 'Icom rig UDP network enabled' "$STAGE/usr/local/lib/libhamlib.so.4"; then
  echo "ERRO: Hamlib ${VER} ainda abre Icom host:port em UDP (SOCK_DGRAM)." >&2
  echo "ERRO: o ser2net do rádio é TCP; use um Hamlib em que esse bloco está em #if 0 (4.6.5)." >&2
  exit 1
fi

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
