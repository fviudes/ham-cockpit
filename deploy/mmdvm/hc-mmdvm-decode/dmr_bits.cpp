#include "dmr_bits.hpp"

#include <cstring>

namespace {

constexpr unsigned int DMR_A_TABLE[] = {
    0U, 4U, 8U, 12U, 16U, 20U, 24U, 28U, 32U, 36U, 40U, 44U, 48U, 52U, 56U, 60U, 64U, 68U, 1U, 5U, 9U, 13U, 17U, 21U};
constexpr unsigned int DMR_B_TABLE[] = {
    25U, 29U, 33U, 37U, 41U, 45U, 49U, 53U, 57U, 61U, 65U, 69U, 2U, 6U, 10U, 14U, 18U, 22U, 26U, 30U, 34U, 38U, 42U};
constexpr unsigned int DMR_C_TABLE[] = {
    46U, 50U, 54U, 58U, 62U, 66U, 70U, 3U, 7U, 11U, 15U, 19U, 23U, 27U, 31U, 35U, 39U, 43U, 47U, 51U, 55U, 59U, 63U,
    67U, 71U};

inline bool readBit(const uint8_t* bytes, unsigned int bit) { return (bytes[bit >> 3] >> (7U - (bit & 7U))) & 1U; }

void packAmbe24(unsigned int a, unsigned int b, unsigned int c, uint8_t out[9])
{
  uint8_t bits[72] = {};
  unsigned int bitPos = 0U;
  auto push24 = [&](unsigned int v) {
    for (int i = 23; i >= 0; --i) {
      if ((v >> i) & 1U)
        bits[bitPos / 8] |= static_cast<uint8_t>(1U << (7 - (bitPos % 8)));
      ++bitPos;
    }
  };
  push24(a);
  push24(b);
  push24(c);
  for (int i = 0; i < 9; ++i) {
    out[i] = 0;
    for (int b = 0; b < 8; ++b)
      if (bits[i * 8 + b])
        out[i] |= static_cast<uint8_t>(1U << (7 - b));
  }
}

bool demodAmbeBlock(const uint8_t* bytes, uint8_t out[9])
{
  unsigned int a = 0U, b = 0U, c = 0U;
  unsigned int mask = 0x800000U;
  for (unsigned int i = 0U; i < 24U; ++i, mask >>= 1U) {
    unsigned int a1Pos = DMR_A_TABLE[i];
    unsigned int a2Pos = a1Pos + 72U;
    if (a2Pos >= 108U)
      a2Pos += 48U;
    unsigned int a3Pos = a1Pos + 192U;
    if (readBit(bytes, a1Pos))
      a |= mask;
    if (readBit(bytes, a2Pos))
      b |= mask;
    if (readBit(bytes, a3Pos))
      c |= mask;
  }
  packAmbe24(a, b, c, out);
  return true;
}

} // namespace

bool dmrExtractAmbeTriple(const uint8_t frame[33], uint8_t ambe[3][9])
{
  if (frame == nullptr || ambe == nullptr)
    return false;

  // Um frame DMR de voz = um instante AMBE+2 (20 ms). Replicamos o mesmo bloco nas 3 posições
  // caso futuros taps enviem subframes separados.
  uint8_t one[9];
  demodAmbeBlock(frame, one);
  for (int i = 0; i < 3; ++i)
    std::memcpy(ambe[i], one, 9U);
  return true;
}