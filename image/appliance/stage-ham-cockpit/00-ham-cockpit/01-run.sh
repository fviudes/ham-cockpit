#!/bin/bash -e
# Legado pi-gen (Raspberry Pi OS). A imagem oficial agora é Ubuntu Server 24.04:
#   sudo bash image/appliance/build.sh
# Overlay Ham Cockpit no rootfs (Node, /opt, systemd, imagens Docker arm64).
STAGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="${STAGE_ROOT}/files/seed"
install -d "${ROOTFS_DIR}/opt/ham-cockpit-seed" "${ROOTFS_DIR}/opt/wavelog/images"
rsync -a "${SEED}/" "${ROOTFS_DIR}/opt/ham-cockpit-seed/"
if compgen -G "${STAGE_ROOT}/files/docker/*.tar" >/dev/null; then
  cp -a "${STAGE_ROOT}/files/docker/"*.tar "${ROOTFS_DIR}/opt/wavelog/images/"
fi

on_chroot << 'EOF'
set -e
export DEBIAN_FRONTEND=noninteractive
export HAMCOCKPIT_CHROOT=1
if ! command -v node >/dev/null || ! node -v | grep -qE '^v(2[0-9]|[3-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
chmod +x /opt/ham-cockpit-seed/deploy/station/install-station.sh
bash /opt/ham-cockpit-seed/deploy/station/install-station.sh
systemctl enable ssh
systemctl enable ham-cockpit.target
systemctl enable waveloggate.service
systemctl set-default multi-user.target
echo "Ham Cockpit OS pronto (Debian Bookworm Lite · Pi 3/4)"
EOF
