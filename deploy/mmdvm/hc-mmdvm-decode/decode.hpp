#pragma once

#include <cstdint>

#include "protocol.hpp"

class VoiceDecoder {
public:
  VoiceDecoder();
  ~VoiceDecoder();

  void reset();
  bool decodeFrame(HcVoiceMode mode, const uint8_t* payload, uint16_t len, int16_t* pcm8k, int* samples);

private:
  struct Impl;
  Impl* impl_;
};

void upsample6x(const int16_t* in, int nin, int16_t* out, int nout);