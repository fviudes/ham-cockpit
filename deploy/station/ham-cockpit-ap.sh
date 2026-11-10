#!/bin/bash
# Hotspot Ham-Cockpit-XXXX em 192.168.4.1 (2,4 GHz).
#
# No Ubuntu 24.04 o caminho “nmcli con add … mode ap” frequentemente
# reporta sucesso SEM propagar o SSID (beacon). O helper
# `nmcli device wifi hotspot` monta o perfil Hotspot completo (RSN/CCMP)
# e é o que realmente aparece no celular. Se o NM falhar, cai para hostapd.
#
# Cabo Ethernet NÃO impede o AP. Só cede se o mesmo wlan já estiver em STA.
set -uo pipefail

PREF_IFACE="${HAMCOCKPIT_WLAN:-${CATBRIDGE_WLAN:-}}"
CONN="Ham-Cockpit-AP"
LOG_TAG="ham-cockpit-ap"
PSK="${HAMCOCKPIT_AP_PSK:-hamcockpit}"
HOSTAPD_CONF="/etc/ham-cockpit/hostapd-ap.conf"
DNSMASQ_CONF="/etc/ham-cockpit/ap-dnsmasq.conf"

log() { echo "$LOG_TAG: $*" >&2; logger -t "$LOG_TAG" "$*" 2>/dev/null || true; }

detect_wlan() {
  local d
  if [[ -n "$PREF_IFACE" && -d /sys/class/net/$PREF_IFACE ]]; then
    echo "$PREF_IFACE"
    return 0
  fi
  d="$(nmcli -t -f DEVICE,TYPE device status 2>/dev/null | awk -F: '$2=="wifi"{print $1; exit}')"
  if [[ -n "$d" ]]; then
    echo "$d"
    return 0
  fi
  for d in /sys/class/net/wl*; do
    [[ -e "$d" ]] || continue
    basename "$d"
    return 0
  done
  return 1
}

has_active_sta() {
  local iface="$1"
  nmcli -t -f NAME,TYPE,DEVICE con show --active 2>/dev/null \
    | awk -F: -v i="$iface" -v ap="$CONN" \
      '$2=="802-11-wireless" && $1!=ap && $1!="Hotspot" && $3==i {found=1} END{exit !found}'
}

ssid_from_serial() {
  local serial tail
  serial="$(tr -d '\0' </sys/firmware/devicetree/base/serial-number 2>/dev/null || echo a4f2)"
  tail="$(printf '%s' "$serial" | tail -c 5 | tr '[:lower:]' '[:upper:]')"
  [[ -n "$tail" ]] || tail="A4F2"
  echo "Ham-Cockpit-${tail}"
}

