# Base de conhecimento — acessórios (não rádios)

Catálogo para expansão futura do Ham Cockpit. **Não há cards no console ainda.** Fonte estruturada: [`equipamentos.json`](equipamentos.json) (schema estável para o app).

## Escopo

Equipamentos de radioamador **exceto transceptores** (HF/VHF/UHF, HT, mobile, base). Só itens controláveis por serial CAT, Ethernet/Wi-Fi ou Bluetooth. Exceções documentadas: **QRO HF-2000/2500** e **RM Italy BLA/HLA/KL** (PTT/RF-sense, sem CAT; pedido explícito).

Gerado em 2026-11-11. Hamlib citado: wiki **4.7.1**.

## Como a relevância foi ordenada

Não existe market share público confiável. A ordem usa **proxies**: linha ainda fabricada, catálogo DX Engineering/HRO, reviews eHam, backend Hamlib `rotctld`/`ampctld`, menções em PstRotator/N1MM/AetherSDR/DDUtil. Tratar `rank` como prioridade de pesquisa, não como % de mercado.

## Top 42 (resumo)

| Rank | Fabricante | Modelo | Categoria | Hamlib | Prioridade Cockpit |
| --- | --- | --- | --- | --- | --- |
| 1 | Yaesu | GS-232B + G-800/1000/2800 DXC | Rotor | rotctld **603** (GS-232B) | P0 |
| 2 | Hy-Gain | DCU-1/3 / YRC-1 + HAM-IV/T2X | Rotor | **403** / **406** | P0 |
| 3 | Green Heron | RT-21 | Rotor | **405** | P0 |
| 4 | SPE Expert | 1.3K / 1.5K / 2K-FA | PA | ampctld **401–403** Beta | P1 |
| 5 | Elecraft | KPA1500 | PA | ampctld **201** Beta | P1 |
| 6 | Elecraft | KPA500 | PA | **não suportado** (macro comentada) | P1 |
| 7 | FlexRadio / 4O3A | Power Genius XL | PA | não | P1 |
| 8 | FlexRadio / 4O3A | Tuner Genius XL | ATU | não | P1 |
| 9 | SteppIR | SDA-100 / SDA-2000 | Yagi | não suportado | P2 |
| 10 | Elecraft | KAT500 | ATU | não suportado | P2 |
| 11 | Palstar | AT-AUTO / HF-AUTO | ATU | não suportado | P2 |
| 12 | Telepost | LP-100A | Wattímetro | não suportado | P2 |
| 13 | OM Power | OM2000A+ / OM2501A / OM4001A (+ OM2000+ / OM2500A) | PA | **não suportado** | P2 |
| 14 | ACOM | série S (700S/1200S…) | PA | não suportado | P2 |
| 15 | Palstar | LA-1K | PA | não suportado | P2 |
| 16 | Alpha | 87A / 9500 / 8410 | PA | não suportado | P2 |
| 17 | Ameritron (MFJ→ITU) | ALS-1306 / AL-80B / AL-811… | PA | não suportado | P3 |
| 18 | QRO Technologies | HF-2000 / HF-2500 | PA | não suportado | P4 |
| 19 | RM Italy | BLA600 / BLA350 Plus / HLA | PA | não suportado | P4 |
| 20 | SPID | Rot2Prog / MD-01 | Rotor | **901–903** | P0 |
| 21 | 4O3A | Antenna Genius | Switch | não suportado | P2 |
| 22 | LDG | AT-1000ProII / AT-600ProII | ATU | não suportado | P3 |
| 23 | Array Solutions | PowerMaster II | Wattímetro | não suportado | P3 |
| 24 | Hamlib/AMSAT | Easycomm I–III | Rotor (protocolo) | **201/202/204** | P1 |
| 25 | YO3DMU | PstRotator | Gateway | rotctld **3** | P1 |
| 26 | Array Solutions | Eight Pak / Bandmaster | Switch | não suportado | P3 |
| 27 | Hamation | MD-12 | Band decoder | não | P3 |
| 28 | M2 | RC2800 | Rotor | **1001–1003** | P2 |
| 29 | Prosistel | D / Combi-Track | Rotor | **1701–1704** | P2 |
| 30 | Icom + terceiros | CT-17 / USB CI-V | Interface | N/A (é o bus) | P1 |
| 31 | microHAM | Station Master / MK2R+ | Automação | não | P4 |
| 32 | Elgato | Stream Deck + HamDeck | Macro pad | não | P3 |
| 33 | Leo Bodnar | GPSDO (+ GPS NMEA) | GPS/NTP | não | P4 |
| 34 | EA4TX | ARS RCI | Rotor | **1101–1102** | P2 |
| 35 | Gemini | DX1200 / HF-1K | PA | ampctld **301** Stable | P4 |
| 36 | OM Power | OM10C | Combiner | não suportado | P4 |
| 37 | RF-KIT / RF-Power | RF2K-S / RF2K+ | PA | não suportado | P3 |
| 38 | OH8LQ | 3 kW LDMOS + control board | PA | não suportado | P3 |
| 39 | VK-AMPS | kit 1 kW / linha LAN / DX Master Pro | PA | não suportado | P3 |
| 40 | S21RC | Arduino LDMOS SSPA + Nextion | PA | não | P4 |
| 41 | RF Linear Amplifiers | paletes 1500/3000 W PEP | PA (kit) | não | P4 |
| 42 | W6PQL | Amplifier Control Board v6 | sequencer | não | P4 |

