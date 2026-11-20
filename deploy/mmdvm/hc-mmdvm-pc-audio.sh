#!/bin/bash
# PCM decodificado do hotspot (estação) → stdout S16_LE mono.
# Saídas, por ordem:
#   1) FIFO /run/ham-cockpit/mmdvm-monitor.pcm (decodificador AMBE/Analog_Bridge)
#   2) ALSA Loopback canal 1 (monitor local)
#   3) Dispositivo em /opt/ham-cockpit/mmdvm-monitor-alsa (card device)
set -euo pipefail

FIFO=/run/ham-cockpit/mmdvm-monitor.pcm
RATE=48000

# Sem o FIFO o script saía na hora e o botão PC Audio apagava.
# Cria (ou espera o serviço de voz criar) e fica bloqueado até chegar PCM.
mkdir -p "$(dirname "$FIFO")" 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if [[ ! -p "$FIFO" ]]; then
    mkfifo "$FIFO" 2>/dev/null || true
  fi
  if [[ -p "$FIFO" ]]; then
    exec cat "$FIFO"
  fi
  sleep 0.2
done

if command -v arecord >/dev/null 2>&1 && arecord -l 2>/dev/null | grep -qi loopback; then
  exec arecord -q -D plughw:Loopback,1 -f S16_LE -r "$RATE" -c 1 -t raw
fi

CFG=/opt/ham-cockpit/mmdvm-monitor-alsa
if [[ -f "$CFG" ]]; then
  # shellcheck disable=SC1090
  source "$CFG"
  if [[ -n "${CARD:-}" && -n "${DEVICE:-}" ]]; then
    exec arecord -q -D "plughw:${CARD},${DEVICE}" -f S16_LE -r "${RATE:-48000}" -c 1 -t raw
  fi
fi

exit 2