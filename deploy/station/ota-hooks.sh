#!/bin/bash
# Rodado no pós-install do pacote OTA (npm). Idempotente.
#
# INI do operador (lab 3× zerado na tela após OTA):
# - NUNCA copiar template deploy/mmdvm/*.ini por cima de mmdvmhost.ini existente.
#   Template só em instalação limpa (arquivo ausente) — ver install-station.sh.
# - Backup mmdvmhost.ini.ota-bak ANTES de qualquer escrita.
# - Merge conservador: só chaves de display/LCD/PTY se faltarem.
#   NUNCA resetar [General] Callsign/Id, [DMR] Id, frequências, senhas, redes, [Modem].
# - Dual Hat = ttyAMA0 / miniuart-bt (Bluetooth na mini-UART; no Pi 4 core_freq_min=500 e arm_boost=1, sem core_freq fixo). NÃO ttyACM0. NÃO ttyS0 no modem. NÃO systemctl restart mmdvmhost
#   Host inativo: start UMA vez. Host já up: não parar.
#   DMR/YSF NÃO usam PartOf no Host (restart do Host matava o BrandMeister).
#
# MMDVM: imagem bake recente JÁ tem os bins em /usr/local/bin.
# mmdvm-arm64.tgz é ponte OTA (estações antigas / reparo Nextion sem HC_FD2_GUARD),
# não requisito de install limpo. Fontes: pacote OTA, /opt/ham-cockpit/, ou update/ no GitHub.
# Docker.io: se o pacote não estiver na imagem, OTA não instala apt — precisa bake.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[[ "$(id -u)" -eq 0 ]] || exit 0

# O apply do console exporta HC_OTA_APPLY=1: tarefas lentas (apt, compile) vão para depois do JSON.
schedule_ota_background() {
  local label="$1"
  shift
  [[ "$#" -gt 0 ]] || return 0
  if [[ "${HC_OTA_APPLY:-}" != "1" ]]; then
    "$@"
    return $?
  fi
  echo "ota-hooks: $label — em segundo plano (não bloqueia o apply)" >&2
  local cmd
  cmd="$(printf '%q ' "$@")"
  if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --quiet --collect --no-block /bin/bash -c "$cmd" >/dev/null 2>&1 \
      || nohup bash -c "$cmd" >>/var/log/ham-cockpit-ota-defer.log 2>&1 </dev/null &
  else
    nohup bash -c "$cmd" >>/var/log/ham-cockpit-ota-defer.log 2>&1 </dev/null &
  fi
  return 0
}

# install idempotente: no OTA o pacote já está em /opt/ham-cockpit — src e dst
# podem ser o mesmo inode; GNU install aborta com "are the same file" e o set -e
# cortava o restante dos hooks (ex.: /opt/wavelog-gate).
safe_install() {
  local dest="${!#}"
  local src="${@: -2:1}"
  local -a opts=( "${@:1:$#-2}" )
  [[ -f "$src" ]] || return 0
  if [[ -e "$dest" && "$src" -ef "$dest" ]]; then
    return 0
  fi
  install "${opts[@]}" "$src" "$dest"
}

# Árvore já veio no bin/ do pacote OTA (ROOT=/opt/ham-cockpit) — evita cp para o mesmo path.
safe_copy_tree() {
  local src="${1:-}" dest="${2:-}"
  [[ -d "$src" ]] || return 0
  [[ -n "$dest" ]] || return 0
  mkdir -p "$(dirname "$dest")"
  if [[ -e "$dest" && "$src" -ef "$dest" ]]; then
    return 0
  fi
  local s d
  s="$(readlink -f "$src" 2>/dev/null || realpath "$src" 2>/dev/null || echo "$src")"
  d="$(readlink -f "$dest" 2>/dev/null || realpath "$dest" 2>/dev/null || echo "$dest")"
  if [[ "$s" == "$d" ]]; then
    return 0
  fi
  rm -rf "$dest"
  cp -a "$src" "$dest"
}

ensure_nginx_upload_limit() {
  local src="$ROOT/nginx-ham-cockpit.conf"
  [[ -f "$src" ]] || return 0
  command -v nginx >/dev/null 2>&1 || return 0
  safe_install -m 0644 "$src" /etc/nginx/sites-available/ham-cockpit
  ln -sfn /etc/nginx/sites-available/ham-cockpit /etc/nginx/sites-enabled/ham-cockpit 2>/dev/null || true
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx.service 2>/dev/null \
      || systemctl try-reload-or-restart nginx.service 2>/dev/null \
      || true
  fi
}

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

# Binário Nextion sem marca do patch fd2 (OTA antigo deixava o stock).
nextion_needs_patch() {
  [[ -x /usr/local/bin/NextionDriver ]] || return 0
  grep -a -q 'HC_FD2_GUARD' /usr/local/bin/NextionDriver && return 1
  return 0
}

# Host g4klx/WPSD sem tap Ham Cockpit (OTA antigo ou mmdvm-arm64.tgz velho).
mmdvm_need_voice_tap() {
  [[ -x /usr/local/bin/MMDVMHost ]] || return 1
  strings -a /usr/local/bin/MMDVMHost 2>/dev/null | grep -q 'HC_VOICE_TAP' && return 1
  echo "ota-hooks: MMDVMHost sem HC_VOICE_TAP — precisa recompilar" >&2
  return 0
}

