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
# Swap + ajustes de RAM (a imagem é gerada em chroot, sem swapon real).
[[ -x /opt/ham-cockpit/bin/hc-tune.sh ]] && /opt/ham-cockpit/bin/hc-tune.sh || true

# UART Dual Hat (PL011 /dev/ttyAMA0) — mesmo critério do install-station.
# Bluetooth na mini-UART; ttyAMA0 no Dual Hat.
# No Pi 4: core_freq_min=500 (VPU não cai; baud estável) e arm_boost=1. Sem core_freq= fixo.
model="$(tr -d '\0' </proc/device-tree/model 2>/dev/null || true)"
if [[ "$model" == *Raspberry* ]]; then
  for cfg in /boot/firmware/config.txt /boot/config.txt; do
    [[ -f "$cfg" ]] || continue
    grep -qE '^[[:space:]]*enable_uart=1' "$cfg" || echo 'enable_uart=1' >>"$cfg"
    sed -i -E '/^[[:space:]]*dtoverlay=(miniuart-bt|pi3-miniuart-bt|pi3-disable-bt|disable-bt)([[:space:]]|$)/d' "$cfg"
    uart_note='# Bluetooth na mini-UART; ttyAMA0 no Dual Hat; core_freq_min=500 só impede o VPU de cair (baud estável); arm_boost devolve o turbo da CPU.'
    if grep -qF 'Bluetooth na mini-UART' "$cfg"; then
      sed -i -E "s|^[[:space:]]*# Bluetooth na mini-UART.*|${uart_note}|" "$cfg"
    else
      echo "$uart_note" >>"$cfg"
    fi
    echo 'dtoverlay=miniuart-bt' >>"$cfg"
    if grep -qE '^\[pi4\][[:space:]]*$' "$cfg"; then
      tmp="$(mktemp)"
      awk '
        function emit() {
          if (!seen_m) print "core_freq_min=500"
          if (!seen_b) print "arm_boost=1"
          seen_m = 1
          seen_b = 1
        }
        /^\[/ {
          if (in4) emit()
          in4 = ($0 ~ /^\[pi4\][[:space:]]*$/)
          inall = ($0 ~ /^\[all\][[:space:]]*$/)
          print
          next
        }
        (in4 || inall) && /^[[:space:]]*core_freq_min=/ {
          if (in4) { print "core_freq_min=500"; seen_m=1 }
          next
        }
        (in4 || inall) && /^[[:space:]]*core_freq=/ { next }
        in4 && /^[[:space:]]*arm_boost=/ { print "arm_boost=1"; seen_b=1; next }
        { print }
        END { if (in4) emit() }
      ' "$cfg" >"$tmp" && cat "$tmp" >"$cfg"
      rm -f "$tmp"
    elif [[ "$model" == *"Pi 4"* || "$model" == *"Pi 400"* || "$model" == *"Compute Module 4"* ]]; then
      sed -i -E '/^[[:space:]]*core_freq=/d' "$cfg"
      sed -i -E '/^[[:space:]]*core_freq_min=/d' "$cfg"
      echo 'core_freq_min=500' >>"$cfg"
      if grep -qE '^[[:space:]]*arm_boost=' "$cfg"; then
        sed -i -E 's/^[[:space:]]*arm_boost=.*/arm_boost=1/' "$cfg"
      else
        echo 'arm_boost=1' >>"$cfg"
      fi
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

# Imagem completa: load dos tar.gz embutidos no bake (sem pull). Fallback pull só se faltar.
shopt -s nullglob
for t in /opt/wavelog/images/*.tar /opt/wavelog/images/*.tar.gz /opt/wavelog/images/*.tgz; do
  echo "first-boot: docker load $(basename "$t")"
  docker load -i "$t" || true
done
shopt -u nullglob

systemctl enable --now ssh.service 2>/dev/null || systemctl enable --now sshd.service 2>/dev/null || true
systemctl enable wavelog.service 2>/dev/null || true
if [[ -x /opt/wavelog/wavelog-ctl.sh ]]; then
  # Preferir imagens locais; pull só se start falhar (rede).
  if ! /opt/wavelog/wavelog-ctl.sh start; then
    echo "AVISO: wavelog start local falhou — tentando pull" >&2
    /opt/wavelog/wavelog-ctl.sh pull || true
  fi
  /opt/wavelog/wavelog-ctl.sh ensure-db || true
fi
systemctl start wavelog.service || true
systemctl enable --now waveloggate.service || systemctl start waveloggate.service || true
touch "$STAMP"
echo "Ham Cockpit first-boot ok · http://192.168.4.1  (AP)  ou  http://$(hostname -I | awk '{print $1}')"
