#!/bin/bash
# Primeiro boot da imagem: hostname, imagens Docker, sobe Wavelog, marca provisionado.
set -euo pipefail
STAMP=/var/lib/hamcockpit/first-boot-done
mkdir -p /var/lib/hamcockpit
hostnamectl set-hostname ham-cockpit || true

systemctl unmask docker.service docker.socket 2>/dev/null || true
systemctl enable docker.service docker.socket 2>/dev/null || true
systemctl start docker.service 2>/dev/null || true

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
fi
systemctl start wavelog.service || true
systemctl enable --now waveloggate.service || systemctl start waveloggate.service || true
touch "$STAMP"
echo "Ham Cockpit first-boot ok · http://192.168.4.1  (AP)  ou  http://$(hostname -I | awk '{print $1}')"
