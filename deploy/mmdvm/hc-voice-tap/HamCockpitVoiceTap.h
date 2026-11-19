/*
 * Ham Cockpit — exporta frames de voz do MMDVMHost para hc-mmdvm-decode (127.0.0.1:40094).
 * Compilado com -DHAM_COCKPIT_VOICE_TAP no bake/estação.
 */
#if !defined(HAM_COCKPIT_VOICE_TAP_H)
#define HAM_COCKPIT_VOICE_TAP_H

#include <cstdint>

#define HC_VOICE_ADDR "127.0.0.1"
#define HC_VOICE_PORT 40094U

#define HC_VOICE_MAGIC0 'H'
#define HC_VOICE_MAGIC1 'C'
#define HC_VOICE_MAGIC2 'V'
#define HC_VOICE_MAGIC3 '1'

#define HC_VOICE_MODE_DMR   1U
#define HC_VOICE_MODE_DSTAR 2U
#define HC_VOICE_MODE_YSF   3U
#define HC_VOICE_MODE_P25   4U
#define HC_VOICE_MODE_NXDN  5U
#define HC_VOICE_MODE_M17   6U
#define HC_VOICE_MODE_FM    7U

#define HC_VOICE_KIND_FRAME 0U
#define HC_VOICE_KIND_LOST  1U
#define HC_VOICE_KIND_EOT   2U

void hcVoiceTapInit();
void hcVoiceTapRaw(uint8_t mode, uint8_t kind, uint8_t slot, const uint8_t* payload, uint16_t len);

void hcVoiceTapDmr(unsigned int slotNo, const uint8_t* frame33);
void hcVoiceTapDStar(const uint8_t* dv9);
void hcVoiceTapYsf(const uint8_t* frame120);

#endif