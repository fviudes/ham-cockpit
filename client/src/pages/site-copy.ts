import type { Pair } from "./site-lang";

export const NAV = {
  station: { pt: "ESTAÇÃO", en: "STATION" } satisfies Pair,
  home: { pt: "Início", en: "Home" } satisfies Pair,
  docs: { pt: "Documentação", en: "Docs" } satisfies Pair,
  console: { pt: "Abrir console", en: "Open console" } satisfies Pair,
};

export const HOME = {
  kicker: { pt: "APPLIANCE DA ESTAÇÃO", en: "STATION APPLIANCE" } satisfies Pair,
  h1a: { pt: "O computador do shack.", en: "The shack computer." } satisfies Pair,
  h1b: { pt: " Um Pi, um navegador, toda a estação.", en: " One Pi, one browser, the whole station." } satisfies Pair,
    lead: {
    pt: "Ham Cockpit é a imagem Ubuntu Server que transforma um Raspberry Pi 3, 4 ou 5 no hub da estação: IC-705 por Web Bluetooth GATT, Lextel por SPP Classic, Cat-USB via ser2net, Hamlib NET, Wavelog, MMDVM (WPSD/Pi-Star), SPE, Hamplus, Palstar, LDG, LP-100A e ACOM — sem ESP32 e sem seis programas Windows donos da mesma COM.",
    en: "Ham Cockpit is the Ubuntu Server image that turns a Raspberry Pi 3, 4 or 5 into the station hub: IC-705 over Web Bluetooth GATT, Lextel over Classic SPP, Cat-USB through ser2net, Hamlib NET, Wavelog, MMDVM (WPSD/Pi-Star), SPE, Hamplus, Palstar, LDG, LP-100A, and ACOM — no ESP32 and no six Windows programs fighting over the same COM port.",
  } satisfies Pair,
  openConsole: { pt: "Abrir o console", en: "Open the console" } satisfies Pair,
  fullDocs: { pt: "Documentação completa", en: "Full documentation" } satisfies Pair,
  osImage: { pt: "Imagem OS", en: "OS image" } satisfies Pair,
  creds: {
    pt: "Chrome / Edge · admin / 1234 · AP Ham-Cockpit-XXXX · http://192.168.4.1/console · ham-cockpit.local",
    en: "Chrome / Edge · admin / 1234 · AP Ham-Cockpit-XXXX · http://192.168.4.1/console · ham-cockpit.local",
  } satisfies Pair,
  photoConsole: {
    pt: "O operador usa o Chrome. O Pi fica no shack: rádio, wattímetro, logbook e Hamlib no mesmo aparelho.",
    en: "You operate in Chrome. The Pi stays in the shack: radio, wattmeter, logbook, and Hamlib on one box.",
  } satisfies Pair,
  photoConsoleAlt: {
    pt: "Console Ham Cockpit no notebook, com o rádio e o wattímetro na mesa",
    en: "Ham Cockpit console on a laptop, with the radio and wattmeter on the desk",
  } satisfies Pair,
  archLabel: { pt: "Arquitetura", en: "Architecture" } satisfies Pair,
  archTitle: { pt: "O Pi é o hub. Nada compartilha a TTY.", en: "The Pi is the hub. Nothing shares the TTY." } satisfies Pair,
  photoShack: {
    pt: "Arquitetura em estrela: rádio e acessórios ligam no Pi (BLE, SPP ou USB-serial). Você só abre HTTP.",
    en: "Star architecture: radio and accessories attach to the Pi (BLE, SPP, or USB-serial). You only open HTTP.",
  } satisfies Pair,
  photoShackAlt: {
    pt: "Estação com Raspberry Pi, rádio QRP e wattímetro no mesmo posto",
    en: "Station with a Raspberry Pi, QRP radio, and wattmeter on the same desk",
  } satisfies Pair,
    figStation: {
    pt: "IC-705 GATT · Lextel SPP · ser2net dono das TTY CAT · MMDVM Host dono do UART do modem · Wavelog :8086 · Hamlib :4532.",
    en: "IC-705 GATT · Lextel SPP · ser2net owns CAT TTYs · MMDVM Host owns the modem UART · Wavelog :8086 · Hamlib :4532.",
  } satisfies Pair,
    archP: {
    pt: "Quatro planos no mesmo Ubuntu: (1) rádio HF — Web Bluetooth ou Cat-USB no ser2net; (2) acessórios — SPE, Hamplus, Palstar, LDG, LP-100A, ACOM falam IP 127.0.0.1:porta; (3) aplicações — Wavelog, WaveLogGate, rigctld, nginx; (4) MMDVM — MMDVM Host no UART do hat/USB, DMR Gateway em loopback. O GPIO 3,3 V do Pi nunca leva RS232 de amp; o HAT MMDVM é a exceção (já é 3,3 V).",
    en: "Four planes on the same Ubuntu: (1) HF radio — Web Bluetooth or Cat-USB on ser2net; (2) accessories — SPE, Hamplus, Palstar, LDG, LP-100A, ACOM talk IP 127.0.0.1:port; (3) apps — Wavelog, WaveLogGate, rigctld, nginx; (4) MMDVM — MMDVM Host on the hat/USB UART, DMR Gateway on loopback. The Pi 3.3 V GPIO never carries amp RS232; the MMDVM HAT is the exception (it already is 3.3 V).",
  } satisfies Pair,
  thLayer: { pt: "Camada", en: "Layer" } satisfies Pair,
  thRuns: { pt: "O que roda", en: "What runs" } satisfies Pair,
  thTalks: { pt: "Como fala", en: "How it talks" } satisfies Pair,
  flowLabel: { pt: "Fluxo", en: "Flow" } satisfies Pair,
  flowTitle: {
    pt: "Do cartão SD ao QSO, na ordem em que a estação acorda",
    en: "From the SD card to a QSO, in the order the station wakes up",
  } satisfies Pair,
  figBoot: {
    pt: "Grave ham-cockpit-0.1.05-raspi.img.xz → ligue o Pi → Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit) → 192.168.4.1 → admin / 1234.",
    en: "Flash ham-cockpit-0.1.05-raspi.img.xz → power the Pi → Wi‑Fi Ham-Cockpit-XXXX (password hamcockpit) → 192.168.4.1 → admin / 1234.",
  } satisfies Pair,
  figIc705: {
    pt: "IC-705: Pairing Reception no rádio, Conectar no console, aceite Ham-Cockpit-Web01. Marque Principal — o login reconecta o GATT.",
    en: "IC-705: Pairing Reception on the radio, Connect in the console, accept Ham-Cockpit-Web01. Check Primary — login reconnects GATT.",
  } satisfies Pair,
  figDual: {
    pt: "GATT (705) e SPP (MS-2000) no mesmo dongle. O Lextel reconecta no servidor; o 705 reconecta no Chrome depois da autorização.",
    en: "GATT (705) and SPP (MS-2000) on the same dongle. Lextel reconnects on the server; the 705 reconnects in Chrome after the grant.",
  } satisfies Pair,
  intLabel: { pt: "Integrações", en: "Integrations" } satisfies Pair,
  intTitle: { pt: "O que conversa com o quê — e em que porta", en: "What talks to what — and on which port" } satisfies Pair,
  figWavelog: {
    pt: "WSJT-X Secondary UDP 2333 → WaveLogGate → API Wavelog → QSO em :8086. CAT opcional via Hamlib 127.0.0.1:4532.",
    en: "WSJT-X Secondary UDP 2333 → WaveLogGate → Wavelog API → QSO on :8086. Optional CAT via Hamlib 127.0.0.1:4532.",
  } satisfies Pair,
  wavelogP: {
    pt: "Wavelog (PHP + MariaDB em Docker) não usa a porta 80. Primeiro acesso http://IP:8086/install, host wavelog-db. Gate headless UDP 2333, CAT a cada 4 s, QSY :54321, contest 3.0 com CAT radio.",
    en: "Wavelog (PHP + MariaDB in Docker) does not use port 80. First visit http://IP:8086/install, host wavelog-db. Headless Gate UDP 2333, CAT every 4 s, QSY :54321, contest 3.0 with CAT radio.",
  } satisfies Pair,
  photoLogbook: {
    pt: "Logbook :8086. LoTW, eQSL, Club Log, DXCC, callbook QRZ. O rádio CAT aparece em Hardware Interfaces porque o Gate publica api/radio.",
    en: "Logbook :8086. LoTW, eQSL, Club Log, DXCC, QRZ callbook. The CAT radio shows under Hardware Interfaces because the Gate publishes api/radio.",
  } satisfies Pair,
  photoLogbookAlt: {
    pt: "Logbook Wavelog no notebook da estação",
    en: "Wavelog logbook on the station laptop",
  } satisfies Pair,
  figSer2net: {
    pt: "Só o ser2net abre a TTY. Os apps usam Hamlib NET. Nunca dois programas no mesmo cabo.",
    en: "Only ser2net opens the TTY. Apps use Hamlib NET. Never two programs on the same cable.",
  } satisfies Pair,
  ser2netP: {
    pt: "Config Device Wizard: serial USB → TCP 127.0.0.1:4001+ → dispositivo. O rádio Cat-USB vira rigctld (-m 3085 no 705). SPE usa ampctld. ACOM e LP-100A falam o protocolo nativo na porta crua.",
    en: "Config Device Wizard: USB serial → TCP 127.0.0.1:4001+ → device. Cat-USB radio becomes rigctld (-m 3085 on the 705). SPE uses ampctld. ACOM and LP-100A speak the native protocol on the raw port.",
  } satisfies Pair,
  figMmdvm: {
    pt: "Rádio DV → modem MMDVM (UART 115200) → MMDVM Host → DMR Gateway :62031 (BrandMeister / TGIF / DMR+ / XLX). Last heard lê /var/log/mmdvm.",
    en: "DV radio → MMDVM modem (UART 115200) → MMDVM Host → DMR Gateway :62031 (BrandMeister / TGIF / DMR+ / XLX). Last heard reads /var/log/mmdvm.",
  } satisfies Pair,
  mmdvmP: {
    pt: "Módulo Operação → MMDVM no mesmo layout do portal (Space Grotesk, IBM Plex, navy/ciano/âmbar). Não porta o PHP do WPSD: usa os daemons, INI e last heard. repo.w0chp.net fica atrás de Anubis; o código estudado é o mirror WPSD-M17/WPSD-WebCode + g4klx/MMDVMHost.",
    en: "Operate → MMDVM uses the same portal layout (Space Grotesk, IBM Plex, navy/cyan/amber). It does not port WPSD PHP: it uses the daemons, INI, and last heard. repo.w0chp.net sits behind Anubis; the code we studied is the WPSD-M17/WPSD-WebCode mirror + g4klx/MMDVMHost.",
  } satisfies Pair,
  thSvc: { pt: "Serviço", en: "Service" } satisfies Pair,
  thPath: { pt: "Pasta / unidade", en: "Path / unit" } satisfies Pair,
  thPort: { pt: "Porta", en: "Port" } satisfies Pair,
  thNotes: { pt: "Notas", en: "Notes" } satisfies Pair,
  gearLabel: { pt: "Equipamento", en: "Gear" } satisfies Pair,
  gearTitle: {
    pt: "Icom, Kenwood, Yaesu, Flex, Xiegu, HL2, Anan e acessórios no mesmo cadastro",
    en: "Icom, Kenwood, Yaesu, Flex, Xiegu, HL2, Anan, and accessories in one roster",
  } satisfies Pair,
  photoRadio: {
    pt: "IC-705: Web Bluetooth serviço 14cf8001, handshake CI-V 0x61–0x64, endereço 0xA4, nome Ham-Cockpit-Web01.",
    en: "IC-705: Web Bluetooth service 14cf8001, CI-V handshake 0x61–0x64, address 0xA4, name Ham-Cockpit-Web01.",
  } satisfies Pair,
  photoRadioAlt: {
    pt: "Rádio QRP portátil e celular com o console Ham Cockpit",
    en: "Portable QRP radio and a phone showing the Ham Cockpit console",
  } satisfies Pair,
  photoGear: {
    pt: "Acessórios RS232 (±12 V) entram por USB-serial MAX3232. O wizard escolhe baud e porta TCP.",
    en: "RS232 accessories (±12 V) come in through a USB-serial MAX3232. The wizard picks baud and TCP port.",
  } satisfies Pair,
  photoGearAlt: {
    pt: "Wattímetro, amplificador e adaptador USB-RS232 na bancada",
    en: "Wattmeter, amplifier, and USB-RS232 adapter on the bench",
  } satisfies Pair,
  thDev: { pt: "Dispositivo", en: "Device" } satisfies Pair,
  thLink: { pt: "Conexão", en: "Link" } satisfies Pair,
  thSerial: { pt: "Serial", en: "Serial" } satisfies Pair,
  thProto: { pt: "Protocolo", en: "Protocol" } satisfies Pair,
  recipesLabel: { pt: "Receitas", en: "Recipes" } satisfies Pair,
  recipesTitle: {
    pt: "Quatro estações que o mesmo cartão cobre",
    en: "Four stations the same card covers",
  } satisfies Pair,
  cablesLabel: { pt: "Cabos", en: "Cables" } satisfies Pair,
  cablesTitle: {
    pt: "USB e Bluetooth. RS232 de amp nunca no GPIO.",
    en: "USB and Bluetooth. Amp RS232 never on the GPIO.",
  } satisfies Pair,
  cablesP: {
    pt: "IC-705 e Lextel não precisam de conversor. SPE, Palstar, Hamplus, ACOM e LP-100A são RS232 de PC (±12 V). O header uart2–5 do Pi é 3,3 V — um cabo de amp direto mata o SoC. Prefira /dev/serial/by-id/…",
    en: "IC-705 and Lextel need no converter. SPE, Palstar, Hamplus, ACOM, and LP-100A are PC RS232 (±12 V). The Pi uart2–5 header is 3.3 V — a direct amp cable kills the SoC. Prefer /dev/serial/by-id/…",
  } satisfies Pair,
  figAcom: {
    pt: "ACOM 2000A: 1200 8N1, null-modem só 2–3 / 3–2 / 5–5. CAT do rádio no RCU. LP-100A: cabo reto 115200 8N1.",
    en: "ACOM 2000A: 1200 8N1, null-modem only 2–3 / 3–2 / 5–5. Radio CAT on the RCU. LP-100A: straight cable 115200 8N1.",
  } satisfies Pair,
  ctaTitle: { pt: "Ligue a estação agora", en: "Bring the station up now" } satisfies Pair,
  ctaP: {
    pt: "Grave a imagem em image/out, ou baixe o release. O manual do operador (PT-BR e EN-US) vive dentro do console, com o botão que abre a aba certa.",
    en: "Flash the image from image/out, or download the release. The operator manual (Brazilian Portuguese and US English) lives inside the console, with a button that opens the right tab.",
  } satisfies Pair,
  readDocs: { pt: "Ler a documentação", en: "Read the docs" } satisfies Pair,
  footerRight: {
    pt: "Appliance, não firmware ESP32. Imagem em image/out — o Git não versiona o .img.xz.",
    en: "Appliance, not ESP32 firmware. Image in image/out — Git does not version the .img.xz.",
  } satisfies Pair,
};

