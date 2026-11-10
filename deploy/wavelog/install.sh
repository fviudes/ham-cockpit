#!/bin/bash
# Instala o Wavelog no Pi e habilita no boot (docker + MariaDB + PHP + Gate).
# Uso (root): sudo bash deploy/wavelog/install.sh
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "execute como root: sudo bash $0" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${WAVELOG_DIR:-/opt/wavelog}"
GATE_DEST="/opt/wavelog-gate"

if ! command -v docker >/dev/null 2>&1; then
  echo "instalando docker..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
fi
if getent passwd hamcockpit >/dev/null 2>&1; then
  usermod -aG docker hamcockpit || true
fi

mkdir -p "$DEST"
cp -a "$HERE/docker-compose.yml" "$HERE/wavelog-ctl.sh" "$HERE/.env.example" "$HERE/install.sh" "$HERE/wavelog.service" "$DEST/"
chmod +x "$DEST/wavelog-ctl.sh" "$DEST/install.sh"

if [[ ! -f "$DEST/.env" ]]; then
  PW="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 20)"
  printf 'WAVELOG_DB_PASSWORD=%s\n' "$PW" >"$DEST/.env"
  echo "criado $DEST/.env (senha do MariaDB gerada)"
fi
# Serviço hamcockpit precisa ler/gravar no backup/restore (não world-readable).
if [[ -f "$DEST/.env" ]]; then
  if getent passwd hamcockpit >/dev/null 2>&1; then
    chown hamcockpit:hamcockpit "$DEST/.env"
  fi
  chmod 640 "$DEST/.env"
fi

install -m 0644 "$HERE/wavelog.service" /etc/systemd/system/wavelog.service
GATE_UNIT=""
if [[ -f "$HERE/../wavelog-gate/waveloggate.service" ]]; then
  GATE_UNIT="$HERE/../wavelog-gate/waveloggate.service"
elif [[ -f "$GATE_DEST/waveloggate.service" ]]; then
  GATE_UNIT="$GATE_DEST/waveloggate.service"
fi
if [[ -f "$GATE_UNIT" ]]; then
  mkdir -p "$GATE_DEST"
  cp -a "$GATE_UNIT" "$GATE_DEST/waveloggate.service"
  install -m 0644 "$GATE_DEST/waveloggate.service" /etc/systemd/system/waveloggate.service
fi
if [[ -f "$HERE/../wavelog-gate/wavelog-gate.mjs" ]]; then
  install -m 0755 "$HERE/../wavelog-gate/wavelog-gate.mjs" "$GATE_DEST/wavelog-gate.mjs"
fi
if [[ -f "$HERE/../wavelog-gate/VERSION" ]]; then
  install -m 0644 "$HERE/../wavelog-gate/VERSION" "$GATE_DEST/VERSION"
fi
if [[ -f "$HERE/../wavelog-gate/wavelog-gate.env" && ! -f "$GATE_DEST/wavelog-gate.env" ]]; then
  install -m 0640 "$HERE/../wavelog-gate/wavelog-gate.env" "$GATE_DEST/wavelog-gate.env"
fi
chown -R hamcockpit:hamcockpit "$GATE_DEST" 2>/dev/null || true

systemctl daemon-reload
systemctl unmask docker.service docker.socket 2>/dev/null || true
systemctl enable docker.service docker.socket 2>/dev/null || true
systemctl enable --now docker.service
# Espera o sock antes do compose (mesmo critério do wavelog.service).
for _ in $(seq 1 60); do
  docker info >/dev/null 2>&1 && break
  sleep 1
done
systemctl enable --now wavelog.service
if systemctl cat waveloggate.service >/dev/null 2>&1; then
  systemctl enable waveloggate.service
  systemctl start waveloggate.service || true
fi

echo "Wavelog habilitado no boot · http://$(hostname -I | awk '{print $1}'):8086/install"
echo "host do banco no instalador web: wavelog-db"
