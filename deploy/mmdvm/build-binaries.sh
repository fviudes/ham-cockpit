#!/bin/bash
# Compila MMDVMHost + DMRGateway + YSFGateway + ircddbgatewayd + NextionDriver.
# Preferido no bake ARM64 (chroot Ubuntu 24.04). Uso (root): bash deploy/mmdvm/build-binaries.sh
#
# Importante: o master do g4klx/MMDVMHost virou MQTT (binário MMDVM-Host) e quebrou
# o layout WPSD/Pi-Star (logs + Nextion). Usamos o ramo v1.0 pré-MQTT:
#   M17-Project/MMDVMHost@v1.0  (MMDVMHost + Nextion + M17, logs em arquivo)
#   g4klx/DMRGateway@v1.0
set -euo pipefail

PREFIX="${MMDVM_PREFIX:-/usr/local}"
SRC="${MMDVM_SRC:-/usr/local/src/mmdvm}"
JOBS="${MMDVM_JOBS:-$(nproc 2>/dev/null || echo 2)}"
# No bake, remove árvore de fontes e -dev após instalar (economiza disco na imagem).
PURGE="${MMDVM_PURGE_BUILD:-1}"

BINS=(MMDVMHost DMRGateway YSFGateway ircddbgatewayd NextionDriver)

need() { command -v "$1" >/dev/null 2>&1 || { echo "falta $1" >&2; exit 1; }; }

have_all=1
for b in "${BINS[@]}"; do
  if [[ ! -x "$PREFIX/bin/$b" ]]; then
    have_all=0
    break
  fi
done
if [[ "$have_all" == "1" && "${MMDVM_FORCE:-0}" != "1" ]]; then
  echo "binários MMDVM já em $PREFIX/bin (MMDVM_FORCE=1 para recompilar)"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive

