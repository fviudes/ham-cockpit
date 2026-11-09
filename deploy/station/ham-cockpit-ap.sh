#!/bin/bash
# Hotspot Ham-Cockpit-XXXX em 192.168.4.1 quando não há Ethernet.
set -euo pipefail
IFACE="${HAMCOCKPIT_WLAN:-${CATBRIDGE_WLAN:-wlan0}}"
CONN="Ham-Cockpit-AP"

has_lan() {
  local d
  for d in eth0 end0 enp1s0; do
    [[ -d /sys/class/net/$d ]] || continue
    [[ $(cat /sys/class/net/$d/carrier 2>/dev/null || echo 0) == 1 ]] && return 0
  done
  return 1
}

if has_lan; then
  nmcli -t -f NAME con show --active | grep -qx "$CONN" && nmcli con down "$CONN" || true
  exit 0
fi

[[ -d /sys/class/net/$IFACE ]] || exit 0

SERIAL=$(tr -d '\0' </sys/firmware/devicetree/base/serial-number 2>/dev/null || echo a4f2)
TAIL=$(echo "$SERIAL" | tail -c 5 | tr '[:lower:]' '[:upper:]')
SSID="Ham-Cockpit-${TAIL}"
PSK="${HAMCOCKPIT_AP_PSK:-hamcockpit}"

nmcli con delete "$CONN" >/dev/null 2>&1 || true
nmcli con add type wifi ifname "$IFACE" con-name "$CONN" autoconnect yes ssid "$SSID"
nmcli con modify "$CONN" \
  802-11-wireless.mode ap \
  802-11-wireless.band bg \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "$PSK" \
  ipv4.method shared \
  ipv4.addresses 192.168.4.1/24 \
  ipv6.method disabled
nmcli con up "$CONN"
echo "AP $SSID  http://192.168.4.1  PSK $PSK"
