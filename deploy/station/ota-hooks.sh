#!/bin/bash
# Rodado no pós-install do pacote OTA (npm). Idempotente; não toca configs.
# MMDVM: instala binários ARM64 de mmdvm-arm64.tgz (no pacote OTA ou no canal update/).
# Docker.io: se o pacote não estiver na imagem, OTA não instala apt — precisa bake.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[[ "$(id -u)" -eq 0 ]] || exit 0

MMDVM_BINS=(MMDVMHost DMRGateway YSFGateway ircddbgatewayd NextionDriver)

mmdvm_missing() {
  local b
  for b in "${MMDVM_BINS[@]}"; do
    if [[ ! -x "/usr/local/bin/$b" ]]; then
      return 0
    fi
  done
  return 1
}

install_mmdvm_tgz() {
  local tgz="$1"
  [[ -f "$tgz" ]] || return 1
  local tmp b f
  tmp="$(mktemp -d)"
  if ! tar -xzf "$tgz" -C "$tmp"; then
    rm -rf "$tmp"
    return 1
  fi
  for b in "${MMDVM_BINS[@]}"; do
    if [[ -f "$tmp/bin/$b" ]]; then
      install -m 0755 "$tmp/bin/$b" "/usr/local/bin/$b"
    fi
  done
  mkdir -p /usr/local/etc /usr/share/ircddbgateway
  for f in groups.txt users.csv YSFHosts.txt \
    DPlus_Hosts.txt DExtra_Hosts.txt DCS_Hosts.txt CCS_Hosts.txt; do
    if [[ -f "$tmp/etc/$f" ]]; then
      install -m 0644 "$tmp/etc/$f" "/usr/local/etc/$f"
      case "$f" in
        *_Hosts.txt) install -m 0644 "$tmp/etc/$f" "/usr/share/ircddbgateway/$f" ;;
      esac
    fi
  done
  mkdir -p /var/log/mmdvm
  rm -rf "$tmp"
  return 0
}

