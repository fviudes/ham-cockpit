#!/bin/bash
# Compila MMDVMHost + DMRGateway + YSFGateway + ircddbgatewayd (g4klx) — modelo WPSD.
# Uso (root, ARM64/x86_64): bash deploy/mmdvm/build-binaries.sh
set -euo pipefail

PREFIX="${MMDVM_PREFIX:-/usr/local}"
SRC="${MMDVM_SRC:-/usr/local/src/mmdvm}"
JOBS="${MMDVM_JOBS:-$(nproc 2>/dev/null || echo 2)}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "falta $1" >&2; exit 1; }; }

have_all=0
if [[ -x "$PREFIX/bin/MMDVMHost" && -x "$PREFIX/bin/DMRGateway" && -x "$PREFIX/bin/YSFGateway" && -x "$PREFIX/bin/ircddbgatewayd" && -x "$PREFIX/bin/NextionDriver" ]]; then
  have_all=1
fi
if [[ "$have_all" == "1" && "${MMDVM_FORCE:-0}" != "1" ]]; then
  echo "binários MMDVM já em $PREFIX/bin (MMDVM_FORCE=1 para recompilar)"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    build-essential git cmake pkg-config \
    libusb-1.0-0-dev libsamplerate0-dev \
    libwxgtk3.2-dev libwxgtk3.0-gtk3-dev libwxgtk3.0-dev || true
fi

need git
need make
need g++

mkdir -p "$SRC" "$PREFIX/etc"
cd "$SRC"

clone_once() {
  local url="$1" dir="$2"
  if [[ ! -d "$dir/.git" ]]; then
    git clone --depth 1 "$url" "$dir"
  fi
}

clone_once https://github.com/g4klx/MMDVMHost.git MMDVMHost
clone_once https://github.com/g4klx/DMRGateway.git DMRGateway
clone_once https://github.com/g4klx/YSFClients.git YSFClients
clone_once https://github.com/g4klx/ircDDBGateway.git ircDDBGateway
clone_once https://github.com/on7lds/NextionDriver.git NextionDriver

echo "compilando MMDVMHost…"
make -C MMDVMHost -j"$JOBS"
install -m 0755 MMDVMHost/MMDVMHost "$PREFIX/bin/MMDVMHost"

echo "compilando DMRGateway…"
make -C DMRGateway -j"$JOBS"
install -m 0755 DMRGateway/DMRGateway "$PREFIX/bin/DMRGateway"

echo "compilando YSFGateway…"
make -C YSFClients/YSFGateway -j"$JOBS"
install -m 0755 YSFClients/YSFGateway/YSFGateway "$PREFIX/bin/YSFGateway"
if [[ -f YSFClients/YSFGateway/YSFHosts.txt ]]; then
  install -m 0644 YSFClients/YSFGateway/YSFHosts.txt "$PREFIX/etc/YSFHosts.txt" || true
fi

echo "compilando ircDDBGateway (daemon)…"
make -C ircDDBGateway -j"$JOBS" BUILD=release BINDIR="$PREFIX/bin" CONFDIR=/etc LOGDIR=/var/log/mmdvm || \
  make -C ircDDBGateway -j"$JOBS" BUILD=release
# Binário pode ficar em ircDDBGateway/ircDDBGateway ou instalado por make install
if [[ -x ircDDBGateway/ircDDBGateway/ircddbgatewayd ]]; then
  install -m 0755 ircDDBGateway/ircDDBGateway/ircddbgatewayd "$PREFIX/bin/ircddbgatewayd"
elif [[ -x "$PREFIX/bin/ircddbgatewayd" ]]; then
  true
else
  # Fallback: make install (precisa root)
  make -C ircDDBGateway install BUILD=release BINDIR="$PREFIX/bin" CONFDIR=/etc LOGDIR=/var/log/mmdvm || true
fi
# Alguns builds nomeiam ircDDBGateway sem o 'd'
if [[ ! -x "$PREFIX/bin/ircddbgatewayd" && -x "$PREFIX/bin/ircDDBGateway" ]]; then
  ln -sfn "$PREFIX/bin/ircDDBGateway" "$PREFIX/bin/ircddbgatewayd"
fi

echo "compilando NextionDriver (ON7LDS)…"
make -C NextionDriver -j"$JOBS" || make -C NextionDriver
if [[ -x NextionDriver/NextionDriver ]]; then
  install -m 0755 NextionDriver/NextionDriver "$PREFIX/bin/NextionDriver"
elif [[ -x NextionDriver/nextionDriver ]]; then
  install -m 0755 NextionDriver/nextionDriver "$PREFIX/bin/NextionDriver"
fi

mkdir -p /var/log/mmdvm "$PREFIX/etc"
echo "ok · MMDVMHost · DMRGateway · YSFGateway · ircddbgatewayd · NextionDriver"
