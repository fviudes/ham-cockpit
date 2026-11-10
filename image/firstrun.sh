#!/bin/bash
# Só usado se alguém gravar um Pi OS vanilla. A imagem Ham Cockpit OS já vem pronta no bake.
set +e
if [[ -x /opt/ham-cockpit/index.js ]] || systemctl cat ham-cockpit.target >/dev/null 2>&1; then
  systemctl enable --now ham-cockpit.target
  rm -f /boot/firmware/firstrun.sh /boot/firstrun.sh
  exit 0
fi
BOOT=/boot/firmware
[[ -d $BOOT/hamcockpit ]] || BOOT=/boot
if [[ -d $BOOT/hamcockpit ]]; then
  bash "$BOOT/hamcockpit/deploy/station/install-station.sh"
fi
systemctl enable --now ham-cockpit.target
rm -f /boot/firmware/firstrun.sh /boot/firstrun.sh
exit 0
