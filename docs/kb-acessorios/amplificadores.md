# Amplificadores / PAs

Hamlib `ampctld` (wiki 4.7.1) só cobre: Dummy, NET, **KPA1500 201**, **Gemini 301**, **SPE 401/402/403**. Todo o resto é **não suportado** (incluindo PGXL, OM Power, ACOM, Palstar LA-1K, Alpha, Ameritron, QRO, RM Italy, RF-KIT, OH8LQ, VK-AMPS, S21RC, paletes RF Linear, W6PQL).

Ordem relativa **entre PAs** (proxies Cockpit, não market share): SPE → KPA1500 → KPA500 → **PGXL** → OM Power → ACOM → **LA-1K** → Alpha → Ameritron → QRO → RM Italy → Gemini → OM10C → **RF-KIT** → OH8LQ → VK-AMPS → S21RC → RF Linear → W6PQL.

## SPE Expert 1.3/1.5/2K-FA (rank 4) — P1

LCD: OPERATE, banda, Pout, SWR ATU/ant, V/I, temp, alarmes. Software `Term_*_USB` / `Term_*_232` (Windows). USB **ou** RS-232, 115200 8N1 típico.

Protocolo PC (APG 1.1): `55 55 55 | CNT | DATA | CHK`. Status `AA AA AA` + CSV. CAT do **rádio** no DE-15 é Icom/Kenwood/Yaesu/Band Data — outro cabo.

Hamlib **401–403** Beta.

## Elecraft KPA1500 (rank 5) — P1

PA estado sólido **1500 W** com **ATU integrado** (ANT 1/2), típico contest/DX. Não é o KPA500.

LCD 2 linhas + bargraphs. Utility Win/Mac/Linux; Remote TCP **4526**. Command server TCP/UDP **1500** (`^CP`). ASCII `^cmd;` (`^DS;` lê o display). Firmware **só USB Host**. Hamlib **201** Beta.

## Elecraft KPA500 (rank 6) — P1

Mesma família ASCII, sem Ethernet, 500 W (combo KAT500). 4800–38400 8N1 (AetherSDR usa 38400). Hamlib: `AMP_MODEL_ELECRAFT_KPA500` **comentado** — não há `-m`.

## FlexRadio / 4O3A Power Genius XL (rank 7) — P1

1500 W ICAS **100% duty cycle** (todas as modalidades; headroom ~2000 W; 220 VAC para potência plena). SO2R (70 dB entre entradas). LCD touch: POST, IP, OPER/STBY, Pout pico/média, SWR, V/I dreno, banda, fonte de band data, MEffA.

Controle do **PA**: Ethernet TCP **9008** (UDP discovery 9008 no subnet). Banner `V… [AUTH]`; `C<seq>|comando`; `R<seq>|<hex>|<msg>`. Wiki SmartSDR: `status`, `setup read`, `ifconf`, `catradio`, `flexradio`, `save`. Pareamento Flex: PTT **LAN**, medidores via Amplifier API do rádio. WAN: auth code + forward 9008.

CAT do **rádio** (DB-9 A/B, CI-V, BCD/PTB): dialetos Elecraft/Kenwood/Icom/Yaesu_1–3 — **não** misturar na porta já pareada com Flex. Sem `ampctld`.

Acoplador companheiro: **Tuner Genius XL** (rank 8, `tuners-wattimetros.md`) TCP **9010**.

## OM Power (rank 13 auto / rank 36 combiner) — P2 / P4