export const HOME_LAYERS: { layer: Pair; runs: Pair; talks: Pair }[] = [
  {
    layer: { pt: "Navegador", en: "Browser" },
    runs: { pt: "Console React (Chrome/Edge)", en: "React console (Chrome/Edge)" },
    talks: { pt: "HTTP :80 · Web Bluetooth GATT do IC-705", en: "HTTP :80 · IC-705 Web Bluetooth GATT" },
  },
  {
    layer: { pt: "Appliance", en: "Appliance" },
    runs: { pt: "Node Ham Cockpit + nginx", en: "Ham Cockpit Node + nginx" },
    talks: { pt: "/opt/ham-cockpit · systemd ham-cockpit.service", en: "/opt/ham-cockpit · systemd ham-cockpit.service" },
  },
  {
    layer: { pt: "Serial IP", en: "Serial IP" },
    runs: { pt: "ser2net 4", en: "ser2net 4" },
    talks: { pt: "127.0.0.1:4001+ · único processo na TTY", en: "127.0.0.1:4001+ · only process on the TTY" },
  },
  {
    layer: { pt: "CAT NET", en: "CAT NET" },
    runs: { pt: "rigctld / ampctld (libhamlib-utils)", en: "rigctld / ampctld (libhamlib-utils)" },
    talks: { pt: "4532 rádio · 4531 SPE · 4534 CAT2", en: "4532 radio · 4531 SPE · 4534 CAT2" },
  },
  {
    layer: { pt: "Logbook", en: "Logbook" },
    runs: { pt: "Wavelog Docker + WaveLogGate", en: "Wavelog Docker + WaveLogGate" },
    talks: { pt: ":8086 · UDP 2333 · QSY 54321", en: ":8086 · UDP 2333 · QSY 54321" },
  },
  {
    layer: { pt: "Rádio BLE", en: "BLE radio" },
    runs: { pt: "Web Bluetooth no Chrome", en: "Web Bluetooth in Chrome" },
    talks: { pt: "svc 14cf8001 · HS Ham-Cockpit-Web01", en: "svc 14cf8001 · HS Ham-Cockpit-Web01" },
  },
  {
    layer: { pt: "Wattímetro BT", en: "BT wattmeter" },
    runs: { pt: "Lextel SPP Classic", en: "Lextel Classic SPP" },
    talks: { pt: "rfcomm / COM de saída · PIN 1234 ou 0000", en: "rfcomm / outgoing COM · PIN 1234 or 0000" },
  },
  {
    layer: { pt: "MMDVM / WPSD", en: "MMDVM / WPSD" },
    runs: { pt: "MMDVM Host + DMR Gateway", en: "MMDVM Host + DMR Gateway" },
    talks: { pt: "UART modem · 127.0.0.1:62031 · Remote 7642", en: "Modem UART · 127.0.0.1:62031 · Remote 7642" },
  },
];

