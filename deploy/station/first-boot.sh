#!/bin/bash
# Primeiro boot da imagem: hostname, imagens Docker, marca o cartão como provisionado.
set -euo pipefail
STAMP=/var/lib/hamcockpit/first-boot-done
mkdir -p /var/lib/hamcockpit
hostnamectl set-hostname ham-cockpit || true

if ls /opt/wavelog/images/*.tar >/dev/null 2>&1; then
  for t in /opt/wavelog/images/*.tar; do
    docker load -i "$t" || true
  done
fi

systemctl enable --now ssh.service 2>/dev/null || systemctl enable --now sshd.service 2>/dev/null || true
systemctl start wavelog.service || true
systemctl enable --now waveloggate.service || systemctl start waveloggate.service || true
touch "$STAMP"
echo "Ham Cockpit first-boot ok · http://192.168.4.1  (AP)  ou  http://$(hostname -I | awk '{print $1}')"
