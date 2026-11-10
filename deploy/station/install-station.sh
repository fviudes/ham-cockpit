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

install -d -o hamcockpit -g hamcockpit /opt/ham-cockpit /opt/ham-cockpit/bin /opt/ser2net /opt/wavelog /opt/wavelog-gate /opt/lextel /backup
install -m 0755 "$HERE/ham-cockpit-ap.sh" /opt/ham-cockpit/bin/ham-cockpit-ap.sh
install -m 0755 "$HERE/first-boot.sh" /opt/ham-cockpit/bin/first-boot.sh
install -o root -g root -m 0755 "$HERE/root-login" /opt/ham-cockpit/bin/root-login
install -o root -g root -m 0755 "$HERE/station-user" /opt/ham-cockpit/bin/station-user
install -o root -g root -m 0755 "$HERE/ser2net-ctl" /opt/ham-cockpit/bin/ser2net-ctl
install -o root -g root -m 0755 "$HERE/station-net" /opt/ham-cockpit/bin/station-net
install -o root -g root -m 0755 "$HERE/station-svc" /opt/ham-cockpit/bin/station-svc
install -o root -g root -m 0755 "$HERE/station-upd" /opt/ham-cockpit/bin/station-upd
install -o root -g root -m 0755 "$HERE/vfo-display-ctl" /opt/ham-cockpit/bin/vfo-display-ctl
install -o root -g root -m 0755 "$HERE/vfo-display-kiosk" /opt/ham-cockpit/bin/vfo-display-kiosk
install -o root -g root -m 0755 "$HERE/vfo-display-idle" /opt/ham-cockpit/bin/vfo-display-idle
install -o root -g root -m 0755 "$HERE/ldg-serial" /opt/ham-cockpit/bin/ldg-serial
install -o root -g root -m 0755 "$ROOT/deploy/mmdvm/mmdvm-ctl" /opt/ham-cockpit/bin/mmdvm-ctl
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
if [[ -f "$ROOT/VERSION" ]]; then
  install -m 0644 "$ROOT/VERSION" /opt/ham-cockpit/VERSION
fi
(cd /opt/ham-cockpit && npm install --omit=dev)
chown -R hamcockpit:hamcockpit /opt/ham-cockpit
chown root:root /opt/ham-cockpit/bin/root-login /opt/ham-cockpit/bin/station-user /opt/ham-cockpit/bin/ser2net-ctl /opt/ham-cockpit/bin/station-net /opt/ham-cockpit/bin/station-svc /opt/ham-cockpit/bin/station-upd /opt/ham-cockpit/bin/lextel-bt /opt/ham-cockpit/bin/vfo-display-ctl /opt/ham-cockpit/bin/vfo-display-kiosk /opt/ham-cockpit/bin/vfo-display-idle /opt/ham-cockpit/bin/ldg-serial /opt/ham-cockpit/bin/mmdvm-ctl
chmod 0755 /opt/ham-cockpit/bin/root-login /opt/ham-cockpit/bin/station-user /opt/ham-cockpit/bin/ser2net-ctl /opt/ham-cockpit/bin/station-net /opt/ham-cockpit/bin/station-svc /opt/ham-cockpit/bin/station-upd /opt/ham-cockpit/bin/lextel-bt /opt/ham-cockpit/bin/vfo-display-ctl /opt/ham-cockpit/bin/vfo-display-kiosk /opt/ham-cockpit/bin/vfo-display-idle /opt/ham-cockpit/bin/ldg-serial /opt/ham-cockpit/bin/mmdvm-ctl
chown -R hamcockpit:hamcockpit /opt/lextel
chmod 0775 /opt/lextel

