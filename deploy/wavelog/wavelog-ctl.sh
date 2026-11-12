#!/bin/bash
# Sobe / para o compose do Wavelog em /opt/wavelog.
# .env: gera WAVELOG_DB_PASSWORD só se faltar — nunca rotaciona senha existente.
set -euo pipefail
DIR="${WAVELOG_DIR:-/opt/wavelog}"
cd "$DIR"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "docker compose não encontrado" >&2
    exit 1
  fi
}

ensure_env() {
  if [[ -f "$DIR/.env" ]]; then
    sed -i 's/\r$//' "$DIR/.env" 2>/dev/null || true
  fi
  if [[ -f "$DIR/.env" ]] && grep -q '^WAVELOG_DB_PASSWORD=.' "$DIR/.env"; then
    return 0
  fi
  if [[ -f "$DIR/.env" ]]; then
    echo "WAVELOG_DB_PASSWORD ausente em $DIR/.env" >&2
    return 1
  fi
  PW="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 20)"
  printf 'WAVELOG_DB_PASSWORD=%s\n' "$PW" >"$DIR/.env"
  if getent passwd hamcockpit >/dev/null 2>&1; then
    chown hamcockpit:hamcockpit "$DIR/.env" || true
  fi
  chmod 640 "$DIR/.env"
  echo "criado $DIR/.env (senha do MariaDB gerada uma vez)"
}

# Volume já inicializado sem MARIADB_USER não cria o usuário depois — alinha ao .env sem trocar senha.
ensure_app_db() {
  local pw line
  line="$(grep '^WAVELOG_DB_PASSWORD=' "$DIR/.env" 2>/dev/null || true)"
  pw="${line#WAVELOG_DB_PASSWORD=}"
  pw="${pw%$'\r'}"
  pw="${pw#\"}"
  pw="${pw%\"}"
  [[ -n "$pw" ]] || return 0
  # Só docker exec no container — nunca socket mysql do host.
  for _ in $(seq 1 30); do
    docker exec wavelog-db mariadb -uroot -e "SELECT 1" >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec -i wavelog-db mariadb -uroot <<SQL
CREATE DATABASE IF NOT EXISTS wavelog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'wavelog'@'%' IDENTIFIED BY '${pw}';
CREATE USER IF NOT EXISTS 'wavelog'@'localhost' IDENTIFIED BY '${pw}';
GRANT ALL PRIVILEGES ON wavelog.* TO 'wavelog'@'%';
GRANT ALL PRIVILEGES ON wavelog.* TO 'wavelog'@'localhost';
FLUSH PRIVILEGES;
SQL
}

case "${1:-}" in
  pull)
    ensure_env
    compose pull
    compose up -d --remove-orphans
    ensure_app_db
    ;;
  start)
    ensure_env
    shopt -s nullglob
    for t in "$DIR"/images/*.tar "$DIR"/images/*.tar.gz "$DIR"/images/*.tgz; do
      docker load -i "$t" || true
    done
    shopt -u nullglob
    # --pull=never: usa só o que já está local (bake/first-boot load). Sem rede.
    if ! compose up -d --pull=never --remove-orphans; then
      compose up -d --remove-orphans
    fi
    ensure_app_db
    ;;
  stop) compose stop ;;
  db-start)
    ensure_env
    compose up -d wavelog-db
    ensure_app_db
    ;;
  db-stop) compose stop wavelog-db ;;
  ensure-db)
    ensure_env
    ensure_app_db
    ;;
  *)
    echo "uso: $0 start|stop|pull|ensure-db|db-start|db-stop" >&2
    exit 1
    ;;
esac