export const HOME_FLOW: { n: string; title: Pair; body: Pair }[] = [
  {
    n: "01",
    title: { pt: "Boot do cartão", en: "Card boot" },
    body: {
      pt: "Ubuntu 24.04 ARM64 + ham-cockpit.target: docker, nginx:80, ser2net, Wavelog :8086, Gate UDP 2333. AP 192.168.4.1 sobe com ou sem cabo.",
      en: "Ubuntu 24.04 ARM64 + ham-cockpit.target: docker, nginx:80, ser2net, Wavelog :8086, Gate UDP 2333. AP 192.168.4.1 comes up with or without a cable.",
    },
  },
  {
    n: "02",
    title: { pt: "Login no console", en: "Console login" },
    body: {
      pt: "admin / 1234. O clique em Entrar é o gesto do Chrome: o rádio principal Bluetooth tenta o GATT já autorizado e insiste a cada 2 s, como o Lextel no SPP.",
      en: "admin / 1234. The Sign in click is Chrome's gesture: the primary Bluetooth radio retries the granted GATT every 2 s, same idea as Lextel on SPP.",
    },
  },
  {
    n: "03",
    title: { pt: "Wizard e ser2net", en: "Wizard and ser2net" },
    body: {
      pt: "Acessório = serial USB + porta TCP sequencial + baud. O dispositivo na aba só escolhe essa conexão IP. Cat-USB do rádio é tipo Rádio na aba ser2net.",
      en: "Accessory = USB serial + sequential TCP port + baud. The device tab only picks that IP connection. Cat-USB radio is a Radio-type row on the ser2net tab.",
    },
  },
  {
    n: "04",
    title: { pt: "Operar e registrar", en: "Operate and log" },
    body: {
      pt: "Painel VFO, PTT, modo. WSJT-X em Hamlib NET 127.0.0.1:4532 e Secondary UDP 2333. Cada QSO cai no Wavelog sem copiar à mão.",
      en: "VFO panel, PTT, mode. WSJT-X on Hamlib NET 127.0.0.1:4532 and Secondary UDP 2333. Each QSO lands in Wavelog with no hand copy.",
    },
  },
];

