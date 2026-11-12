#!/bin/bash
# Gera Ham Cockpit OS: Ubuntu Server 24.04 LTS ARM64 já com a estação.
# Resultado: image/out/ham-cockpit-<VERSION>-raspi.img.xz
# Requer Linux (GitHub Actions ou WSL) com qemu-user-static, losetup, xz.
# Não usa pi-gen / Raspberry Pi OS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/image/out"
STAGE="$OUT/stage"
MNT="$OUT/mnt"
CFG="$ROOT/image/appliance/config"
# shellcheck disable=SC1090
source "$CFG"
# VERSION pode ser OTA (x.y.zz.NN); o artefato .img usa só a base de 3 partes.
VER_FULL="$(tr -d ' \r\n' <"$ROOT/VERSION")"
VER="$(printf '%s\n' "$VER_FULL" | sed -E 's/^([0-9]+\.[0-9]+\.[0-9]+)(\.[0-9]+)?$/\1/')"
if [[ ! "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "VERSION inválida para imagem: $VER_FULL (esperado x.y.zz ou x.y.zz.NN)" >&2
  exit 1
fi
if [[ "$VER_FULL" != "$VER" ]]; then
  echo "aviso: VERSION=$VER_FULL tem sufixo OTA — bake usará base $VER no nome do .img" >&2
  echo "recomendado: bump de imagem (sem .NN) antes do bake; ver docs/versionamento.md" >&2
fi
IMG_RAW="$OUT/${IMG_NAME}-${VER}-raspi.img"
IMG_XZ="$OUT/${IMG_NAME}-${VER}-raspi.img.xz"
BASE_XZ="$STAGE/$UBUNTU_IMG"

if [[ $(id -u) -ne 0 ]]; then
  echo "execute como root: sudo bash $0" >&2
  exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "falta $1" >&2; exit 1; }; }
need qemu-img
need xz
need losetup
need rsync
need wget
need parted
need resize2fs
need e2fsck
command -v growpart >/dev/null 2>&1 || { echo "falta growpart (cloud-guest-utils)" >&2; exit 1; }

HOST_ARCH="$(uname -m)"
NATIVE_ARM=0
if [[ $HOST_ARCH == aarch64 || $HOST_ARCH == arm64 ]]; then
  NATIVE_ARM=1
fi
QEMU_STATIC="$(command -v qemu-aarch64-static || true)"
if [[ $NATIVE_ARM -eq 0 && -z $QEMU_STATIC ]]; then
  echo "instale qemu-user-static (ou rode num host ARM64)" >&2
  exit 1
fi

if [[ ! -f $ROOT/dist/index.js ]]; then
  echo "compilando Ham Cockpit..."
  if [[ -n ${SUDO_USER:-} && $SUDO_USER != root ]]; then
    su - "$SUDO_USER" -c "cd '$ROOT' && pnpm install && pnpm build"
  else
    (cd "$ROOT" && pnpm install && pnpm build)
  fi
fi

mkdir -p "$OUT" "$STAGE" "$MNT"
cleanup() {
  set +e
  if mountpoint -q "$MNT/dev/pts"; then umount "$MNT/dev/pts"; fi
  if mountpoint -q "$MNT/dev"; then umount "$MNT/dev"; fi
  if mountpoint -q "$MNT/proc"; then umount "$MNT/proc"; fi
  if mountpoint -q "$MNT/sys"; then umount "$MNT/sys"; fi
  if mountpoint -q "$MNT/run"; then umount "$MNT/run"; fi
  if mountpoint -q "$MNT/boot/firmware"; then umount "$MNT/boot/firmware"; fi
  if mountpoint -q "$MNT"; then umount "$MNT"; fi
  if [[ -n ${LOOP:-} ]]; then losetup -d "$LOOP" 2>/dev/null; fi
}
trap cleanup EXIT

echo "baixando Ubuntu Server ${UBUNTU_RELEASE} ARM64 Raspberry Pi..."
df -h
if [[ ! -f $BASE_XZ ]]; then
  wget --tries=3 --timeout=60 -O "$BASE_XZ" "$UBUNTU_IMG_URL"
fi
wget -q -O "$STAGE/SHA256SUMS" "$UBUNTU_SHA_URL"
(cd "$STAGE" && sha256sum -c SHA256SUMS --ignore-missing)

rm -f "$IMG_RAW" "$IMG_XZ"
echo "descompactando base..."
xz -dc "$BASE_XZ" >"$IMG_RAW"
rm -f "$BASE_XZ"
qemu-img resize "$IMG_RAW" "$IMAGE_SIZE"

