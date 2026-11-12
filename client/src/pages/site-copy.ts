import type { Pair } from "./site-lang";

export const NAV = {
  station: { pt: "ESTAÇÃO", en: "STATION" } satisfies Pair,
  home: { pt: "Início", en: "Home" } satisfies Pair,
  docs: { pt: "Documentação", en: "Docs" } satisfies Pair,
  manual: { pt: "Manual", en: "Manual" } satisfies Pair,
  console: { pt: "Abrir console", en: "Open console" } satisfies Pair,
  download: { pt: "Download", en: "Download" } satisfies Pair,
};

export const HOME = {
  kicker: { pt: "O COMPUTADOR DA ESTAÇÃO", en: "THE STATION COMPUTER" } satisfies Pair,
  h1a: { pt: "O computador do shack.", en: "The shack computer." } satisfies Pair,
  h1b: {
    pt: " Um Raspberry Pi, um navegador, a estação inteira.",
    en: " One Raspberry Pi, one browser, the whole station.",
  } satisfies Pair,
  lead: {
    pt: "O Ham Cockpit transforma um Raspberry Pi 3, 4 ou 5 no computador central da sua estação de radioamador. Ele conversa com o rádio, o amplificador, o wattímetro e o logbook. Você opera tudo pelo navegador, no celular ou no notebook. Chega de vários programas do Windows brigando pela mesma porta COM.",
    en: "Ham Cockpit turns a Raspberry Pi 3, 4 or 5 into the central computer of your ham station. It talks to the radio, the amplifier, the wattmeter and the logbook. You run everything from a browser, on a phone or a laptop. No more Windows programs fighting over the same COM port.",
  } satisfies Pair,
  openConsole: { pt: "Abrir o console", en: "Open the console" } satisfies Pair,
  fullDocs: { pt: "Documentação completa", en: "Full documentation" } satisfies Pair,
  osImage: { pt: "Baixar a imagem", en: "Get the image" } satisfies Pair,
  imageLabel: { pt: "Imagem mais recente", en: "Latest image" } satisfies Pair,
  creds: {
    pt: "Use Chrome ou Edge · Usuário admin, senha 1234 · Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit) · http://192.168.4.1/console · ham-cockpit.local",
    en: "Use Chrome or Edge · User admin, password 1234 · Wi‑Fi Ham-Cockpit-XXXX (password hamcockpit) · http://192.168.4.1/console · ham-cockpit.local",
  } satisfies Pair,
  photoConsole: {
    pt: "Você opera pelo Chrome. O Pi fica no shack, com rádio, wattímetro, logbook e Hamlib no mesmo aparelho.",
    en: "You operate from Chrome. The Pi stays in the shack, with radio, wattmeter, logbook and Hamlib in one box.",
  } satisfies Pair,
  photoConsoleAlt: {
    pt: "Console Ham Cockpit no notebook, com o rádio e o wattímetro na mesa",
    en: "Ham Cockpit console on a laptop, with the radio and wattmeter on the desk",
  } satisfies Pair,
  archLabel: { pt: "Arquitetura", en: "Architecture" } satisfies Pair,
  archTitle: {
    pt: "O Pi fica no centro da estação",
    en: "The Pi sits at the center of the station",
  } satisfies Pair,
  photoShack: {
    pt: "O rádio e os acessórios ligam no Pi por Bluetooth, USB ou serial. Você só abre o navegador.",
    en: "The radio and accessories connect to the Pi by Bluetooth, USB or serial. You only open the browser.",
  } satisfies Pair,
  photoShackAlt: {
    pt: "Estação com Raspberry Pi, rádio QRP e wattímetro no mesmo posto",
    en: "Station with a Raspberry Pi, QRP radio, and wattmeter on the same desk",
  } satisfies Pair,
  figStation: {
    pt: "IC-705 por Bluetooth LE · Lextel por Bluetooth Classic · ser2net cuida das portas seriais · MMDVM Host cuida do modem · Wavelog :8086 · Hamlib :4532.",
    en: "IC-705 over Bluetooth LE · Lextel over Classic Bluetooth · ser2net owns the serial ports · MMDVM Host owns the modem · Wavelog :8086 · Hamlib :4532.",
  } satisfies Pair,
  archP: {
    pt: "O Pi divide a estação em quatro partes. 1) Rádio: Bluetooth direto no navegador ou cabo USB. 2) Acessórios: SPE, Hamplus, Palstar, LDG, LP-100A e ACOM, cada um por uma porta de rede interna. 3) Programas: Wavelog, WaveLogGate, Hamlib e nginx. 4) MMDVM: hotspot e repetidora digital. Atenção: o GPIO do Pi trabalha em 3,3 V. Nunca ligue nele o RS232 de um amplificador. Use um adaptador USB-serial. O HAT MMDVM é a única exceção, porque já é 3,3 V.",
    en: "The Pi splits the station into four parts. 1) Radio: Bluetooth straight from the browser, or a USB cable. 2) Accessories: SPE, Hamplus, Palstar, LDG, LP-100A and ACOM, each on an internal network port. 3) Programs: Wavelog, WaveLogGate, Hamlib and nginx. 4) MMDVM: digital hotspot and repeater. Warning: the Pi GPIO runs at 3.3 V. Never connect an amplifier RS232 line to it. Use a USB-serial adapter. The MMDVM HAT is the only exception, because it is already 3.3 V.",
  } satisfies Pair,
  thLayer: { pt: "Camada", en: "Layer" } satisfies Pair,
  thRuns: { pt: "O que roda", en: "What runs" } satisfies Pair,
  thTalks: { pt: "Como se comunica", en: "How it talks" } satisfies Pair,
  flowLabel: { pt: "Passo a passo", en: "Step by step" } satisfies Pair,
  flowTitle: {
    pt: "Do cartão SD ao primeiro QSO",
    en: "From the SD card to the first QSO",
  } satisfies Pair,
  figBoot: {
    pt: "Grave a imagem no cartão → ligue o Pi → conecte no Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit) → abra 192.168.4.1 → entre com admin / 1234.",
    en: "Write the image to the card → power on the Pi → join Wi‑Fi Ham-Cockpit-XXXX (password hamcockpit) → open 192.168.4.1 → sign in with admin / 1234.",
  } satisfies Pair,
  figIc705: {
    pt: "IC-705: no rádio, abra Pairing Reception. No console, clique em Conectar e aceite Ham-Cockpit-Web01. Marque Principal: daí em diante, o login reconecta o rádio.",
    en: "IC-705: on the radio, open Pairing Reception. In the console, click Connect and accept Ham-Cockpit-Web01. Tick Primary: from then on, signing in reconnects the radio.",
  } satisfies Pair,
  figDual: {
    pt: "O IC-705 (GATT) e o wattímetro MS-2000 (SPP) usam o mesmo adaptador Bluetooth. O Lextel reconecta sozinho pelo servidor; o 705 reconecta pelo Chrome depois da primeira autorização.",
    en: "The IC-705 (GATT) and the MS-2000 wattmeter (SPP) share one Bluetooth adapter. Lextel reconnects by itself on the server; the 705 reconnects in Chrome after the first grant.",
  } satisfies Pair,
  intLabel: { pt: "Integrações", en: "Integrations" } satisfies Pair,
  intTitle: {
    pt: "Quem conversa com quem, e em qual porta",
    en: "What talks to what, and on which port",
  } satisfies Pair,
  figWavelog: {
    pt: "WSJT-X (UDP 2333) → WaveLogGate → Wavelog → QSO no logbook (:8086). O controle do rádio é opcional, pelo Hamlib em 127.0.0.1:4532.",
    en: "WSJT-X (UDP 2333) → WaveLogGate → Wavelog → QSO in the logbook (:8086). Radio control is optional, through Hamlib at 127.0.0.1:4532.",
  } satisfies Pair,
  wavelogP: {
    pt: "O Wavelog roda em Docker (PHP + MariaDB) e usa a porta 8086, não a 80. No primeiro acesso, abra http://IP-do-Pi:8086/install e use wavelog-db como host do banco. O WaveLogGate recebe o log do WSJT-X (UDP 2333), publica a frequência do rádio a cada 4 s e aceita QSY pela porta 54321. O modo contest 3.0 também usa o rádio via CAT.",
    en: "Wavelog runs in Docker (PHP + MariaDB) on port 8086, not 80. On the first visit, open http://Pi-IP:8086/install and use wavelog-db as the database host. WaveLogGate receives the WSJT-X log (UDP 2333), publishes the radio frequency every 4 s and accepts QSY on port 54321. Contest 3.0 mode also uses the radio through CAT.",
  } satisfies Pair,
  photoLogbook: {
    pt: "Logbook em :8086, com LoTW, eQSL, Club Log, DXCC e consulta de indicativo (QRZ). O rádio aparece em Hardware Interfaces porque o Gate publica a frequência.",
    en: "Logbook on :8086, with LoTW, eQSL, Club Log, DXCC and QRZ callsign lookup. The radio shows under Hardware Interfaces because the Gate publishes the frequency.",
  } satisfies Pair,
  photoLogbookAlt: {
    pt: "Logbook Wavelog no notebook da estação",
    en: "Wavelog logbook on the station laptop",
  } satisfies Pair,
  figSer2net: {
    pt: "Só o ser2net abre a porta serial. Os programas se conectam pelo Hamlib NET. Nunca dois programas no mesmo cabo.",
    en: "Only ser2net opens the serial port. Programs connect through Hamlib NET. Never two programs on the same cable.",
  } satisfies Pair,
  ser2netP: {
    pt: "No Config Device Wizard você liga uma serial USB a uma porta TCP (127.0.0.1:4001 em diante) e escolhe o equipamento. O rádio por cabo vira um rigctld (modelo 3085 no IC-705). O SPE usa o ampctld. ACOM e LP-100A falam o protocolo próprio direto na porta TCP.",
    en: "In the Config Device Wizard you bind a USB serial port to a TCP port (127.0.0.1:4001 onward) and pick the equipment. A cabled radio becomes a rigctld (model 3085 on the IC-705). The SPE uses ampctld. ACOM and LP-100A speak their own protocol straight on the TCP port.",
  } satisfies Pair,
  figMmdvm: {
    pt: "Rádio digital → modem MMDVM (UART 115200) → MMDVM Host → DMR Gateway :62031 (BrandMeister, TGIF, DMR+, XLX). Os últimos ouvidos vêm de /var/log/mmdvm.",
    en: "Digital radio → MMDVM modem (UART 115200) → MMDVM Host → DMR Gateway :62031 (BrandMeister, TGIF, DMR+, XLX). Last heard comes from /var/log/mmdvm.",
  } satisfies Pair,
  mmdvmP: {
    pt: "Em Operação → MMDVM você controla o hotspot ou a repetidora digital, no mesmo visual do console. O aparelho usa os mesmos serviços do WPSD e do Pi-Star (MMDVM Host, DMR Gateway, arquivos INI e últimos ouvidos), mas sem o painel PHP. Código estudado: WPSD-M17/WPSD-WebCode e g4klx/MMDVMHost.",
    en: "Under Operate → MMDVM you control the digital hotspot or repeater, in the same look as the console. The unit uses the same services as WPSD and Pi-Star (MMDVM Host, DMR Gateway, INI files and last heard), without the PHP dashboard. Code we studied: WPSD-M17/WPSD-WebCode and g4klx/MMDVMHost.",
  } satisfies Pair,
  thSvc: { pt: "Serviço", en: "Service" } satisfies Pair,
  thPath: { pt: "Pasta / unidade", en: "Path / unit" } satisfies Pair,
  thPort: { pt: "Porta", en: "Port" } satisfies Pair,
  thNotes: { pt: "Observações", en: "Notes" } satisfies Pair,
  gearLabel: { pt: "Equipamentos", en: "Gear" } satisfies Pair,
  gearTitle: {
    pt: "Icom, Kenwood, Yaesu, Flex, Xiegu, HL2, Anan e acessórios, tudo no mesmo cadastro",
    en: "Icom, Kenwood, Yaesu, Flex, Xiegu, HL2, Anan and accessories, all in one list",
  } satisfies Pair,
  photoRadio: {
    pt: "IC-705 por Web Bluetooth: serviço 14cf8001, endereço CI-V 0xA4, nome Ham-Cockpit-Web01. Sem cabo.",
    en: "IC-705 over Web Bluetooth: service 14cf8001, CI-V address 0xA4, name Ham-Cockpit-Web01. No cable.",
  } satisfies Pair,
  photoRadioAlt: {
    pt: "Rádio QRP portátil e celular com o console Ham Cockpit",
    en: "Portable QRP radio and a phone showing the Ham Cockpit console",
  } satisfies Pair,
  photoGear: {
    pt: "Acessórios RS232 (±12 V) entram por um adaptador USB-serial com MAX3232. O wizard escolhe a velocidade e a porta TCP.",
    en: "RS232 accessories (±12 V) come in through a USB-serial adapter with a MAX3232. The wizard picks the speed and the TCP port.",
  } satisfies Pair,
  photoGearAlt: {
    pt: "Wattímetro, amplificador e adaptador USB-RS232 na bancada",
    en: "Wattmeter, amplifier, and USB-RS232 adapter on the bench",
  } satisfies Pair,
  thDev: { pt: "Equipamento", en: "Device" } satisfies Pair,
  thLink: { pt: "Conexão", en: "Link" } satisfies Pair,
  thSerial: { pt: "Velocidade / porta", en: "Speed / port" } satisfies Pair,
  thProto: { pt: "Protocolo", en: "Protocol" } satisfies Pair,
  recipesLabel: { pt: "Receitas", en: "Recipes" } satisfies Pair,
  recipesTitle: {
    pt: "Quatro estações que o mesmo cartão atende",
    en: "Four stations the same card covers",
  } satisfies Pair,
  cablesLabel: { pt: "Cabos", en: "Cables" } satisfies Pair,
  cablesTitle: {
    pt: "USB e Bluetooth. RS232 de amplificador nunca no GPIO.",
    en: "USB and Bluetooth. Amplifier RS232 never on the GPIO.",
  } satisfies Pair,
  cablesP: {
    pt: "O IC-705 e o Lextel não precisam de conversor. SPE, Palstar, Hamplus, ACOM e LP-100A usam RS232 de PC (±12 V). O GPIO do Pi é 3,3 V: ligar um cabo de amplificador direto nele queima o Pi. Use um adaptador USB-serial e, no Pi, o caminho /dev/serial/by-id/…",
    en: "The IC-705 and Lextel need no converter. SPE, Palstar, Hamplus, ACOM and LP-100A use PC RS232 (±12 V). The Pi GPIO is 3.3 V: wiring an amplifier cable straight to it burns the Pi. Use a USB-serial adapter and, on the Pi, the /dev/serial/by-id/… path.",
  } satisfies Pair,
  figAcom: {
    pt: "ACOM 2000A: 1200 8N1, cabo null-modem apenas com os pinos 2–3, 3–2 e 5–5. O CAT do rádio vai no RCU. LP-100A: cabo reto, 115200 8N1.",
    en: "ACOM 2000A: 1200 8N1, null-modem cable with pins 2–3, 3–2 and 5–5 only. Radio CAT goes on the RCU. LP-100A: straight cable, 115200 8N1.",
  } satisfies Pair,
  ctaTitle: { pt: "Ligue a sua estação", en: "Bring up your station" } satisfies Pair,
  ctaP: {
    pt: "Grave a imagem no cartão, ligue o Pi e abra o console. O manual do operador (PT-BR e EN-US) fica dentro do console, e cada seção tem um botão que abre a aba certa.",
    en: "Write the image to the card, power on the Pi and open the console. The operator manual (Brazilian Portuguese and US English) lives inside the console, and each section has a button that opens the right tab.",
  } satisfies Pair,
  ctaPortalP: {
    pt: "Baixe a imagem, grave no cartão e ligue o Pi. O manual do operador explica cada passo, do primeiro Wi‑Fi ao primeiro QSO.",
    en: "Download the image, write it to the card and power on the Pi. The operator manual walks through every step, from the first Wi‑Fi to the first QSO.",
  } satisfies Pair,
  readDocs: { pt: "Ler a documentação", en: "Read the docs" } satisfies Pair,
  readManual: { pt: "Manual do operador", en: "Operator manual" } satisfies Pair,
  footerRight: {
    pt: "Ham Cockpit é um aparelho completo (imagem para Raspberry Pi), não firmware de ESP32.",
    en: "Ham Cockpit is a complete appliance (a Raspberry Pi image), not ESP32 firmware.",
  } satisfies Pair,
};