export const HOME_PORTS: { svc: string; path: string; port: string; note: Pair }[] = [
  { svc: "Console", path: "/opt/ham-cockpit", port: "TCP 80", note: { pt: "nginx + Node. Dev local :3000", en: "nginx + Node. Local dev :3000" } },
  { svc: "Wavelog", path: "/opt/wavelog", port: "TCP 8086", note: { pt: "Docker PHP. Não publicar MariaDB 3306", en: "Docker PHP. Do not publish MariaDB 3306" } },
  { svc: "WaveLogGate", path: "/opt/wavelog-gate", port: "UDP 2333 · TCP 54321/54322", note: { pt: "QSO → API · QSY HTTP", en: "QSO → API · QSY HTTP" } },
  { svc: "ser2net", path: "/opt/ser2net", port: "127.0.0.1:4001–4006", note: { pt: "kickolduser; um cliente por TTY", en: "kickolduser; one client per TTY" } },
  { svc: "rigctld IC-705", path: "libhamlib-utils", port: "TCP 4532", note: { pt: "-m 3085 -r 127.0.0.1:4001", en: "-m 3085 -r 127.0.0.1:4001" } },
  { svc: "ampctld SPE", path: "libhamlib-utils", port: "TCP 4531", note: { pt: "-r 127.0.0.1:4004", en: "-r 127.0.0.1:4004" } },
  { svc: "SSH", path: "sshd", port: "TCP 22", note: { pt: "hamcockpit / 1234 · root por senha off", en: "hamcockpit / 1234 · root password login off" } },
  { svc: "AP", path: "NetworkManager", port: "192.168.4.1", note: { pt: "SSID Ham-Cockpit-XXXX · senha hamcockpit", en: "SSID Ham-Cockpit-XXXX · password hamcockpit" } },
  { svc: "MMDVM Host", path: "/opt/ham-cockpit/mmdvm", port: "UART · Remote 7642", note: { pt: "Dono do modem. Não ser2net", en: "Owns the modem. Not ser2net" } },
  { svc: "DMR Gateway", path: "/opt/ham-cockpit/mmdvm", port: "127.0.0.1:62031/62032", note: { pt: "BrandMeister / TGIF / DMR+ / XLX", en: "BrandMeister / TGIF / DMR+ / XLX" } },
];