# Stub de verdade: diretivas ativas. Comentários da unit real NÃO contam
# (0.1.05.01 apagava a unit porque o texto de aviso batia no grep).
nextion_unit_is_stub() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  grep -vE '^[[:space:]]*(#|$)' "$f" | grep -qE \
    'lab: disabled|ConditionPathExists=/nonexistent|^ExecStart=/bin/true([[:space:]]|$)'
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
  for f in groups.txt users.csv YSFHosts.txt DMRIds.dat \
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
# Rápido: se wx + mosquitto já estão instalados, NÃO faz apt-get update (travava OTA em ~93%).
ensure_mmdvm_runtime_pkgs() {
  command -v apt-get >/dev/null 2>&1 || return 0
  export DEBIAN_FRONTEND=noninteractive
  local pkgs=(libmosquitto1 mosquitto libdlt2)
  local has_wx=0 has_mqtt=0
  if dpkg-query -W -f='${Status}' libwxbase3.2-1t64 2>/dev/null | grep -q "install ok installed" \
    || dpkg-query -W -f='${Status}' libwxbase3.2-1 2>/dev/null | grep -q "install ok installed"; then
    has_wx=1
  fi
  if dpkg-query -W -f='${Status}' mosquitto 2>/dev/null | grep -q "install ok installed" \
    || command -v mosquitto >/dev/null 2>&1; then
    has_mqtt=1
  fi
  if [[ "$has_wx" -eq 1 && "$has_mqtt" -eq 1 ]]; then
    echo "ota-hooks: runtime wx/mosquitto já presente — pulando apt" >&2
    return 0
  fi
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
  for f in groups.txt users.csv YSFHosts.txt DMRIds.dat \
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

enable_mmdvm_units() {
  systemctl daemon-reload 2>/dev/null || true
  local u
  for u in nextiondriver.service mmdvmhost.service dmrgateway.service ysfgateway.service ircddbgateway.service; do
    systemctl enable "$u" 2>/dev/null || true
  done
}

ensure_mmdvm_bins() {
  local tgz="" from_pkg=0
  # Imagem: os bins são compilados no chroot. Baixar o tarball aqui faz o
  # build-binaries achar o binário e pular a compilação.
  if [[ "${HAMCOCKPIT_CHROOT:-0}" == "1" ]]; then
    echo "ota-hooks: chroot de bake — MMDVM será compilado na imagem, sem baixar tarball" >&2
    return 0
  fi
  # Pacote OTA embutiu o tarball — só reinstala se faltar bin ou Nextion sem HC_FD2_GUARD.
  # Extrair/instalar o tgz a cada OTA (antes: always) saturava o Pi e a UI em ~93%.
  if [[ -f "$ROOT/mmdvm-arm64.tgz" ]]; then
    tgz="$ROOT/mmdvm-arm64.tgz"
    from_pkg=1
  else
    tgz="$(pick_mmdvm_tgz || true)"
  fi

  if ! mmdvm_missing && ! nextion_needs_patch && ! mmdvm_need_voice_tap; then
    # Não extrai o tgz só para hosts — isso sozinho mantinha a UI em ~93% no Pi.
    echo "ota-hooks: binários MMDVM OK — pulando tarball/apt hosts" >&2
    enable_mmdvm_units
    return 0
  fi

  if [[ -n "$tgz" ]]; then
    refresh_mmdvm_data_from_tgz "$tgz" || true
  fi

  if [[ "$from_pkg" -eq 1 ]]; then
    echo "ota-hooks: instalando MMDVM do pacote OTA ($tgz)…" >&2
    if install_mmdvm_tgz "$tgz"; then
      echo "ota-hooks: MMDVM instalado/atualizado de $tgz" >&2
      enable_mmdvm_units
      return 0
    fi
    echo "ota-hooks: AVISO — falha ao instalar mmdvm-arm64.tgz do pacote; tentando fallback" >&2
  fi

  # Sem tarball no pacote (ou falha): só repara se faltar bin, Nextion sem marca ou Host sem tap.
  if ! mmdvm_missing && ! nextion_needs_patch && ! mmdvm_need_voice_tap; then
    return 0
  fi
  if nextion_needs_patch && ! mmdvm_missing; then
    echo "ota-hooks: NextionDriver sem HC_FD2_GUARD — atualizando só esse binário…" >&2
    if [[ -n "$tgz" ]]; then
      tmp="$(mktemp -d)"
      if tar -xzf "$tgz" -C "$tmp" bin/NextionDriver 2>/dev/null \
        && [[ -f "$tmp/bin/NextionDriver" ]]; then
        install -m 0755 "$tmp/bin/NextionDriver" /usr/local/bin/NextionDriver
        echo "ota-hooks: NextionDriver atualizado de $tgz (HC_FD2_GUARD)" >&2
      fi
      rm -rf "$tmp"
    fi
    if ! nextion_needs_patch; then
      return 0
    fi
  else
    echo "ota-hooks: binários MMDVM ausentes — tentando instalar…" >&2
  fi
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
    enable_mmdvm_units
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
  # Unmask + sempre instalar a unit Nextion real. NUNCA rm do arquivo
  # (0.1.05.01 apagava a unit viva porque o grep batia em comentário).
  systemctl unmask nextiondriver.service 2>/dev/null || true
  for unit in "$ROOT"/systemd/*.service "$ROOT"/systemd/*.target "$ROOT"/systemd/*.timer; do
    base="$(basename "$unit")"
    if [[ "$base" == "nextiondriver.service" ]] && nextion_unit_is_stub "$unit"; then
      echo "ota-hooks: AVISO — pacote trouxe nextiondriver stub; ignorando esse arquivo" >&2
      continue
    fi
    install -m 0644 "$unit" "/etc/systemd/system/$base"
  done
  nxt_src=""
  if [[ -f "$ROOT/systemd/nextiondriver.service" ]] && ! nextion_unit_is_stub "$ROOT/systemd/nextiondriver.service"; then
    nxt_src="$ROOT/systemd/nextiondriver.service"
  fi
  if [[ ! -f /etc/systemd/system/nextiondriver.service ]] || nextion_unit_is_stub /etc/systemd/system/nextiondriver.service; then
    if [[ -n "$nxt_src" ]]; then
      echo "ota-hooks: restaurando nextiondriver.service (unit real)" >&2
      install -m 0644 "$nxt_src" /etc/systemd/system/nextiondriver.service
    else
      echo "ota-hooks: AVISO — sem unit Nextion real no pacote" >&2
    fi
  fi
  systemctl daemon-reload 2>/dev/null || true
  if [[ -f /etc/systemd/system/nextiondriver.service ]]; then
    systemctl enable nextiondriver.service 2>/dev/null || true
  fi
  if [[ -f "$ROOT/bin/ham-cockpit-watch.sh" ]]; then
    sed -i 's/\r$//' "$ROOT/bin/ham-cockpit-watch.sh" 2>/dev/null || true
    safe_install -m 0755 "$ROOT/bin/ham-cockpit-watch.sh" /opt/ham-cockpit/bin/ham-cockpit-watch.sh
  fi
  if [[ -f /etc/systemd/system/ham-cockpit-watch.timer ]]; then
    systemctl enable ham-cockpit-watch.timer 2>/dev/null || true
    systemctl start ham-cockpit-watch.timer 2>/dev/null || true
  fi
  if [[ -f "$ROOT/bin/ham-cockpit-net-failover.sh" ]]; then
    sed -i 's/\r$//' "$ROOT/bin/ham-cockpit-net-failover.sh" 2>/dev/null || true
    safe_install -m 0755 "$ROOT/bin/ham-cockpit-net-failover.sh" /opt/ham-cockpit/bin/ham-cockpit-net-failover.sh
  fi
  if [[ -f /etc/systemd/system/ham-cockpit-net-failover.timer ]]; then
    systemctl enable ham-cockpit-net-failover.timer 2>/dev/null || true
    systemctl start ham-cockpit-net-failover.timer 2>/dev/null || true
  fi
fi

# Monitor MMDVM no PC: FIFO + loopback ALSA (decoder na Pi, sem dongle USB).
if [[ -f "$ROOT/bin/hc-mmdvm-voice-pump.sh" ]]; then
  sed -i 's/\r$//' "$ROOT/bin/hc-mmdvm-voice-pump.sh" 2>/dev/null || true
  safe_install -m 0755 "$ROOT/bin/hc-mmdvm-voice-pump.sh" /opt/ham-cockpit/bin/hc-mmdvm-voice-pump.sh
fi
if [[ -f "$ROOT/systemd/ham-cockpit-mmdvm-voice.service" ]]; then
  safe_install -m 0644 "$ROOT/systemd/ham-cockpit-mmdvm-voice.service" /etc/systemd/system/ham-cockpit-mmdvm-voice.service
  systemctl daemon-reload 2>/dev/null || true
fi
mkdir -p /etc/modules-load.d /run/ham-cockpit
grep -qxF 'snd-aloop' /etc/modules-load.d/ham-cockpit-mmdvm-monitor.conf 2>/dev/null \
  || printf '%s\n' 'snd-aloop' >/etc/modules-load.d/ham-cockpit-mmdvm-monitor.conf
modprobe snd-aloop 2>/dev/null || true
[[ -p /run/ham-cockpit/mmdvm-monitor.pcm ]] || mkfifo /run/ham-cockpit/mmdvm-monitor.pcm 2>/dev/null || true
chgrp hamcockpit /run/ham-cockpit/mmdvm-monitor.pcm 2>/dev/null || true
chmod 0660 /run/ham-cockpit/mmdvm-monitor.pcm 2>/dev/null || true

if [[ -f "$ROOT/bin/apply-hc-voice-tap.sh" ]]; then
  safe_install -m 0755 "$ROOT/bin/apply-hc-voice-tap.sh" /opt/ham-cockpit/bin/apply-hc-voice-tap.sh
  sed -i 's/\r$//' /opt/ham-cockpit/bin/apply-hc-voice-tap.sh 2>/dev/null || true
fi

ensure_hc_mmdvm_decode() {
  safe_copy_tree "$ROOT/mmdvm-decode" /opt/ham-cockpit/mmdvm-decode
  if [[ -f "$ROOT/bin/build-hc-mmdvm-decode.sh" ]]; then
    safe_install -m 0755 "$ROOT/bin/build-hc-mmdvm-decode.sh" /opt/ham-cockpit/bin/build-hc-mmdvm-decode.sh
    sed -i 's/\r$//' /opt/ham-cockpit/bin/build-hc-mmdvm-decode.sh 2>/dev/null || true
  fi
  if [[ -x /opt/ham-cockpit/bin/hc-mmdvm-decode ]]; then
    return 0
  fi
  local script="/opt/ham-cockpit/bin/build-hc-mmdvm-decode.sh"
  if [[ ! -x "$script" ]]; then
    echo "ota-hooks: AVISO — sem build-hc-mmdvm-decode.sh; monitor MMDVM sem decoder" >&2
    return 0
  fi
  if [[ "${HC_OTA_APPLY:-}" == "1" ]]; then
    schedule_ota_background "hc-mmdvm-decode (mbelib)" bash "$script"
    return 0
  fi
  bash "$script" || echo "ota-hooks: AVISO — hc-mmdvm-decode não compilou" >&2
}
ensure_hc_mmdvm_decode || true

if [[ -d "$ROOT/bin" ]]; then
  find "$ROOT/bin" -maxdepth 1 -type f -exec chmod 0755 {} +
  chown root:root "$ROOT"/bin/* 2>/dev/null || true
  # CRLF no shebang quebra sudo/kernel.
  sed -i 's/\r$//' "$ROOT/bin/mmdvm-ctl" 2>/dev/null || true
  if [[ -f /opt/ham-cockpit/bin/mmdvm-ctl ]]; then
    sed -i 's/\r$//' /opt/ham-cockpit/bin/mmdvm-ctl
  fi
fi

# Estabilidade (swap, journald, mask de serviços pesados, CRLF, ser2net vazio).
# ROOT costuma ser /opt/ham-cockpit — não reinstalar hc-tune sobre si mesmo.
if [[ -f "$ROOT/bin/hc-tune.sh" ]]; then
  sed -i 's/\r$//' "$ROOT/bin/hc-tune.sh" 2>/dev/null || true
  safe_install -m 0755 "$ROOT/bin/hc-tune.sh" /opt/ham-cockpit/bin/hc-tune.sh
fi
if [[ -x /opt/ham-cockpit/bin/hc-tune.sh ]]; then
  /opt/ham-cockpit/bin/hc-tune.sh || true
fi

# Daemon g4klx lê ircddbgateway (sem .conf) no confdir.
if [[ -f /opt/ham-cockpit/mmdvm/ircddbgateway.conf && ! -e /opt/ham-cockpit/mmdvm/ircddbgateway ]]; then
  ln -sfn ircddbgateway.conf /opt/ham-cockpit/mmdvm/ircddbgateway
  chown -h hamcockpit:hamcockpit /opt/ham-cockpit/mmdvm/ircddbgateway 2>/dev/null || true
fi
# DPlus em loopback impede REF* na LAN — template/console usam 0.0.0.0.
for f in /opt/ham-cockpit/mmdvm/ircddbgateway.conf /opt/ham-cockpit/mmdvm/ircddbgateway /etc/ircddbgateway; do
  [[ -e "$f" ]] || continue
  sed -i -E 's/^(localAddress|gatewayAddress)=127\.0\.0\.1$/\1=0.0.0.0/' "$f" 2>/dev/null || true
done

# Caminho LCD WPSD/ON7LDS no INI existente — NUNCA Callsign/Id/Modem/freq/senhas/redes.
# Só preenche chave ausente (ou Display=None / ScreenLayout vazio). Template NÃO entra aqui.
merge_nextion_ini() {
  local ini=/opt/ham-cockpit/mmdvm/mmdvmhost.ini
  [[ -f "$ini" ]] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  python3 - "$ini" <<'PY'
import shutil
import sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8", errors="replace")
lines = text.splitlines(True)

def get_kv(lines, section, key):
    in_s = False
    for ln in lines:
        if ln.strip() == f"[{section}]":
            in_s = True
            continue
        if ln.lstrip().startswith("[") and in_s:
            break
        s = ln.lstrip()
        if in_s and (s.startswith(f"{key}=") or s.startswith(f"{key} =")):
            return s.split("=", 1)[1].strip()
    return None

def set_if_missing(lines, section, key, value, placeholders=()):
    cur = get_kv(lines, section, key)
    if cur not in (None, "", *placeholders):
        return lines
    sec = f"[{section}]"
    i = 0
    while i < len(lines):
        if lines[i].strip() == sec:
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("["):
                s = lines[i].lstrip()
                if s.startswith(f"{key}=") or s.startswith(f"{key} ="):
                    nl = "\n" if lines[i].endswith("\n") else ""
                    lines[i] = f"{key}={value}{nl}"
                    return lines
                i += 1
            lines.insert(i, f"{key}={value}\n")
            return lines
        i += 1
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    lines.append(f"\n{sec}\n{key}={value}\n")
    return lines

# Dual Hat do lab não é dvmpis/ttyACM0. Não toca [Modem]/Callsign/Id.
lines = set_if_missing(lines, "General", "Display", "Nextion", ("None",))
lines = set_if_missing(lines, "Nextion", "Port", "/dev/ttyNextionDriver")
lines = set_if_missing(lines, "Nextion", "ScreenLayout", "4", ("3",))
lines = set_if_missing(lines, "NextionDriver", "Enable", "1")
lines = set_if_missing(lines, "NextionDriver", "Port", "modem")
lines = set_if_missing(lines, "NextionDriver", "WaitForLan", "0")
lines = set_if_missing(lines, "Transparent Data", "Enable", "1")
lines = set_if_missing(lines, "Transparent Data", "SendFrameType", "1")
new = "".join(lines)
if new != text:
    bak = p.with_name(p.name + ".ota-bak")
    shutil.copy2(p, bak)
    p.write_text(new, encoding="utf-8")
    print("ota-hooks: INI Nextion mesclado (só chaves LCD ausentes; backup .ota-bak)", file=sys.stderr)
PY
}
merge_nextion_ini || true

# Remote Control (TG na 7642) + beacons DMR em hotspot simplex (modo rede WPSD).
merge_mmdvm_host_ota() {
  local ini=/opt/ham-cockpit/mmdvm/mmdvmhost.ini
  [[ -f "$ini" ]] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  python3 - "$ini" <<'PY'
import re
import shutil
import sys
from pathlib import Path

p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8", errors="replace")
lines = text.splitlines(True)

def get_kv(lines, section, key):
    in_s = False
    for ln in lines:
        if ln.strip() == f"[{section}]":
            in_s = True
            continue
        if ln.lstrip().startswith("[") and in_s:
            break
        s = ln.lstrip()
        if in_s and s.startswith(f"{key}="):
            return s.split("=", 1)[1].strip()
    return None

def upsert(lines, section, key, value):
    sec = f"[{section}]"
    i = 0
    while i < len(lines):
        if lines[i].strip() == sec:
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("["):
                s = lines[i].lstrip()
                if s.startswith(f"{key}="):
                    nl = "\n" if lines[i].endswith("\n") else ""
                    lines[i] = f"{key}={value}{nl}"
                    return lines
                i += 1
            lines.insert(i, f"{key}={value}\n")
            return lines
        i += 1
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    lines.extend([f"\n{sec}\n", f"{key}={value}\n"])
    return lines

def delete_key(lines, section, key):
    in_s = False
    out = []
    for ln in lines:
        if ln.strip() == f"[{section}]":
            in_s = True
            out.append(ln)
            continue
        if ln.lstrip().startswith("[") and in_s:
            in_s = False
        if in_s and ln.lstrip().startswith(f"{key}="):
            continue
        out.append(ln)
    return out

net_type = (get_kv(lines, "DMR Network", "Type") or "Gateway").lower()
lines = upsert(lines, "Remote Control", "Enable", "1")
cur_addr = get_kv(lines, "Remote Control", "Address") or ""
if not cur_addr or cur_addr == "0.0.0.0":
    lines = upsert(lines, "Remote Control", "Address", "127.0.0.1")
lines = upsert(lines, "Remote Control", "Port", get_kv(lines, "Remote Control", "Port") or "7642")
interval = get_kv(lines, "DMR", "BeaconInterval") or ""
if net_type == "gateway" and not interval:
    lines = upsert(lines, "DMR", "Beacons", "1")
    lines = upsert(lines, "DMR", "BeaconDuration", get_kv(lines, "DMR", "BeaconDuration") or "3")
    lines = delete_key(lines, "DMR", "BeaconInterval")
new = "".join(lines)
if new != text:
    bak = p.with_name(p.name + ".ota-bak")
    if not bak.exists():
        shutil.copy2(p, bak)
    p.write_text(new, encoding="utf-8")
    print("ota-hooks: INI mmdvmhost — Remote Control + beacons DMR (hotspot)", file=sys.stderr)
    Path("/run/ham-cockpit/mmdvm-ota-ini-changed").write_text("1", encoding="utf-8")
PY
  local gw=/opt/ham-cockpit/mmdvm/dmrgateway.ini
  [[ -f "$gw" ]] || return 0
  grep -q '^\[Voice\]' "$gw" 2>/dev/null || {
    printf '\n[Voice]\nEnabled=1\nLanguage=en_US\nDirectory=/usr/local/etc/DMRGateway/Audio\n' >>"$gw"
    echo "ota-hooks: dmrgateway.ini [Voice] adicionado" >&2
  }
}
merge_mmdvm_host_ota || true

ensure_dmrgateway_audio() {
  local src="" dst=/usr/local/etc/DMRGateway/Audio f
  for src in \
    "$ROOT/mmdvm/dmrgateway-audio" \
    "$ROOT/deploy/mmdvm/dmrgateway-audio" \
    /opt/ham-cockpit/deploy/mmdvm/dmrgateway-audio; do
    [[ -d "$src" ]] || continue
    mkdir -p "$dst"
    shopt -s nullglob
    for f in "$src"/*.ambe "$src"/*.indx; do
      [[ -f "$f" ]] || continue
      if [[ ! -f "$dst/$(basename "$f")" ]]; then
        install -m 0644 "$f" "$dst/$(basename "$f")"
        echo "ota-hooks: voz DMRGateway $(basename "$f")" >&2
      fi
    done
    shopt -u nullglob
    return 0
  done
}
ensure_dmrgateway_audio || true

restart_mmdvm_after_ota_ini() {
  [[ -f /run/ham-cockpit/mmdvm-ota-ini-changed ]] || return 0
  rm -f /run/ham-cockpit/mmdvm-ota-ini-changed
  systemctl restart dmrgateway.service 2>/dev/null || true
  sleep 1
  if systemctl is-active --quiet mmdvmhost.service; then
    systemctl stop --job-mode=ignore-dependencies mmdvmhost.service 2>/dev/null || true
    sleep 2
    systemctl start --job-mode=ignore-dependencies mmdvmhost.service 2>/dev/null || true
  fi
  echo "ota-hooks: mmdvmhost+dmrgateway reiniciados (INI mesclado)" >&2
}

# Copia o tarball MMDVM para /opt para reuso e instala se faltar.
if [[ -f "$ROOT/mmdvm-arm64.tgz" ]]; then
  cp -a "$ROOT/mmdvm-arm64.tgz" /opt/ham-cockpit/mmdvm-arm64.tgz 2>/dev/null || true
fi
ensure_mmdvm_bins || true
ensure_mmdvm_runtime_pkgs || true
ensure_nginx_upload_limit || true

# Hamlib ≥4.6 no prefixo privado — não sobrescreve o apt 4.5.5.
# O rigctld do rádio precisa deste prefixo: o 4.5.5 abre Icom host:port em UDP
# e o ser2net TCP do CI-V não devolve o quadro. O ampctld da SPE usa o mesmo prefixo.
HC_HAMLIB=/opt/ham-cockpit/hamlib
install_hamlib_tgz() {
  local tgz="$1" tmp
  [[ -f "$tgz" ]] || return 1
  tmp="$(mktemp -d)"
  if ! tar -xzf "$tgz" -C "$tmp"; then
    rm -rf "$tmp"
    return 1
  fi
  mkdir -p "$HC_HAMLIB/bin" "$HC_HAMLIB/lib"
  if [[ -d "$tmp/bin" ]]; then
    find "$tmp/bin" -maxdepth 1 -type f -exec install -m 0755 {} "$HC_HAMLIB/bin/" \;
  fi
  if [[ -d "$tmp/lib" ]]; then
    cp -a "$tmp/lib"/. "$HC_HAMLIB/lib/"
    find "$HC_HAMLIB/lib" -name '*.la' -delete 2>/dev/null || true
  fi
  rm -rf "$tmp"
  if [[ -r "$HC_HAMLIB/lib/libhamlib.so.4" ]] \
    && grep -a -q -F 'Icom rig UDP network enabled' "$HC_HAMLIB/lib/libhamlib.so.4"; then
    echo "ota-hooks: ERRO — tarball ainda abre Icom host:port em UDP" >&2
    return 1
  fi
  if LD_LIBRARY_PATH="$HC_HAMLIB/lib" "$HC_HAMLIB/bin/ampctl" -l 2>/dev/null \
    | awk '$1+0==401 {found=1} END{exit !found}'; then
    return 0
  fi
  echo "ota-hooks: AVISO — hamlib-arm64.tgz instalado mas ampctl sem modelo 401" >&2
  return 1
}

ensure_hamlib_spe() {
  local tgz="" need=0 dl="" rig_changed=0 restart_u=0
  # Só reinstala o tarball se faltar ampctl/401. Nunca rebuilda Hamlib no OTA.
  # rigctld ausente deixa o rádio no apt 4.5.5 (UDP). Reinstala o tarball.
  if [[ ! -x "$HC_HAMLIB/bin/ampctld" ]] \
    || [[ ! -x "$HC_HAMLIB/bin/rigctld" ]] \
    || ! LD_LIBRARY_PATH="$HC_HAMLIB/lib" "$HC_HAMLIB/bin/ampctl" -l 2>/dev/null \
      | awk '$1+0==401 {found=1} END{exit !found}'; then
    need=1
  fi
  # Prefixo com a string do 4.5.5 ainda manda SOCK_DGRAM no Icom. Troca pelo tarball.
  if [[ -r "$HC_HAMLIB/lib/libhamlib.so.4" ]] \
    && grep -a -q -F 'Icom rig UDP network enabled' "$HC_HAMLIB/lib/libhamlib.so.4"; then
    echo "ota-hooks: prefixo abre Icom host:port em UDP — reinstalando" >&2
    need=1
  fi
  if [[ -f "$ROOT/hamlib-arm64.tgz" ]]; then
    tgz="$ROOT/hamlib-arm64.tgz"
    if [[ ! -f /opt/ham-cockpit/hamlib-arm64.tgz ]] || ! cmp -s "$tgz" /opt/ham-cockpit/hamlib-arm64.tgz; then
      cp -a "$tgz" /opt/ham-cockpit/hamlib-arm64.tgz 2>/dev/null || true
    fi
  elif [[ -f /opt/ham-cockpit/hamlib-arm64.tgz ]]; then
    tgz=/opt/ham-cockpit/hamlib-arm64.tgz
  fi
  if [[ "$need" -eq 1 ]]; then
    if [[ -z "$tgz" ]]; then
      dl="$(mktemp)"
      echo "ota-hooks: baixando hamlib-arm64.tgz do canal update/…" >&2
      if curl -fsSL -A "Ham-Cockpit/ota" \
        "https://raw.githubusercontent.com/fviudes/ham-cockpit/main/update/hamlib-arm64.tgz" \
        -o "$dl" \
        && [[ -s "$dl" ]]; then
        cp -a "$dl" /opt/ham-cockpit/hamlib-arm64.tgz 2>/dev/null || true
        tgz=/opt/ham-cockpit/hamlib-arm64.tgz
      fi
      rm -f "$dl"
    fi
    if [[ -n "$tgz" ]]; then
      echo "ota-hooks: instalando Hamlib SPE em $HC_HAMLIB ($tgz)…" >&2
      install_hamlib_tgz "$tgz" || true
    else
      echo "ota-hooks: AVISO — sem hamlib-arm64.tgz; ampctld@spe precisa Hamlib ≥4.6" >&2
    fi
  else
    echo "ota-hooks: Hamlib SPE (401) já OK — pulando tarball" >&2
  fi
  if [[ -f "$ROOT/bin/ampctld-spe" ]]; then
    safe_install -m 0755 "$ROOT/bin/ampctld-spe" /opt/ham-cockpit/bin/ampctld-spe
    sed -i 's/\r$//' /opt/ham-cockpit/bin/ampctld-spe 2>/dev/null || true
  fi
  rig_changed=0
  if [[ -f "$ROOT/bin/rigctld-ic705" ]]; then
    if [[ ! -f /opt/ham-cockpit/bin/rigctld-ic705 ]] \
      || ! cmp -s "$ROOT/bin/rigctld-ic705" /opt/ham-cockpit/bin/rigctld-ic705; then
      rig_changed=1
    fi
    safe_install -m 0755 "$ROOT/bin/rigctld-ic705" /opt/ham-cockpit/bin/rigctld-ic705
    sed -i 's/\r$//' /opt/ham-cockpit/bin/rigctld-ic705 2>/dev/null || true
  fi
  if [[ -f "$ROOT/bin/ser2net-ctl" ]]; then
    safe_install -m 0755 "$ROOT/bin/ser2net-ctl" /opt/ham-cockpit/bin/ser2net-ctl
    sed -i 's/\r$//' /opt/ham-cockpit/bin/ser2net-ctl 2>/dev/null || true
  fi
  # Só o helper. Não regrava /opt/lextel/config.json (MAC salvo) e não mexe em
  # dtoverlay: disable-bt tiraria o onboard e o ttyAMA0 do MMDVM. O helper
  # não dá rfkill, power off nem hciconfig. O reconnect do MAC fica no fim
  # do gancho, depois que o helper novo já está no disco.
  if [[ -f "$ROOT/bin/lextel-bt" ]]; then
    safe_install -m 0755 "$ROOT/bin/lextel-bt" /opt/ham-cockpit/bin/lextel-bt
    sed -i 's/\r$//' /opt/ham-cockpit/bin/lextel-bt 2>/dev/null || true
  fi
  if [[ -f "$ROOT/bin/station-support-vpn" ]]; then
    safe_install -o root -g root -m 0755 "$ROOT/bin/station-support-vpn" /opt/ham-cockpit/bin/station-support-vpn
    sed -i 's/\r$//' /opt/ham-cockpit/bin/station-support-vpn 2>/dev/null || true
  fi
  if [[ -f "$ROOT/hamlib-models.json" ]]; then
    install -m 0644 "$ROOT/hamlib-models.json" /opt/ham-cockpit/hamlib-models.json
  fi
  ensure_ft8_decode() {
    if [[ -f "$ROOT/bin/ftx-encode.c" ]]; then
      install -m 0644 "$ROOT/bin/ftx-encode.c" /opt/ham-cockpit/bin/ftx-encode.c
    fi
    if [[ -f "$ROOT/bin/build-ft8-decode.sh" ]]; then
      install -m 0755 "$ROOT/bin/build-ft8-decode.sh" /opt/ham-cockpit/bin/build-ft8-decode.sh
    fi
    if [[ -x /opt/ham-cockpit/bin/decode_ft8 && -x /opt/ham-cockpit/bin/ftx-encode ]]; then
      return 0
    fi
    local script="/opt/ham-cockpit/bin/build-ft8-decode.sh"
    if [[ ! -f "$script" ]]; then
      echo "ota-hooks: AVISO — sem build-ft8-decode.sh; modem FT8/FT4 fica de fora" >&2
      return 0
    fi
    if [[ "${HC_OTA_APPLY:-}" == "1" ]]; then
      schedule_ota_background "modem FT8/FT4" bash "$script"
      return 0
    fi
    bash "$script" || echo "ota-hooks: AVISO — modem FT8/FT4 não compilou" >&2
  }
  ensure_ft8_decode || true
  if ! command -v arecord >/dev/null 2>&1; then
    if [[ "${HC_OTA_APPLY:-}" == "1" ]]; then
      schedule_ota_background "alsa-utils (arecord)" \
        bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y --no-install-recommends alsa-utils'
    else
      apt-get update -qq || true
      apt-get install -y --no-install-recommends alsa-utils || echo "ota-hooks: AVISO — arecord ausente; PC Audio sem codec" >&2
    fi
  fi
  systemctl daemon-reload 2>/dev/null || true
  # Hamlib do Ubuntu 4.5.5 abre UDP no Icom e o CI-V morre. O rigctld tem de
  # ser o 4.6.5 do prefixo, com LD_LIBRARY_PATH. SPE é RFC2217 na 4001 e o
  # rádio é TCP cru na 4002. ampctld do SPE fica desligado. Não recarrega
  # o ser2net: um reload derruba as duas sessões.
  systemctl disable --now ampctld@spe.service >/dev/null 2>&1 || true
  # Não restart a cada OTA se already active (evita churn sob carga).
  # Console novo não é motivo: o tap escuta de novo e o rigctld redisca.
  # O wrapper do IC-705 reinicia só quando o arquivo muda: senão o processo
  # velho continua na porta de outro acessório (SPE na 4001).
  for u in 'rigctld@ic705.service'; do
    [[ -f "/etc/systemd/system/$u" ]] || continue
    systemctl enable "$u" 2>/dev/null || true
    restart_u=0
    if [[ "$need" -eq 1 ]]; then
      restart_u=1
    elif [[ "$u" == "rigctld@ic705.service" && "$rig_changed" -eq 1 ]]; then
      restart_u=1
    fi
    if [[ "$restart_u" -eq 1 ]]; then
      systemctl reset-failed "$u" 2>/dev/null || true
      systemctl restart "$u" 2>/dev/null \
        || systemctl start --job-mode=ignore-dependencies "$u" 2>/dev/null \
        || true
    elif ! systemctl is-active --quiet "$u"; then
      systemctl start --job-mode=ignore-dependencies "$u" 2>/dev/null || true
    fi
  done
}
ensure_hamlib_spe || true

# Broker MQTT local (ircddbgatewayd) + units MMDVM no boot após OTA.
if command -v mosquitto >/dev/null 2>&1 || [[ -x /usr/sbin/mosquitto ]]; then
  systemctl enable mosquitto.service 2>/dev/null || true
  systemctl start mosquitto.service 2>/dev/null || true
fi
systemctl daemon-reload 2>/dev/null || true
for u in nextiondriver.service mmdvmhost.service dmrgateway.service ysfgateway.service ircddbgateway.service; do
  systemctl enable "$u" 2>/dev/null || true
done
# Ordem: Nextion → PTY → Host (só se inativo) → gateways. NUNCA restart mmdvmhost.
# Lab 0.1.05.02: stop+start do Host (ignore-dependencies) derrubou filhos PartOf
# (DMRGateway failed) e apagou indicativo/ID no Nextion — INI do operador intacto.
started_nextion=0
if [[ -x /usr/local/bin/NextionDriver && -f /etc/systemd/system/nextiondriver.service ]]; then
  if ! systemctl is-active --quiet nextiondriver.service; then
    systemctl reset-failed nextiondriver.service 2>/dev/null || true
    systemctl start nextiondriver.service 2>/dev/null || true
    started_nextion=1
  fi
  pty_ok=0
  for i in $(seq 1 40); do
    t=$(readlink -f /dev/ttyNextionDriver 2>/dev/null || true)
    if [[ -c "$t" ]]; then
      chgrp dialout "$t" 2>/dev/null || true
      chmod 660 "$t" 2>/dev/null || chmod 666 "$t" 2>/dev/null || true
      if [[ -r "$t" && -w "$t" ]]; then
        pty_ok=1
        break
      fi
    fi
    sleep 0.25
  done
  if [[ "$pty_ok" -eq 1 ]]; then
    if ! systemctl is-active --quiet mmdvmhost.service; then
      systemctl start --job-mode=ignore-dependencies mmdvmhost.service 2>/dev/null || true
    elif [[ "$started_nextion" -eq 1 ]]; then
      # PTY novo: reabrir Host UMA vez. Não usar systemctl restart (ciclo PartOf).
      systemctl stop --job-mode=ignore-dependencies mmdvmhost.service 2>/dev/null || true
      sleep 2
      systemctl start --job-mode=ignore-dependencies mmdvmhost.service 2>/dev/null || true
    fi
  else
    echo "ota-hooks: PTY Nextion ainda não pronto — tentando mmdvm-ctl start" >&2
    if [[ -x /opt/ham-cockpit/bin/mmdvm-ctl ]]; then
      /opt/ham-cockpit/bin/mmdvm-ctl start all 2>/dev/null || true
    fi
  fi
else
  if [[ -x /opt/ham-cockpit/bin/mmdvm-ctl ]] && ! systemctl is-active --quiet mmdvmhost.service; then
    /opt/ham-cockpit/bin/mmdvm-ctl start all 2>/dev/null || true
  fi
fi
# Filhos PartOf não voltam no start ignore-dependencies do Host — sobe se inativos.
for u in dmrgateway.service ysfgateway.service ircddbgateway.service; do
  systemctl reset-failed "$u" 2>/dev/null || true
  if ! systemctl is-active --quiet "$u"; then
    systemctl start --job-mode=ignore-dependencies "$u" 2>/dev/null || true
  fi
done
restart_mmdvm_after_ota_ini || true

# Conta suporte: senha e sudo de root. Não mexe em admin, rádios, INI nem VPN.
if [[ -f "$ROOT/bin/ensure-support-user" ]]; then
  sed -i 's/\r$//' "$ROOT/bin/ensure-support-user" 2>/dev/null || true
  safe_install -o root -g root -m 0700 "$ROOT/bin/ensure-support-user" /opt/ham-cockpit/bin/ensure-support-user
  # O apply deixa o bin em 0755 e, no mesmo inode, o install acima não troca o modo.
  chown root:root /opt/ham-cockpit/bin/ensure-support-user
  chmod 0700 /opt/ham-cockpit/bin/ensure-support-user
fi
if [[ -f "$ROOT/bin/station-user" ]]; then
  sed -i 's/\r$//' "$ROOT/bin/station-user" 2>/dev/null || true
  safe_install -o root -g root -m 0755 "$ROOT/bin/station-user" /opt/ham-cockpit/bin/station-user
fi
if [[ -f "$ROOT/bin/station-svc" ]]; then
  sed -i 's/\r$//' "$ROOT/bin/station-svc" 2>/dev/null || true
  safe_install -o root -g root -m 0755 "$ROOT/bin/station-svc" /opt/ham-cockpit/bin/station-svc
fi
if [[ -x /opt/ham-cockpit/bin/ensure-support-user ]]; then
  /opt/ham-cockpit/bin/ensure-support-user || true
fi
if [[ -f /etc/systemd/system/ham-cockpit-support-user.service ]]; then
  systemctl enable ham-cockpit-support-user.service 2>/dev/null || true
fi

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

# VPN de suporte. Não apaga /opt/ham-cockpit/support-vpn.json (escolha ligado/desligado).
# Não mexe em services.json, rádios, INI nem /opt/lextel/config.json.
# 203/EXEC no lab: a unit existia e o pacote openvpn não.
if [[ ! -x /usr/sbin/openvpn ]] && command -v apt-get >/dev/null 2>&1; then
  if [[ "${HC_OTA_APPLY:-}" == "1" ]]; then
    schedule_ota_background "OpenVPN de suporte" \
      bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y --no-install-recommends openvpn'
  else
    export DEBIAN_FRONTEND=noninteractive
    if ! apt-get update -qq; then
      echo "ota-hooks: AVISO — apt-get update falhou; OpenVPN de suporte não instalado" >&2
    elif ! apt-get install -y --no-install-recommends openvpn; then
      echo "ota-hooks: AVISO — não foi possível instalar o pacote openvpn" >&2
    fi
  fi
fi
if [[ -f "$ROOT/support/client.ovpn" ]]; then
  install -d -o root -g root -m 0755 /opt/ham-cockpit/support
  safe_install -o root -g root -m 0600 "$ROOT/support/client.ovpn" /opt/ham-cockpit/support/client.ovpn
  sed -i 's/\r$//' /opt/ham-cockpit/support/client.ovpn 2>/dev/null || true
  if [[ -f "$ROOT/support/auth.txt" ]]; then
    safe_install -o root -g root -m 0600 "$ROOT/support/auth.txt" /opt/ham-cockpit/support/auth.txt
    sed -i 's/\r$//' /opt/ham-cockpit/support/auth.txt 2>/dev/null || true
  fi
  if [[ -f "$ROOT/support/vpn-reply.sh" ]]; then
    safe_install -o root -g root -m 0755 "$ROOT/support/vpn-reply.sh" /opt/ham-cockpit/support/vpn-reply.sh
    sed -i 's/\r$//' /opt/ham-cockpit/support/vpn-reply.sh 2>/dev/null || true
  fi
fi
# O station-upd em campo copia bin/, não support/. O script vem no bin desta OTA.
if [[ -f "$ROOT/bin/vpn-reply.sh" ]]; then
  sed -i 's/\r$//' "$ROOT/bin/vpn-reply.sh" 2>/dev/null || true
  install -d -o root -g root -m 0755 /opt/ham-cockpit/support
  install -o root -g root -m 0755 "$ROOT/bin/vpn-reply.sh" /opt/ham-cockpit/support/vpn-reply.sh
fi
ovpn=/opt/ham-cockpit/support/client.ovpn
if [[ -f "$ovpn" && -f /opt/ham-cockpit/support/vpn-reply.sh ]] && ! grep -q 'vpn-reply.sh' "$ovpn"; then
  printf '\n%s\n%s\n%s\n' \
    'script-security 2' \
    'route-up /opt/ham-cockpit/support/vpn-reply.sh' \
    'route-pre-down /opt/ham-cockpit/support/vpn-reply.sh' >> "$ovpn"
  if systemctl is-active --quiet ham-cockpit-support-vpn.service; then
    systemctl restart ham-cockpit-support-vpn.service 2>/dev/null || true
  fi
fi
# O pacote openvpn habilita o unit genérico, sem perfil. Sem .conf ele fica desligado.
if ! find /etc/openvpn /etc/openvpn/client -maxdepth 1 -name '*.conf' -print -quit 2>/dev/null | grep -q .; then
  if systemctl disable --now openvpn.service >/dev/null 2>&1; then
    :
  fi
fi
if [[ -x /usr/sbin/openvpn && -f /etc/systemd/system/ham-cockpit-support-vpn.service && -f /opt/ham-cockpit/support-vpn.json ]]; then
  systemctl daemon-reload 2>/dev/null || true
  if grep -q '"enabled"[[:space:]]*:[[:space:]]*true' /opt/ham-cockpit/support-vpn.json; then
    systemctl enable ham-cockpit-support-vpn.service 2>/dev/null || true
    if ! systemctl is-active --quiet ham-cockpit-support-vpn.service; then
      systemctl start ham-cockpit-support-vpn.service 2>/dev/null || true
    fi
  else
    systemctl disable --now ham-cockpit-support-vpn.service 2>/dev/null || true
  fi
fi
# Entrada total vinda do túnel (tun+ / tun0 e 10.8.0.0/16).
# Não desliga o firewall, não dá ufw enable/disable e não abre a WAN.
# O unit oneshot reaplica no boot; a regra do ufw fica gravada para quando ele estiver ativo.
allow_support_vpn_input() {
  if command -v iptables >/dev/null 2>&1; then
    if ! iptables -C INPUT -i tun+ -m comment --comment "ham-cockpit vpn tun" -j ACCEPT 2>/dev/null; then
      iptables -I INPUT 1 -i tun+ -m comment --comment "ham-cockpit vpn tun" -j ACCEPT || true
    fi
    if ! iptables -C INPUT -i tun+ -s 10.8.0.0/16 -m comment --comment "ham-cockpit vpn 10.8.0.0/16" -j ACCEPT 2>/dev/null; then
      iptables -I INPUT 1 -i tun+ -s 10.8.0.0/16 -m comment --comment "ham-cockpit vpn 10.8.0.0/16" -j ACCEPT || true
    fi
  fi
  # rp_filter estrito (1) na tun0 descarta o retorno. O efetivo é o máximo com all;
  # aqui só se mexe na tun0, e só se ela estiver em 1. Não altera all, eth0 nem a WAN.
  if [[ -r /proc/sys/net/ipv4/conf/tun0/rp_filter ]] && [[ "$(cat /proc/sys/net/ipv4/conf/tun0/rp_filter)" == "1" ]]; then
    sysctl -w net.ipv4.conf.tun0.rp_filter=2 >/dev/null || true
  fi
  if command -v ufw >/dev/null 2>&1 && [[ -f /etc/ufw/user.rules ]]; then
    # ufw 0.36 rejeita "--force allow" e "comment". Não dá enable nem disable.
    if ! grep -q -- '-i tun+' /etc/ufw/user.rules 2>/dev/null; then
      ufw allow in on tun+ >/dev/null 2>&1 || true
    fi
    if ! grep -q -- '-i tun0' /etc/ufw/user.rules 2>/dev/null; then
      ufw allow in on tun0 >/dev/null 2>&1 || true
    fi
    if ! grep -q -- '-i tun+ -s 10.8.0.0/16' /etc/ufw/user.rules 2>/dev/null; then
      ufw allow in on tun+ from 10.8.0.0/16 >/dev/null 2>&1 || true
    fi
    if ! grep -q -- '-i tun0 -s 10.8.0.0/16' /etc/ufw/user.rules 2>/dev/null; then
      ufw allow in on tun0 from 10.8.0.0/16 >/dev/null 2>&1 || true
    fi
  fi
  cat >/etc/systemd/system/ham-cockpit-vpn-input.service <<'EOF'
[Unit]
Description=Ham Cockpit entrada do tunel VPN
After=network-online.target ufw.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
# Aceita a entrada do tun+ e de 10.8.0.0/16. Não dá ufw enable/disable e não abre a WAN.
ExecStart=/bin/bash -c 'iptables -C INPUT -i tun+ -m comment --comment "ham-cockpit vpn tun" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i tun+ -m comment --comment "ham-cockpit vpn tun" -j ACCEPT || true; iptables -C INPUT -i tun+ -s 10.8.0.0/16 -m comment --comment "ham-cockpit vpn 10.8.0.0/16" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i tun+ -s 10.8.0.0/16 -m comment --comment "ham-cockpit vpn 10.8.0.0/16" -j ACCEPT || true; if [ -r /proc/sys/net/ipv4/conf/tun0/rp_filter ] && [ "$(cat /proc/sys/net/ipv4/conf/tun0/rp_filter)" = 1 ]; then sysctl -w net.ipv4.conf.tun0.rp_filter=2 || true; fi; exit 0'

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload 2>/dev/null || true
  if ! systemctl enable ham-cockpit-vpn-input.service 2>/dev/null; then
    mkdir -p /etc/systemd/system/multi-user.target.wants
    ln -sfn /etc/systemd/system/ham-cockpit-vpn-input.service /etc/systemd/system/multi-user.target.wants/ham-cockpit-vpn-input.service
  fi
  return 0
}
allow_support_vpn_input || echo "ota-hooks: AVISO — entrada do tunel VPN nao aplicada" >&2

# Portas TCP do ser2net para a rede privada. Não dá ufw enable/disable e não abre a WAN.
allow_ser2net_ports() {
  local ctl=/opt/ham-cockpit/bin/ser2net-ctl
  [[ -x "$ctl" ]] || return 1
  cat >/etc/systemd/system/ham-cockpit-ser2net-ports.service <<'EOF'
[Unit]
Description=Ham Cockpit portas ser2net na rede local
After=network-online.target ufw.service ser2net.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
# Abre as portas do services.json para redes privadas. Não dá ufw enable/disable e não abre a WAN.
ExecStart=/opt/ham-cockpit/bin/ser2net-ctl open-ports

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload 2>/dev/null || true
  if ! systemctl enable ham-cockpit-ser2net-ports.service 2>/dev/null; then
    mkdir -p /etc/systemd/system/multi-user.target.wants
    ln -sfn /etc/systemd/system/ham-cockpit-ser2net-ports.service /etc/systemd/system/multi-user.target.wants/ham-cockpit-ser2net-ports.service
  fi
  "$ctl" open-ports
  return 0
}
allow_ser2net_ports || echo "ota-hooks: AVISO — portas ser2net no firewall nao aplicadas" >&2

# .env do Wavelog costuma nascer root:root 600 (Docker/install antigo).
# Sem isso o backup do console falha com EACCES ao copiar /opt/wavelog/.env.
if [[ -x "$ROOT/bin/station-backup" ]]; then
  "$ROOT/bin/station-backup" ensure-env >/dev/null 2>&1 || true
elif [[ -f /opt/wavelog/.env ]] && getent passwd hamcockpit >/dev/null 2>&1; then
  chown hamcockpit:hamcockpit /opt/wavelog/.env 2>/dev/null || true
  chmod 640 /opt/wavelog/.env 2>/dev/null || true
fi
# Garante usuário/banco wavelog alinhados ao .env (não rotaciona senha).
mkdir -p /opt/wavelog
COMPOSE_CHANGED=0
if [[ -f "$ROOT/wavelog/docker-compose.yml" ]]; then
  if ! cmp -s "$ROOT/wavelog/docker-compose.yml" /opt/wavelog/docker-compose.yml 2>/dev/null; then
    COMPOSE_CHANGED=1
  fi
  safe_install -o root -g hamcockpit -m 0644 "$ROOT/wavelog/docker-compose.yml" /opt/wavelog/docker-compose.yml
fi
if [[ -f "$ROOT/bin/wavelog-ctl.sh" ]]; then
  safe_install -o root -g hamcockpit -m 0755 "$ROOT/bin/wavelog-ctl.sh" /opt/wavelog/wavelog-ctl.sh
  sed -i 's/\r$//' /opt/wavelog/wavelog-ctl.sh
  /opt/wavelog/wavelog-ctl.sh ensure-db >/dev/null 2>&1 || true
fi
# Destino absoluto /opt/wavelog-gate (nunca relativo "opt/wavelog-gate").
if [[ -f "$ROOT/wavelog-gate/wavelog-gate.mjs" ]]; then
  mkdir -p /opt/wavelog-gate
  safe_install -o hamcockpit -g hamcockpit -m 0755 "$ROOT/wavelog-gate/wavelog-gate.mjs" /opt/wavelog-gate/wavelog-gate.mjs
  if [[ -f "$ROOT/wavelog-gate/VERSION" ]]; then
    safe_install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/wavelog-gate/VERSION" /opt/wavelog-gate/VERSION
  fi
  # Nunca sobrescrever wavelog-gate.env (WAVELOG_API_KEY do operador).
  if [[ ! -f /opt/wavelog-gate/wavelog-gate.env && -f "$ROOT/wavelog-gate/wavelog-gate.env" ]]; then
    safe_install -o hamcockpit -g hamcockpit -m 0640 "$ROOT/wavelog-gate/wavelog-gate.env" /opt/wavelog-gate/wavelog-gate.env
  fi
  chown hamcockpit:hamcockpit /opt/wavelog-gate /opt/wavelog-gate/wavelog-gate.mjs /opt/wavelog-gate/VERSION 2>/dev/null || true
  chown hamcockpit:hamcockpit /opt/wavelog-gate/wavelog-gate.env 2>/dev/null || true
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
  /opt/ham-cockpit/spe \
  /var/lib/hamcockpit \
  /var/lib/hamcockpit/chromium \
  /var/lib/hamcockpit/license \
  2>/dev/null || true
if [[ ! -f /opt/ham-cockpit/spe/spe.json ]]; then
  printf '%s\n' '{ "autoConnect": true }' >/opt/ham-cockpit/spe/spe.json
  chown hamcockpit:hamcockpit /opt/ham-cockpit/spe/spe.json 2>/dev/null || true
  chmod 0644 /opt/ham-cockpit/spe/spe.json 2>/dev/null || true
fi
# A OTA anterior só apagava o LCK neste gancho. /var/lock no disco da raiz
# sobrevive ao reboot e o ser2net novo recusa o TTY ("Port in use by pid"
# do próprio processo). A regra fica no unit (ExecStartPre) e no tmpfiles
# (/var/lock -> /run/lock). Não reinicia o ser2net: isso derruba o CI-V.
if [[ -f "$ROOT/bin/ser2net-clear-locks" ]]; then
  safe_install -m 0755 "$ROOT/bin/ser2net-clear-locks" /opt/ham-cockpit/bin/ser2net-clear-locks
  sed -i 's/\r$//' /opt/ham-cockpit/bin/ser2net-clear-locks 2>/dev/null || true
  /opt/ham-cockpit/bin/ser2net-clear-locks install || true
fi

# Hamlib do Ubuntu 4.5.5 abre UDP no Icom e o CI-V morre.
# SPE é RFC2217 na 4001 e o rádio é TCP cru na 4002; ampctld fica desligado.
# OTA não substitui ser2net.yaml, services.json, rádios, INI, lextel nem spe.json vivos.
ser2net_yaml_keeps_contract() {
  local y=/opt/ser2net/ser2net.yaml
  [[ -f "$y" ]] || return 1
  grep -Eq 'telnet\(rfc2217\),tcp,[^,]+,4001' "$y" || return 1
  grep -Eq 'accepter: tcp,[^,]+,4002' "$y" || return 1
  grep -Eq 'telnet\(rfc2217\),tcp,[^,]+,4002' "$y" && return 1
  return 0
}
if ser2net_yaml_keeps_contract; then
  echo "ota-hooks: ser2net.yaml já tem 4001 RFC2217 e 4002 TCP — não substitui" >&2
elif [[ ! -f /opt/ser2net/services.json && -f "$ROOT/ser2net/services.json" && -f "$ROOT/ser2net/ser2net.yaml" ]]; then
  install -d -o hamcockpit -g hamcockpit /opt/ser2net
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/ser2net/ser2net.yaml" /opt/ser2net/ser2net.yaml
  install -o hamcockpit -g hamcockpit -m 0644 "$ROOT/ser2net/services.json" /opt/ser2net/services.json
fi

ota_hooks_progress() {
  local pct="${1:-80}"
  python3 -c 'import json,sys; print("HC_PROGRESS "+json.dumps({"id":"app","pct":int(sys.argv[1]),"stage":"hooks","determinate":True}), file=sys.stderr, flush=True)' "$pct" 2>/dev/null || true
}

# Docker + Wavelog no boot (units/perms). Sem docker.io no apt → só bake resolve.
ota_hooks_progress 79
getent group docker >/dev/null 2>&1 || groupadd --system docker 2>/dev/null || true
if getent passwd hamcockpit >/dev/null 2>&1; then
  getent group docker >/dev/null 2>&1 && usermod -aG docker hamcockpit 2>/dev/null || true
  getent group audio >/dev/null 2>&1 && usermod -aG audio hamcockpit 2>/dev/null || true
fi
if command -v docker >/dev/null 2>&1 || [[ -x /usr/bin/docker ]]; then
  systemctl unmask docker.service docker.socket 2>/dev/null || true
  systemctl enable docker.service docker.socket 2>/dev/null || true
  systemctl enable ham-cockpit.target wavelog.service first-boot.service 2>/dev/null || true
  systemctl start docker.socket 2>/dev/null || true
  systemctl start docker.service 2>/dev/null || \
    systemctl start docker.service --job-mode=ignore-dependencies 2>/dev/null || true
  # NÃO reinicia ham-cockpit aqui: o apply roda como filho do console.
  # systemctl restart no meio do OTA mata o Node e o station-upd (código ?).
  # O station-upd agenda o restart depois de devolver o JSON.
  if systemctl cat wavelog.service >/dev/null 2>&1; then
    systemctl reset-failed wavelog.service 2>/dev/null || true
    stack_ok=0
    if docker inspect -f '{{.State.Running}}' wavelog-main 2>/dev/null | grep -qx true \
      && docker inspect -f '{{.State.Running}}' wavelog-db 2>/dev/null | grep -qx true; then
      stack_ok=1
    fi
    ota_hooks_progress 85
    if [[ "$stack_ok" != 1 ]]; then
      if [[ -x /opt/wavelog/wavelog-ctl.sh ]]; then
        echo "ota-hooks: wavelog stack parada — compose up" >&2
        /opt/wavelog/wavelog-ctl.sh start >/var/log/wavelog-ota-start.log 2>&1 || true
      elif ! systemctl is-active --quiet wavelog.service; then
        systemctl start --no-block wavelog.service 2>/dev/null || true
      fi
    elif [[ "${COMPOSE_CHANGED:-0}" == 1 && -x /opt/wavelog/wavelog-ctl.sh ]]; then
      nohup /opt/wavelog/wavelog-ctl.sh start >/var/log/wavelog-recompose.log 2>&1 </dev/null &
    fi
    if systemctl cat waveloggate.service >/dev/null 2>&1; then
      systemctl reset-failed waveloggate.service 2>/dev/null || true
      if ! systemctl is-active --quiet waveloggate.service; then
        systemctl start --no-block waveloggate.service 2>/dev/null || true
      fi
    fi
  fi
else
  echo "ota-hooks: docker ausente neste host — grave imagem bake com docker.io" >&2
fi
ota_hooks_progress 88

# Religa o SPP do MAC salvo. Não grava /opt/lextel/config.json, não reinicia
# o ser2net, não mexe em VPN, firewall, Hamlib nem no overlay. O helper não
# dá rfkill, power off nem hciconfig.
#
# Por que este religamento é obrigatório: a OTA troca o binário com o Node
# ainda segurando /dev/rfcomm0 e, em seguida, o station-upd faz try-restart
# (sleep 4). O open() do RFCOMM roda numa thread com sinais mascarados: o
# SIGTERM não solta o fd. O processo fica em Stopping até a página
# Bluetooth estourar (~30s) e o nó fica "closed", não clean. Um sleep fixo
# de 20s a partir daqui corre DENTRO desse Stopping (lab 0.1.10: reconnect
# às 01:20:58, Stopped só às 01:21:16) e o console novo abre o DLC morto.
# O hci0 então registra "link tx timeout" / "command tx timeout" e o
# MS-2000 não volta. clean e connected continuam intocados. A segunda
# chamada espera o ActiveEnterTimestamp mudar e repete ~20s depois.
lextel_reconnect_saved() {
  [[ -x /opt/ham-cockpit/bin/lextel-bt ]] || return 0
  [[ -f /opt/lextel/config.json ]] || return 0
  # Uma chamada só. Várias em segundos disputam o flock e o hci0 estoura
  # link tx timeout. clean/connected não se solta; se o fd antigo ainda
  # segura o nó, o reconnect-after-restart repete depois que o console sobe.
  if [[ "${HC_OTA_APPLY:-}" == "1" ]]; then
    echo "ota-hooks: Lextel reconnect-saved adiado — o console ainda segura rfcomm" >&2
    return 0
  fi
  echo "ota-hooks: Lextel religando o MAC salvo (clean não é link morto)" >&2
  if /opt/ham-cockpit/bin/lextel-bt reconnect-saved; then
    echo "ota-hooks: Lextel rfcomm do MAC salvo pronto" >&2
    return 0
  fi
  echo "ota-hooks: AVISO — Lextel não religou agora; o console tenta de novo sem apagar o MAC" >&2
  return 0
}
lextel_reconnect_saved || echo "ota-hooks: AVISO — reconnect do Lextel não rodou" >&2
# Não reescreve config.json e não toca no ser2net. O helper espera o
# console realmente subir (fd antigo largado) e religa de novo ~20s depois.
if [[ -x /opt/ham-cockpit/bin/lextel-bt && -f /opt/lextel/config.json ]]; then
  if command -v systemd-run >/dev/null 2>&1; then
    systemd-run --quiet --collect \
      /opt/ham-cockpit/bin/lextel-bt reconnect-after-restart \
      >/dev/null 2>&1 || echo "ota-hooks: AVISO — reconnect do Lextel pós-restart não agendou" >&2
  else
    nohup /opt/ham-cockpit/bin/lextel-bt reconnect-after-restart >/dev/null 2>&1 &
  fi
fi

exit 0