export const HOME_LAYERS: { layer: Pair; runs: Pair; talks: Pair }[] = [
  {
    layer: { pt: "Navegador", en: "Browser" },
    runs: { pt: "Console React (Chrome ou Edge)", en: "React console (Chrome or Edge)" },
    talks: { pt: "HTTP :80 · Web Bluetooth do IC-705", en: "HTTP :80 · IC-705 Web Bluetooth" },
  },
  {
    layer: { pt: "Aparelho", en: "Appliance" },
    runs: { pt: "Node do Ham Cockpit + nginx", en: "Ham Cockpit Node + nginx" },
    talks: { pt: "/opt/ham-cockpit · serviço ham-cockpit.service", en: "/opt/ham-cockpit · ham-cockpit.service" },
  },
  {
    layer: { pt: "Serial pela rede", en: "Serial over network" },
    runs: { pt: "ser2net 4", en: "ser2net 4" },
    talks: { pt: "127.0.0.1:4001+ · único processo na porta serial", en: "127.0.0.1:4001+ · only process on the serial port" },
  },
  {
    layer: { pt: "CAT pela rede", en: "CAT over network" },
    runs: { pt: "rigctld / ampctld (libhamlib-utils)", en: "rigctld / ampctld (libhamlib-utils)" },
    talks: { pt: "4532 rádio · 4531 SPE · 4534 CAT2", en: "4532 radio · 4531 SPE · 4534 CAT2" },
  },
  {
    layer: { pt: "Logbook", en: "Logbook" },
    runs: { pt: "Wavelog em Docker + WaveLogGate", en: "Wavelog in Docker + WaveLogGate" },
    talks: { pt: ":8086 · UDP 2333 · QSY 54321", en: ":8086 · UDP 2333 · QSY 54321" },
  },
  {
    layer: { pt: "Rádio Bluetooth LE", en: "Bluetooth LE radio" },
    runs: { pt: "Web Bluetooth no Chrome", en: "Web Bluetooth in Chrome" },
    talks: { pt: "serviço 14cf8001 · nome Ham-Cockpit-Web01", en: "service 14cf8001 · name Ham-Cockpit-Web01" },
  },
  {
    layer: { pt: "Wattímetro Bluetooth", en: "Bluetooth wattmeter" },
    runs: { pt: "Lextel, Bluetooth Classic (SPP)", en: "Lextel, Classic Bluetooth (SPP)" },
    talks: { pt: "rfcomm / COM de saída · PIN 1234 ou 0000", en: "rfcomm / outgoing COM · PIN 1234 or 0000" },
  },
  {
    layer: { pt: "MMDVM / WPSD", en: "MMDVM / WPSD" },
    runs: { pt: "MMDVM Host + DMR Gateway", en: "MMDVM Host + DMR Gateway" },
    talks: { pt: "UART do modem · 127.0.0.1:62031 · controle remoto 7642", en: "Modem UART · 127.0.0.1:62031 · remote control 7642" },
  },
];