wait_nm() {
  local i
  for i in $(seq 1 90); do
    if systemctl is-active --quiet NetworkManager.service 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_wlan() {
  local i
  for i in $(seq 1 120); do
    if IFACE="$(detect_wlan)"; then
      echo "$IFACE"
      return 0
    fi
    # Força probe do driver Broadcom/Cypress no Pi
    modprobe brcmfmac 2>/dev/null || true
    rfkill unblock wifi 2>/dev/null || true
    sleep 1
  done
  return 1
}

prepare_radio() {
  local iface="$1"
  rfkill unblock wifi 2>/dev/null || true
  rfkill unblock wlan 2>/dev/null || true
  iw reg set BR 2>/dev/null || true
  # Alguns firmwares só liberam AP depois do país no wpa_supplicant
  mkdir -p /etc/wpa_supplicant
  if [[ ! -f /etc/wpa_supplicant/wpa_supplicant.conf ]] || ! grep -q 'country=' /etc/wpa_supplicant/wpa_supplicant.conf 2>/dev/null; then
    printf 'country=BR\nctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\nupdate_config=1\n' \
      >/etc/wpa_supplicant/wpa_supplicant.conf
  else
    sed -i 's/^country=.*/country=BR/' /etc/wpa_supplicant/wpa_supplicant.conf || true
  fi
  nmcli radio wifi on 2>/dev/null || true
  nmcli device set "$iface" managed yes 2>/dev/null || true
  ip link set "$iface" up 2>/dev/null || true
  local i
  for i in $(seq 1 40); do
    if nmcli -t device status 2>/dev/null | grep -q "^${iface}:"; then
      local state
      state="$(nmcli -t -f DEVICE,STATE device status 2>/dev/null | awk -F: -v i="$iface" '$1==i{print $2; exit}')"
      log "NM $iface state=${state:-?}"
      return 0
    fi
    sleep 1
  done
  return 1
}

ap_is_beaconing() {
  local iface="$1"
  # type AP no iw = beacon ativo
  iw dev "$iface" info 2>/dev/null | grep -qiE 'type[[:space:]]+AP'
}

has_ap_addr() {
  local iface="$1"
  ip -4 addr show "$iface" 2>/dev/null | grep -q '192\.168\.4\.1'
}

active_wifi_name() {
  local iface="$1"
  nmcli -t -f NAME,TYPE,DEVICE con show --active 2>/dev/null \
    | awk -F: -v i="$iface" '$2=="802-11-wireless" && $3==i {print $1; exit}'
}

pin_ap_address() {
  local name="$1"
  [[ -n "$name" ]] || return 1
  nmcli con modify "$name" \
    connection.id "$CONN" \
    connection.autoconnect yes \
    connection.autoconnect-priority 100 \
    ipv4.method shared \
    ipv4.addresses 192.168.4.1/24 \
    ipv6.method disabled \
    802-11-wireless.band bg \
    802-11-wireless.channel 6 \
    802-11-wireless-security.key-mgmt wpa-psk \
    802-11-wireless-security.proto rsn \
    802-11-wireless-security.pairwise ccmp \
    802-11-wireless-security.group ccmp \
    802-11-wireless-security.psk "$PSK" 2>/dev/null || \
  nmcli con modify "$name" \
    ipv4.method shared \
    ipv4.addresses 192.168.4.1/24 \
    ipv6.method disabled
  # Renomear para CONN se ainda for "Hotspot"
  local id
  id="$(nmcli -t -f connection.id con show "$name" 2>/dev/null || true)"
  if [[ "$id" != "$CONN" ]]; then
    nmcli con modify "$name" connection.id "$CONN" 2>/dev/null || true
  fi
}

# ── Path A: helper oficial do NM (propaga SSID de verdade no Ubuntu 24.04) ──
bring_up_hotspot_helper() {
  local iface="$1"
  local ssid="$2"

  nmcli con delete "$CONN" >/dev/null 2>&1 || true
  nmcli con delete Hotspot >/dev/null 2>&1 || true
  # Remove perfil órfão com o mesmo SSID
  nmcli -t -f NAME,TYPE con show 2>/dev/null | awk -F: -v s="$ssid" '$2=="802-11-wireless" && $1==s {print $1}' \
    | while read -r n; do nmcli con delete "$n" >/dev/null 2>&1 || true; done

  log "tentando nmcli device wifi hotspot ($iface / $ssid)"
  if ! nmcli -w 60 device wifi hotspot ifname "$iface" ssid "$ssid" password "$PSK"; then
    log "hotspot helper falhou"
    return 1
  fi

  local name
  name="$(active_wifi_name "$iface")"
  [[ -n "$name" ]] || name="Hotspot"
  pin_ap_address "$name"
  # Reaplica endereço fixo 192.168.4.1
  nmcli -w 30 con up "$CONN" ifname "$iface" 2>/dev/null \
    || nmcli -w 30 con up "$name" ifname "$iface" 2>/dev/null \
    || nmcli -w 30 con up Hotspot ifname "$iface" 2>/dev/null \
    || true

  sleep 2
  if ap_is_beaconing "$iface" || has_ap_addr "$iface"; then
    log "AP OK via hotspot helper · $ssid · http://192.168.4.1 · iface $iface"
    echo "AP $ssid  http://192.168.4.1  PSK $PSK  IFACE $iface  VIA=nm-hotspot"
    return 0
  fi
  log "hotspot helper subiu mas beacon/IP ausentes"
  iw dev "$iface" info >&2 || true
  return 1
}

# ── Path B: perfil manual com RSN/CCMP explícitos ──
bring_up_manual_nm() {
  local iface="$1"
  local ssid="$2"

  log "tentando perfil NM manual com RSN/CCMP ($iface)"
  nmcli con delete "$CONN" >/dev/null 2>&1 || true
  nmcli con delete Hotspot >/dev/null 2>&1 || true

  if ! nmcli con add type wifi ifname "$iface" con-name "$CONN" autoconnect yes ssid "$ssid"; then
    return 1
  fi
  nmcli con modify "$CONN" \
    connection.interface-name "$iface" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    802-11-wireless.channel 6 \
    802-11-wireless.ssid "$ssid" \
    802-11-wireless-security.key-mgmt wpa-psk \
    802-11-wireless-security.proto rsn \
    802-11-wireless-security.pairwise ccmp \
    802-11-wireless-security.group ccmp \
    802-11-wireless-security.psk "$PSK" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PSK" \
    ipv4.method shared \
    ipv4.addresses 192.168.4.1/24 \
    ipv6.method disabled \
    connection.autoconnect yes \
    connection.autoconnect-priority 100

  if ! nmcli -w 45 con up "$CONN" ifname "$iface"; then
    nmcli device disconnect "$iface" >/dev/null 2>&1 || true
    sleep 2
    nmcli -w 45 con up "$CONN" ifname "$iface" || return 1
  fi

  sleep 2
  if ap_is_beaconing "$iface" || has_ap_addr "$iface"; then
    log "AP OK via perfil manual · $ssid · http://192.168.4.1"
    echo "AP $ssid  http://192.168.4.1  PSK $PSK  IFACE $iface  VIA=nm-manual"
    return 0
  fi
  log "perfil manual ativo sem beacon — falha conhecida do Ubuntu 24.04"
  return 1
}

# ── Path C: hostapd + dnsmasq dedicado (fora do NM) ──
bring_up_hostapd() {
  local iface="$1"
  local ssid="$2"

  command -v hostapd >/dev/null 2>&1 || {
    log "hostapd não instalado — sem fallback"
    return 1
  }

  log "fallback hostapd ($iface / $ssid)"
  # Libera o rádio do NetworkManager
  nmcli con down "$CONN" >/dev/null 2>&1 || true
  nmcli con down Hotspot >/dev/null 2>&1 || true
  nmcli device disconnect "$iface" >/dev/null 2>&1 || true
  nmcli device set "$iface" managed no 2>/dev/null || true

  ip link set "$iface" down 2>/dev/null || true
  ip addr flush dev "$iface" 2>/dev/null || true
  ip addr add 192.168.4.1/24 dev "$iface"
  ip link set "$iface" up

  mkdir -p /etc/ham-cockpit /run/ham-cockpit
  cat >"$HOSTAPD_CONF" <<EOF
interface=$iface
driver=nl80211
ssid=$ssid
hw_mode=g
channel=6
ieee80211n=1
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$PSK
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
country_code=BR
EOF

  cat >"$DNSMASQ_CONF" <<EOF
interface=$iface
bind-interfaces
except-interface=lo
dhcp-range=192.168.4.50,192.168.4.200,255.255.255.0,12h
dhcp-option=3,192.168.4.1
dhcp-option=6,192.168.4.1
EOF

  pkill -f "hostapd $HOSTAPD_CONF" 2>/dev/null || true
  pkill -f "dnsmasq --conf-file=$DNSMASQ_CONF" 2>/dev/null || true
  sleep 1

  if ! hostapd -B "$HOSTAPD_CONF"; then
    log "hostapd falhou ao iniciar"
    nmcli device set "$iface" managed yes 2>/dev/null || true
    return 1
  fi
  dnsmasq --conf-file="$DNSMASQ_CONF" --pid-file=/run/ham-cockpit/ap-dnsmasq.pid || true

  sleep 2
  if ap_is_beaconing "$iface"; then
    log "AP OK via hostapd · $ssid · http://192.168.4.1"
    echo "AP $ssid  http://192.168.4.1  PSK $PSK  IFACE $iface  VIA=hostapd"
    return 0
  fi
  log "hostapd rodando sem type AP visível"
  iw dev "$iface" info >&2 || true
  return 1
}

bring_up() {
  local iface="$1"
  local ssid="$2"

  if has_active_sta "$iface"; then
    log "STA Wi‑Fi ativo em $iface — AP não sobe (rádio único)"
    return 2
  fi

  bring_up_hotspot_helper "$iface" "$ssid" && return 0
  bring_up_manual_nm "$iface" "$ssid" && return 0
  bring_up_hostapd "$iface" "$ssid" && return 0
  return 1
}

# ── main ────────────────────────────────────────────────────────────
systemctl stop dnsmasq.service 2>/dev/null || true
systemctl disable dnsmasq.service 2>/dev/null || true
systemctl mask dnsmasq.service 2>/dev/null || true

if ! wait_nm; then
  log "NetworkManager não ficou ativo"
  exit 1
fi

IFACE="$(wait_wlan)" || {
  log "nenhuma interface Wi‑Fi em ~120 s — firmware/rfkill/overlay?"
  rfkill list >&2 || true
  ls -l /sys/class/net >&2 || true
  dmesg 2>/dev/null | grep -iE 'brcm|wlan|firmware|wifi' | tail -n 40 >&2 || true
  exit 1
}

SSID="$(ssid_from_serial)"
log "wlan=$IFACE ssid=$SSID"

prepare_radio "$IFACE" || log "NM ainda não gerencia $IFACE — seguindo assim mesmo"

attempt=1
while [[ $attempt -le 10 ]]; do
  rc=0
  bring_up "$IFACE" "$SSID" || rc=$?
  if [[ $rc -eq 0 ]]; then
    exit 0
  fi
  if [[ $rc -eq 2 ]]; then
    exit 0
  fi
  log "tentativa $attempt/10 falhou — nova em 12 s"
  sleep 12
  IFACE="$(detect_wlan || echo "$IFACE")"
  prepare_radio "$IFACE" || true
  attempt=$((attempt + 1))
done

log "esgotaram as tentativas de subir o AP"
nmcli device status >&2 || true
iw dev >&2 || true
exit 1
