#pragma once

#include <cstdint>

constexpr char HC_VOICE_MAGIC[4] = {'H', 'C', 'V', '1'};

enum HcVoiceMode : uint8_t {
  HC_MODE_DMR = 1,
  HC_MODE_DSTAR = 2,
  HC_MODE_YSF = 3,
  HC_MODE_P25 = 4,
  HC_MODE_NXDN = 5,
  HC_MODE_M17 = 6,
  HC_MODE_FM = 7,
};

enum HcVoiceKind : uint8_t {
  HC_KIND_FRAME = 0,
  HC_KIND_LOST = 1,
  HC_KIND_EOT = 2,
};

constexpr uint16_t HC_VOICE_PORT = 40094;