export const HOME_FLOW: { n: string; title: Pair; body: Pair }[] = [
  {
    n: "01",
    title: { pt: "Boot do cartão", en: "Card boot" },
    body: {
      pt: "O Ubuntu 24.04 ARM64 sobe com o ham-cockpit.target: Docker, nginx (:80), ser2net, Wavelog (:8086) e Gate (UDP 2333). O Wi‑Fi próprio do Pi (192.168.4.1) sobe com ou sem cabo de rede.",
      en: "Ubuntu 24.04 ARM64 starts ham-cockpit.target: Docker, nginx (:80), ser2net, Wavelog (:8086) and Gate (UDP 2333). The Pi's own Wi‑Fi (192.168.4.1) comes up with or without a network cable.",
    },
  },
  {
    n: "02",
    title: { pt: "Login no console", en: "Console login" },
    body: {
      pt: "Entre com admin / 1234. O clique em Entrar é o gesto que o Chrome exige: o rádio marcado como Principal tenta reconectar sozinho e repete a tentativa a cada 2 s.",
      en: "Sign in with admin / 1234. The Sign in click is the gesture Chrome requires: the radio marked Primary tries to reconnect by itself and retries every 2 s.",
    },
  },
  {
    n: "03",
    title: { pt: "Wizard e ser2net", en: "Wizard and ser2net" },
    body: {
      pt: "Cada acessório ganha uma serial USB, uma porta TCP e uma velocidade (baud). A aba do equipamento só escolhe essa conexão. O rádio por cabo é uma linha do tipo Rádio na aba ser2net.",
      en: "Each accessory gets a USB serial port, a TCP port and a speed (baud). The device tab only picks that connection. A cabled radio is a Radio-type row on the ser2net tab.",
    },
  },
  {
    n: "04",
    title: { pt: "Operar e registrar", en: "Operate and log" },
    body: {
      pt: "Use o Painel (VFO, PTT, modo). No WSJT-X, configure Hamlib NET em 127.0.0.1:4532 e o servidor UDP secundário na porta 2333. Cada QSO vai para o Wavelog sem digitação.",
      en: "Use the Panel (VFO, PTT, mode). In WSJT-X, set Hamlib NET to 127.0.0.1:4532 and the secondary UDP server to port 2333. Every QSO lands in Wavelog with no typing.",
    },
  },
];

