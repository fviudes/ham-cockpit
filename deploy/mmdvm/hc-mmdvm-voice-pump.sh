#!/bin/bash
# Prepara FIFO de monitor MMDVM e inicia o decodificador PCM (sem dongle USB).
# O binário hc-mmdvm-decode (mbelib / AMBE na Pi) grava S16_LE mono em /run/ham-cockpit/mmdvm-monitor.pcm.
# A UI (MONITOR no card MMDVM) lê esse FIFO via hc-mmdvm-pc-audio.sh → WebSocket → alto-falante do PC.
set -euo pipefail

RUN=/run/ham-cockpit
FIFO="$RUN/mmdvm-monitor.pcm"
STATE="$RUN/mmdvm-hat-mode.json"
DEC=/opt/ham-cockpit/bin/hc-mmdvm-decode

mkdir -p "$RUN"
if [[ ! -p "$FIFO" ]]; then
  mkfifo "$FIFO"
fi
chgrp hamcockpit "$FIFO" 2>/dev/null || true
chmod 0660 "$FIFO" 2>/dev/null || true

# O binário pode aparecer depois do OTA. Enquanto isso o FIFO fica intacto
# para o cat do console. Quando o ELF existe, este processo vira o decoder.
while true; do
  if [[ -x "$DEC" ]] && file "$DEC" 2>/dev/null | grep -qi ELF; then
    exec "$DEC" --fifo "$FIFO" --state "$STATE"
  fi
  echo "hc-mmdvm-voice: aguardando hc-mmdvm-decode em $DEC" >&2
  sleep 15
done