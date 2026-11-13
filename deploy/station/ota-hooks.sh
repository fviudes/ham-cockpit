#!/bin/bash
# Rodado no pós-install do pacote OTA (npm). Idempotente.
#
# INI do operador (lab 3× zerado na tela após OTA):
# - NUNCA copiar template deploy/mmdvm/*.ini por cima de mmdvmhost.ini existente.
#   Template só em instalação limpa (arquivo ausente) — ver install-station.sh.
# - Backup mmdvmhost.ini.ota-bak ANTES de qualquer escrita.
# - Merge conservador: só chaves de display/LCD/PTY se faltarem.
#   NUNCA resetar [General] Callsign/Id, [DMR] Id, frequências, senhas, redes, [Modem].
# - Dual Hat = ttyAMA0 / disable-bt. NÃO ttyACM0. NÃO systemctl restart mmdvmhost
#   (ciclo PartOf DMR/YSF). Host inativo: start UMA vez. Host já up: não parar.
#   stop+start do Host derruba filhos PartOf e apaga indicativo/ID no Nextion.
#
# MMDVM: imagem bake recente JÁ tem os bins em /usr/local/bin.
# mmdvm-arm64.tgz é ponte OTA (estações antigas / reparo Nextion sem HC_FD2_GUARD),
# não requisito de install limpo. Fontes: pacote OTA, /opt/ham-cockpit/, ou update/ no GitHub.
# Docker.io: se o pacote não estiver na imagem, OTA não instala apt — precisa bake.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[[ "$(id -u)" -eq 0 ]] || exit 0

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

  if ! mmdvm_missing && ! nextion_needs_patch; then
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

  # Sem tarball no pacote (ou falha): só repara se faltar bin ou Nextion sem marca.
  if ! mmdvm_missing && ! nextion_needs_patch; then
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
  for unit in "$ROOT"/systemd/*.service "$ROOT"/systemd/*.target; do
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

# Copia o tarball MMDVM para /opt para reuso e instala se faltar.
if [[ -f "$ROOT/mmdvm-arm64.tgz" ]]; then
  cp -a "$ROOT/mmdvm-arm64.tgz" /opt/ham-cockpit/mmdvm-arm64.tgz 2>/dev/null || true
fi
ensure_mmdvm_bins || true
ensure_mmdvm_runtime_pkgs || true

# Hamlib ≥4.6 (SPE Expert 401) em prefixo privado — não sobrescreve apt 4.5.5.
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
  if LD_LIBRARY_PATH="$HC_HAMLIB/lib" "$HC_HAMLIB/bin/ampctl" -l 2>/dev/null \
    | awk '$1+0==401 {found=1} END{exit !found}'; then
    return 0
  fi
  echo "ota-hooks: AVISO — hamlib-arm64.tgz instalado mas ampctl sem modelo 401" >&2
  return 1
}

ensure_hamlib_spe() {
  local tgz="" need=0 dl=""
  # Só reinstala o tarball se faltar ampctl/401. Nunca rebuilda Hamlib no OTA.
  if [[ ! -x "$HC_HAMLIB/bin/ampctld" ]] \
    || ! LD_LIBRARY_PATH="$HC_HAMLIB/lib" "$HC_HAMLIB/bin/ampctl" -l 2>/dev/null \
      | awk '$1+0==401 {found=1} END{exit !found}'; then
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
  if [[ -f "$ROOT/bin/rigctld-ic705" ]]; then
    safe_install -m 0755 "$ROOT/bin/rigctld-ic705" /opt/ham-cockpit/bin/rigctld-ic705
    sed -i 's/\r$//' /opt/ham-cockpit/bin/rigctld-ic705 2>/dev/null || true
  fi
  systemctl daemon-reload 2>/dev/null || true
  # Não restart a cada OTA se already active (evita churn sob carga).
  for u in ampctld@spe.service 'rigctld@ic705.service'; do
    [[ -f "/etc/systemd/system/$u" ]] || continue
    systemctl enable "$u" 2>/dev/null || true
    if [[ "$need" -eq 1 ]]; then
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
  fi
fi
# Filhos PartOf não voltam no start ignore-dependencies do Host — sobe se inativos.
for u in dmrgateway.service ysfgateway.service ircddbgateway.service; do
  systemctl reset-failed "$u" 2>/dev/null || true
  if ! systemctl is-active --quiet "$u"; then
    systemctl start --job-mode=ignore-dependencies "$u" 2>/dev/null || true
  fi
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
  chown -R hamcockpit:hamcockpit /opt/wavelog-gate 2>/dev/null || true
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
  /var/lib/hamcockpit \
  /var/lib/hamcockpit/chromium \
  /var/lib/hamcockpit/license \
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
  systemctl start docker.socket 2>/dev/null || true
  systemctl start docker.service 2>/dev/null || \
    systemctl start docker.service --job-mode=ignore-dependencies 2>/dev/null || true
  # NÃO reinicia ham-cockpit aqui: o apply roda como filho do console.
  # systemctl restart no meio do OTA mata o Node e o station-upd (código ?).
  # O station-upd agenda o restart depois de devolver o JSON.
  if systemctl cat wavelog.service >/dev/null 2>&1; then
    systemctl reset-failed wavelog.service 2>/dev/null || true
    # Não faz restart (derrubava MariaDB/Wavelog a cada OTA e pesava no Pi 3). Só sobe se parado.
    if ! systemctl is-active --quiet wavelog.service; then
      systemctl start --no-block wavelog.service 2>/dev/null || true
    elif [[ "${COMPOSE_CHANGED:-0}" == 1 && -x /opt/wavelog/wavelog-ctl.sh ]]; then
      # Compose novo (ex.: MariaDB enxuto): recria só o que mudou, em segundo plano.
      nohup /opt/wavelog/wavelog-ctl.sh start >/var/log/wavelog-recompose.log 2>&1 </dev/null &
    fi
  fi
else
  echo "ota-hooks: docker ausente neste host — grave imagem bake com docker.io" >&2
fi

exit 0
