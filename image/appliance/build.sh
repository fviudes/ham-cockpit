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
VER="$(tr -d ' \r\n' <"$ROOT/VERSION")"
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

QEMU_STATIC="$(command -v qemu-aarch64-static || true)"
[[ -n $QEMU_STATIC ]] || { echo "instale qemu-user-static" >&2; exit 1; }

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
if [[ ! -f $BASE_XZ ]]; then
  wget -O "$BASE_XZ" "$UBUNTU_IMG_URL"
fi
wget -q -O "$STAGE/SHA256SUMS" "$UBUNTU_SHA_URL"
(cd "$STAGE" && sha256sum -c SHA256SUMS --ignore-missing)

rm -f "$IMG_RAW" "$IMG_XZ"
echo "descompactando base..."
xz -dc "$BASE_XZ" >"$IMG_RAW"
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
cp -a "$QEMU_STATIC" "$MNT/usr/bin/qemu-aarch64-static"

echo "pré-carregando imagens Docker linux/arm64 (Wavelog + MariaDB)..."
DOCK="$STAGE/docker"
mkdir -p "$DOCK"
if command -v docker >/dev/null 2>&1; then
  docker pull --platform linux/arm64 "$DOCKER_WAVELG"
  docker pull --platform linux/arm64 "$DOCKER_MARIADB"
  docker save "$DOCKER_WAVELG" -o "$DOCK/wavelog.tar"
  docker save "$DOCKER_MARIADB" -o "$DOCK/mariadb.tar"
else
  echo "docker ausente no host — Wavelog será baixado no primeiro boot" >&2
fi

echo "copiando seed Ham Cockpit..."
SEED="$MNT/opt/ham-cockpit-seed"
mkdir -p "$SEED/deploy" "$SEED/dist" "$MNT/opt/wavelog-seed-images"
rsync -a "$ROOT/deploy/" "$SEED/deploy/"
rsync -a "$ROOT/dist/" "$SEED/dist/"
cp -a "$ROOT/package.json" "$ROOT/VERSION" "$SEED/"
if ls "$DOCK"/*.tar >/dev/null 2>&1; then
  cp -a "$DOCK/"*.tar "$MNT/opt/wavelog-seed-images/"
fi
install -m 0755 "$ROOT/image/appliance/chroot-setup.sh" "$MNT/tmp/chroot-setup.sh"
install -m 0644 "$ROOT/image/appliance/user-data" "$MNT/boot/firmware/user-data"
install -m 0644 "$ROOT/image/appliance/network-config" "$MNT/boot/firmware/network-config"

echo "chroot ARM64 — instalando Docker, ser2net, Hamlib, Wavelog, console..."
chroot "$MNT" /usr/bin/qemu-aarch64-static /bin/bash -c \
  "NODE_VER='$NODE_VER' HAMCOCKPIT_SEED=/opt/ham-cockpit-seed bash /tmp/chroot-setup.sh"

rm -rf "$MNT/opt/ham-cockpit-seed" "$MNT/opt/wavelog-seed-images" "$MNT/tmp/chroot-setup.sh"
rm -f "$MNT/usr/bin/qemu-aarch64-static"
sync

cleanup
trap - EXIT
LOOP=""

if command -v zerofree >/dev/null 2>&1; then
  LOOP="$(losetup --show -fP "$IMG_RAW")"
  e2fsck -fy "${LOOP}p2"
  zerofree -v "${LOOP}p2" || true
  losetup -d "$LOOP"
  LOOP=""
fi

echo "comprimindo $IMG_XZ ..."
xz -T0 -6 -v -k -f "$IMG_RAW"
mv -f "${IMG_RAW}.xz" "$IMG_XZ"
rm -f "$IMG_RAW"
sha256sum "$IMG_XZ" | tee "$IMG_XZ.sha256"
ls -lh "$IMG_XZ"
echo "grave com Raspberry Pi Imager ou: instaladores/flash.ps1 -DiskNumber N"
echo "imagem: $IMG_XZ"
