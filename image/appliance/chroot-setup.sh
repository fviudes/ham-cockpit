#!/bin/bash
# Roda DENTRO do chroot ARM64 da imagem Ubuntu Server 24.04 (Raspberry Pi).
# Não inicia daemons — só instala pacotes, copia a estação e habilita systemd.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export HAMCOCKPIT_CHROOT=1
export LANG=C.UTF-8

SEED="${HAMCOCKPIT_SEED:-/opt/ham-cockpit-seed}"
NODE_VER="${NODE_VER:-20.18.3}"

echo "Ham Cockpit OS: apt + Node + install-station (chroot)"

cat >/usr/sbin/policy-rc.d <<'EOF'
#!/bin/sh
exit 101
EOF
chmod +x /usr/sbin/policy-rc.d

if [[ -f /etc/resolv.conf ]] || [[ -L /etc/resolv.conf ]]; then
  rm -f /etc/resolv.conf
fi
printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' >/etc/resolv.conf

ln -sf /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime
echo America/Sao_Paulo >/etc/timezone
echo ham-cockpit >/etc/hostname
if ! grep -q 'ham-cockpit' /etc/hosts; then
  printf '127.0.1.1\tham-cockpit ham-cockpit.local\n' >>/etc/hosts
fi

enable_universe() {
  local f
  for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
    [[ -f $f ]] || continue
    if grep -qE '^[[:space:]]*deb ' "$f" && ! grep -qE '^[[:space:]]*deb .* universe' "$f"; then
      sed -i -E 's/^(deb(-src)?[[:space:]].*[[:space:]](main|restricted)([^#]*))$/\1 universe/' "$f"
    fi
  done
  for f in /etc/apt/sources.list.d/*.sources; do
    [[ -f $f ]] || continue
    if grep -q '^Components:' "$f" && ! grep -qE '^Components:.*universe' "$f"; then
      sed -i -E 's/^(Components:.*)/\1 universe/' "$f"
    fi
  done
}

resolve_pkg() {
  local name="$1" cand c
  case "$name" in
    hamlib-utils) cand=(libhamlib-utils hamlib-utils) ;;
    *) cand=("$name") ;;
  esac
  for c in "${cand[@]}"; do
    if apt-cache show "$c" >/dev/null 2>&1; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  return 1
}

enable_universe
apt-get update -qq
apt-get install -y locales
sed -i 's/^# *pt_BR.UTF-8/pt_BR.UTF-8/' /etc/locale.gen
locale-gen
update-locale LANG=pt_BR.UTF-8 LC_ALL=pt_BR.UTF-8 || true

PKGLIST="$SEED/deploy/station/packages.list"
mapfile -t RAW < <(grep -vE '^#|^$|^(firefox|chromium-browser)$' "$PKGLIST")
RAW+=(epiphany-browser)
PKGS=()
for p in "${RAW[@]}"; do
  if mapped="$(resolve_pkg "$p")"; then
    PKGS+=("$mapped")
  else
    echo "AVISO: pacote $p não existe neste Ubuntu (ignorado)" >&2
  fi
done
if [[ ${#PKGS[@]} -eq 0 ]]; then
  echo "nenhum pacote apt para instalar" >&2
  exit 1
fi
if ! printf '%s\n' "${PKGS[@]}" | grep -qxE 'libhamlib-utils|hamlib-utils'; then
  echo "Hamlib (rigctld) é obrigatório e não foi encontrado no apt" >&2
  exit 1
fi
apt-get install -y --no-install-recommends "${PKGS[@]}"

if ! command -v docker >/dev/null 2>&1 && [[ ! -x /usr/bin/docker ]]; then
  echo "ERRO: docker.io não instalou no chroot — Wavelog (:8086) exige Docker" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(2[0-9]|[3-9])'; then
  arch="$(uname -m)"
  case "$arch" in
    aarch64|arm64) node_arch=linux-arm64 ;;
    x86_64) node_arch=linux-x64 ;;
    *) echo "arch $arch sem tarball Node" >&2; exit 1 ;;
  esac
  curl -fsSL "https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-${node_arch}.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1
  ln -sfn /usr/local/bin/node /usr/bin/node
  ln -sfn /usr/local/bin/npm /usr/bin/npm
fi

chmod +x "$SEED/deploy/station/install-station.sh"
# Compila g4klx (Host/DMR/YSF/ircDDB) + NextionDriver no bake ARM64 nativo.
# MMDVM_BUILD_BINARIES=0 para pular (só em debug — a imagem de release exige os binários).
export MMDVM_BUILD_BINARIES="${MMDVM_BUILD_BINARIES:-1}"
export MMDVM_PURGE_BUILD="${MMDVM_PURGE_BUILD:-1}"
bash "$SEED/deploy/station/install-station.sh"

echo "verificando binários MMDVM em /usr/local/bin…"
for b in MMDVMHost DMRGateway YSFGateway ircddbgatewayd NextionDriver; do
  if [[ ! -x "/usr/local/bin/$b" ]]; then
    echo "ERRO: bake sem /usr/local/bin/$b — compile falhou ou foi pulado" >&2
    exit 1
  fi
  ls -lh "/usr/local/bin/$b"
done

if ls /opt/wavelog-seed-images/*.tar >/dev/null 2>&1; then
  mkdir -p /opt/wavelog/images
  cp -a /opt/wavelog-seed-images/*.tar /opt/wavelog/images/
fi

# enable já feito em install-station.sh (com fallback de symlinks no chroot).
# Reforça docker + target sem depender do D-Bus.
systemctl unmask docker.service docker.socket 2>/dev/null || true
for u in docker.service docker.socket ham-cockpit.target wavelog.service first-boot.service; do
  if [[ -f /etc/systemd/system/$u || -f /lib/systemd/system/$u || -f /usr/lib/systemd/system/$u ]]; then
    systemctl enable "$u" 2>/dev/null || true
  fi
done
# Garante WantedBy=multi-user mesmo se systemctl enable falhar no chroot.
for pair in \
  "docker.service:multi-user.target" \
  "docker.socket:sockets.target" \
  "ham-cockpit.target:multi-user.target" \
  "wavelog.service:ham-cockpit.target" \
  "first-boot.service:ham-cockpit.target"; do
  u="${pair%%:*}"
  t="${pair##*:}"
  src=""
  for dir in /etc/systemd/system /lib/systemd/system /usr/lib/systemd/system; do
    [[ -f "$dir/$u" ]] && src="$dir/$u" && break
  done
  if [[ -n "$src" ]]; then
    mkdir -p "/etc/systemd/system/${t}.wants"
    ln -sfn "$src" "/etc/systemd/system/${t}.wants/$u"
  fi
done
systemctl set-default multi-user.target
if [[ ! -e /etc/systemd/system/multi-user.target.wants/docker.service ]]; then
  echo "ERRO: docker.service não habilitado no boot (symlink ausente)" >&2
  exit 1
fi
if [[ ! -e /etc/systemd/system/multi-user.target.wants/ham-cockpit.target ]]; then
  echo "ERRO: ham-cockpit.target não habilitado no boot" >&2
  exit 1
fi
systemctl disable snapd.service snapd.socket 2>/dev/null || true
# Preferir NetworkManager (AP + STA); evita conflito com systemd-networkd.
systemctl disable systemd-networkd.service systemd-networkd.socket 2>/dev/null || true
systemctl mask systemd-networkd.service 2>/dev/null || true
systemctl disable dnsmasq.service 2>/dev/null || true
systemctl mask dnsmasq.service 2>/dev/null || true
systemctl disable hostapd.service 2>/dev/null || true
systemctl mask hostapd.service 2>/dev/null || true
mkdir -p /etc/cloud/cloud.cfg.d /etc/netplan /etc/NetworkManager/conf.d
# Garante renderer NM mesmo se o cloud-init da FAT atrasar.
cat >/etc/netplan/99-ham-cockpit-nm.yaml <<'EOF'
network:
  version: 2
  renderer: NetworkManager
EOF
chmod 600 /etc/netplan/99-ham-cockpit-nm.yaml
cat >/etc/NetworkManager/conf.d/90-ham-cockpit-wifi.conf <<'EOF'
[device]
wifi.scan-rand-mac-address=no
wifi.powersave=2

[connection]
wifi.powersave=2
EOF
echo 'REGDOMAIN=BR' >/etc/default/crda
cat >/etc/cloud/cloud.cfg.d/99-ham-cockpit.cfg <<'EOF'
ssh_pwauth: true
disable_root: true
EOF

apt-get clean
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
rm -f /usr/sbin/policy-rc.d

echo "Ham Cockpit OS pronto (Ubuntu Server 24.04 LTS · Pi 3/4/5)"