LOOP="$(losetup --show -fP "$IMG_RAW")"
echo "loop $LOOP"
# part2 = root ext4; part1 = firmware FAT
ROOTPART="${LOOP}p2"
BOOTPART="${LOOP}p1"
growpart "$LOOP" 2
e2fsck -fy "$ROOTPART"
resize2fs "$ROOTPART"

mount "$ROOTPART" "$MNT"
mkdir -p "$MNT/boot/firmware"
mount "$BOOTPART" "$MNT/boot/firmware"
mount --bind /dev "$MNT/dev"
mount --bind /dev/pts "$MNT/dev/pts"
mount --bind /proc "$MNT/proc"
mount --bind /sys "$MNT/sys"
mount --bind /run "$MNT/run"
if [[ $NATIVE_ARM -eq 0 ]]; then
  cp -a "$QEMU_STATIC" "$MNT/usr/bin/qemu-aarch64-static"
fi

DOCK="$STAGE/docker"
mkdir -p "$DOCK"
# Padrão do produto: imagem completa — Wavelog/MariaDB embutidos (tar.gz).
# SKIP_DOCKER_CACHE=1 só para debug local com pouco disco.
EMBED_DOCKER=1
if [[ ${SKIP_DOCKER_CACHE:-0} == 1 ]]; then
  EMBED_DOCKER=0
