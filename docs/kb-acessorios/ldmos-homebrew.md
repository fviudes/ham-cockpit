# PAs LDMOS caseiros / kits (RF Linear, OH8LQ, VK-AMPS e família de firmware)

Pesquisa 2026-11-11. **Não inventar opcodes.** Hamlib `ampctld` 4.7.1: **nenhum** destes itens. Cards no Ham Cockpit: **não implementar agora**, salvo o plano REST do **RF-KIT** (API pública; ver abaixo).

Ranking no catálogo principal (`README.md` / `equipamentos.json` / `amplificadores.md`): **37 RF-KIT (P3)** → **38 OH8LQ (P3)** → **39 VK-AMPS (P3)** → **40 S21RC (P4)** → **41 RF Linear (P4)** → **42 W6PQL (P4)**. Atrás de SPE/Elecraft/PGXL. Este arquivo é o detalhe satélite, não o índice.

## Resposta curta

| Pergunta | Achado |
| --- | --- |
| Os três produtos compartilham firmware/placa? | **Não.** Paletes RF Linear ≠ controlador OH8LQ ≠ kit/controlador VK-AMPS. |
| Mesmo software de PC? | **Não.** Não há um binário Windows/Android comum. AetherSDR trata **VK3AMP** (TCP 5005 / UDP 5010) e **RF-KIT** (HTTP 8080) como **dois dispositivos**. |
| Como falar IP? | RF Linear: **sem rede**. OH8LQ: Wi-Fi no Arduino **Giga**, IP no menu Nextion (DHCP ou estático); UI web no navegador — **porta HTTP não publicada**. VK-AMPS kit 1 kW: **sem Ethernet** na página do produto. Linha AetherSDR VK3AMP: TCP **5005** + UDP **5010** no IP da LAN (DHCP; ARP broadcast lento no Windows). RF-KIT RF2K-S: HTTP **8080**, DHCP/LAN. |
| Bluetooth? | **Nenhum UUID BLE / SPP** publicado nestas três fontes. DIY à parte (ESP32 CI-V / D1 Mini MQTT) não é o PA. |
| O que o painel poderia mostrar | Espelho do Nextion: Pout, SWR, Vds, Ids, temp, banda, STBY/OPER, alarmes. Só com protocolo **público**. |
| “Muita gente usa a mesma base” | Sim, mas são **duas famílias distintas**: (1) **W6PQL** sequencer **analógico**; (2) **Arduino Nano + Nextion + placa DXWORLD-E** (S21RC e clones visuais). OH8LQ e VK-AMPS **parecem** Nextion 5–7″, firmware **não é o mesmo binário**. |

## RF Linear Amplifiers (rank 41, P4)

**Fabricante:** loja EUA (contato 770-500-5945 / carmine2962@gmail.com; também citado como “RF Man”).

**Produtos (paletes, não PA de shack fechado):**

- 1500 W PEP HF: 1× Ampleon **BLF188XR**, 1,8–54 MHz, 50–56 V, 25–30 A, drive 0,5–1 W RMS, classe AB, placa 4″×7,5″.
- 3000 W PEP: 2× BLF188XR, 40–50 A, drive 1–1,5 W.
- Paletes de banda única 1000 W: **6 m**, **2 m**, **1,25 m (220 MHz)**.
- Kits: LPF de banda única, placa nua single/dual, copper spreader, **Keying Relay Circuit Kit**.

**Display / software / protocolo:** nenhum MCU, Nextion, app, HTTP, MQTT, USB CAT ou Bluetooth no catálogo. Bias = dois potenciômetros. LPF e atenuador **não inclusos**. Sem Hamlib.

**Cockpit:** no máximo PTT/GPIO se o construtor acrescentar um controlador de terceiros. Sem telemetria.

