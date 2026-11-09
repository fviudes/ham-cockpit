#!/bin/bash
# Atalho: gera a imagem Ubuntu Server 24.04 ARM64 com Ham Cockpit assado.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec sudo bash "$ROOT/image/appliance/build.sh"