# Runtime wx/MQTT para ircddbgatewayd em estações antigas (OTA sem bake novo).
# Sem apt (imagem read-only improvável) só registra aviso.
ensure_mmdvm_runtime_pkgs() {
  command -v apt-get >/dev/null 2>&1 || return 0
  export DEBIAN_FRONTEND=noninteractive
  local pkgs=(libmosquitto1 mosquitto libdlt2)
  local p cand ok=()
  for p in libwxbase3.2-1t64 libwxgtk3.2-1t64 libwxbase3.2-1 libwxgtk3.2-1 "${pkgs[@]}"; do
    cand="$(apt-cache policy "$p" 2>/dev/null | awk '/Candidate:/ {print $2; exit}')"
    if [[ -n "$cand" && "$cand" != "(none)" ]]; then
      ok+=("$p")
    fi
  done
  if [[ ${#ok[@]} -eq 0 ]]; then
    echo "ota-hooks: AVISO — sem candidatos apt para runtime MMDVM (wx/mosquitto)" >&2
    return 0
  fi
  apt-get update -qq 2>/dev/null || true
  apt-get install -y --no-install-recommends "${ok[@]}" 2>/dev/null \
    || echo "ota-hooks: AVISO — falha ao instalar runtime wx/mosquitto/libdlt2" >&2
}

# Preferência: pacote OTA embutido → cópia em /opt → download raw GitHub.
pick_mmdvm_tgz() {
  if [[ -f "$ROOT/mmdvm-arm64.tgz" ]]; then
    echo "$ROOT/mmdvm-arm64.tgz"
    return 0
  fi
  if [[ -f /opt/ham-cockpit/mmdvm-arm64.tgz ]]; then
    echo /opt/ham-cockpit/mmdvm-arm64.tgz
    return 0
  fi
  return 1
}

# Hosts D-Star + data files mesmo quando os bins já existem (estações antigas).
refresh_mmdvm_data_from_tgz() {
  local tgz="$1" tmp f
  [[ -f "$tgz" ]] || return 1
  tmp="$(mktemp -d)"
  if ! tar -xzf "$tgz" -C "$tmp" 2>/dev/null; then
    rm -rf "$tmp"
    return 1
  fi
  mkdir -p /usr/local/etc /usr/share/ircddbgateway
  for f in groups.txt users.csv YSFHosts.txt \
    DPlus_Hosts.txt DExtra_Hosts.txt DCS_Hosts.txt CCS_Hosts.txt; do
    if [[ -f "$tmp/etc/$f" ]]; then
      install -m 0644 "$tmp/etc/$f" "/usr/local/etc/$f"
      case "$f" in
        *_Hosts.txt) install -m 0644 "$tmp/etc/$f" "/usr/share/ircddbgateway/$f" ;;
      esac
    fi
  done
  rm -rf "$tmp"
  return 0
}

ensure_mmdvm_bins() {
  local tgz=""
  tgz="$(pick_mmdvm_tgz || true)"
  if [[ -n "$tgz" ]]; then
    refresh_mmdvm_data_from_tgz "$tgz" || true
  fi
  if ! mmdvm_missing; then
    return 0
  fi
  echo "ota-hooks: binários MMDVM ausentes — tentando instalar…" >&2
  if [[ -n "$tgz" ]] && install_mmdvm_tgz "$tgz"; then
    echo "ota-hooks: MMDVM instalado de $tgz" >&2
  else
    local dl
    dl="$(mktemp)"
    if curl -fsSL -A "Ham-Cockpit/ota" \
      "https://raw.githubusercontent.com/fviudes/ham-cockpit/main/update/mmdvm-arm64.tgz" \
      -o "$dl" \
      && install_mmdvm_tgz "$dl"; then
      echo "ota-hooks: MMDVM baixado do canal update/" >&2
      cp -a "$dl" /opt/ham-cockpit/mmdvm-arm64.tgz 2>/dev/null || true
    else
      echo "ota-hooks: AVISO — sem mmdvm-arm64.tgz; rode bake ou workflow MMDVM ARM64" >&2
    fi
    rm -f "$dl"
  fi
  if ! mmdvm_missing; then
    systemctl daemon-reload 2>/dev/null || true
    for u in nextiondriver.service mmdvmhost.service dmrgateway.service ysfgateway.service ircddbgateway.service; do
      systemctl enable "$u" 2>/dev/null || true
    done
    return 0
  fi

  # Fallback: compila na própria Pi (oneshot, até ~1 h). Precisa de rede + apt.
  if [[ -x /opt/ham-cockpit/bin/mmdvm-build-binaries.sh ]]; then
    echo "ota-hooks: agendando compilação MMDVM em segundo plano…" >&2
    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed ham-cockpit-mmdvm-build.service 2>/dev/null || true
    systemctl start --no-block ham-cockpit-mmdvm-build.service 2>/dev/null \
      || nohup /opt/ham-cockpit/bin/mmdvm-build-binaries.sh \
        >/var/log/mmdvm-build.log 2>&1 &
  else
    echo "ota-hooks: ainda faltam binários e não há mmdvm-build-binaries.sh" >&2
  fi
}

if [[ -d "$ROOT/systemd" ]]; then
  shopt -s nullglob
  # Unmask Nextion antes de reinstalar — stub “lab: disabled” / mask /dev/null não pode ficar no bake/OTA.
  systemctl unmask nextiondriver.service 2>/dev/null || true
  for unit in "$ROOT"/systemd/*.service "$ROOT"/systemd/*.target; do
    base="$(basename "$unit")"
    if [[ "$base" == "nextiondriver.service" ]] && grep -qE 'lab: disabled|/nonexistent|ExecStart=/bin/true' "$unit"; then
      echo "ota-hooks: AVISO — recusando stub nextiondriver.service do pacote OTA" >&2
      continue
    fi
    install -m 0644 "$unit" "/etc/systemd/system/$base"
  done
  # Se a unit ativa ainda for stub (lab antigo), remove para o ConditionPathExists do binário valer na próxima cópia boa.
  if [[ -f /etc/systemd/system/nextiondriver.service ]] \
    && grep -qE 'lab: disabled|/nonexistent|ExecStart=/bin/true' /etc/systemd/system/nextiondriver.service; then
    echo "ota-hooks: AVISO — removendo stub nextiondriver.service legado" >&2
    rm -f /etc/systemd/system/nextiondriver.service
  fi
  systemctl daemon-reload 2>/dev/null || true
fi

if [[ -d "$ROOT/bin" ]]; then
  find "$ROOT/bin" -maxdepth 1 -type f -exec chmod 0755 {} +
  chown root:root "$ROOT"/bin/* 2>/dev/null || true
  # CRLF no shebang quebra sudo/kernel.
  sed -i 's/\r$//' "$ROOT/bin/mmdvm-ctl" 2>/dev/null || true
  if [[ -f /opt/ham-cockpit/bin/mmdvm-ctl ]]; then
    sed -i 's/\r$//' /opt/ham-cockpit/bin/mmdvm-ctl
  fi
fi

# Daemon g4klx lê ircddbgateway (sem .conf) no confdir.
if [[ -f /opt/ham-cockpit/mmdvm/ircddbgateway.conf && ! -e /opt/ham-cockpit/mmdvm/ircddbgateway ]]; then
  ln -sfn ircddbgateway.conf /opt/ham-cockpit/mmdvm/ircddbgateway
  chown -h hamcockpit:hamcockpit /opt/ham-cockpit/mmdvm/ircddbgateway 2>/dev/null || true
fi

# Copia o tarball MMDVM para /opt para reuso e instala se faltar.
if [[ -f "$ROOT/mmdvm-arm64.tgz" ]]; then
  cp -a "$ROOT/mmdvm-arm64.tgz" /opt/ham-cockpit/mmdvm-arm64.tgz 2>/dev/null || true
fi
ensure_mmdvm_bins || true
ensure_mmdvm_runtime_pkgs || true

# Broker MQTT local (ircddbgatewayd) + units MMDVM no boot após OTA.
if command -v mosquitto >/dev/null 2>&1 || [[ -x /usr/sbin/mosquitto ]]; then
  systemctl enable mosquitto.service 2>/dev/null || true
  systemctl start mosquitto.service 2>/dev/null || true
fi
systemctl daemon-reload 2>/dev/null || true
for u in nextiondriver.service mmdvmhost.service dmrgateway.service ysfgateway.service ircddbgateway.service; do
  systemctl enable "$u" 2>/dev/null || true
done

# Sudoers do helper de backup (e demais) — atualiza em aparelhos já instalados.
if [[ -f "$ROOT/sudoers-hamcockpit" ]]; then
  if command -v visudo >/dev/null 2>&1; then
    if visudo -cf "$ROOT/sudoers-hamcockpit" >/dev/null 2>&1; then
      install -o root -g root -m 0440 "$ROOT/sudoers-hamcockpit" /etc/sudoers.d/ham-cockpit
    fi
  else
    install -o root -g root -m 0440 "$ROOT/sudoers-hamcockpit" /etc/sudoers.d/ham-cockpit
  fi
fi

# .env do Wavelog costuma nascer root:root 600 (Docker/install antigo).
# Sem isso o backup do console falha com EACCES ao copiar /opt/wavelog/.env.
if [[ -x "$ROOT/bin/station-backup" ]]; then
  "$ROOT/bin/station-backup" ensure-env >/dev/null 2>&1 || true
elif [[ -f /opt/wavelog/.env ]] && getent passwd hamcockpit >/dev/null 2>&1; then
  chown hamcockpit:hamcockpit /opt/wavelog/.env 2>/dev/null || true
  chmod 640 /opt/wavelog/.env 2>/dev/null || true
fi

# Pastas de dados graváveis pelo serviço (OTA em aparelhos já instalados).
install -d -o hamcockpit -g hamcockpit -m 0775 \
  /opt/ham-cockpit/radios \
  /opt/ham-cockpit/equipment \
  /opt/ham-cockpit/layouts \
  /opt/ham-cockpit/net \
  /opt/ham-cockpit/services \
  /opt/ham-cockpit/ldg \
  /opt/ham-cockpit/lp100a \
  2>/dev/null || true

# Docker + Wavelog no boot (units/perms). Sem docker.io no apt → só bake resolve.
getent group docker >/dev/null 2>&1 || groupadd --system docker 2>/dev/null || true
if getent passwd hamcockpit >/dev/null 2>&1; then
  getent group docker >/dev/null 2>&1 && usermod -aG docker hamcockpit 2>/dev/null || true
fi
if command -v docker >/dev/null 2>&1 || [[ -x /usr/bin/docker ]]; then
  systemctl unmask docker.service docker.socket 2>/dev/null || true
  systemctl enable docker.service docker.socket 2>/dev/null || true
  systemctl enable ham-cockpit.target wavelog.service first-boot.service 2>/dev/null || true
  systemctl start docker.service 2>/dev/null || true
  # Reinicia o console para herdar SupplementaryGroups=docker.
  systemctl try-restart ham-cockpit.service 2>/dev/null || true
  if systemctl cat wavelog.service >/dev/null 2>&1; then
    systemctl reset-failed wavelog.service 2>/dev/null || true
    systemctl restart wavelog.service 2>/dev/null || systemctl start wavelog.service 2>/dev/null || true
  fi
else
  echo "ota-hooks: docker ausente neste host — grave imagem bake com docker.io" >&2
fi

exit 0