export const HOME_FEATURES: { title: Pair; body: Pair }[] = [
  {
    title: { pt: "Rádio Icom · Kenwood · Yaesu · Flex · Ten-Tec", en: "Icom · Kenwood · Yaesu · Flex · Ten-Tec radio" },
    body: {
      pt: "Cadastro com fabricante, USB ou Bluetooth, CI-V ou CAT, baud e endereço. Checkbox Principal reconecta no login.",
      en: "Roster with maker, USB or Bluetooth, CI-V or CAT, baud and address. Primary checkbox reconnects at login.",
    },
  },
  {
    title: { pt: "IC-705 GATT CI-V", en: "IC-705 GATT CI-V" },
    body: {
      pt: "Serviço 14cf8001, chars 14cf8002/8003, handshake 0x61–0x64, CI-V 0xA4. Chrome/Edge, HTTPS ou localhost. Pairing Reception só na primeira vez.",
      en: "Service 14cf8001, chars 14cf8002/8003, handshake 0x61–0x64, CI-V 0xA4. Chrome/Edge, HTTPS or localhost. Pairing Reception only the first time.",
    },
  },
  {
    title: { pt: "Lextel MS-2000", en: "Lextel MS-2000" },
    body: {
      pt: "Classic SPP, só escuta. PEP, média, ROE, V, Z, AM. Reconecta no servidor (wantOpen). PIN 1234 ou 0000.",
      en: "Classic SPP, listen-only. PEP, average, SWR, V, Z, AM. Server reconnect (wantOpen). PIN 1234 or 0000.",
    },
  },
  {
    title: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" },
    body: {
      pt: "Dono da TTY. Hamlib NET para WSJT-X/JTDX. ACOM e LP-100A sem ampctld — protocolo nativo no TCP cru.",
      en: "Owns the TTY. Hamlib NET for WSJT-X/JTDX. ACOM and LP-100A skip ampctld — native protocol on the raw TCP port.",
    },
  },
  {
    title: { pt: "Wavelog + Gate", en: "Wavelog + Gate" },
    body: {
      pt: "Logbook :8086. Gate UDP 2333. Publicar CAT opcional. Sem Apache na 80.",
      en: "Logbook :8086. Gate UDP 2333. Optional CAT publish. No Apache on port 80.",
    },
  },
  {
    title: { pt: "MMDVM · WPSD / Pi-Star", en: "MMDVM · WPSD / Pi-Star" },
    body: {
      pt: "Hotspot/repetidora DMR, D-Star, YSF, P25, NXDN, M17, POCSAG. Console React no padrão do portal; daemons e INI iguais ao WPSD.",
      en: "Hotspot/repeater DMR, D-Star, YSF, P25, NXDN, M17, POCSAG. React console in the portal look; daemons and INI match WPSD.",
    },
  },
  {
    title: { pt: "SPE · Hamplus · Palstar · LDG · LP-100A · ACOM", en: "SPE · Hamplus · Palstar · LDG · LP-100A · ACOM" },
    body: {
      pt: "Expert 9600, AS-603WL, AT-AUTO, METER TTL 38400, wattímetro 115200 cabo reto, 2000A 1200 null-modem 2–3/5–5.",
      en: "Expert 9600, AS-603WL, AT-AUTO, METER TTL 38400, wattmeter 115200 straight cable, 2000A 1200 null-modem 2–3/5–5.",
    },
  },
  {
    title: { pt: "Wi‑Fi AP e da casa", en: "Home Wi‑Fi and the Pi AP" },
    body: {
      pt: "Campo: AP 192.168.4.1. Casa: STA DHCP ou IP fixo + hostname ham-cockpit. Status mostra os dois IPs.",
      en: "Field: AP 192.168.4.1. Home: STA DHCP or static IP + hostname ham-cockpit. Status shows both IPs.",
    },
  },
  {
    title: { pt: "Config Device Wizard", en: "Config Device Wizard" },
    body: {
      pt: "Três passos: serial livre → IP:porta → SPE/Hamplus/Palstar/LDG/LP-100A/ACOM → início automático.",
      en: "Three steps: free serial → IP:port → SPE/Hamplus/Palstar/LDG/LP-100A/ACOM → start on boot.",
    },
  },
  {
    title: { pt: "Admin da estação", en: "Station admin" },
    body: {
      pt: "Serviços no boot, atualizações (app/OS/ser2net/hamlib/Wavelog), backup, terminal root, SSH :22, HDMI VFO.",
      en: "Boot services, updates (app/OS/ser2net/hamlib/Wavelog), backup, root terminal, SSH :22, HDMI VFO.",
    },
  },
];

