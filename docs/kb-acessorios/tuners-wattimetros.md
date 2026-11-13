# Tuners e wattímetros

Hamlib **não** tem daemon de ATU nem de wattímetro.

## FlexRadio / 4O3A Tuner Genius XL (rank 8) — P1

Acoplador 1500 W ICAS / pico 2000 W, 1,8–54 MHz, até 10:1, memória <20 ms. LCD touch 4,5": SWR, P, C-L-C, porta, fonte de freq, IP. Utility Windows; AetherSDR TCP **9010** (`C<id>|…`, banner `AUTH` na WAN). PTT LAN com Flex. Companheiro do **PGXL** (TCP 9008) — ver `amplificadores.md`. Sem Hamlib.

## Elecraft KAT500 (rank 10) — P2

LCD antena/SWR/L-C. PC DATA 4800–38400 8N1, comandos ASCII `;`. Utility autodetect com `;`. Jack Icom START/KEY separado.

## Palstar AT-AUTO / HF-AUTO (rank 11) — P2

AT-AUTO: Smart mode escuta CI-V/Kenwood/Yaesu. Default **9600 8N1**. DB-9 pin 2/3/5; **pin 7 = reset** — não ligar. CI-V addr **0xE0**, frames `FE FE … FD`. Cópia no repo: [`docs/protocolos/atauto_protocol.txt`](../protocolos/atauto_protocol.txt).

HF-AUTO: app **W1TR** + UDP XML. Relatos Flex: RS-232 de fábrica é sobretudo firmware — **não** assumir os opcodes do AT-AUTO. Palstar posiciona o **LA-1K** como PA companheiro (ver `amplificadores.md`); protocolos distintos.

## OM Power — sem ATU de shack

Auto-tune é **interno** aos PAs A/A+ (segmentos de banda). A categoria da loja “Tuners & Filters” é OM6BPF (BPF) + caixas remotas, não Palstar/Elecraft-like.

## LDG AT-1000ProII (rank 22) — P3

Jack mini-DIN 4 do medidor: **TTL 38400 8N1**. Pin 1 +12, 2 GND, 3 RX, 4 TX. Wake `0x20` + `F/T/A/P/C/M/S/X`. **Não** ligar RS-232 ±12 V. Cabo S-video genérico pode danificar.

## Telepost LP-100A (rank 12) — P2

GVFD: P, SWR, Z/θ, dBm. VCP Windows. **115200 8N1**, cabo straight. Poll `P` → CSV 43 bytes `;power,Z,phase,…,SWR`. FW antigo: 38400/19200.

## Array Solutions PowerMaster II (rank 23) — P3

Display potência/SWR/alarmes. USB xor RS-232, baud 9600/19200/**38400**. Frames do **PM1** (KE9NS) **não** devem ser copiados às cegas para o PM II.

## LP-500/700

Display gráfico rico; protocolo **não extraído** nesta pesquisa — gap.