export const HOME_PORTS: { svc: string; path: string; port: string; note: Pair }[] = [
  { svc: "Console", path: "/opt/ham-cockpit", port: "TCP 80", note: { pt: "nginx + Node. No desenvolvimento local, :3000", en: "nginx + Node. Local development: :3000" } },
  { svc: "Wavelog", path: "/opt/wavelog", port: "TCP 8086", note: { pt: "PHP em Docker. Não publique a porta 3306 do MariaDB", en: "PHP in Docker. Do not publish MariaDB port 3306" } },
  { svc: "WaveLogGate", path: "/opt/wavelog-gate", port: "UDP 2333 · TCP 54321/54322", note: { pt: "QSO → API · QSY por HTTP", en: "QSO → API · QSY over HTTP" } },
  { svc: "ser2net", path: "/opt/ser2net", port: "127.0.0.1:4001–4006", note: { pt: "Um cliente por porta serial", en: "One client per serial port" } },
  { svc: "rigctld IC-705", path: "libhamlib-utils", port: "TCP 4532", note: { pt: "modelo 3085, serial em 127.0.0.1:4001", en: "model 3085, serial on 127.0.0.1:4001" } },
  { svc: "ampctld SPE", path: "libhamlib-utils", port: "TCP 4531", note: { pt: "serial em 127.0.0.1:4004", en: "serial on 127.0.0.1:4004" } },
  { svc: "SSH", path: "sshd", port: "TCP 22", note: { pt: "usuário hamcockpit, senha 1234 · login root por senha desligado", en: "user hamcockpit, password 1234 · root password login off" } },
  { svc: "Wi‑Fi do Pi (AP)", path: "NetworkManager", port: "192.168.4.1", note: { pt: "Rede Ham-Cockpit-XXXX · senha hamcockpit", en: "Network Ham-Cockpit-XXXX · password hamcockpit" } },
  { svc: "MMDVM Host", path: "/opt/ham-cockpit/mmdvm", port: "UART · controle remoto 7642", note: { pt: "Dono exclusivo do modem. Não passa pelo ser2net", en: "Sole owner of the modem. Does not go through ser2net" } },
  { svc: "DMR Gateway", path: "/opt/ham-cockpit/mmdvm", port: "127.0.0.1:62031/62032", note: { pt: "BrandMeister / TGIF / DMR+ / XLX", en: "BrandMeister / TGIF / DMR+ / XLX" } },
];