Tetrodo QRO (Eslováquia), catálogo DX Engineering / Array Solutions. **Não** está no `ampctld` 4.7.1. Ranking: abaixo de SPE/Elecraft/**PGXL** (Hamlib ou API LAN publicada) e **acima da ACOM S** (LAN oficial + software Windows).

### Linha automática atual — OM2000A+ / OM2501A / OM3501A / OM4001A — P2

Touch TFT **4,3"**: CAT/freq, banda-segmento, STBY/OPER, aquecimento (~180 s), MEAS (bargraphs), INFO (SN, FW, horas, tubo, rede), FAULTS (20). Auto-tune interno (não é ATU de shack separado). Antenas BCD até 10; BPF BCD (Yaesu) para OM6BPF.

CAT do **rádio** (não é o protocolo do PA): Icom, Elecraft, Kenwood, Ten-Tec Orion, Yaesu, CI-V microHAM, Flex, Anan; ou RF-sense / BAND DATA. TCVR DB-9: 2 RX-D, 3 TX-D, 5 GND. CI-V 3,5 mm (ponta = dados). Flex 6xxx: USB-serial + null-modem no TCVR, menu FLEXRADIO **9600**.

Controle do **PA**: Lantronix **XPort** XP1001000-05R. Software oficial **HF_PA_Manager 3.40/3.41** (Windows, downloads). Portas **9999** (setup) e **10001** (dados). IP default: OM2000A+ **192.168.1.211**, OM4001A **192.168.1.222**. GUI HTTP do XPort (sem user/senha de fábrica). Software: ON/OFF, STBY/OPER, antenas, faults, fine tune, vistas Minimal/Normal/Advanced.

DB-9 **PC** no manual = CAT pass-through para o PC, **não** telemetria do PA (OpsLog mediu silêncio no OM4000A). Firmware: null-modem no **TCVR**, **115200**, `MX460L.exe` — só upgrade.

**Não implementar** frames TCP 10001: OM Power não publica o vocabulário.

OM4001C: PA comercial contínuo (5–25 ou 10–30 MHz), mesma família touch/LAN — não é rádio.

### OM2000+ / OM2501HF / OM4001HF (manual)

Irmãos de sintonia manual. OM2000+: OLED **4×20**, LEDs ON AIR/STBY/FAULT/ON; CAT do rádio; **sem** HF_PA_Manager 3.x na página de downloads. eHam OM2000+ ~29 reviews. Menos prioridade Cockpit que a linha A+.

### Legado OM2500A / OM3500A / OM4000A

RCU 1.49/1.51 + **caixa remota** (loja: Remote control box 2500/3500/4000). O XPort está na caixa. O RJ45 no chassi do PA **não é Ethernet** (tensão que queima NIC) — ligar só à caixa remota.

### OM10C (rank 36) — P4

Combiner 10 kW PEP, 1,8–29,7 MHz, entradas SO-239, saída 7/16", touch 4,3", XPort IP default **192.168.1.233**, software remoto **1.04**. Não assumir o mesmo payload 10001 do PA. Sem Hamlib.

### Fontes e tuners OM Power

Não há ATU separado nem fonte de shack CAT. Auto-tune = modelos A/A+. OM6BPF = BPF 200 W por BCD. Transformadores toroidais (tipos 1–7) são reposição, sem protocolo.

Fontes: site/manuais OM Power; Hamlib wiki amps; eHam OM2000A+; DX Engineering; OpsLog wiki Amplifiers-and-Switches.

## ACOM série S (rank 14) — P2

9600 8N1. Telemetria comunitária (AetherSDR): frame 72 B `55 2F`. **Não implementar** sem manual ACOM.

## Palstar LA-1K (rank 15) — P2

LDMOS 1000 W PEP / CW ICAS, 1,8–54 MHz. TFT touch: OPR/STBY, banda, ANT 1–3, Pout, SWR, temp, faults (BYPASS SWR/TEMP/OVERDRIVE/+Vd). RF-sense (cabo de banda opcional). USB frontal **só firmware**.

PC: conector **RS-232 Band Control**, cabo straight + FTDI (comunidade); Kenwood no rádio = null-modem no manual. Palstar documenta **`AM1;`** (OPERATE; duas vezes se o filtro estiver errado). FW 1.05H: status RS-232 com keying 3/5/9 + versão. **Baud não está no user manual** — não inventar. TRX-Manager (FW ≥1.03H). Sem `ampctld`. Par do HF-AUTO (tuner separado).

## Alpha 87A / 9500 / 8410 (rank 16) — P2

Padrão ouro USA (ETO / Alpha Radio Products / Alpha RF Systems). Produção de unidades novas **encerrada / incerta** após a mudança para Ohio; **Dishtronix/Ten-Tec** lista suporte a 9500, 8410, 8406, 2100, 2000 (peças ~10 anos). 87A: micro antigo, peças difíceis. Sem `ampctld`. **Três protocolos PC — não misturar:**

- **87A:** RS-232 DB-25F, **4800 8N1** (pinos 9/12/22 = baud, não ligar ao PC). ASCII + Enter: `VER`, `STAT`, `OPER ON/OFF`, `BAND`, `FREQ`, `PWR`, `TUNE`/`LOAD`, `SF`/`HF`. AlphaRemote exige ROM **AlphaMax**.
- **9500:** USB FTDI ou RS-232, **115200 8N1**; habilitar com `+++`; sentenças `$APAnn,…*FCS`. USB e RS-232 exclusivos.
- **8410/8406:** USB VCP **115200**; login `#1,123456`; `# ,0,cmd` → `$APA20–26`. Monitor AE9K; FW ≥2.02e = OPER/STBY remoto.

## Ameritron (rank 17) — P3

Linha MFJ (Starkville encerrou **2024-05-17**). **ITU Corporation** anunciou em **2026-06-09** a compra de Ameritron + Mirage e a consolidação em Linton, IN (produção plena prevista até o fim de 2026).

- **ALS-1306 / 1406 / 606:** SS no-tune; band data (Icom tensão, Elecraft/Yaesu BCD, Kenwood RS-232 **só banda**); RJ45 **REMOTE** para cabeçote — vocabulário **não** está no manual.
- **ALS-600 + ARI-500 / ALS-500RC:** banda automática via CAT-5.
- **AL-80B, AL-811/H, AL-1500:** valvulados; RELAY+ALC, sem CAT.
- **RCS-12:** switch com band decoder (não é PA). RCS-4 = tensão no coax.

Sem utility PC de telemetria. Sem `ampctld`. **Não inventar** opcodes dos RJ45.

## QRO Technologies HF-2000 / HF-2500 (rank 18) — P4

USA, manutenção simples (HF-2000 = 2× 3-500ZG). Manuais: KEY XMT (12 V / 80 mA), +15 V XMT, ALC 0…−20 V. **Sem** serial/Ethernet/CAT. Fora do recorte CAT; listado a pedido.

## RM Italy BLA600 / BLA350 Plus / HLA (rank 19) — P4

Desktop italiano ainda fabricado. **BLA600:** 500 W HF+6 m, LCD 2×16, 3 antenas, PTT RCA **obrigatório**; o manual diz que **CAT não é necessário** (RF-sense). **BLA350 Plus:** ~300 W, LCD + medidor, PTT/ALC RCA. **HLA 150/300:** 12 V HF, LEDs/bargraph. **KL***: 10 m / 12 V; KL506V tem RJ45 de **cabeçote** (≤3 m), não CAT. Sem `ampctld`. Sem opcodes.

## RF-KIT RF2K-S / RF2K+ (rank 37) — P3

PA LDMOS ~2 kW (DH3NAB). Único desta leva com **REST JSON público** (`:8080`, spec 0.9.0). Sem `ampctld`. AetherSDR trata RF-KIT e VK3AMP como **dois** periféricos. Plano de card (sem código neste ciclo): GET `/info` + `/data` ou `/power` + `/operate-mode`. Abaixo de SPE/Elecraft/PGXL; um degrau acima dos outros LDMOS/homebrew.

## OH8LQ 3 kW + control board (rank 38) — P3

Arduino DUE/Giga + Nextion 5/7″; UI web no Giga (porta **não** publicada). Firmware OTA fechado. Visual Nextion parecido com S21RC/VK-AMPS — **binário diferente**. Sem poll inventado.

## VK-AMPS (rank 39) — P3

Três SKUs: kit 1 kW Nextion (sem Ethernet na página); linha AetherSDR LAN TCP **5005** / UDP **5010** (**framing não público**); DX Master Pro USB + app Remote. **Não** é o REST do RF-KIT. **Não** é firmware OH8LQ/S21RC.

## S21RC Arduino LDMOS SSPA (rank 40) — P4

Nano + Nextion + DXWORLD-E. Base open-source mais clonada. Sem Ethernet. V2.0 full = HEX. Não é o firmware OH8LQ nem VK-AMPS.

## RF Linear paletes (rank 41) — P4

Kits BLF188XR (1500/3000 W PEP HF etc.). Sem MCU, serial ou rede. Se o construtor acrescentar controlador, tratar OH8LQ/S21RC/W6PQL — não a palete.

## W6PQL Amplifier Control Board v6 (rank 42) — P4

Sequencer analógico (PTT/bias/Vdd). Sem UART de telemetria. ON7EQ pode acrescentar Arduino+LCD à parte.

RF Linear ≠ OH8LQ ≠ VK-AMPS ≠ RF-KIT: **não compartilham** placa nem binário. Detalhe e plano de poll: [ldmos-homebrew.md](ldmos-homebrew.md).

## Gemini DX1200 (rank 35) — P4

Hamlib **301** Stable; base de usuários pequena; manual não obtido aqui.

## Fontes

SPE APG + manual 1.5K-FA; Elecraft Programming Reference KPA1500/KPA500; Flex/4O3A PGXL User Guide + wiki PowerGenius-Ethernet-API; Hamlib wiki amps; AetherSDR amplifiers; OM Power product/downloads + manual OM2000A+; Alpha 87A/9500/8410 PDFs; Ameritron ALS-1306; QRO HF-2000/2500DX; Palstar LA-1K; RM Italy BLA600/BLA350; rflinear-amplifiers.com; oh8lq.com; vk-amps.com; RF-KIT API 0.9.0.
