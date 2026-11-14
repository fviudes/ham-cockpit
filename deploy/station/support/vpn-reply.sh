#!/bin/bash
# A resposta do IP do túnel sai pelo tun.
# A LAN do Pi tem métrica menor; sem esta regra o TCP volta pela eth0 e a sessão não fecha.
set +e
dev="${dev:-tun0}"
src="${ifconfig_local:-}"
table=108
if [[ -z "$src" ]]; then
  exit 0
fi
clear_rule() {
  local i
  for i in 1 2 3 4 5; do
    ip rule del from "$src" lookup "$table" pref 108 2>/dev/null || break
  done
  ip route flush table "$table" 2>/dev/null
}
case "${script_type:-route-up}" in
  route-pre-down|down)
    clear_rule
    exit 0
    ;;
esac
clear_rule
ip route add 10.8.0.0/16 dev "$dev" table "$table" 2>/dev/null
ip route add default dev "$dev" table "$table" 2>/dev/null
ip rule add from "$src" lookup "$table" pref 108 2>/dev/null
if [[ -w "/proc/sys/net/ipv4/conf/${dev}/rp_filter" ]]; then
  echo 2 > "/proc/sys/net/ipv4/conf/${dev}/rp_filter" 2>/dev/null
fi
exit 0
