#pragma once

#include <cstdint>

// Extrai três blocos AMBE+2 (9 bytes, ordem DVSI) de um frame DMR de 33 bytes (pós-FEC).
bool dmrExtractAmbeTriple(const uint8_t frame[33], uint8_t ambe[3][9]);