# Instala só pacotes com Candidate real (apt-cache show ainda lista
# pacotes obsoletos tipo libwxgtk3.0-dev sem candidato no 24.04).
apt_try_install() {
  local pkg cand
  local ok=()
  for pkg in "$@"; do
    cand="$(apt-cache policy "$pkg" 2>/dev/null | awk '/Candidate:/ {print $2; exit}')"
    if [[ -n "$cand" && "$cand" != "(none)" ]]; then
      ok+=("$pkg")
    else
      echo "AVISO: pacote $pkg sem candidato neste Ubuntu (ignorado)" >&2
    fi
  done
  if [[ ${#ok[@]} -eq 0 ]]; then
    return 0
  fi
  apt-get install -y --no-install-recommends "${ok[@]}"
}

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  # Ubuntu 24.04: libwxgtk3.2-dev. Nomes 3.0 ficam só como fallback em releases antigas.
  apt_try_install \
    build-essential git cmake pkg-config \
    libusb-1.0-0-dev libsamplerate0-dev \
    libmosquitto-dev \
    nlohmann-json3-dev \
    libwxgtk3.2-dev \
    libwxgtk3.0-gtk3-dev libwxgtk3.0-dev
fi

need git
need make
need g++

if ! command -v wx-config >/dev/null 2>&1; then
  echo "falta wx-config (libwxgtk3.2-dev) — necessário para ircddbgatewayd" >&2
  exit 1
fi

mkdir -p "$SRC" "$PREFIX/bin" "$PREFIX/etc"
cd "$SRC"

# clone_once URL DIR [REF]
# REF = branch ou tag (shallow). Sem REF → default branch.
clone_once() {
  local url="$1" dir="$2" ref="${3:-}"
  local n=0
  local args=(clone --depth 1)
  if [[ -n "$ref" ]]; then
    args+=(--branch "$ref")
  fi
  if [[ -d "$dir/.git" ]]; then
    return 0
  fi
  rm -rf "$dir"
  until git "${args[@]}" "$url" "$dir"; do
    n=$((n + 1))
    if [[ $n -ge 3 ]]; then
      echo "git clone falhou: $url ${ref:+($ref)}" >&2
      exit 1
    fi
    echo "tentativa $n de clone falhou; repetindo…" >&2
    sleep 2
    rm -rf "$dir"
  done
}

install_bin() {
  local built="$1" dest_name="$2"
  if [[ -x "$built" ]]; then
    install -m 0755 "$built" "$PREFIX/bin/$dest_name"
    return 0
  fi
  echo "binário não gerado: $built → $dest_name" >&2
  exit 1
}

# v1.0 = último layout WPSD (arquivo de log + Nextion). Não usar master MQTT.
clone_once https://github.com/M17-Project/MMDVMHost.git MMDVMHost v1.0
clone_once https://github.com/g4klx/DMRGateway.git DMRGateway v1.0
clone_once https://github.com/g4klx/YSFClients.git YSFClients
clone_once https://github.com/g4klx/ircDDBGateway.git ircDDBGateway
clone_once https://github.com/on7lds/NextionDriver.git NextionDriver

echo "compilando MMDVMHost (M17-Project v1.0 · WPSD)…"
make -C MMDVMHost -j"$JOBS"
# Aceita MMDVMHost (clássico) ou MMDVM-Host (MQTT) e instala com o nome WPSD.
if [[ -x MMDVMHost/MMDVMHost ]]; then
  install_bin MMDVMHost/MMDVMHost MMDVMHost
elif [[ -x MMDVMHost/MMDVM-Host ]]; then
  install_bin MMDVMHost/MMDVM-Host MMDVMHost
else
  echo "MMDVMHost não foi gerado" >&2
  exit 1
fi

echo "compilando DMRGateway (g4klx v1.0)…"
make -C DMRGateway -j"$JOBS"
install_bin DMRGateway/DMRGateway DMRGateway

echo "compilando YSFGateway…"
make -C YSFClients/YSFGateway -j"$JOBS"
install_bin YSFClients/YSFGateway/YSFGateway YSFGateway
if [[ -f YSFClients/YSFGateway/YSFHosts.txt ]]; then
  install -m 0644 YSFClients/YSFGateway/YSFHosts.txt "$PREFIX/etc/YSFHosts.txt" || true
fi

echo "compilando ircddbgatewayd (só o daemon)…"
# Só o target do daemon — evita GUI; precisa wx + libmosquitto.
make -C ircDDBGateway -j"$JOBS" BUILD=release \
  BINDIR="$PREFIX/bin" CONFDIR=/etc LOGDIR=/var/log/mmdvm \
  ircDDBGateway/ircddbgatewayd
if [[ -x ircDDBGateway/ircDDBGateway/ircddbgatewayd ]]; then
  install_bin ircDDBGateway/ircDDBGateway/ircddbgatewayd ircddbgatewayd
elif [[ -x ircDDBGateway/ircddbgatewayd ]]; then
  install_bin ircDDBGateway/ircddbgatewayd ircddbgatewayd
else
  echo "ircddbgatewayd não foi gerado" >&2
  exit 1
fi

echo "compilando NextionDriver (ON7LDS)…"
# O alvo "all" do Makefile faz "clean" + build; com -j isso apaga o binário.
need gcc
make -C NextionDriver clean || true
make -C NextionDriver NextionDriver
if [[ -x NextionDriver/NextionDriver ]]; then
  install_bin NextionDriver/NextionDriver NextionDriver
elif [[ -x NextionDriver/nextionDriver ]]; then
  install_bin NextionDriver/nextionDriver NextionDriver
else
  echo "NextionDriver não foi gerado" >&2
  exit 1
fi
# DataFilesPath=/usr/local/etc/ no mmdvmhost.ini (talkgroups + DMR IDs).
if [[ -f NextionDriver/groups.txt ]]; then
  install -m 0644 NextionDriver/groups.txt "$PREFIX/etc/groups.txt"
fi
if [[ -f NextionDriver/users.csv ]]; then
  install -m 0644 NextionDriver/users.csv "$PREFIX/etc/users.csv"
fi

mkdir -p /var/log/mmdvm

missing=0
for b in "${BINS[@]}"; do
  if [[ -x "$PREFIX/bin/$b" ]]; then
    ls -lh "$PREFIX/bin/$b"
  else
    echo "ERRO: falta $PREFIX/bin/$b" >&2
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

if [[ "$PURGE" == "1" ]]; then
  echo "removendo fontes e pacotes -dev do bake…"
  rm -rf "$SRC"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get purge -y \
      libusb-1.0-0-dev libsamplerate0-dev libmosquitto-dev \
      nlohmann-json3-dev \
      libwxgtk3.2-dev libwxgtk3.0-gtk3-dev libwxgtk3.0-dev \
      cmake 2>/dev/null || true
    # Runtime de ircddbgatewayd: apt não sabe que o binário em /usr/local liga neles.
    apt_try_install libmosquitto1 libwxbase3.2-1t64 libwxgtk3.2-1t64 \
      libwxbase3.2-1 libwxgtk3.2-1
    apt-get autoremove -y 2>/dev/null || true
    apt-get clean 2>/dev/null || true
  fi
fi

echo "ok · MMDVMHost · DMRGateway · YSFGateway · ircddbgatewayd · NextionDriver → $PREFIX/bin"