fi
if [[ $EMBED_DOCKER -eq 1 ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERRO: docker ausente no host do bake — necessário para embutir Wavelog/MariaDB" >&2
    exit 1
  fi
  echo "pré-carregando imagens Docker linux/arm64 (Wavelog + MariaDB)…"
  docker pull --platform linux/arm64 "$DOCKER_WAVELG"
  docker pull --platform linux/arm64 "$DOCKER_MARIADB"
  # gzip: cabe melhor no .img.xz (limite 2 GiB da Release) e no disco do runner.
  docker save "$DOCKER_WAVELG" | gzip -1 >"$DOCK/wavelog.tar.gz"
  docker save "$DOCKER_MARIADB" | gzip -1 >"$DOCK/mariadb.tar.gz"
  ls -lh "$DOCK"/*.tar.gz
  docker rmi "$DOCKER_WAVELG" "$DOCKER_MARIADB" 2>/dev/null || true
  docker system prune -af 2>/dev/null || true
else
  echo "AVISO: SKIP_DOCKER_CACHE=1 — Wavelog/MariaDB só no primeiro boot (rede)" >&2
fi

echo "copiando seed Ham Cockpit..."
SEED="$MNT/opt/ham-cockpit-seed"
mkdir -p "$SEED/deploy" "$SEED/dist" "$MNT/opt/wavelog-seed-images"
rsync -a "$ROOT/deploy/" "$SEED/deploy/"
rsync -a "$ROOT/dist/" "$SEED/dist/"
cp -a "$ROOT/package.json" "$ROOT/VERSION" "$SEED/"
if ls "$DOCK"/*.tar.gz >/dev/null 2>&1; then
  cp -a "$DOCK/"*.tar.gz "$MNT/opt/wavelog-seed-images/"
  rm -f "$DOCK"/*.tar.gz
fi
install -m 0755 "$ROOT/image/appliance/chroot-setup.sh" "$MNT/tmp/chroot-setup.sh"
install -m 0644 "$ROOT/image/appliance/user-data" "$MNT/boot/firmware/user-data"
install -m 0644 "$ROOT/image/appliance/network-config" "$MNT/boot/firmware/network-config"

df -h
echo "chroot ARM64 — instalando Docker, ser2net, Hamlib, console, MMDVM…"
if [[ $NATIVE_ARM -eq 1 ]]; then
  chroot "$MNT" /bin/bash -c \
    "NODE_VER='$NODE_VER' HAMCOCKPIT_SEED=/opt/ham-cockpit-seed EMBED_DOCKER='$EMBED_DOCKER' bash /tmp/chroot-setup.sh"
else
  chroot "$MNT" /usr/bin/qemu-aarch64-static /bin/bash -c \
    "NODE_VER='$NODE_VER' HAMCOCKPIT_SEED=/opt/ham-cockpit-seed EMBED_DOCKER='$EMBED_DOCKER' bash /tmp/chroot-setup.sh"
fi

echo "conferindo binários MMDVM na imagem montada…"
for b in MMDVMHost DMRGateway YSFGateway ircddbgatewayd NextionDriver; do
  if [[ ! -x "$MNT/usr/local/bin/$b" ]]; then
    echo "ERRO: imagem sem /usr/local/bin/$b após chroot" >&2
    exit 1
  fi
done
if ! grep -a -q 'HC_FD2_GUARD' "$MNT/usr/local/bin/NextionDriver"; then
  echo "ERRO: imagem sem marca HC_FD2_GUARD no NextionDriver" >&2
  exit 1
fi
if [[ ! -f "$MNT/etc/systemd/system/nextiondriver.service" ]]; then
  echo "ERRO: imagem sem nextiondriver.service" >&2
  exit 1
fi
if [[ $EMBED_DOCKER -eq 1 ]]; then
  echo "conferindo tarballs Docker (Wavelog/MariaDB) em /opt/wavelog/images…"
  if ! ls "$MNT/opt/wavelog/images"/wavelog.tar.gz >/dev/null 2>&1 \
    || ! ls "$MNT/opt/wavelog/images"/mariadb.tar.gz >/dev/null 2>&1; then
    echo "ERRO: bake sem /opt/wavelog/images/{wavelog,mariadb}.tar.gz — first-boot dependeria de pull" >&2
    ls -la "$MNT/opt/wavelog/images" 2>/dev/null || true
    exit 1
  fi
  ls -lh "$MNT/opt/wavelog/images"/*.tar.gz
fi

# Byproduct OTA: cópia dos binários JÁ instalados na rootfs acima.
# A imagem única não depende deste tarball no boot — é ponte para estações
# antigas / ota-hooks / canal update/. Ver docs/imagem-os.md.
MMDVM_TGZ="$OUT/mmdvm-arm64.tgz"
STAGE_MMDVM="$(mktemp -d)"
mkdir -p "$STAGE_MMDVM/bin" "$STAGE_MMDVM/etc"
for b in MMDVMHost DMRGateway YSFGateway ircddbgatewayd NextionDriver; do
  install -m 0755 "$MNT/usr/local/bin/$b" "$STAGE_MMDVM/bin/$b"
done
for f in groups.txt users.csv YSFHosts.txt DMRIds.dat \
  DPlus_Hosts.txt DExtra_Hosts.txt DCS_Hosts.txt CCS_Hosts.txt; do
  if [[ -f "$MNT/usr/local/etc/$f" ]]; then
    install -m 0644 "$MNT/usr/local/etc/$f" "$STAGE_MMDVM/etc/$f"
  elif [[ -f "$MNT/usr/share/ircddbgateway/$f" ]]; then
    install -m 0644 "$MNT/usr/share/ircddbgateway/$f" "$STAGE_MMDVM/etc/$f"
  fi
done
tar -C "$STAGE_MMDVM" -czf "$MMDVM_TGZ" bin etc
rm -rf "$STAGE_MMDVM"
# Cópia para o canal OTA: o bake roda como root; devolver dono ao SUDO_USER
# senão o passo "Publish GitHub Release" falha com Permission denied no cp.
install -m 0644 "$MMDVM_TGZ" "$ROOT/update/mmdvm-arm64.tgz"
# Dentro da imagem: reinstall Nextion se strings não tiver HC_FD2_GUARD (install/OTA).
install -m 0644 "$MMDVM_TGZ" "$MNT/opt/ham-cockpit/mmdvm-arm64.tgz"
if [[ -n ${SUDO_USER:-} && $SUDO_USER != root ]]; then
  chown "$SUDO_USER:" "$ROOT/update/mmdvm-arm64.tgz" || true
fi
ls -lh "$MMDVM_TGZ"

rm -rf "$MNT/opt/ham-cockpit-seed" "$MNT/opt/wavelog-seed-images" "$MNT/tmp/chroot-setup.sh"
rm -f "$MNT/usr/bin/qemu-aarch64-static"
# Zera espaço livre: xz comprime zeros; lixo pós-resize2fs infla o .img.xz.
echo "zerando espaço livre da rootfs (melhor compressão xz)…"
dd if=/dev/zero of="$MNT/zero.fill" bs=1M status=progress 2>/dev/null || true
rm -f "$MNT/zero.fill"
df -h
sync

cleanup
trap - EXIT
LOOP=""

echo "comprimindo $IMG_XZ (xz -9e — Release GitHub limita asset a 2 GiB) ..."
# Sem -k: libera os ~10G do .img cru durante/após o xz (disco do runner).
# -9e: melhor razão; se ainda passar de 2 GiB, o workflow publica em .part00/.part01.
xz -T0 -9e -v -f "$IMG_RAW"
mv -f "${IMG_RAW}.xz" "$IMG_XZ"
sha256sum "$IMG_XZ" | tee "$IMG_XZ.sha256"
ls -lh "$IMG_XZ"
echo "grave com Raspberry Pi Imager ou: instaladores/flash.ps1 -DiskNumber N"
echo "imagem: $IMG_XZ"
