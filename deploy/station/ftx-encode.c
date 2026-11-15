/* Tom FT8/FT4 em PCM 12 kHz. O pacote e o LDPC são do ft8_lib (MIT). */
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ft8/constants.h"
#include "ft8/encode.h"
#include "ft8/message.h"

#define FT8_BT 2.0f
#define FT4_BT 1.0f

static void gfsk_pulse(int n_spsym, float bt, float *pulse) {
  const float k = 5.336446f;
  for (int i = 0; i < 3 * n_spsym; ++i) {
    float t = (float)i / (float)n_spsym - 1.5f;
    pulse[i] = (erff(k * bt * (t + 0.5f)) - erff(k * bt * (t - 0.5f))) * 0.5f;
  }
}

static void synth(const uint8_t *sym, int n_sym, float f0, float bt, float period, int rate, float *out) {
  int n_spsym = (int)(0.5f + (float)rate * period);
  int n_wave = n_sym * n_spsym;
  int n_phi = n_wave + 2 * n_spsym;
  float *dphi = (float *)calloc((size_t)n_phi, sizeof(float));
  float *pulse = (float *)calloc((size_t)(3 * n_spsym), sizeof(float));
  if (!dphi || !pulse) exit(3);
  float step = (2.0f * (float)M_PI) / (float)n_spsym;
  float base = (2.0f * (float)M_PI * f0) / (float)rate;
  for (int i = 0; i < n_phi; ++i) dphi[i] = base;
  gfsk_pulse(n_spsym, bt, pulse);
  for (int i = 0; i < n_sym; ++i) {
    int ib = i * n_spsym;
    for (int j = 0; j < 3 * n_spsym; ++j) dphi[j + ib] += step * (float)sym[i] * pulse[j];
  }
  for (int j = 0; j < 2 * n_spsym; ++j) {
    dphi[j] += step * pulse[j + n_spsym] * (float)sym[0];
    dphi[j + n_sym * n_spsym] += step * pulse[j] * (float)sym[n_sym - 1];
  }
  float phi = 0.0f;
  for (int n = 0; n < n_wave; ++n) {
    out[n] = sinf(phi);
    phi = fmodf(phi + dphi[n + n_spsym], 2.0f * (float)M_PI);
  }
  int ramp = n_spsym / 8;
  if (ramp < 1) ramp = 1;
  for (int i = 0; i < ramp; ++i) {
    float env = (1.0f - cosf((2.0f * (float)M_PI * (float)i) / (2.0f * (float)ramp))) * 0.5f;
    out[i] *= env;
    out[n_wave - 1 - i] *= env;
  }
  free(dphi);
  free(pulse);
}

int main(int argc, char **argv) {
  if (argc != 5) {
    fprintf(stderr, "uso: ftx-encode FT8|FT4 Hz mensagem saida.s16\n");
    return 2;
  }
  int ft4 = strcmp(argv[1], "FT4") == 0;
  if (!ft4 && strcmp(argv[1], "FT8") != 0) return 2;
  float f0 = strtof(argv[2], NULL);
  if (!(f0 >= 200.0f && f0 <= 4000.0f)) return 2;
  ftx_message_t msg;
  if (ftx_message_encode(&msg, NULL, argv[3]) != FTX_MESSAGE_RC_OK) {
    fprintf(stderr, "mensagem recusada\n");
    return 3;
  }
  int nsym = ft4 ? FT4_NN : FT8_NN;
  uint8_t tones[128];
  if (nsym > (int)sizeof(tones)) return 3;
  if (ft4) ft4_encode(msg.payload, tones);
  else ft8_encode(msg.payload, tones);
  float period = ft4 ? FT4_SYMBOL_PERIOD : FT8_SYMBOL_PERIOD;
  float bt = ft4 ? FT4_BT : FT8_BT;
  int rate = 12000;
  int nsamp = (int)(0.5f + (float)nsym * period * (float)rate);
  float *wave = (float *)calloc((size_t)nsamp, sizeof(float));
  if (!wave) return 3;
  synth(tones, nsym, f0, bt, period, rate, wave);
  FILE *fp = fopen(argv[4], "wb");
  if (!fp) return 3;
  for (int i = 0; i < nsamp; ++i) {
    float x = wave[i] * 22000.0f;
    if (x > 32767.0f) x = 32767.0f;
    if (x < -32767.0f) x = -32767.0f;
    int16_t s = (int16_t)lrintf(x);
    if (fwrite(&s, sizeof(s), 1, fp) != 1) {
      fclose(fp);
      return 3;
    }
  }
  fclose(fp);
  free(wave);
  fprintf(stderr, "ok %s %d\n", argv[1], nsamp);
  return 0;
}
