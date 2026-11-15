#!/bin/bash
# Compila decode_ft8 e ftx-encode contra o ft8_lib (MIT, Karlis Goba).
# Não traz fonte do WSJT-X.
set -euo pipefail
DEST=/opt/ham-cockpit/bin
DECODE="$DEST/decode_ft8"
ENCODE="$DEST/ftx-encode"
if [[ -x "$DECODE" && -x "$ENCODE" ]]; then
  exit 0
fi
if ! command -v git >/dev/null 2>&1 || ! command -v gcc >/dev/null 2>&1 || ! command -v make >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y --no-install-recommends git gcc make ca-certificates
fi
src=""
for cand in "$(dirname "$0")/ftx-encode.c" "$DEST/ftx-encode.c"; do
  if [[ -f "$cand" ]]; then
    src="$cand"
    break
  fi
done
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
git clone --depth 1 https://github.com/kgoba/ft8_lib.git "$workdir/ft8_lib"
make -C "$workdir/ft8_lib" -j"$(nproc)" decode_ft8
install -d "$DEST"
install -m 0755 "$workdir/ft8_lib/decode_ft8" "$DECODE"
if [[ -f "$workdir/ft8_lib/LICENSE" ]]; then
  install -m 0644 "$workdir/ft8_lib/LICENSE" "$DEST/ft8_lib.LICENSE"
fi
if [[ -z "$src" ]]; then
  echo "build-ft8: sem ftx-encode.c; só o decode ficou instalado" >&2
  exit 0
fi
gcc -O2 -std=c11 -D_DEFAULT_SOURCE -I "$workdir/ft8_lib" -o "$workdir/ftx-encode" "$src" -L "$workdir/ft8_lib" -lft8 -lm
install -m 0755 "$workdir/ftx-encode" "$ENCODE"
"$ENCODE" FT8 1500 "CQ PR2PT" "$workdir/tone.s16"
bytes=$(wc -c < "$workdir/tone.s16")
if [[ "$bytes" -ne 303360 ]]; then
  echo "build-ft8: ftx-encode gerou $bytes bytes, esperado 303360" >&2
  exit 1
fi
echo "build-ft8: decode_ft8 e ftx-encode prontos"
