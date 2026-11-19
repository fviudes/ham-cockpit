#include "decode.hpp"

#include "dmr_bits.hpp"

#include <cstring>
#include <mbelib-neo/mbelib.h>

namespace {

constexpr int SAMPLES_8K = 160;

void ambe72ToFr(const uint8_t b[9], char ambe_fr[4][24])
{
  for (int i = 0; i < 4; ++i)
    for (int j = 0; j < 24; ++j)
      ambe_fr[i][j] = 0;
  int idx = 0;
  for (int by = 0; by < 9; ++by) {
    for (int bi = 7; bi >= 0; --bi) {
      if ((b[by] >> bi) & 1)
        ambe_fr[idx / 24][idx % 24] = 1;
      ++idx;
      if (idx >= 96)
        return;
    }
  }
}

bool decodeAmbe2450(const uint8_t ambe9[9], int16_t* pcm, mbe_parms& cur, mbe_parms& prev, mbe_parms& enh)
{
  char ambe_fr[4][24];
  ambe72ToFr(ambe9, ambe_fr);
  mbe_process_result result {};
  const int rc = mbe_processAmbe3600x2450Frame(pcm, &result, ambe_fr, &cur, &prev, &enh);
  return rc >= 0;
}

bool decodeDStar9(const uint8_t dv9[9], int16_t* pcm, mbe_parms& cur, mbe_parms& prev, mbe_parms& enh)
{
  char ambe_fr[4][24];
  if (mbe_decodeDStarDVData(dv9, ambe_fr) < 0)
    return false;
  mbe_process_result result {};
  const int rc = mbe_processAmbe3600x2400Frame(pcm, &result, ambe_fr, &cur, &prev, &enh);
  return rc >= 0;
}

// YSF V/D mode: FEC já aplicado no Host; vocoder em ~bytes 12..20 (heurística Frame FR).
bool ysfExtractAmbe(const uint8_t frame120[120], uint8_t ambe9[9])
{
  if (frame120 == nullptr || ambe9 == nullptr)
    return false;
  std::memcpy(ambe9, frame120 + 12, 9);
  return true;
}

} // namespace

struct VoiceDecoder::Impl {
  mbe_parms dmrCur {}, dmrPrev {}, dmrEnh {};
  mbe_parms dsCur {}, dsPrev {}, dsEnh {};
  mbe_parms ysfCur {}, ysfPrev {}, ysfEnh {};
};

VoiceDecoder::VoiceDecoder() : impl_(new Impl) {}

VoiceDecoder::~VoiceDecoder()
{
  delete impl_;
}

void VoiceDecoder::reset()
{
  std::memset(impl_, 0, sizeof(Impl));
}

bool VoiceDecoder::decodeFrame(HcVoiceMode mode, const uint8_t* payload, uint16_t len, int16_t* pcm8k, int* samples)
{
  if (pcm8k == nullptr || samples == nullptr || payload == nullptr)
    return false;

  *samples = 0;
  switch (mode) {
  case HC_MODE_DMR:
    if (len < 33)
      return false;
    {
      uint8_t ambe[3][9];
      if (!dmrExtractAmbeTriple(payload, ambe))
        return false;
      if (!decodeAmbe2450(ambe[0], pcm8k, impl_->dmrCur, impl_->dmrPrev, impl_->dmrEnh))
        return false;
      *samples = SAMPLES_8K;
      return true;
    }
  case HC_MODE_DSTAR:
    if (len < 9)
      return false;
    if (!decodeDStar9(payload, pcm8k, impl_->dsCur, impl_->dsPrev, impl_->dsEnh))
      return false;
    *samples = SAMPLES_8K;
    return true;
  case HC_MODE_YSF:
    if (len < 120)
      return false;
    {
      uint8_t ambe9[9];
      if (!ysfExtractAmbe(payload, ambe9))
        return false;
      if (!decodeAmbe2450(ambe9, pcm8k, impl_->ysfCur, impl_->ysfPrev, impl_->ysfEnh))
        return false;
      *samples = SAMPLES_8K;
      return true;
    }
  default:
    return false;
  }
}

void upsample6x(const int16_t* in, int nin, int16_t* out, int nout)
{
  if (nin <= 0 || nout <= 0 || in == nullptr || out == nullptr)
    return;
  const int chunks = nin - 1;
  if (chunks <= 0) {
  out[0] = in[0];
    return;
  }
  int pos = 0;
  for (int i = 0; i < chunks && pos < nout; ++i) {
    const int16_t a = in[i];
    const int16_t b = in[i + 1];
    for (int s = 0; s < 6 && pos < nout; ++s) {
      const int num = 6 - s;
      out[pos++] = static_cast<int16_t>((a * num + b * s) / 6);
    }
  }
  while (pos < nout)
    out[pos++] = in[nin - 1];
}