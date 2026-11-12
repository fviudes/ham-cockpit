#!/bin/bash
# Primeiro boot da imagem: hostname, imagens Docker, sobe Wavelog, marca provisionado.
# Idempotente com o que o bake já fez (UART Dual, Nextion, mosquitto) — instalação limpa não re-fixa.
set -euo pipefail
STAMP=/var/lib/hamcockpit/first-boot-done
mkdir -p /var/lib/hamcockpit
hostnamectl set-hostname ham-cockpit || true

sed -i 's/\r$//' /opt/wavelog/wavelog-ctl.sh 2>/dev/null || true
sed -i 's/\r$//' /opt/ham-cockpit/bin/mmdvm-ctl 2>/dev/null || true
sed -i 's/\r$//' /opt/ham-cockpit/bin/first-boot.sh 2>/dev/null || true

# UART Dual Hat (PL011 /dev/ttyAMA0) — mesmo critério do install-station.
if [[ "$(tr -d '\0' </proc/device-tree/model 2>/dev/null || true)" == *Raspberry* ]]; then
  for cfg in /boot/firmware/config.txt /boot/config.txt; do
    [[ -f "$cfg" ]] || continue
    grep -qE '^[[:space:]]*enable_uart=1' "$cfg" || echo 'enable_uart=1' >>"$cfg"
    if grep -qE '^[[:space:]]*dtoverlay=(miniuart-bt|pi3-miniuart-bt|pi3-disable-bt|disable-bt)' "$cfg"; then
      sed -i -E 's/^[[:space:]]*dtoverlay=(miniuart-bt|pi3-miniuart-bt|pi3-disable-bt|disable-bt).*/dtoverlay=disable-bt/' "$cfg"
    else
      echo 'dtoverlay=disable-bt' >>"$cfg"
    fi
    break
  done
  for cmd in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
    [[ -f "$cmd" ]] || continue
    sed -i -E 's/[[:space:]]*console=(serial0|ttyAMA0|ttyS0)[^[:space:]]*//g' "$cmd"
    break
  done
  systemctl disable --now serial-getty@ttyS0.service serial-getty@ttyAMA0.service 2>/dev/null || true
  systemctl mask serial-getty@ttyS0.service serial-getty@ttyAMA0.service 2>/dev/null || true
fi

systemctl unmask docker.service docker.socket 2>/dev/null || true
systemctl enable docker.service docker.socket 2>/dev/null || true
systemctl start docker.socket 2>/dev/null || true
systemctl start docker.service 2>/dev/null || true
systemctl unmask nextiondriver.service 2>/dev/null || true
systemctl enable mosquitto.service nextiondriver.service 2>/dev/null || true
if command -v mosquitto >/dev/null 2>&1 || [[ -x /usr/sbin/mosquitto ]]; then
  systemctl start mosquitto.service 2>/dev/null || true
fi

echo "first-boot: aguardando API do Docker…"
ready=0
for _ in $(seq 1 90); do
  if docker info >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "AVISO: docker info falhou após 90s — Wavelog pode subir no próximo boot" >&2
fi

if ls /opt/wavelog/images/*.tar >/dev/null 2>&1; then
  for t in /opt/wavelog/images/*.tar; do
    docker load -i "$t" || true
  done
fi

systemctl enable --now ssh.service 2>/dev/null || systemctl enable --now sshd.service 2>/dev/null || true
systemctl enable wavelog.service 2>/dev/null || true
if [[ -x /opt/wavelog/wavelog-ctl.sh ]]; then
  # Compose up (usa tarballs locais se houver; senão tenta pull com rede).
  /opt/wavelog/wavelog-ctl.sh start || /opt/wavelog/wavelog-ctl.sh pull || true
  /opt/wavelog/wavelog-ctl.sh ensure-db || true
fi
systemctl start wavelog.service || true
systemctl enable --now waveloggate.service || systemctl start waveloggate.service || true
touch "$STAMP"
echo "Ham Cockpit first-boot ok · http://192.168.4.1  (AP)  ou  http://$(hostname -I | awk '{print $1}')"
