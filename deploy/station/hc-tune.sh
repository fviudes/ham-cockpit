#!/bin/bash
# Estabilidade do Pi (1 GB de RAM). Idempotente — rodado por OTA, first-boot e install-station.
#
# Causas de travamento achadas no lab (12/Nov/2026, Pi 3 B, 899 MB, sem swap):
#   - RAM esgotada (MMDVM + Nextion + MariaDB + Docker + console + kiosk) sem swap →
#     "systemd-journald: Under memory pressure" e o Pi para de responder;
#   - serviços em laço de restart (ser2net, rigctld, ham-cockpit-ap, vfo, dmrgateway);
#   - scripts com CRLF (ham-cockpit-ap.sh) falhando e reiniciando sem parar;
#   - processos de manutenção do Ubuntu (apt-check, snapd, packagekit, unattended-upgrades).
set -uo pipefail
[[ "$(id -u)" -eq 0 ]] || exit 0

log() { echo "hc-tune: $*" >&2; }
RUNNING=0
[[ -d /run/systemd/system ]] && RUNNING=1

# ── 1. Swap em arquivo (RAM ≤ 3 GB) ──────────────────────────────────────────
ensure_swap() {
  local mem_kb avail_kb size_mb
  mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  [[ "$mem_kb" -gt 0 && "$mem_kb" -le 3145728 ]] || return 0
  if [[ "$mem_kb" -le 1310720 ]]; then size_mb=1024; else size_mb=2048; fi

  if [[ ! -f /swapfile ]]; then
    avail_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
    if [[ "${avail_kb:-0}" -lt $(( (size_mb + 2048) * 1024 )) ]]; then
      log "pouco espaço em / — swap não criado"
      return 0
    fi
    log "criando /swapfile (${size_mb} MB)"
    if ! fallocate -l "${size_mb}M" /swapfile 2>/dev/null; then
      dd if=/dev/zero of=/swapfile bs=1M count="$size_mb" status=none || { rm -f /swapfile; return 0; }
    fi
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null 2>&1 || { rm -f /swapfile; return 0; }
  fi
  if ! grep -qE '^[[:space:]]*/swapfile[[:space:]]' /etc/fstab 2>/dev/null; then
    printf '/swapfile none swap sw,pri=10 0 0\n' >>/etc/fstab
  fi
  if [[ "$RUNNING" -eq 1 ]] && ! swapon --noheadings --show=NAME 2>/dev/null | grep -qx /swapfile; then
    swapon -p 10 /swapfile 2>/dev/null || log "swapon falhou"
  fi
}

# ── 2. sysctl + journald enxutos ─────────────────────────────────────────────
ensure_sysctl_journald() {
  install -d -m 0755 /etc/sysctl.d /etc/systemd/journald.conf.d
  cat >/etc/sysctl.d/99-ham-cockpit.conf <<'EOF'
# Ham Cockpit — Pi com pouca RAM: usa swap cedo em vez de congelar.
vm.swappiness=40
vm.vfs_cache_pressure=120
vm.min_free_kbytes=16384
EOF
  cat >/etc/systemd/journald.conf.d/ham-cockpit.conf <<'EOF'
[Journal]
SystemMaxUse=120M
RuntimeMaxUse=40M
RateLimitIntervalSec=30s
RateLimitBurst=2000
EOF
  if [[ "$RUNNING" -eq 1 ]]; then
    sysctl -q -p /etc/sysctl.d/99-ham-cockpit.conf 2>/dev/null || true
    systemctl kill -s HUP systemd-journald.service 2>/dev/null || true
  fi
}

# ── 3. Serviços de manutenção do Ubuntu que pesam sem servir ao appliance ───
mask_bloat() {
  local u
  for u in snapd.service snapd.socket snapd.seeded.service snapd.apparmor.service \
    unattended-upgrades.service packagekit.service ModemManager.service \
    apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service \
    update-notifier-download.timer update-notifier-motd.timer motd-news.timer \
    fwupd-refresh.timer; do
    if [[ "$RUNNING" -eq 1 ]]; then
      systemctl disable --now "$u" >/dev/null 2>&1 || true
    fi
    systemctl mask "$u" >/dev/null 2>&1 || true
  done
}

# ── 4. CRLF em helpers/units (Windows → Pi) ──────────────────────────────────
fix_crlf() {
  local f changed=0
  for f in /opt/ham-cockpit/bin/* /opt/wavelog/wavelog-ctl.sh \
    /etc/systemd/system/ham-cockpit*.service /etc/systemd/system/ham-cockpit.target \
    /etc/systemd/system/{ser2net,wavelog,waveloggate,mmdvmhost,dmrgateway,ysfgateway,ircddbgateway,nextiondriver,first-boot}.service \
    /etc/systemd/system/rigctld@*.service /etc/systemd/system/ampctld@*.service; do
    [[ -f "$f" ]] || continue
    grep -Iq . "$f" 2>/dev/null || continue
    if grep -q $'\r' "$f" 2>/dev/null; then
      sed -i 's/\r$//' "$f" && changed=1 && log "CRLF→LF: $f"
    fi
  done
  if [[ "$changed" -eq 1 && "$RUNNING" -eq 1 ]]; then systemctl daemon-reload 2>/dev/null || true; fi
}

# ── 5. ser2net: YAML sem conexões não pode ser só comentário ─────────────────
fix_ser2net_yaml() {
  local y=/opt/ser2net/ser2net.yaml
  [[ -f "$y" ]] || return 0
  if ! grep -qE '^(connection|define):' "$y"; then
    log "ser2net.yaml sem conexões — acrescentando define vazio"
    printf '\n# ser2net 4 recusa documento só com comentários.\ndefine: &hc_empty ""\n' >>"$y"
    if [[ "$RUNNING" -eq 1 ]]; then
      case "$(systemctl is-active ser2net.service 2>/dev/null)" in
        activating | failed)
          systemctl reset-failed ser2net.service 2>/dev/null || true
          systemctl restart --no-block ser2net.service 2>/dev/null || true
          ;;
      esac
    fi
  fi
}

ensure_swap
ensure_sysctl_journald
mask_bloat
fix_crlf
fix_ser2net_yaml
exit 0