if [[ ! -f /opt/ser2net/services.json ]]; then
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/deploy/ser2net/ser2net.yaml" /opt/ser2net/ser2net.yaml
fi
chown -R hamcockpit:hamcockpit /opt/ser2net
chmod 0775 /opt/ser2net
cp -a "$ROOT/deploy/wavelog/docker-compose.yml" "$ROOT/deploy/wavelog/wavelog-ctl.sh" "$ROOT/deploy/wavelog/.env.example" /opt/wavelog/
chmod +x /opt/wavelog/wavelog-ctl.sh
if [[ ! -f /opt/wavelog/.env ]]; then
  PW="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 20)"
  printf 'WAVELOG_DB_PASSWORD=%s\n' "$PW" >/opt/wavelog/.env
  chmod 600 /opt/wavelog/.env
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
install_unit() {
  local name="$1"
  if [[ ! -f "/etc/systemd/system/$name" && ! -f "/lib/systemd/system/$name" ]]; then
    install -m 0644 "$ROOT/deploy/mmdvm/$name" "/etc/systemd/system/$name"
  fi
}
install_unit mmdvmhost.service
install_unit dmrgateway.service
install_unit ysfgateway.service
install_unit ircddbgateway.service
install_unit nextiondriver.service
# Binários g4klx (Host + DMR + YSF + D-Star). MMDVM_BUILD_BINARIES=0 para pular.
if [[ "${MMDVM_BUILD_BINARIES:-auto}" != "0" ]]; then
  if [[ "${MMDVM_BUILD_BINARIES:-}" == "1" || ! -x /usr/local/bin/MMDVMHost ]]; then
    chmod +x "$ROOT/deploy/mmdvm/build-binaries.sh" || true
    bash "$ROOT/deploy/mmdvm/build-binaries.sh" || echo "AVISO: build MMDVM falhou — console grava INI mesmo assim" >&2
  fi
fi
install -m 0644 "$HERE/ham-cockpit-vfo.service" /etc/systemd/system/ham-cockpit-vfo.service
install -m 0644 "$HERE/ham-cockpit-vfo-idle.service" /etc/systemd/system/ham-cockpit-vfo-idle.service
install -d -o hamcockpit -g hamcockpit /var/lib/hamcockpit /var/lib/hamcockpit/chromium
loginctl enable-linger hamcockpit 2>/dev/null || true

install -m 0644 "$HERE/nginx-ham-cockpit.conf" /etc/nginx/sites-available/ham-cockpit
ln -sfn /etc/nginx/sites-available/ham-cockpit /etc/nginx/sites-enabled/ham-cockpit
rm -f /etc/nginx/sites-enabled/default
systemctl disable dnsmasq.service 2>/dev/null || true
systemctl daemon-reload || true
systemctl unmask ssh.service 2>/dev/null || true
systemctl enable ssh.service 2>/dev/null || systemctl enable sshd.service 2>/dev/null || true
systemctl enable docker.service nginx.service || true
systemctl enable ham-cockpit.target ham-cockpit.service ham-cockpit-ap.service first-boot.service || true
systemctl enable ser2net.service rigctld@ic705.service wavelog.service waveloggate.service || true
systemctl enable nextiondriver.service mmdvmhost.service dmrgateway.service ysfgateway.service ircddbgateway.service 2>/dev/null || true
systemctl enable seatd.service ham-cockpit-vfo.service ham-cockpit-vfo-idle.service || true
systemctl enable waveloggate.service || true
if [[ "$CHROOT" != "1" ]]; then
  systemctl enable --now ham-cockpit.target || systemctl start ham-cockpit.target || true
  systemctl restart waveloggate.service || systemctl start waveloggate.service || true
fi

echo "estação habilitada no boot · ham-cockpit.target"
echo "console  http://192.168.4.1  (AP)  ou  http://$(hostname -I | awk '{print $1}')"
echo "wavelog  http://IP:8086/install  (DB host: wavelog-db)"
echo "ssh      utilizadores sudo (hamcockpit / admin) · porta 22 · sem root por senha"
echo "hdmi     VFO em tela cheia · CTRL+X volta ao console · 10 min no CLI reabre o VFO"
