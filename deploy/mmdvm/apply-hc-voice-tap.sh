#!/bin/bash
# Injeta HamCockpitVoiceTap no fonte MMDVMHost (M17 v1.0) antes do make.
set -euo pipefail

HOST_DIR="${1:-MMDVMHost}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAP_SRC="$SCRIPT_DIR/hc-voice-tap"
if [[ ! -d "$TAP_SRC" && -d "$SCRIPT_DIR/../hc-voice-tap" ]]; then
  TAP_SRC="$SCRIPT_DIR/../hc-voice-tap"
fi

[[ -d "$HOST_DIR" ]] || { echo "apply-hc-voice-tap: pasta ausente: $HOST_DIR" >&2; exit 1; }

cp -f "$TAP_SRC/HamCockpitVoiceTap.h" "$TAP_SRC/HamCockpitVoiceTap.cpp" "$HOST_DIR/"

if ! grep -q 'HamCockpitVoiceTap.o' "$HOST_DIR/Makefile"; then
  sed -i 's/\t\tTimer.o UARTController.o UDPController.o UDPSocket.o/\t\tTimer.o UARTController.o UDPController.o UDPSocket.o HamCockpitVoiceTap.o/' "$HOST_DIR/Makefile"
fi

if ! grep -q 'HAM_COCKPIT_VOICE_TAP' "$HOST_DIR/Makefile"; then
  sed -i 's/-DHAVE_LOG_H/-DHAVE_LOG_H -DHAM_COCKPIT_VOICE_TAP/' "$HOST_DIR/Makefile"
fi

python3 - "$HOST_DIR" <<'PY'
import pathlib, sys

root = pathlib.Path(sys.argv[1])

def add_include(path: pathlib.Path, header: str = "HamCockpitVoiceTap.h"):
    text = path.read_text(encoding="utf-8", errors="replace")
    needle = "#ifdef HAM_COCKPIT_VOICE_TAP\n#include \"HamCockpitVoiceTap.h\"\n#endif\n"
    if needle.strip() in text.replace("\r\n", "\n"):
        return
    if "HamCockpitVoiceTap.h" in text:
        return
    guard = "#include \"HamCockpitVoiceTap.h\"\n"
    ifdef = "#ifdef HAM_COCKPIT_VOICE_TAP\n#include \"HamCockpitVoiceTap.h\"\n#endif\n\n"
    # Depois do último #include local
    lines = text.splitlines(keepends=True)
    last_inc = 0
    for i, line in enumerate(lines):
        if line.startswith("#include \""):
            last_inc = i + 1
    lines.insert(last_inc, ifdef)
    path.write_text("".join(lines), encoding="utf-8")

def insert_all_after(text: str, anchor: str, insert: str) -> str:
    if insert.strip() in text:
        return text
    while True:
        idx = text.find(anchor)
        if idx < 0:
            break
        end = idx + len(anchor)
        text = text[:end] + insert + text[end:]
    return text

# DMRSlot — após FEC em frames de voz RF e rede
dmr = (root / "DMRSlot.cpp").read_text(encoding="utf-8", errors="replace")
for anchor in (
    "errors = m_fec.regenerateDMR(data + 2U);",
    "m_netErrs += m_fec.regenerateDMR(data + 2U);",
):
    dmr = insert_all_after(dmr, anchor, "\n#ifdef HAM_COCKPIT_VOICE_TAP\n\t\t\t\thcVoiceTapDmr(m_slotNo, data + 2U);\n#endif")
(root / "DMRSlot.cpp").write_text(dmr, encoding="utf-8")
add_include(root / "DMRSlot.cpp")

# D-Star — DV 9 bytes
dstar = (root / "DStarControl.cpp").read_text(encoding="utf-8", errors="replace")
t2 = "#ifdef HAM_COCKPIT_VOICE_TAP\n\t\t\t\thcVoiceTapDStar(data + 1U);\n#endif\n"
dstar = insert_all_after(dstar, "errors = m_fec.regenerateDStar(data + 1U);", t2)
dstar = insert_all_after(dstar, "errors = m_fec.regenerateDStar(data + 2U);", "#ifdef HAM_COCKPIT_VOICE_TAP\n\t\t\t\thcVoiceTapDStar(data + 2U);\n#endif\n")
(root / "DStarControl.cpp").write_text(dstar, encoding="utf-8")
add_include(root / "DStarControl.cpp")

# YSF — frame 120 bytes em áudio RF
ysf = (root / "YSFControl.cpp").read_text(encoding="utf-8", errors="replace")
t3 = "#ifdef HAM_COCKPIT_VOICE_TAP\n\t\t\t\thcVoiceTapYsf(data + 2U);\n#endif\n"
ysf = insert_all_after(ysf, "\t\t\tdata[0U] = TAG_DATA;\n\t\t\tdata[1U] = 0x00U;\n\n\t\t\twriteNetwork(data, m_rfFrames % 128U);", t3)
(root / "YSFControl.cpp").write_text(ysf, encoding="utf-8")
add_include(root / "YSFControl.cpp")

# Init no arranque
host = (root / "MMDVMHost.cpp").read_text(encoding="utf-8", errors="replace")
if "hcVoiceTapInit();" not in host:
    host = insert_all_after(
        host,
        'LogInfo("MMDVMHost-%s is starting", VERSION);',
        "#ifdef HAM_COCKPIT_VOICE_TAP\n\thcVoiceTapInit();\n#endif\n",
    )
(root / "MMDVMHost.cpp").write_text(host, encoding="utf-8")
add_include(root / "MMDVMHost.cpp")

print("apply-hc-voice-tap: ok", file=sys.stderr)
PY

echo "apply-hc-voice-tap: Ham Cockpit voice tap no MMDVMHost"