#!/bin/bash
# Hotspot Ham-Cockpit-XXXX em 192.168.4.1 quando não há cabo de rede com link.
# Se o cabo Ethernet estiver plugado, o AP NÃO sobe (de propósito) — use o IP da LAN.
set -euo pipefail

IFACE="${HAMCOCKPIT_WLAN:-${CATBRIDGE_WLAN:-wlan0}}"
CONN="Ham-Cockpit-AP"
LOG_TAG="ham-cockpit-ap"

log() { echo "$LOG_TAG: $*" >&2; }

has_lan() {
  local d
  for d in eth0 end0 enp1s0 eno1; do
    [[ -d /sys/class/net/$d ]] || continue
    [[ $(cat /sys/class/net/$d/carrier 2>/dev/null || echo 0) == 1 ]] && return 0
  done
  return 1
}

wait_iface() {
  local i
  for i in $(seq 1 30); do
    if [[ -d /sys/class/net/$IFACE ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if has_lan; then
  log "cabo com link detectado — AP desligado (use o IP da LAN / ham-cockpit.local)"
  nmcli -t -f NAME con show --active 2>/dev/null | grep -qx "$CONN" && nmcli con down "$CONN" || true
  exit 0
fi

# rfkill / regulatório (sem país o AP do Pi costuma falhar em silêncio)
rfkill unblock wifi 2>/dev/null || rfkill unblock wlan 2>/dev/null || true
iw reg set BR 2>/dev/null || true

if ! wait_iface; then
  log "interface $IFACE não apareceu — AP não sobe"
  exit 1
fi

# Aguarda o NetworkManager gerenciar o rádio
for i in $(seq 1 20); do
  if nmcli -t device status 2>/dev/null | grep -q "^${IFACE}:"; then
    break
  fi
  sleep 1
done

SERIAL=$(tr -d '\0' </sys/firmware/devicetree/base/serial-number 2>/dev/null || echo a4f2)
TAIL=$(echo "$SERIAL" | tail -c 5 | tr '[:lower:]' '[:upper:]')
[[ -n "$TAIL" ]] || TAIL="A4F2"
SSID="Ham-Cockpit-${TAIL}"
PSK="${HAMCOCKPIT_AP_PSK:-hamcockpit}"

nmcli radio wifi on 2>/dev/null || true
nmcli con delete "$CONN" >/dev/null 2>&1 || true
nmcli con add type wifi ifname "$IFACE" con-name "$CONN" autoconnect yes ssid "$SSID"
nmcli con modify "$CONN" \
  802-11-wireless.mode ap \
  802-11-wireless.band bg \
  802-11-wireless.channel 6 \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "$PSK" \
  ipv4.method shared \
  ipv4.addresses 192.168.4.1/24 \
  ipv6.method disabled \
  connection.autoconnect yes

if ! nmcli con up "$CONN"; then
  log "falha ao subir AP $SSID em $IFACE"
  exit 1
fi

log "AP $SSID · http://192.168.4.1 · senha $PSK"
echo "AP $SSID  http://192.168.4.1  PSK $PSK"
