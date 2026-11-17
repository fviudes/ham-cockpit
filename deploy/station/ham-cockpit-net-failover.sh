#!/bin/bash
# Uplink: perda do carrier Ethernet → Wi‑Fi STA na ordem de /opt/ham-cockpit/net/config.json.
# Volta do cabo com link=ethernet → prefere cabo (STA desce; AP Ham Cockpit intacto).
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
CONFIG=/opt/ham-cockpit/net/config.json
STAMP=/run/ham-cockpit-net-failover
NET=/opt/ham-cockpit/bin/station-net

mkdir -p "$STAMP"
exec 9>"$STAMP/lock"
flock -n 9 || exit 0

eth_dev() {
  local d
  for d in eth0 end0 enp1s0 eno1; do
    [[ -d /sys/class/net/$d ]] && { echo "$d"; return 0; }
  done
  return 1
}

eth_carrier_up() {
  local eth="$1" c
  c="$(cat "/sys/class/net/$eth/carrier" 2>/dev/null)" || return 1
  [[ "$c" == "1" ]]
}

eth_connected() {
  local eth="$1" st
  st="$(nmcli -t -f DEVICE,STATE device status 2>/dev/null | awk -F: -v e="$eth" '$1==e{print $2; exit}')"
  [[ "$st" == "connected" ]]
}

wifi_sta_name() {
  nmcli -t -f NAME,TYPE con show --active 2>/dev/null \
    | awk -F: '$2=="802-11-wireless" && $1!="Ham-Cockpit-AP" {print $1; exit}'
}

has_default_route() {
  ip -4 route show default 2>/dev/null | grep -q .
}

link_pref() {
  [[ -f "$CONFIG" ]] || { echo "wifi"; return; }
  python3 - "$CONFIG" <<'PY' 2>/dev/null || echo wifi
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("wifi")
else:
    print("ethernet" if d.get("link") == "ethernet" else "wifi")
PY
}

ETH="$(eth_dev || true)"
[[ -n "$ETH" ]] || exit 0

if ! systemctl is-active --quiet NetworkManager.service 2>/dev/null; then
  exit 0
fi

PREF="$(link_pref)"

if eth_carrier_up "$ETH"; then
  echo 1 >"$STAMP/carrier"
  if [[ "$PREF" == "ethernet" ]]; then
    sta="$(wifi_sta_name || true)"
    if [[ -n "$sta" ]] || ! eth_connected "$ETH"; then
      if [[ -x "$NET" ]]; then
        "$NET" link ethernet >/dev/null 2>&1 \
          && logger -t ham-cockpit-net-failover "cabo ativo — uplink Ethernet"
      fi
    fi
  fi
  exit 0
fi

echo 0 >"$STAMP/carrier"

if has_default_route; then
  sta="$(wifi_sta_name || true)"
  [[ -n "$sta" ]] && exit 0
fi

if [[ "$PREF" != "ethernet" ]] && has_default_route; then
  exit 0
fi

[[ -x "$NET" ]] || exit 0
if "$NET" failover; then
  logger -t ham-cockpit-net-failover "failover Wi‑Fi após perda do cabo"
fi
exit 0