Detalhe por categoria:

- [rotors.md](rotors.md)
- [amplificadores.md](amplificadores.md) — índice canônico dos PAs (inclui ranks 37–42)
- [ldmos-homebrew.md](ldmos-homebrew.md) — detalhe RF Linear / OH8LQ / VK-AMPS / RF-KIT / S21RC / W6PQL
- [tuners-wattimetros.md](tuners-wattimetros.md)
- [switches-outros.md](switches-outros.md)

## Prioridade sugerida no Ham Cockpit

1. **P0 rotors** — `rotctld` na mesma arquitetura do hub CAT (`ser2net` → `:4533`).
2. **P1 PA Hamlib + Flex Genius + CI-V boxes + PstRotator/Easycomm** — `ampctld` SPE/KPA1500; KPA500 ASCII; PGXL TCP 9008 / TGXL 9010.
3. **P2** — KAT500, Palstar HF-AUTO/AT-AUTO (já há `docs/protocolos/atauto_protocol.txt`) e LA-1K (`AM1;` só; baud em gap), LP-100A, SteppIR (ponte PstRotator, sem opcodes inventados), OM Power e ACOM só com spec/manual oficial (não inventar TCP 10001 / frames 72 B); Alpha serial por geração (87A ≠ 9500 ≠ 8410).
4. **P3–P4** — Ameritron (band data / cabeçote sem spec), Genius Ethernet de antena, LDG TTL, QRO/RM Italy só PTT, Stream Deck como cliente HTTP, GPS/NTP no Pi.
5. **LDMOS kit/homebrew (ranks 37–42)** — atrás de SPE/Elecraft/PGXL. **RF-KIT** um degrau acima (REST `:8080` público; P3; plano de card, sem código neste ciclo). OH8LQ e VK-AMPS: P3 (UI/LAN existem; API/framing **não** públicos). S21RC, palete RF Linear e sequencer W6PQL: P4. Família clonada = W6PQL analógico **ou** Arduino+Nextion S21RC — **não** o mesmo binário dos três sites.

## Campos do JSON

`id`, `rank`, `maker`, `model`, `category`, `relevanceNotes`, `physicalDisplay`, `software`, `protocol`, `link` (baud/connector/pinout se público), `hamlib`, `cockpitPriority`, `cockpitNotes`, `sources`, `gaps`.

## Gaps globais

- Market share numérico: **não existe** fonte séria; proxies apenas.
- **Dummy loads, transverters, sequencers, fontes**: quase sempre analógico/PTT; fora do ranking.
- **Bluetooth**: nenhum acessório deste levantamento tem UUID BLE público confirmado (não inventar). Stream Deck/GPSDO não são CAT BLE. Kits LDMOS (RF Linear / OH8LQ / VK-AMPS) também sem SPP/BLE publicado.
- **VK3AMP TCP 5005 / UDP 5010**: AetherSDR usa; **bytes não publicados** — não implementar. **RF-KIT** REST `:8080` é o único desta família com spec HTML do fabricante.
- PowerMaster II, 8-Pak, ACOM oficial, OM Power XPort 10001, SteppIR Data Out, Ameritron RJ45 REMOTE, Palstar LA-1K (baud/status completo), microHAM Router: protocolo incompleto — **não implementar**.
- Wiki Antenna Genius: nesta sessão só o discovery UDP 9007 foi lido por completo.
- PGXL/TGXL: envelope ASCII e portas 9008/9010 estão no wiki/helpdesk; não recitar PDFs 4O3A inteiros.

## Fontes âncora

- [Hamlib Supported Rotators](https://github.com/Hamlib/Hamlib/wiki/Supported-Rotators)
- [Hamlib Supported Amplifiers](https://github.com/Hamlib/Hamlib/wiki/Supported-Amplifiers)
- Manuais: Yaesu GS-232B, Hy-Gain DCU, Green Heron RT-21, SPE 1.5K-FA + APG, Elecraft KPA1500/KPA500/KAT500, Palstar AT-AUTO e LA-1K, LP-100A, LDG meter spec, 4O3A Genius API, SteppIR Serial Interface 2021, OM Power OM2000A+/OM2000+/downloads, Flex/4O3A PGXL+TGXL, Alpha 87A/9500/8410, Ameritron ALS-1306, QRO HF-2000/2500DX, RM Italy BLA600/BLA350.
