#!/bin/bash
# Instala a estação Ham Cockpit no Ubuntu Server e habilita TUDO no boot.
# Uso (root): sudo bash deploy/station/install-station.sh
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "execute como root: sudo bash $0" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CHROOT="${HAMCOCKPIT_CHROOT:-0}"
export DEBIAN_FRONTEND=noninteractive

if [[ "$CHROOT" != "1" ]]; then
  # Lab: dpkg a meio / Hamlib — sempre concluir configure antes do apt.
  export DEBIAN_FRONTEND=noninteractive
  dpkg --configure -a || true
  apt-get -y -f install || true
  apt-get update -qq
  mapfile -t STATION_PKGS < <(grep -vE '^#|^$' "$HERE/packages.list" | sed 's/^hamlib-utils$/libhamlib-utils/')
  apt-get install -y "${STATION_PKGS[@]}"
fi

if [[ "$CHROOT" == "1" ]]; then
  command -v node >/dev/null 2>&1 || { echo "node ausente no chroot" >&2; exit 1; }
elif ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(2[0-9]|[3-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Grupo docker antes do unit SupplementaryGroups=docker (senão o console não sobe).
getent group docker >/dev/null 2>&1 || groupadd --system docker || true

add_station_user() {
  local user="$1" pass="$2"
  if ! id "$user" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "$user"
    echo "$user:$pass" | chpasswd
  fi
  local g
  for g in sudo docker dialout plugdev bluetooth video input tty render; do
    getent group "$g" >/dev/null 2>&1 && usermod -aG "$g" "$user" || true
  done
}
add_station_user hamcockpit 1234
add_station_user admin 1234

install -d -o hamcockpit -g hamcockpit /opt/ham-cockpit /opt/ham-cockpit/bin /opt/ham-cockpit/radios /opt/ham-cockpit/equipment /opt/ser2net /opt/wavelog /opt/wavelog-gate /opt/lextel /backup
install -m 0755 "$HERE/ham-cockpit-ap.sh" /opt/ham-cockpit/bin/ham-cockpit-ap.sh
install -m 0755 "$HERE/first-boot.sh" /opt/ham-cockpit/bin/first-boot.sh
install -m 0755 "$HERE/hc-tune.sh" /opt/ham-cockpit/bin/hc-tune.sh
install -o root -g root -m 0755 "$HERE/root-login" /opt/ham-cockpit/bin/root-login
install -o root -g root -m 0755 "$HERE/station-user" /opt/ham-cockpit/bin/station-user
install -o root -g root -m 0755 "$HERE/ser2net-ctl" /opt/ham-cockpit/bin/ser2net-ctl
install -o root -g root -m 0755 "$HERE/station-net" /opt/ham-cockpit/bin/station-net
install -o root -g root -m 0755 "$HERE/station-svc" /opt/ham-cockpit/bin/station-svc
install -o root -g root -m 0755 "$HERE/station-upd" /opt/ham-cockpit/bin/station-upd
install -o root -g root -m 0755 "$HERE/station-backup" /opt/ham-cockpit/bin/station-backup
install -o root -g root -m 0755 "$HERE/vfo-display-ctl" /opt/ham-cockpit/bin/vfo-display-ctl
install -o root -g root -m 0755 "$HERE/vfo-display-kiosk" /opt/ham-cockpit/bin/vfo-display-kiosk
install -o root -g root -m 0755 "$HERE/vfo-display-idle" /opt/ham-cockpit/bin/vfo-display-idle
install -o root -g root -m 0755 "$HERE/ldg-serial" /opt/ham-cockpit/bin/ldg-serial
install -o root -g root -m 0755 "$ROOT/deploy/mmdvm/mmdvm-ctl" /opt/ham-cockpit/bin/mmdvm-ctl
# Shebang CRLF (checkout Windows) → `sudo: unable to execute … mmdvm-ctl`.
sed -i 's/\r$//' /opt/ham-cockpit/bin/mmdvm-ctl
install -m 0644 "$HERE/versions.json" /opt/ham-cockpit/versions.json
install -o root -g root -m 0755 "$ROOT/deploy/lextel/lextel-bt" /opt/ham-cockpit/bin/lextel-bt
install -m 0644 "$ROOT/deploy/lextel/99-lextel-rfcomm.rules" /etc/udev/rules.d/99-lextel-rfcomm.rules
udevadm control --reload-rules 2>/dev/null || true
install -o root -g root -m 0440 "$HERE/sudoers-hamcockpit" /etc/sudoers.d/ham-cockpit
install -d /etc/ssh/sshd_config.d
install -m 0644 "$HERE/sshd-ham-cockpit.conf" /etc/ssh/sshd_config.d/ham-cockpit.conf

if [[ -d "$ROOT/dist" ]]; then
  cp -a "$ROOT/dist/." /opt/ham-cockpit/
elif [[ -f "$ROOT/package.json" ]] && command -v node >/dev/null; then
  echo "compilando Ham Cockpit..."
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT" && pnpm install && pnpm build)
  else
    (cd "$ROOT" && corepack enable && corepack prepare pnpm@latest --activate && pnpm install && pnpm build)
  fi
  cp -a "$ROOT/dist/." /opt/ham-cockpit/
fi
cp -a "$HERE/runtime-package.json" /opt/ham-cockpit/package.json
if [[ -f "$HERE/ota-hooks.sh" ]]; then
  install -m 0755 "$HERE/ota-hooks.sh" /opt/ham-cockpit/ota-hooks.sh
fi
if [[ -f "$ROOT/VERSION" ]]; then
  install -m 0644 "$ROOT/VERSION" /opt/ham-cockpit/VERSION
fi
(cd /opt/ham-cockpit && npm install --omit=dev)
chown -R hamcockpit:hamcockpit /opt/ham-cockpit
chown root:root /opt/ham-cockpit/bin/root-login /opt/ham-cockpit/bin/station-user /opt/ham-cockpit/bin/ser2net-ctl /opt/ham-cockpit/bin/station-net /opt/ham-cockpit/bin/station-svc /opt/ham-cockpit/bin/station-upd /opt/ham-cockpit/bin/station-backup /opt/ham-cockpit/bin/lextel-bt /opt/ham-cockpit/bin/vfo-display-ctl /opt/ham-cockpit/bin/vfo-display-kiosk /opt/ham-cockpit/bin/vfo-display-idle /opt/ham-cockpit/bin/ldg-serial /opt/ham-cockpit/bin/mmdvm-ctl
chmod 0755 /opt/ham-cockpit/bin/root-login /opt/ham-cockpit/bin/station-user /opt/ham-cockpit/bin/ser2net-ctl /opt/ham-cockpit/bin/station-net /opt/ham-cockpit/bin/station-svc /opt/ham-cockpit/bin/station-upd /opt/ham-cockpit/bin/station-backup /opt/ham-cockpit/bin/lextel-bt /opt/ham-cockpit/bin/vfo-display-ctl /opt/ham-cockpit/bin/vfo-display-kiosk /opt/ham-cockpit/bin/vfo-display-idle /opt/ham-cockpit/bin/ldg-serial /opt/ham-cockpit/bin/mmdvm-ctl
chown -R hamcockpit:hamcockpit /opt/lextel
chmod 0775 /opt/lextel

if [[ ! -f /opt/ser2net/services.json ]]; then
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/deploy/ser2net/ser2net.yaml" /opt/ser2net/ser2net.yaml
fi
chown -R hamcockpit:hamcockpit /opt/ser2net
chmod 0775 /opt/ser2net
cp -a "$ROOT/deploy/wavelog/docker-compose.yml" "$ROOT/deploy/wavelog/wavelog-ctl.sh" "$ROOT/deploy/wavelog/.env.example" /opt/wavelog/
chmod +x /opt/wavelog/wavelog-ctl.sh
sed -i 's/\r$//' /opt/wavelog/wavelog-ctl.sh
chown root:hamcockpit /opt/wavelog/docker-compose.yml /opt/wavelog/wavelog-ctl.sh /opt/wavelog/.env.example 2>/dev/null || true
if [[ ! -f /opt/wavelog/.env ]]; then
  PW="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 20)"
  printf 'WAVELOG_DB_PASSWORD=%s\n' "$PW" >/opt/wavelog/.env
fi
# Legível/gravável pelo serviço hamcockpit (backup/restore); não world-readable.
if [[ -f /opt/wavelog/.env ]]; then
  chown hamcockpit:hamcockpit /opt/wavelog/.env
  chmod 640 /opt/wavelog/.env
fi

install -o hamcockpit -g hamcockpit -m 0755 "$ROOT/deploy/wavelog-gate/wavelog-gate.mjs" /opt/wavelog-gate/wavelog-gate.mjs
install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/deploy/wavelog-gate/VERSION" /opt/wavelog-gate/VERSION
if [[ ! -f /opt/wavelog-gate/wavelog-gate.env ]]; then
  install -o hamcockpit -g hamcockpit -m 0640 "$ROOT/deploy/wavelog-gate/wavelog-gate.env" /opt/wavelog-gate/wavelog-gate.env
fi
chown -R hamcockpit:hamcockpit /opt/wavelog-gate

install -m 0644 "$HERE/ham-cockpit.target" /etc/systemd/system/ham-cockpit.target
install -m 0644 "$HERE/ham-cockpit.service" /etc/systemd/system/ham-cockpit.service
install -m 0644 "$HERE/ham-cockpit-ap.service" /etc/systemd/system/ham-cockpit-ap.service
install -m 0644 "$HERE/first-boot.service" /etc/systemd/system/first-boot.service
install -m 0644 "$ROOT/deploy/ser2net/ser2net.service" /etc/systemd/system/ser2net.service
install -m 0644 "$ROOT/deploy/hamlib/rigctld@ic705.service" /etc/systemd/system/rigctld@ic705.service
install -m 0644 "$ROOT/deploy/hamlib/rigctld@cat2.service" /etc/systemd/system/rigctld@cat2.service
install -m 0644 "$ROOT/deploy/hamlib/ampctld@spe.service" /etc/systemd/system/ampctld@spe.service
install -m 0644 "$ROOT/deploy/wavelog/wavelog.service" /etc/systemd/system/wavelog.service
install -m 0644 "$ROOT/deploy/wavelog-gate/waveloggate.service" /etc/systemd/system/waveloggate.service
install -d -o hamcockpit -g hamcockpit /opt/ham-cockpit/mmdvm /var/log/mmdvm
# Templates só em instalação LIMPA (arquivo ausente). OTA/upgrade NUNCA entra aqui
# com cp por cima — senão Callsign/Id do operador viram N0CALL/0000000 (lab 3×).
if [[ ! -f /opt/ham-cockpit/mmdvm/mmdvmhost.ini ]]; then
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/deploy/mmdvm/mmdvmhost.ini" /opt/ham-cockpit/mmdvm/mmdvmhost.ini
fi
if [[ ! -f /opt/ham-cockpit/mmdvm/dmrgateway.ini ]]; then
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/deploy/mmdvm/dmrgateway.ini" /opt/ham-cockpit/mmdvm/dmrgateway.ini
fi
if [[ ! -f /opt/ham-cockpit/mmdvm/ysfgateway.ini ]]; then
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/deploy/mmdvm/ysfgateway.ini" /opt/ham-cockpit/mmdvm/ysfgateway.ini
fi
if [[ ! -f /opt/ham-cockpit/mmdvm/ircddbgateway.conf ]]; then
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/deploy/mmdvm/ircddbgateway.conf" /opt/ham-cockpit/mmdvm/ircddbgateway.conf
fi
# ircddbgatewayd (g4klx) lê <confdir>/ircddbgateway — SEM extensão. Só o .conf não basta.
if [[ ! -e /opt/ham-cockpit/mmdvm/ircddbgateway ]]; then
  ln -sfn ircddbgateway.conf /opt/ham-cockpit/mmdvm/ircddbgateway
  chown -h hamcockpit:hamcockpit /opt/ham-cockpit/mmdvm/ircddbgateway || true
fi
install -d /opt/ham-cockpit/systemd /opt/ham-cockpit/deploy/mmdvm
# Cópia do TEMPLATE em deploy/ — NÃO é o INI vivo em /opt/ham-cockpit/mmdvm/.
if [[ -d "$ROOT/deploy/mmdvm" ]]; then
  cp -a "$ROOT/deploy/mmdvm/mmdvmhost.ini" "$ROOT/deploy/mmdvm/dmrgateway.ini" \
    "$ROOT/deploy/mmdvm/ysfgateway.ini" "$ROOT/deploy/mmdvm/ircddbgateway.conf" \
    /opt/ham-cockpit/deploy/mmdvm/ 2>/dev/null || true
fi
install_unit() {
  local name="$1"
  install -m 0644 "$ROOT/deploy/mmdvm/$name" "/etc/systemd/system/$name"
  install -m 0644 "$ROOT/deploy/mmdvm/$name" "/opt/ham-cockpit/systemd/$name"
}
install_unit mmdvmhost.service
install_unit dmrgateway.service
install_unit ysfgateway.service
install_unit ircddbgateway.service
install_unit ham-cockpit-mmdvm-build.service
# Unit Nextion real — SEMPRE /etc/systemd/system + cópia em /opt/ham-cockpit/systemd.
# Detector de stub só em diretivas ATIVAS (comentários não contam; 0.1.05.01 apagava a unit).
systemctl unmask nextiondriver.service 2>/dev/null || true
install_unit nextiondriver.service
if grep -vE '^[[:space:]]*(#|$)' /etc/systemd/system/nextiondriver.service 2>/dev/null \
  | grep -qE 'lab: disabled|ConditionPathExists=/nonexistent|^ExecStart=/bin/true([[:space:]]|$)'; then
  echo "ERRO: nextiondriver.service stub recusado — reinstalando unit real" >&2
  install -m 0644 "$ROOT/deploy/mmdvm/nextiondriver.service" /etc/systemd/system/nextiondriver.service
  install -m 0644 "$ROOT/deploy/mmdvm/nextiondriver.service" /opt/ham-cockpit/systemd/nextiondriver.service
fi
# Fallback de compilação na Pi (OTA / bake incremental): script + patch fd2.
install -o root -g root -m 0755 "$ROOT/deploy/mmdvm/build-binaries.sh" /opt/ham-cockpit/bin/mmdvm-build-binaries.sh
sed -i 's/\r$//' /opt/ham-cockpit/bin/mmdvm-build-binaries.sh
install -d /opt/ham-cockpit/bin/patches
if [[ -d "$ROOT/deploy/mmdvm/patches" ]]; then
  cp -a "$ROOT/deploy/mmdvm/patches/." /opt/ham-cockpit/bin/patches/
fi

# UART GPIO do HAT MMDVM (Pi 3/4): PL011 livre em /dev/ttyAMA0.
# disable-bt libera o UART principal nos pinos GPIO (Bluetooth off).
# Sem console serial/getty ocupando a porta (padrão WPSD / Pi-Star).
configure_mmdvm_uart() {
  local cfg cmd model
  model=""
  if [[ -r /proc/device-tree/model ]]; then
    model="$(tr -d '\0' </proc/device-tree/model 2>/dev/null || true)"
  fi
  [[ "$model" == *Raspberry* ]] || return 0
  for cfg in /boot/firmware/config.txt /boot/config.txt; do
    [[ -f "$cfg" ]] || continue
    grep -qE '^[[:space:]]*enable_uart=1' "$cfg" || echo 'enable_uart=1' >>"$cfg"
    # Preferir disable-bt; normaliza overlays antigos (miniuart-bt / pi3-*).
    if grep -qE '^[[:space:]]*dtoverlay=(miniuart-bt|pi3-miniuart-bt|pi3-disable-bt|disable-bt)' "$cfg"; then
      sed -i -E 's/^[[:space:]]*dtoverlay=(miniuart-bt|pi3-miniuart-bt|pi3-disable-bt|disable-bt).*/dtoverlay=disable-bt/' "$cfg"
    else
      echo 'dtoverlay=disable-bt' >>"$cfg"
    fi
    break
  done
  for cmd in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
    [[ -f "$cmd" ]] || continue
    # Remove console serial; mantém console=tty1 para HDMI/local.
    sed -i -E 's/[[:space:]]*console=(serial0|ttyAMA0|ttyS0)[^[:space:]]*//g' "$cmd"
    break
  done
  systemctl disable --now serial-getty@ttyS0.service serial-getty@ttyAMA0.service 2>/dev/null || true
  systemctl mask serial-getty@ttyS0.service serial-getty@ttyAMA0.service 2>/dev/null || true
}
configure_mmdvm_uart

nextion_needs_patch() {
  [[ -x /usr/local/bin/NextionDriver ]] || return 0
  grep -a -q 'HC_FD2_GUARD' /usr/local/bin/NextionDriver && return 1
  return 0
}
# Tarball patched (bake/OTA). Não basta o bin existir — stock Ubuntu 24 aborta sem a marca.
# No chroot o arquivo já pode estar em /opt/ham-cockpit — cp origem=destino aborta com set -e.
for tgz in "$ROOT/update/mmdvm-arm64.tgz" "$ROOT/image/out/mmdvm-arm64.tgz" /opt/ham-cockpit/mmdvm-arm64.tgz; do
  if [[ -f "$tgz" ]]; then
    if [[ "$tgz" != /opt/ham-cockpit/mmdvm-arm64.tgz ]]; then
      cp -a "$tgz" /opt/ham-cockpit/mmdvm-arm64.tgz
    fi
    break
  fi
done
if nextion_needs_patch && [[ -f /opt/ham-cockpit/mmdvm-arm64.tgz ]]; then
  tmp="$(mktemp -d)"
  if tar -xzf /opt/ham-cockpit/mmdvm-arm64.tgz -C "$tmp" bin/NextionDriver 2>/dev/null \
    && [[ -f "$tmp/bin/NextionDriver" ]]; then
    install -m 0755 "$tmp/bin/NextionDriver" /usr/local/bin/NextionDriver
    echo "NextionDriver reinstalado de mmdvm-arm64.tgz (HC_FD2_GUARD)" >&2
  fi
  rm -rf "$tmp"
fi

# Binários g4klx + NextionDriver. MMDVM_BUILD_BINARIES=0 para pular.
# No bake (CHROOT=1 ou MMDVM_BUILD_BINARIES=1) a falha aborta a imagem.
if [[ "${MMDVM_BUILD_BINARIES:-auto}" != "0" ]]; then
  if [[ "${MMDVM_BUILD_BINARIES:-}" == "1" || ! -x /usr/local/bin/MMDVMHost ]] || nextion_needs_patch; then
    chmod +x "$ROOT/deploy/mmdvm/build-binaries.sh"
    if [[ "${MMDVM_BUILD_BINARIES:-}" == "1" || "$CHROOT" == "1" ]]; then
      export MMDVM_PURGE_BUILD="${MMDVM_PURGE_BUILD:-1}"
      bash "$ROOT/deploy/mmdvm/build-binaries.sh"
      for b in MMDVMHost DMRGateway YSFGateway ircddbgatewayd NextionDriver; do
        if [[ ! -x "/usr/local/bin/$b" ]]; then
          echo "ERRO: bake sem /usr/local/bin/$b" >&2
          exit 1
        fi
      done
      if ! grep -a -q 'HC_FD2_GUARD' /usr/local/bin/NextionDriver; then
        echo "ERRO: bake sem marca HC_FD2_GUARD no NextionDriver" >&2
        exit 1
      fi
    else
      bash "$ROOT/deploy/mmdvm/build-binaries.sh" || echo "AVISO: build MMDVM falhou — console grava INI mesmo assim" >&2
    fi
  fi
fi
install -m 0644 "$HERE/ham-cockpit-vfo.service" /etc/systemd/system/ham-cockpit-vfo.service
install -m 0644 "$HERE/ham-cockpit-vfo-idle.service" /etc/systemd/system/ham-cockpit-vfo-idle.service
# Cópia das units da estação no tree do console (mesmo layout do pacote OTA).
install -d /opt/ham-cockpit/systemd
for u in ham-cockpit.service ham-cockpit-ap.service ham-cockpit.target first-boot.service \
  ham-cockpit-vfo.service ham-cockpit-vfo-idle.service wavelog.service; do
  if [[ -f "/etc/systemd/system/$u" ]]; then
    install -m 0644 "/etc/systemd/system/$u" "/opt/ham-cockpit/systemd/$u"
  fi
done
# Helpers só LF (checkout Windows / pendrive).
find /opt/ham-cockpit/bin -maxdepth 1 -type f -exec sed -i 's/\r$//' {} + 2>/dev/null || true
sed -i 's/\r$//' /opt/wavelog/wavelog-ctl.sh 2>/dev/null || true
install -d -o hamcockpit -g hamcockpit /var/lib/hamcockpit /var/lib/hamcockpit/chromium
loginctl enable-linger hamcockpit 2>/dev/null || true

install -m 0644 "$HERE/nginx-ham-cockpit.conf" /etc/nginx/sites-available/ham-cockpit
ln -sfn /etc/nginx/sites-available/ham-cockpit /etc/nginx/sites-enabled/ham-cockpit
rm -f /etc/nginx/sites-enabled/default
systemctl disable dnsmasq.service 2>/dev/null || true
systemctl mask dnsmasq.service 2>/dev/null || true
# hostapd só sobe pelo ham-cockpit-ap.sh (fallback); o unit default conflita com o NM.
systemctl disable hostapd.service 2>/dev/null || true
systemctl mask hostapd.service 2>/dev/null || true
systemctl daemon-reload || true
systemctl unmask ssh.service 2>/dev/null || true
systemctl unmask docker.service docker.socket 2>/dev/null || true

# systemctl enable falha em chroot sem D-Bus — cria symlinks WantedBy à mão.
enable_units() {
  local u src wants w dir
  for u in "$@"; do
    if systemctl enable "$u" 2>/dev/null; then
      continue
    fi
    src=""
    for dir in /etc/systemd/system /lib/systemd/system /usr/lib/systemd/system; do
      if [[ -f "$dir/$u" ]]; then
        src="$dir/$u"
        break
      fi
    done
    if [[ -z "$src" ]]; then
      echo "AVISO: unit $u não encontrada para enable" >&2
      continue
    fi
    wants="$(awk -F= '/^WantedBy=/{print $2}' "$src" | tr ' ' '\n' | grep -v '^$' || true)"
    [[ -n "$wants" ]] || wants="multi-user.target"
    for w in $wants; do
      mkdir -p "/etc/systemd/system/${w}.wants"
      ln -sfn "$src" "/etc/systemd/system/${w}.wants/$u"
    done
  done
}

enable_units ssh.service
enable_units sshd.service
enable_units docker.service docker.socket nginx.service NetworkManager.service avahi-daemon.service
enable_units ham-cockpit.target ham-cockpit.service ham-cockpit-ap.service first-boot.service
enable_units ser2net.service 'rigctld@ic705.service' wavelog.service waveloggate.service
enable_units nextiondriver.service mmdvmhost.service dmrgateway.service ysfgateway.service ircddbgateway.service
enable_units seatd.service ham-cockpit-vfo.service ham-cockpit-vfo-idle.service
# ircddbgatewayd (g4klx recente) exige broker MQTT local; sem mosquitto → Connection refused.
enable_units mosquitto.service
# Swap, journald/sysctl enxutos, mask de snapd/apt-daily etc. (Pi 3 travava sem swap).
/opt/ham-cockpit/bin/hc-tune.sh || true
# docker.io deve existir após packages.list (bake) / apt (install vivo).
if ! command -v docker >/dev/null 2>&1; then
  echo "AVISO: binário docker ausente — instale docker.io (nova imagem bake se for appliance)" >&2
elif [[ -d /run/systemd/system ]]; then
  systemctl start docker.socket docker.service 2>/dev/null || true
fi
mkdir -p /etc/netplan /etc/NetworkManager/conf.d
if [[ ! -f /etc/netplan/99-ham-cockpit-nm.yaml ]]; then
  cat >/etc/netplan/99-ham-cockpit-nm.yaml <<'EOF'
network:
  version: 2
  renderer: NetworkManager
EOF
  chmod 600 /etc/netplan/99-ham-cockpit-nm.yaml
fi
# País / powersave — sem REGDOMAIN o AP do Pi falha em silêncio com frequência.
cat >/etc/NetworkManager/conf.d/90-ham-cockpit-wifi.conf <<'EOF'
[device]
wifi.scan-rand-mac-address=no
wifi.powersave=2

[connection]
wifi.powersave=2
EOF
if [[ -f /etc/default/crda ]]; then
  sed -i 's/^REGDOMAIN=.*/REGDOMAIN=BR/' /etc/default/crda || true
  grep -q '^REGDOMAIN=' /etc/default/crda || echo 'REGDOMAIN=BR' >>/etc/default/crda
else
  echo 'REGDOMAIN=BR' >/etc/default/crda
fi
iw reg set BR 2>/dev/null || true
if [[ "$CHROOT" != "1" ]]; then
  # Broker MQTT local para ircddbgatewayd (libmosquitto); libdlt2 vem do packages.list.
  if command -v mosquitto >/dev/null 2>&1 || [[ -x /usr/sbin/mosquitto ]]; then
    systemctl enable --now mosquitto.service 2>/dev/null || systemctl start mosquitto.service || true
  fi
  systemctl enable --now ham-cockpit.target || systemctl start ham-cockpit.target || true
  systemctl restart waveloggate.service || systemctl start waveloggate.service || true
fi

echo "estação habilitada no boot · ham-cockpit.target"
echo "console  http://192.168.4.1  (AP sem cabo)  ou  http://ham-cockpit.local  /  http://$(hostname -I | awk '{print $1}')"
echo "wavelog  http://IP:8086/install  (DB host: wavelog-db)"
echo "ssh      usuários sudo (hamcockpit / admin) · porta 22 · sem root por senha"
echo "hdmi     VFO em tela cheia · CTRL+X volta ao console · 10 min no CLI reabre o VFO"
