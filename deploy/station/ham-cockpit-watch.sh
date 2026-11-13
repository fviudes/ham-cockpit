#!/bin/bash
# Vigia a estação fora do Node. Se o console cair, este timer continua.
# Sobe o que boot.json marca para iniciar e que não está active.
# Não sobe ampctld@spe: a SPE fala o protocolo nativo dentro do console.
# rigctld que saiu 0 (sem rádio cadastrado) não é queda — não entra em loop.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
BOOT=/opt/ham-cockpit/services/boot.json
STAMP_DIR=/run/ham-cockpit-watch
RETRY_SEC=180

mkdir -p "$STAMP_DIR"
exec 9>"$STAMP_DIR/lock"
flock -n 9 || exit 0

want() {
  python3 -c '
import json, sys
key, path = sys.argv[1], sys.argv[2]
try:
    data = json.load(open(path, encoding="utf-8"))
except Exception:
    print("1")
    raise SystemExit
print("0" if data.get(key, True) is False else "1")
' "$1" "$BOOT" 2>/dev/null || echo 1
}

classify() {
  local unit="$1" active result
  systemctl cat "$unit" >/dev/null 2>&1 || { echo missing; return; }
  active="$(systemctl show -p ActiveState --value "$unit" 2>/dev/null || echo inactive)"
  case "$active" in
    active|activating) echo "$active"; return ;;
  esac
  result="$(systemctl show -p Result --value "$unit" 2>/dev/null || echo unknown)"
  if [[ "$result" == "success" ]]; then echo success; else echo down; fi
}

recent() {
  local f="$STAMP_DIR/$1" now age
  [[ -f "$f" ]] || return 1
  now="$(date +%s)"
  age=$(( now - $(stat -c %Y "$f" 2>/dev/null || echo 0) ))
  [[ "$age" -lt "$RETRY_SEC" ]]
}

mark() { touch "$STAMP_DIR/$1"; }

start_unit() {
  local id="$1" unit="$2"
  systemctl reset-failed "$unit" >/dev/null 2>&1 || true
  if systemctl start --no-block "$unit"; then
    logger -t ham-cockpit-watch "subiu $unit"
  else
    logger -t ham-cockpit-watch "falha ao subir $unit"
  fi
  mark "$id"
}

# mode stay: tem de ficar no ar (inactive também sobe).
# mode crash: saída 0 não religa (hamlib sem modelo).
consider() {
  local boot_id="$1" stamp="$2" unit="$3" mode="$4" st
  [[ "$(want "$boot_id")" == "1" ]] || return 0
  st="$(classify "$unit")"
  case "$st" in
    active|activating|missing) return 0 ;;
    success) [[ "$mode" == "stay" ]] || return 0 ;;
  esac
  if recent "$stamp"; then return 0; fi
  start_unit "$stamp" "$unit"
}

consider web web ham-cockpit.service stay
consider web nginx nginx.service stay
if [[ "$(want wavelog)" == "1" || "$(want db)" == "1" ]]; then
  consider docker docker docker.service stay
fi
consider ser2net ser2net ser2net.service stay
consider wlg wlg waveloggate.service stay
consider bluetooth bluetooth bluetooth.service stay
consider wifi wifi ham-cockpit-ap.service stay
consider wavelog wavelog wavelog.service stay
if [[ "$(want db)" == "1" || "$(want wavelog)" == "1" ]] && command -v docker >/dev/null 2>&1; then
  running="$(docker inspect -f '{{.State.Running}}' wavelog-db 2>/dev/null || echo false)"
  if [[ "$running" != "true" ]] && ! recent db; then
    docker start wavelog-db >/dev/null 2>&1 || true
    mark db
    logger -t ham-cockpit-watch "subiu container wavelog-db"
  fi
fi
if [[ "$(want mmdvm)" == "1" ]]; then
  consider mmdvm nextion nextiondriver.service stay
  consider mmdvm mmdvm mmdvmhost.service stay
  consider mmdvm dmr dmrgateway.service stay
  consider mmdvm ysf ysfgateway.service stay
  consider mmdvm ircddb ircddbgateway.service stay
  consider mmdvm mosquitto mosquitto.service stay
fi
consider hamlib hamlib 'rigctld@ic705.service' crash
exit 0