**Fontes:** [site](https://www.rflinear-amplifiers.com/), páginas 1500 W / 3000 W.

## OH8LQ — 3 kW LDMOS + placa de controle (rank 38, P3)

**Projeto:** Jari Ojala OH8LQ. Homebrew contest/DX; placas vendidas em lote.

**RF:** quatro módulos **ART1K6** (cada um abaixo de 400 W de carga), 160–10 m, chassis ~30 kg, diplexers (3ª harmônica para dummy), WaveNode SWR, PSU trifásica ~9 kW 50 V (HP ESP120 ou Huawei R4850G2 + CAN).

**Controle:** PCB 4 camadas v5.2 (KiCad; esquemático/BOM no site). MCU **Arduino DUE** *ou* **Arduino Giga R1 Wi-Fi**. Proteção **em hardware** (OCP, HiSWR, temp…); o firmware só reporta alarmes.

**Display local:** Nextion **NX8048P050-011R** (5″) ou **NX8048P070-011R** (7″). Telas: PWR (escala até 3 kW), SWR 1–5, Vds, FET A+B / C+D °C, Ids A–D 0–30 A, alarmes (HiPWR, HiSWR, OVCA–D, HiIN, HiVds, Temp, LPF), STBY/OPER, RX/TX, RESET, FAN, AUTO/MANUAL, bandas 160–10, SETTINGS.

**Rede:** só com **Giga**. Menu Wi-Fi: SSID, senha, hostname (ex. `powerqube`), DHCP ou IP/máscara/gateway estáticos, Current IP na tela. OTA do FW Arduino e do `.tft` Nextion a partir do **servidor OH8LQ**. Loader `loader_LDMOS_control_v1.2.zip` (não é o firmware-fonte do controlador; usa `Arduino_Portenta_OTA`).

**Remoto:** “Java-based web interface” no navegador; demo estática [POWER QUBE REMOTE PANEL](https://www.oh8lq.com/LDMOS%20control/index.html) (mesmos medidores). **Porta HTTP/WebSocket default não publicada.** CAT do rádio (não é o protocolo PC): Yaesu band data; Icom CI-V (ex. rádio `0x94`, controlador `0xE0`, 38400, timeout 200 ms); Kenwood CAT 19200 8N1. Conector J29 no PDF: módulo **ESP32 Wi-Fi** (UART) — caminho legado/DUE; o Giga tem Wi-Fi nativo.

**Software:** firmware **fechado** (OTA). `.tft` Nextion baixável. Sem app Windows/Android comum com VK-AMPS. Sem Hamlib.

**Cockpit (plano, sem opcodes):** não poll inventado. Opções honestas: (1) usuário abre o IP mostrado no Nextion num iframe/aba; (2) se OH8LQ publicar REST/WS, aí sim driver. **Não implementar.**

**Fontes:** [3 kW PA](https://www.oh8lq.com/index.php/3-kw-ldmos-linear-amplifier), [control board](https://www.oh8lq.com/index.php/ldmos-control-board), [PDF conectores](https://www.oh8lq.com/LDMOS%20control/LDMOS%20control%20card%20connectors%20and%20calibration.pdf).

## VK-AMPS (rank 39, P3)

**Fabricante:** VK-AMPS PTY LTD (Austrália), vk3amp@gmail.com.

**Não é um único produto.** Distinguir SKUs:

### Kit 1 kW HF/6 m (página da loja)

- Palete **MHT1803**, ~1000 W HF / ~800 W 6 m, 48–53 V, até 32 A, drive 3–5 W, LPF 7 bandas, 1× IN + 3× ANT SO-239.
- **Nextion 7″**: OV/OC/OT, Pmax, HiSWR, filtro errado; trimmers V/I/FWD/REF; decoder automático **Icom / Yaesu**; IDC; DB-9 **EXT Control**.
- Completar: caixa, dissipador, fonte 50 V, fans.
- **Ethernet/Bluetooth não citados** nesta página. Sem Hamlib.

### Linha que o AetherSDR chama “VK3AMP 600 / 1000 / 2000 W”

Só **rede**: TCP controle **5005**, UDP telemetria **5010**. Sem serial. Applet: PWR/REF/SWR, temp, V, I, banda, antena, código numérico de fault, BYPASS/AMP ON, cooling override, ANT 1–3, rail LOW/HIGH, RESET (~10 s). Windows: 1ª conexão 9–12 s (amp só responde ARP **broadcast**).

**Payload TCP/UDP: AetherSDR não publica os bytes.** Não copiar driver fechado. **Não implementar** no Cockpit até spec VK-AMPS.

### DX Master Pro (review QRZ)

8× MHT1803, ~2 kW SSB/CW, touch 7″, Cortex M7 600 MHz, BCD+CAT, **USB** + software “VK-Amps Remote” (temp, I, Pin, V, eficiência). **Não** é o REST do RF-KIT.

**Manuais:** [PDFs da loja](https://www.vk-amps.com/blogs/support-files/15103-documents) (inclui “VK3AMP Amplifier - User Manual”) — protocolo LAN **não** extraído como tabela de opcodes nesta pesquisa.

## RF-KIT RF2K-S / 2K+ (rank 37, P3; **não** é VK-AMPS)

AetherSDR periférico **separado**. Touch GUI no PA; LAN/Wi-Fi; CAT, UDP **N1MM RadioInfo** default **12060**, TCI (WebSocket, PA é **cliente** TCI).

**API REST pública** (firmware ≥ G108C132; AetherSDR testou G200C267; doc **RFKIT API 0.9.0**): HTTP **8080**, **sem login**.

Poll documentado (não inventado):

| Método | Caminho | Uso |
| --- | --- | --- |
| GET | `/info` | Detecção (`GET /info` JSON) |
| GET | `/data` | Status |
| GET | `/power` | Potência |
| GET | `/operate-mode` | OPERATE / STANDBY |
| PUT | `/operate-mode` | `{"operate_mode":"OPERATE"}` |
| GET | `/antennas` , `/antennas/active` | Antenas |
| PUT | `/antennas/active` | Seleção |
| GET | `/tuner` | L/C `{value, unit}` — **somente leitura** na API 0.9.0 |
| GET | `/operational-interface` | UNIV / CAT / UDP / TCI |
| PUT | `/error/reset` | Limpar erro |

Exemplo público: `GET http://192.168.50.209:8080/tuner` → JSON com `mode`, `L`, `C`. `GET /info` no browser = teste de link (AetherSDR).

**Plano Cockpit (só documentação):** card estilo SPE/PGXL — Pout/Pref/SWR, temp, V, I, banda, freq, interface, STBY/OPER, ANT 1–4, RESET ERR. Poll HTTP GET `/info` + `/data` ou `/power` + `/operate-mode` (intervalo tipo AetherSDR, da ordem de 100 ms noutros PAs — **medir** no RF2K). Sem PTT de rede. Sem Hamlib. **Não implementar neste ciclo** (pedido: só plano).

**Fontes:** [doc API](http://www.rf-kit.de/files/RFKIT_api_doc_0_9_0.html), [manual V14](http://www.rf-kit.de/files/User_Manual_RF2K-S_ENG_V14.pdf), [AetherSDR amplifiers](https://docs.aethersdr.com/amplifiers).

## Família de firmware comum (o que o usuário “vê igual”)

O visual **Nextion 3,5–7″ + barras Pout/SWR/temp** é o padrão de SSPA caseiro. **Não** implica o mesmo `.ino` / mesmo TCP.

### Família A — sequencer analógico W6PQL (rank 42, P4)

[Amplifier Control Board v6](https://www.w6pql.com/amplifier_control_board.htm): PTT → relé → bias/Vdd → libera RF (ALC hold-off); lockout SWR/temp; fan. **Sem UART de telemetria.** Clonado em KiCad: [zleffke/kicad_sequencer](https://github.com/zleffke/kicad_sequencer). ON7EQ usa W6PQL **mais** Arduino de *display*. Cockpit: GPIO/PTT só.

### Família B — Arduino Nano + Nextion + DXWORLD-E (S21RC, rank 40, P4)

Base mais clonada em HF LDMOS 500–1200 W:

- [s21rc/Arduino-LDMOS-SSPA-Controller](https://github.com/s21rc/Arduino-LDMOS-SSPA-Controller) (v1.x, GPL, Gerber + `.ino` + `.tft`)
- [s21rc/ldmos_sspa_controller_v2.1_lite](https://github.com/s21rc/ldmos_sspa_controller_v2.1_lite) (GPL-3.0; Lite **sem** proteção em software)
- [S21RC V2.0](https://s21rc.net/s21rc-ldmos-sspa-controller-v2-0/): **HEX** (não o C fonte; rotinas reutilizadas em produto comercial). Nextion 3,5/5/7″ Basic/Enhanced/Intelligent.

UI: Pout, SWR, temp, banda (touch ou rotary 8 pos.), FAN PWM, V, I (DXWORLD-E), PTT, callsign. **Sem Ethernet/MQTT/Bluetooth** no projeto. Telemetria = UART **Nextion** (protocolo HMI, não CAT). Cockpit só com ponte serial documentada pelo autor — **não há**.

### Família C — OH8LQ (DUE/Giga + Nextion 5/7″)

Parece B no painel; MCU, proteção HW, Wi-Fi e OTA **próprios**. Firmware **não** está no GitHub S21RC.

### Família D — VK-AMPS Nextion 7″

Parece B/C; decoder Icom/Yaesu e (em outros SKUs) LAN 5005/5010 ou USB Remote. Fonte **não** publicada como S21RC.

### Outros open source (não unificados)

| Projeto | MCU / UI | Rede | Notas |
| --- | --- | --- | --- |
| [ON7EQ Arduino SSPA](https://www.qsl.net/on7eq/projects/arduino_sspa.htm) (conceito F1JRD, MRFE6VP61K25H ~1,2–1,8 kW VHF) | Nano + LCD 4×40 + W6PQL | Serial debug | Sketches `.pde` no QSL |
| [K6JCA 500 W HF](https://k6jca.blogspot.com/2019/12/a-500-watt-hf-pa-part-6-front-panel-and.html) | Arduino Nano + LCD + medidor PWM | Paralelo FPGA-SDR / PTT RCA | Esquemáticos no blog; **sem** repo de firmware |
| [SP6GK Forte 600 W](https://github.com/SP6GK/RF_Power_Amplifier_Controller_V1) | STM32F103, LCD 16×2, MAX7219 | Sem IP | GPL-3.0, MRF300, FreeRTOS |
| [DK4JM DPAMP](https://dk4jm.de/t10/autogenerated-11/projekte/dpamp-software) (hw DG8DP) | Mega2560 + Raspberry Pi + touch 7″ Java | UI no Pi | Software ham-only; **não** misturar com OH8LQ |
| [PA2J SSPA](https://pa2j.pa6m.nl/SSPA-Controller/) | Nextion; código “depois / e-mail” | — | Derivado ON7EQ |
| [RaySspaController](https://www.rfstateside.com/projects/raysspacontroller) | Teensy 4.x + Nextion 1–4 módulos | Serial + TCP citados | Fonte “pending audit” — **não usar** |
| [JayGe/axisnt](https://github.com/JayGe/axisnt) | ESP8266 + Nextion + MQTT | MQTT `/radio/amp/set2` | ATV/Portsdown, não HF QRO |
| [MikeFoerster/ldmos-amplifier-if](https://github.com/MikeFoerster/ldmos-amplifier-if) + [LDMOS-Bluetooth-ESP32](https://github.com/MikeFoerster/LDMOS-Bluetooth-ESP32) | Arduino / ESP32 | CI-V / BT | Interface rádio↔PA, não telemetria do deck |
| [madpsy/xpa125b_controller](https://github.com/madpsy/xpa125b_controller) | ESP8266 D1 Mini | HTTP, REST, MQTT, BT serial | Xiegu/Hardrock/MiniPA — **não** LDMOS kW |
| RemoteQTH | — | Web/IP de **switch/rotor** | [remote_openController](https://github.com/dm5xx/remote_openController) = stackmatch, **não** PA |
| PE1RKI | Paletes VHF/UHF | — | RF, não controlador Nextion |
| IU4NBB, DL2MAN, HamStack, OpenAmp, ExpertAmp clone | — | — | **Nenhum** repo de controlador LDMOS QRO encontrado com esses nomes nesta busca (DL2MAN = sandwich QRP uSDX) |

## O que um card Cockpit poderia mostrar (quando houver protocolo)

Alinhado aos cards atuais (Pout, SWR, V/I, temp, banda, STBY/OPER, fault):

1. **RF-KIT** — campos REST acima (plano; HTTP 8080).
2. **VK3AMP LAN** — mesmos medidores **depois** de spec 5005/5010.
3. **OH8LQ** — mesmos medidores no Nextion/web; **sem** API.
4. **S21RC / kit VK / palete RF Linear** — local only; card informativo ou PTT.

**Bluetooth:** não documentar UUID. **Hamlib:** não.

## Como o Cockpit faria poll (regras)

- RF-KIT: GET JSON em `:8080` (tabela).
- VK3AMP: **não** poll até o fabricante/AetherSDR abrir o framing.
- OH8LQ: IP na UI; sem vocabulário.
- Nextion DIY: UART HMI do display ≠ protocolo de estação.
- CAT Icom/Kenwood/Yaesu nestes PAs = **seguir banda do rádio**, não telemetria do PA.
- N1MM UDP 12060 = frequência para o PA (RF-KIT); não substitui `/data`.