export const HOME_DEVICES: { name: string; link: Pair; serial: Pair; proto: Pair }[] = [
  { name: "IC-705", link: { pt: "Bluetooth GATT", en: "Bluetooth GATT" }, serial: { pt: "— (Web BT)", en: "— (Web BT)" }, proto: { pt: "CI-V 0xA4 · HS Ham-Cockpit-Web01", en: "CI-V 0xA4 · HS Ham-Cockpit-Web01" } },
  { name: "IC-7300 / 7610 / 9700 / 7100", link: { pt: "USB CI-V (+ LAN nos 7610/9700)", en: "USB CI-V (+ LAN on 7610/9700)" }, serial: { pt: "19200–115200", en: "19200–115200" }, proto: { pt: "ser2net → Hamlib · LAN UDP→CI-V", en: "ser2net → Hamlib · LAN UDP→CI-V" } },
  { name: "Kenwood TS-590 / 890 / 990", link: { pt: "USB CAT", en: "USB CAT" }, serial: { pt: "38400–115200", en: "38400–115200" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "Yaesu FT-991A / FTDX / FT-710", link: { pt: "USB CAT", en: "USB CAT" }, serial: { pt: "38400", en: "38400" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "FlexRadio 6400 / 6600 / 8600", link: { pt: "Ethernet SmartSDR", en: "SmartSDR Ethernet" }, serial: { pt: "TCP/UDP 4992 · VITA 4991", en: "TCP/UDP 4992 · VITA 4991" }, proto: { pt: "Proxy CAT → Hamlib (driver nativo depois)", en: "CAT proxy → Hamlib (native driver later)" } },
  { name: "Ten-Tec Omni / Eagle", link: { pt: "USB CAT", en: "USB CAT" }, serial: { pt: "57600", en: "57600" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "Xiegu X6100 / X6200 / G90", link: { pt: "USB DEV SERIAL-B", en: "USB DEV SERIAL-B" }, serial: { pt: "19200 CI-V", en: "19200 CI-V" }, proto: { pt: "ser2net + Hamlib", en: "ser2net + Hamlib" } },
  { name: "Hermes Lite 2", link: { pt: "Ethernet OpenHPSDR P1", en: "Ethernet OpenHPSDR P1" }, serial: { pt: "UDP 1024 / 1025", en: "UDP 1024 / 1025" }, proto: { pt: "Thetis/piHPSDR CAT → Hamlib 2054/2040", en: "Thetis/piHPSDR CAT → Hamlib 2054/2040" } },
  { name: "Anan 10E / 100D / 7000 / G2", link: { pt: "Ethernet OpenHPSDR P2", en: "Ethernet OpenHPSDR P2" }, serial: { pt: "UDP 1024+", en: "UDP 1024+" }, proto: { pt: "Thetis/piHPSDR CAT → Hamlib", en: "Thetis/piHPSDR CAT → Hamlib" } },
  { name: "Lextel MS-2000", link: { pt: "BT Classic SPP", en: "Classic BT SPP" }, serial: { pt: "rfcomm", en: "rfcomm" }, proto: { pt: "Escuta; decoder ASCII/CSV/binário", en: "Listen-only; ASCII/CSV/binary decoder" } },
  { name: "SPE Expert", link: { pt: "USB-RS232", en: "USB-RS232" }, serial: { pt: "9600 8N1", en: "9600 8N1" }, proto: { pt: "ampctld · MAX3232", en: "ampctld · MAX3232" } },
  { name: "Hamplus AS-603WL", link: { pt: "USB-RS232", en: "USB-RS232" }, serial: { pt: "9600 8N1", en: "9600 8N1" }, proto: { pt: "ANT 1–6 · rádio 1–3 · rotor", en: "ANT 1–6 · radio 1–3 · rotator" } },
  { name: "Palstar AT-AUTO", link: { pt: "USB-RS232", en: "USB-RS232" }, serial: { pt: "9600 8N1", en: "9600 8N1" }, proto: { pt: "Auto / Manual / Bypass", en: "Auto / Manual / Bypass" } },
  { name: "LDG AT-600/1000 ProII", link: { pt: "USB-TTL METER", en: "USB-TTL METER" }, serial: { pt: "38400 8N1", en: "38400 8N1" }, proto: { pt: "TTL 5 V — nunca RS232 de PC", en: "TTL 5 V — never PC RS232" } },
  { name: "TelePost LP-100A", link: { pt: "USB-RS232 reto", en: "Straight USB-RS232" }, serial: { pt: "115200 8N1", en: "115200 8N1" }, proto: { pt: "Poll P · A alarme · F Avg/Peak/Tune", en: "Poll P · A alarm · F Avg/Peak/Tune" } },
  { name: "ACOM 2000A", link: { pt: "USB-RS232 null-modem", en: "USB-RS232 null-modem" }, serial: { pt: "1200 8N1", en: "1200 8N1" }, proto: { pt: "Só 2–3/3–2/5–5 · RPON RTS+DTR 10 s", en: "Pins 2–3/3–2/5–5 only · RPON RTS+DTR 10 s" } },
  { name: "MMDVM HAT / ZUMspot", link: { pt: "UART GPIO 3,3 V ou USB", en: "GPIO 3.3 V UART or USB" }, serial: { pt: "115200 8N1", en: "115200 8N1" }, proto: { pt: "MMDVM Host exclusivo · não ser2net", en: "MMDVM Host exclusive · not ser2net" } },
];

export const HOME_RECIPES: { kicker: Pair; title: Pair; points: Pair[] }[] = [
  {
    kicker: { pt: "Receita A · campo", en: "Recipe A · field" },
    title: { pt: "IC-705 no AP do Pi", en: "IC-705 on the Pi AP" },
    points: [
      { pt: "Grave a img.xz, ligue o Pi sem Ethernet", en: "Flash the img.xz, power the Pi with no Ethernet" },
      { pt: "Notebook no Wi‑Fi Ham-Cockpit-XXXX / hamcockpit", en: "Laptop on Wi‑Fi Ham-Cockpit-XXXX / hamcockpit" },
      { pt: "Rádio Bluetooth CI-V 0xA4 marcado Principal", en: "Bluetooth CI-V 0xA4 radio marked Primary" },
      { pt: "Lextel opcional no mesmo dongle (SPP)", en: "Optional Lextel on the same dongle (SPP)" },
    ],
  },
  {
    kicker: { pt: "Receita B · digital", en: "Recipe B · digital" },
    title: { pt: "Shack FT8", en: "FT8 shack" },
    points: [
      { pt: "Pi na Ethernet; ham-cockpit.local", en: "Pi on Ethernet; ham-cockpit.local" },
      { pt: "705 GATT + MS-2000 SPP", en: "705 GATT + MS-2000 SPP" },
      { pt: "Wavelog :8086/install · Gate UDP 2333", en: "Wavelog :8086/install · Gate UDP 2333" },
      { pt: "WSJT-X Hamlib NET 127.0.0.1:4532 modelo 3085", en: "WSJT-X Hamlib NET 127.0.0.1:4532 model 3085" },
    ],
  },
  {
    kicker: { pt: "Receita C · HF", en: "Recipe C · HF" },
    title: { pt: "7300 + SPE + ACOM + LP-100A", en: "7300 + SPE + ACOM + LP-100A" },
    points: [
      { pt: "Icom USB CI-V 0x94 como Principal", en: "Icom USB CI-V 0x94 as Primary" },
      { pt: "Três USB-RS232: SPE 9600, ACOM 1200, LP-100A 115200", en: "Three USB-RS232 adapters: SPE 9600, ACOM 1200, LP-100A 115200" },
      { pt: "Wizard para cada acessório; Hamlib só no rádio", en: "Wizard for each accessory; Hamlib only on the radio" },
      { pt: "CAT do 2000A no RCU, não na DB9 do amp", en: "2000A CAT on the RCU, not on the amp DB9" },
    ],
  },
  {
    kicker: { pt: "Receita D · DV", en: "Recipe D · DV" },
    title: { pt: "Hotspot MMDVM no mesmo Pi", en: "MMDVM hotspot on the same Pi" },
    points: [
      { pt: "HAT MMDVM no UART /dev/ttyAMA0 115200 (3,3 V) ou ZUMspot USB", en: "MMDVM HAT on UART /dev/ttyAMA0 115200 (3.3 V) or USB ZUMspot" },
      { pt: "Não coloque o modem no ser2net — MMDVM Host é o dono", en: "Do not put the modem on ser2net — MMDVM Host owns it" },
      { pt: "Operação → MMDVM: indicativo, ID DMR, DMR Gateway BrandMeister", en: "Operate → MMDVM: callsign, DMR ID, DMR Gateway BrandMeister" },
      { pt: "Binários WPSD em /usr/local/bin/MMDVMHost e DMR Gateway", en: "WPSD binaries in /usr/local/bin/MMDVMHost and DMR Gateway" },
    ],
  },
];

export const DOCS_TOC: { id: string; label: Pair }[] = [
  { id: "visao", label: { pt: "O que é", en: "What it is" } },
  { id: "arquitetura", label: { pt: "Arquitetura", en: "Architecture" } },
  { id: "imagem", label: { pt: "Imagem OS", en: "OS image" } },
  { id: "fluxo", label: { pt: "Fluxo de funcionamento", en: "How it runs" } },
  { id: "console", label: { pt: "Console", en: "Console" } },
  { id: "equipamentos", label: { pt: "Rádios suportados", en: "Supported radios" } },
  { id: "radio-ble", label: { pt: "IC-705 Bluetooth", en: "IC-705 Bluetooth" } },
  { id: "radio-usb", label: { pt: "USB / CAT / Hamlib", en: "USB / CAT / Hamlib" } },
  { id: "lextel", label: { pt: "Lextel MS-2000", en: "Lextel MS-2000" } },
  { id: "acessorios", label: { pt: "Acessórios", en: "Accessories" } },
  { id: "wavelog", label: { pt: "Wavelog", en: "Wavelog" } },
  { id: "wlg", label: { pt: "WaveLogGate", en: "WaveLogGate" } },
  { id: "contest", label: { pt: "Contest", en: "Contest" } },
  { id: "mmdvm", label: { pt: "MMDVM / WPSD", en: "MMDVM / WPSD" } },
  { id: "rede", label: { pt: "Rede e Wi‑Fi", en: "Network and Wi‑Fi" } },
  { id: "portas", label: { pt: "Mapa de portas", en: "Port map" } },
  { id: "cabos", label: { pt: "Cabos e níveis", en: "Cables and levels" } },
  { id: "admin", label: { pt: "Serviços e admin", en: "Services and admin" } },
  { id: "config", label: { pt: "Referência de config", en: "Config reference" } },
  { id: "receitas", label: { pt: "Receitas", en: "Recipes" } },
  { id: "problemas", label: { pt: "Se não ligar", en: "If it will not come up" } },
];
