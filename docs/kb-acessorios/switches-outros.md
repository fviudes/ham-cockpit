# Switches, decoders, CI-V, GPS, Stream Deck

## 4O3A Antenna Genius (rank 21) — P2

Ethernet. Discovery UDP **9007** (`AG ip=… port=9007 …`). API TCP **9007**. Sem Hamlib. Vocabulário TCP: reler a wiki completa antes de driver.

## Array Solutions Eight Pak (rank 26) — P3

8 antenas × 2 rádios, lockout, 3 kW. PC RS-232/USB (comandos **não** no manual de instalação). Relés: CAT-5 `+12 / B / A / GND`. RatPak: só 12 V por porta, **sem** CAT.

Ameritron RCS-4: tensão no coax, sem serial.

## Hamation MD-12 (rank 27) — P3

CI-V ↔ Kenwood FA/Yaesu ↔ BCD. USB. ShackLAN. Serve mais como **ponte de banda** do que como card.

## Icom CT-17 / USB CI-V (rank 30) — P1

Acessório de barramento. 3,5 mm CI-V (ponta data, sleeve GND). Vários nós (PA SPE, Palstar, PC) no mesmo bus. Não é um rig Hamlib.

## microHAM Station Master (rank 31) — P4

Router Windows + COM virtuais. API não obtida — não implementar.

## Stream Deck (rank 32) — P3

USB HID. HamDeck/Node-RED. Cliente de ações HTTP do Cockpit, não device RF. Sem UUID BLE documentado aqui.

## GPSDO / NTP (rank 33) — P4

Leo Bodnar: 10 MHz analógico + USB de config (proprietário). NTP de shack: `gpsd`+`chrony`, NMEA **4800** + PPS. Não CAT.

## Fora do ranking (honestidade)

Dummy loads, transverters (DEM/Kuhne), sequencers VHF, fontes: em geral PTT/GPIO. UltraBeam: PstRotator, protocolo fechado. VK3AMP: AetherSDR cita TCP 5005 / UDP 5010 — não Hamlib. OM6BPF: BPF 200 W por BCD Yaesu a partir do PA OM, sem CAT próprio.