export const HOME_FEATURES: { title: Pair; body: Pair }[] = [
  {
    title: { pt: "Rádios Icom · Kenwood · Yaesu · Flex · Ten-Tec", en: "Icom · Kenwood · Yaesu · Flex · Ten-Tec radios" },
    body: {
      pt: "Cadastre fabricante, conexão (USB ou Bluetooth), protocolo (CI-V ou CAT), velocidade e endereço. A caixa Principal reconecta o rádio a cada login.",
      en: "Register maker, link (USB or Bluetooth), protocol (CI-V or CAT), speed and address. The Primary box reconnects the radio at every sign-in.",
    },
  },
  {
    title: { pt: "IC-705 por Bluetooth (GATT CI-V)", en: "IC-705 over Bluetooth (GATT CI-V)" },
    body: {
      pt: "Sem cabo. Funciona no Chrome ou no Edge, em HTTPS ou no IP do Pi. O Pairing Reception só é preciso na primeira vez.",
      en: "No cable. Works in Chrome or Edge, over HTTPS or on the Pi IP. Pairing Reception is only needed the first time.",
    },
  },
  {
    title: { pt: "Lextel MS-2000", en: "Lextel MS-2000" },
    body: {
      pt: "Bluetooth Classic (SPP), só escuta. Mostra PEP, média, ROE, tensão, Z e AM. O servidor reconecta sozinho. PIN 1234 ou 0000.",
      en: "Classic Bluetooth (SPP), listen-only. Shows PEP, average, SWR, voltage, Z and AM. The server reconnects by itself. PIN 1234 or 0000.",
    },
  },
  {
    title: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" },
    body: {
      pt: "O ser2net é o único dono da porta serial. WSJT-X e JTDX usam Hamlib NET. ACOM e LP-100A dispensam o ampctld e falam direto na porta TCP.",
      en: "ser2net is the only owner of the serial port. WSJT-X and JTDX use Hamlib NET. ACOM and LP-100A skip ampctld and talk straight on the TCP port.",
    },
  },
  {
    title: { pt: "Wavelog + Gate", en: "Wavelog + Gate" },
    body: {
      pt: "Logbook na porta 8086 e Gate na UDP 2333. Publicar o CAT é opcional. Não há Apache na porta 80.",
      en: "Logbook on port 8086 and Gate on UDP 2333. Publishing CAT is optional. There is no Apache on port 80.",
    },
  },
  {
    title: { pt: "MMDVM · WPSD / Pi-Star", en: "MMDVM · WPSD / Pi-Star" },
    body: {
      pt: "Hotspot ou repetidora com DMR, D-Star, YSF, P25, NXDN, M17 e POCSAG. O console segue o visual do portal e os serviços são os mesmos do WPSD.",
      en: "Hotspot or repeater with DMR, D-Star, YSF, P25, NXDN, M17 and POCSAG. The console follows the portal look and the services are the same as WPSD.",
    },
  },
  {
    title: { pt: "SPE · Hamplus · Palstar · LDG · LP-100A · ACOM", en: "SPE · Hamplus · Palstar · LDG · LP-100A · ACOM" },
    body: {
      pt: "Amplificador, chave de antenas, acopladores e wattímetros, cada um com a velocidade e o cabo certos (veja a tabela abaixo).",
      en: "Amplifier, antenna switch, tuners and wattmeters, each with the right speed and cable (see the table below).",
    },
  },
  {
    title: { pt: "Wi‑Fi do Pi e da sua casa", en: "The Pi Wi‑Fi and your home Wi‑Fi" },
    body: {
      pt: "No campo, use o Wi‑Fi do Pi (192.168.4.1). Em casa, o Pi entra na sua rede por DHCP ou IP fixo e atende por ham-cockpit.local. A tela Status mostra os dois IPs.",
      en: "In the field, use the Pi Wi‑Fi (192.168.4.1). At home, the Pi joins your network by DHCP or a static IP and answers at ham-cockpit.local. The Status screen shows both IPs.",
    },
  },
  {
    title: { pt: "Config Device Wizard", en: "Config Device Wizard" },
    body: {
      pt: "Três passos: escolha uma serial livre, defina IP e porta, escolha o equipamento. No fim, ligue o início automático.",
      en: "Three steps: pick a free serial port, set IP and port, pick the equipment. At the end, turn on autostart.",
    },
  },
  {
    title: { pt: "Administração da estação", en: "Station administration" },
    body: {
      pt: "Serviços que iniciam no boot, atualizações (app, sistema, ser2net, Hamlib, Wavelog), backup, terminal, SSH na porta 22 e VFO na tela HDMI.",
      en: "Services that start on boot, updates (app, system, ser2net, Hamlib, Wavelog), backup, terminal, SSH on port 22 and a VFO on the HDMI screen.",
    },
  },
];

