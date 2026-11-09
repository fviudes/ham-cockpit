#!/bin/bash
# Sobe / para o compose do Wavelog em /opt/wavelog.
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

case "${1:-}" in
  pull)
    compose pull
    compose up -d --remove-orphans
    ;;
  start)
    if ls "$DIR"/images/*.tar >/dev/null 2>&1; then
      for t in "$DIR"/images/*.tar; do docker load -i "$t" || true; done
    fi
    compose up -d --remove-orphans
    ;;
  stop) compose stop ;;
  *)
    echo "uso: $0 start|stop|pull" >&2
    exit 1
    ;;
esac