export const HOME_DEVICES: { name: string; link: Pair; serial: Pair; proto: Pair }[] = [
  { name: "IC-705", link: { pt: "Bluetooth GATT", en: "Bluetooth GATT" }, serial: { pt: "— (Web Bluetooth)", en: "— (Web Bluetooth)" }, proto: { pt: "CI-V 0xA4 · nome Ham-Cockpit-Web01", en: "CI-V 0xA4 · name Ham-Cockpit-Web01" } },
  { name: "IC-7300 / 7610 / 9700 / 7100", link: { pt: "USB CI-V (e LAN no 7610 e no 9700)", en: "USB CI-V (and LAN on 7610 and 9700)" }, serial: { pt: "19200–115200", en: "19200–115200" }, proto: { pt: "ser2net → Hamlib · LAN UDP → CI-V", en: "ser2net → Hamlib · LAN UDP → CI-V" } },
  { name: "Kenwood TS-590 / 890 / 990", link: { pt: "USB CAT", en: "USB CAT" }, serial: { pt: "38400–115200", en: "38400–115200" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "Yaesu FT-991A / FTDX / FT-710", link: { pt: "USB CAT", en: "USB CAT" }, serial: { pt: "38400", en: "38400" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "FlexRadio 6400 / 6600 / 8600", link: { pt: "Ethernet (SmartSDR)", en: "Ethernet (SmartSDR)" }, serial: { pt: "TCP/UDP 4992 · VITA 4991", en: "TCP/UDP 4992 · VITA 4991" }, proto: { pt: "Proxy CAT para o Hamlib (driver nativo em breve)", en: "CAT proxy to Hamlib (native driver coming)" } },
  { name: "Ten-Tec Omni / Eagle", link: { pt: "USB CAT", en: "USB CAT" }, serial: { pt: "57600", en: "57600" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "Xiegu X6100 / X6200 / G90", link: { pt: "USB (DEV SERIAL-B)", en: "USB (DEV SERIAL-B)" }, serial: { pt: "19200 CI-V", en: "19200 CI-V" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "Hermes Lite 2", link: { pt: "Ethernet (OpenHPSDR P1)", en: "Ethernet (OpenHPSDR P1)" }, serial: { pt: "UDP 1024 / 1025", en: "UDP 1024 / 1025" }, proto: { pt: "CAT do Thetis/piHPSDR → Hamlib 2054/2040", en: "Thetis/piHPSDR CAT → Hamlib 2054/2040" } },
  { name: "Anan 10E / 100D / 7000 / G2", link: { pt: "Ethernet (OpenHPSDR P2)", en: "Ethernet (OpenHPSDR P2)" }, serial: { pt: "UDP 1024+", en: "UDP 1024+" }, proto: { pt: "CAT do Thetis/piHPSDR → Hamlib", en: "Thetis/piHPSDR CAT → Hamlib" } },
  { name: "Lextel MS-2000", link: { pt: "Bluetooth Classic (SPP)", en: "Classic Bluetooth (SPP)" }, serial: { pt: "rfcomm", en: "rfcomm" }, proto: { pt: "Só escuta; decodifica ASCII, CSV e binário", en: "Listen-only; decodes ASCII, CSV and binary" } },
  { name: "SPE Expert", link: { pt: "USB-RS232", en: "USB-RS232" }, serial: { pt: "9600 8N1", en: "9600 8N1" }, proto: { pt: "ampctld · MAX3232", en: "ampctld · MAX3232" } },
  { name: "Hamplus AS-603WL", link: { pt: "USB-RS232", en: "USB-RS232" }, serial: { pt: "9600 8N1", en: "9600 8N1" }, proto: { pt: "Antenas 1–6 · rádios 1–3 · rotor", en: "Antennas 1–6 · radios 1–3 · rotator" } },
  { name: "Palstar AT-AUTO", link: { pt: "USB-RS232", en: "USB-RS232" }, serial: { pt: "9600 8N1", en: "9600 8N1" }, proto: { pt: "Auto / Manual / Bypass", en: "Auto / Manual / Bypass" } },
  { name: "LDG AT-600/1000 ProII", link: { pt: "USB-TTL (jack METER)", en: "USB-TTL (METER jack)" }, serial: { pt: "38400 8N1", en: "38400 8N1" }, proto: { pt: "TTL 5 V. Nunca RS232 de PC", en: "TTL 5 V. Never PC RS232" } },
  { name: "TelePost LP-100A", link: { pt: "USB-RS232, cabo reto", en: "USB-RS232, straight cable" }, serial: { pt: "115200 8N1", en: "115200 8N1" }, proto: { pt: "Leitura contínua · alarme de ROE · modo Avg/Peak/Tune", en: "Continuous reading · SWR alarm · Avg/Peak/Tune mode" } },
  { name: "ACOM 2000A", link: { pt: "USB-RS232, null-modem", en: "USB-RS232, null-modem" }, serial: { pt: "1200 8N1", en: "1200 8N1" }, proto: { pt: "Cabo só com pinos 2–3, 3–2 e 5–5 · liga pelo PC (RTS+DTR, 10 s)", en: "Cable with pins 2–3, 3–2 and 5–5 only · powers on from the PC (RTS+DTR, 10 s)" } },
  { name: "MMDVM HAT / ZUMspot", link: { pt: "UART do GPIO (3,3 V) ou USB", en: "GPIO UART (3.3 V) or USB" }, serial: { pt: "115200 8N1", en: "115200 8N1" }, proto: { pt: "Só o MMDVM Host. Fora do ser2net", en: "MMDVM Host only. Outside ser2net" } },
];

export const HOME_RECIPES: { kicker: Pair; title: Pair; points: Pair[] }[] = [
  {
    kicker: { pt: "Receita A · campo", en: "Recipe A · field" },
    title: { pt: "IC-705 no Wi‑Fi do Pi", en: "IC-705 on the Pi Wi‑Fi" },
    points: [
      { pt: "Grave a imagem e ligue o Pi sem cabo de rede", en: "Write the image and power on the Pi with no network cable" },
      { pt: "Conecte o notebook no Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit)", en: "Join the laptop to Wi‑Fi Ham-Cockpit-XXXX (password hamcockpit)" },
      { pt: "Cadastre o rádio Bluetooth CI-V 0xA4 e marque Principal", en: "Register the Bluetooth CI-V 0xA4 radio and tick Primary" },
      { pt: "Se quiser, use o Lextel no mesmo adaptador (SPP)", en: "If you like, use the Lextel on the same adapter (SPP)" },
    ],
  },
  {
    kicker: { pt: "Receita B · digital", en: "Recipe B · digital" },
    title: { pt: "Shack de FT8", en: "FT8 shack" },
    points: [
      { pt: "Pi no cabo de rede, acessível em ham-cockpit.local", en: "Pi on the network cable, reachable at ham-cockpit.local" },
      { pt: "IC-705 por GATT + MS-2000 por SPP", en: "IC-705 over GATT + MS-2000 over SPP" },
      { pt: "Wavelog em :8086/install e Gate na UDP 2333", en: "Wavelog at :8086/install and Gate on UDP 2333" },
      { pt: "WSJT-X com Hamlib NET em 127.0.0.1:4532 (modelo 3085)", en: "WSJT-X with Hamlib NET at 127.0.0.1:4532 (model 3085)" },
    ],
  },
  {
    kicker: { pt: "Receita C · HF", en: "Recipe C · HF" },
    title: { pt: "7300 + SPE + ACOM + LP-100A", en: "7300 + SPE + ACOM + LP-100A" },
    points: [
      { pt: "Icom por USB CI-V (endereço 0x94) como Principal", en: "Icom over USB CI-V (address 0x94) as Primary" },
      { pt: "Três adaptadores USB-RS232: SPE a 9600, ACOM a 1200 e LP-100A a 115200", en: "Three USB-RS232 adapters: SPE at 9600, ACOM at 1200 and LP-100A at 115200" },
      { pt: "Um passo do wizard para cada acessório; o Hamlib fica só no rádio", en: "One wizard pass per accessory; Hamlib stays on the radio only" },
      { pt: "O CAT do 2000A vai no RCU, não na DB9 do amplificador", en: "The 2000A CAT goes on the RCU, not on the amplifier DB9" },
    ],
  },
  {
    kicker: { pt: "Receita D · digital voice", en: "Recipe D · digital voice" },
    title: { pt: "Hotspot MMDVM no mesmo Pi", en: "MMDVM hotspot on the same Pi" },
    points: [
      { pt: "HAT MMDVM no UART /dev/ttyAMA0 a 115200 (3,3 V) ou ZUMspot USB", en: "MMDVM HAT on UART /dev/ttyAMA0 at 115200 (3.3 V) or a USB ZUMspot" },
      { pt: "Não coloque o modem no ser2net: o MMDVM Host é o dono", en: "Do not put the modem on ser2net: MMDVM Host owns it" },
      { pt: "Em Operação → MMDVM, informe indicativo, ID DMR e a rede BrandMeister", en: "Under Operate → MMDVM, enter callsign, DMR ID and the BrandMeister network" },
      { pt: "Os binários do WPSD ficam em /usr/local/bin (MMDVMHost e DMR Gateway)", en: "WPSD binaries live in /usr/local/bin (MMDVMHost and DMR Gateway)" },
    ],
  },
];

export const DOCS_TOC: { id: string; label: Pair }[] = [
  { id: "visao", label: { pt: "O que é", en: "What it is" } },
  { id: "arquitetura", label: { pt: "Arquitetura", en: "Architecture" } },
  { id: "imagem", label: { pt: "Imagem e primeiro boot", en: "Image and first boot" } },
  { id: "fluxo", label: { pt: "Como funciona", en: "How it runs" } },
  { id: "console", label: { pt: "Console", en: "Console" } },
  { id: "equipamentos", label: { pt: "Rádios suportados", en: "Supported radios" } },
  { id: "radio-ble", label: { pt: "IC-705 por Bluetooth", en: "IC-705 over Bluetooth" } },
  { id: "radio-usb", label: { pt: "USB / CAT / Hamlib", en: "USB / CAT / Hamlib" } },
  { id: "lextel", label: { pt: "Lextel MS-2000", en: "Lextel MS-2000" } },
  { id: "acessorios", label: { pt: "Acessórios", en: "Accessories" } },
  { id: "wavelog", label: { pt: "Wavelog", en: "Wavelog" } },
  { id: "wlg", label: { pt: "WaveLogGate", en: "WaveLogGate" } },
  { id: "contest", label: { pt: "Contest", en: "Contest" } },
  { id: "mmdvm", label: { pt: "MMDVM / WPSD", en: "MMDVM / WPSD" } },
  { id: "rede", label: { pt: "Rede e Wi‑Fi", en: "Network and Wi‑Fi" } },
  { id: "portas", label: { pt: "Mapa de portas", en: "Port map" } },
  { id: "cabos", label: { pt: "Cabos e níveis elétricos", en: "Cables and levels" } },
  { id: "admin", label: { pt: "Serviços e administração", en: "Services and admin" } },
  { id: "config", label: { pt: "Referência rápida", en: "Quick reference" } },
  { id: "receitas", label: { pt: "Estações de exemplo", en: "Sample stations" } },
  { id: "problemas", label: { pt: "Problemas comuns", en: "Common problems" } },
];
