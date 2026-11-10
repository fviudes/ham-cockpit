import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import NavBar from "@/components/NavBar";
import { APP_BLE_NAME, APP_VERSION } from "@shared/brand";
import {
  FigAcomCable,
  FigBoot,
  FigDualBt,
  FigIc705,
  FigSer2net,
  FigStation,
  FigTtl,
  FigWavelog,
  FigWavelogArch,
  FigWavelogCat,
  FigWavelogContest,
  FigMmdvm,
} from "@/console/manual-diagrams";
import { PRODUCT, Photo } from "./product-media";
import { useSiteLang, type Pair } from "./site-lang";
import { DOCS_TOC } from "./site-copy";
import { EquipmentGuide } from "@/console/equipment-guide";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function Docs() {
  const [active, setActive] = useState("visao");
  const [, navigate] = useLocation();
  const { t, lang } = useSiteLang();

  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace("#", "") || "visao";
      setActive(id);
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (window.location.hash) onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (id: string) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pin = lang === "en" ? "or" : "ou";

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <div className="pt-14">
        <header className="border-b border-[rgba(79,195,247,0.1)]">
          <div className="container grid items-center gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">
                {t({ pt: "DOCUMENTAÇÃO", en: "DOCUMENTATION" })} · v{APP_VERSION} · PT-BR / EN-US
              </p>
              <h1 className="font-['Space_Grotesk'] text-4xl font-bold text-white sm:text-5xl">
                {t({ pt: "Ham Cockpit, de ponta a ponta", en: "Ham Cockpit, end to end" })}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#94a3b8]">
                {t({
                  pt: "Arquitetura, imagem Ubuntu, Bluetooth GATT e SPP, ser2net, Hamlib, Wavelog, MMDVM (WPSD/Pi-Star), acessórios RS232 e o mapa de portas do Raspberry Pi. O manual bilíngue do operador continua no console (Sistema → Manual).",
                  en: "Architecture, Ubuntu image, Bluetooth GATT and SPP, ser2net, Hamlib, Wavelog, MMDVM (WPSD/Pi-Star), RS232 accessories, and the Raspberry Pi port map. The bilingual operator manual stays in the console (System → Manual).",
                })}
              </p>
            </div>
            <Photo
              src={PRODUCT.hero}
              alt={t({
                pt: "Raspberry Pi Ham Cockpit com dongle Bluetooth, USB-serial e cartão da imagem OS",
                en: "Ham Cockpit Raspberry Pi with a Bluetooth dongle, USB-serial adapters, and the OS image card",
              })}
              caption={t({
                pt: "Produto: Raspberry Pi 3/4/5, Ubuntu Server 24.04 ARM64, cartão ham-cockpit-0.1.03-raspi.img.xz.",
                en: "Product: Raspberry Pi 3/4/5, Ubuntu Server 24.04 ARM64, ham-cockpit-0.1.03-raspi.img.xz card.",
              })}
            />
          </div>
        </header>

        <div className="container grid gap-8 py-10 lg:grid-cols-[220px_1fr]">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-3 font-['IBM_Plex_Mono'] text-[10px] tracking-widest text-[#4fc3f7]/60 uppercase">
              {t({ pt: "Índice", en: "Contents" })}
            </p>
            <nav className="flex max-h-[70vh] flex-col gap-0.5 overflow-auto pr-1">
              {DOCS_TOC.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s.id)}
                  className={`rounded-md px-3 py-1.5 text-left text-sm ${
                    active === s.id ? "bg-[#4fc3f7]/15 text-[#4fc3f7]" : "text-[#94a3b8] hover:text-[#4fc3f7]"
                  }`}
                >
                  {t(s.label)}
                </button>
              ))}
            </nav>
          </aside>

          <motion.article initial="hidden" animate="visible" variants={fadeUp} className="min-w-0 space-y-16 pb-20">
            <Sec id="visao" title={t({ pt: "O que é o Ham Cockpit", en: "What Ham Cockpit is" })}>
              <p>
                {t({
                  pt: "Ham Cockpit é o appliance da estação: um Raspberry Pi que fica sempre ligado no shack e publica um site. Você opera no Chrome ou Edge — celular, notebook ou PC da mesa. Não é firmware ESP32, não são 4 UARTs CI-V no GPIO, não é um programa Windows por equipamento.",
                  en: "Ham Cockpit is the station appliance: a Raspberry Pi that stays on in the shack and publishes a website. You operate in Chrome or Edge — phone, laptop, or desk PC. It is not ESP32 firmware, not four CI-V UARTs on the GPIO, and not one Windows program per box.",
                })}
              </p>
              <ul>
                <Li
                  pt="Imagem: Ubuntu Server 24.04 LTS ARM64, gravável com Raspberry Pi Imager (Use custom)."
                  en="Image: Ubuntu Server 24.04 LTS ARM64, flash with Raspberry Pi Imager (Use custom)."
                />
                <Li
                  pt="Console em /opt/ham-cockpit atrás do nginx na porta 80 (usuário admin / 1234)."
                  en="Console in /opt/ham-cockpit behind nginx on port 80 (user admin / 1234)."
                />
                <li>
                  IC-705 {t({ pt: "por Web Bluetooth GATT (CI-V 0xA4, nome", en: "over Web Bluetooth GATT (CI-V 0xA4, name" })}{" "}
                  {APP_BLE_NAME}).
                </li>
                <Li
                  pt="Lextel MS-2000 por Bluetooth Classic SPP (só escuta, reconecta no servidor)."
                  en="Lextel MS-2000 over Bluetooth Classic SPP (listen-only, reconnects on the server)."
                />
                <Li
                  pt="Outros rádios por USB/CAT; acessórios por ser2net (IP 127.0.0.1:porta)."
                  en="Other radios over USB/CAT; accessories over ser2net (IP 127.0.0.1:port)."
                />
                <Li
                  pt="Wavelog :8086, WaveLogGate UDP 2333 + CAT api/radio + QSY :54321, contest 3.0, Hamlib NET :4532."
                  en="Wavelog :8086, WaveLogGate UDP 2333 + CAT api/radio + QSY :54321, contest 3.0, Hamlib NET :4532."
                />
                <Li
                  pt="MMDVM (WPSD): MMDVMHost no UART do modem, DMRGateway em 127.0.0.1:62031, console React na aba Operação."
                  en="MMDVM (WPSD): MMDVMHost on the modem UART, DMRGateway on 127.0.0.1:62031, React console on the Operate tab."
                />
              </ul>
            </Sec>

            <Sec id="arquitetura" title={t({ pt: "Arquitetura do sistema", en: "System architecture" })}>
              <Photo
                src={PRODUCT.shack}
                alt={t({ pt: "Pi, rádio e wattímetro no mesmo posto", en: "Pi, radio, and wattmeter on the same desk" })}
                caption={t({
                  pt: "Estrela: o Pi no centro. Rádio e acessórios não falam uns com os outros — falam com o appliance.",
                  en: "Star: the Pi in the center. Radio and accessories do not talk to each other — they talk to the appliance.",
                })}
              />
              <FigStation
                caption={t({
                  pt: "Planos: navegador (GATT + HTTP) · Node/nginx · ser2net · Hamlib · Docker Wavelog · SPP Lextel · MMDVMHost.",
                  en: "Planes: browser (GATT + HTTP) · Node/nginx · ser2net · Hamlib · Docker Wavelog · Lextel SPP · MMDVMHost.",
                })}
              />
              <h3>{t({ pt: "Quatro regras que não se quebram", en: "Four rules that do not break" })}</h3>
              <ol>
                <li>
                  <strong>{t({ pt: "Só o ser2net abre a TTY de CAT/acessório.", en: "Only ser2net opens the CAT/accessory TTY." })}</strong>{" "}
                  {t({
                    pt: "Rádio Cat-USB e acessórios escolhem uma conexão IP. Dois programas na mesma serial = “COM em uso”. O UART do modem MMDVM é a exceção: MMDVMHost é o dono.",
                    en: "Cat-USB radio and accessories pick an IP connection. Two programs on the same serial = “COM in use”. The MMDVM modem UART is the exception: MMDVMHost owns it.",
                  })}
                </li>
                <li>
                  <strong>{t({ pt: "Web Bluetooth é no Chrome.", en: "Web Bluetooth is in Chrome." })}</strong>{" "}
                  {t({
                    pt: "O GATT do 705 não roda no Node. O login (Entrar) é o gesto que o navegador exige; depois o console insiste a cada 2 s, no mesmo espírito do Lextel.",
                    en: "The 705 GATT does not run in Node. Sign in is the gesture the browser requires; then the console retries every 2 s, same idea as Lextel.",
                  })}
                </li>
                <li>
                  <strong>GPIO 3,3 V ≠ RS232 ±12 V.</strong>{" "}
                  {t({
                    pt: "SPE, Palstar, Hamplus, ACOM e LP-100A usam USB-serial MAX3232 (ou cabo USB-RS232). Cabo de amp no header mata o SoC.",
                    en: "SPE, Palstar, Hamplus, ACOM, and LP-100A use a USB-serial MAX3232 (or USB-RS232 cable). An amp cable on the header kills the SoC.",
                  })}
                </li>
              </ol>
            </Sec>

            <Sec id="imagem" title={t({ pt: "Imagem OS e primeiro boot", en: "OS image and first boot" })}>
              <p>
                {t({
                  pt: "O bake roda no GitHub Actions (ARM). O arquivo não vai para o Git (~1,7 GB). Fica em",
                  en: "The bake runs on GitHub Actions (ARM). The file does not go into Git (~1.7 GB). It lives at",
                })}{" "}
                <code>image/out/ham-cockpit-{APP_VERSION}-raspi.img.xz</code>{" "}
                {t({ pt: "neste PC, ou no release", en: "on this PC, or on the" })}{" "}
                <a href={`https://github.com/fviudes/ham-cockpit/releases/tag/v${APP_VERSION}`}>v{APP_VERSION}</a>.
              </p>
              <FigBoot
                caption={t({
                  pt: "Grave o cartão → ligue o Pi → Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit) → http://192.168.4.1 → admin / 1234.",
                  en: "Flash the card → power the Pi → Wi‑Fi Ham-Cockpit-XXXX (password hamcockpit) → http://192.168.4.1 → admin / 1234.",
                })}
              />
              <ul>
                <li>
                  {t({ pt: "Local:", en: "Local:" })} <code>powershell -File image\fetch-image.ps1</code>{" "}
                  {t({ pt: "(baixa o release para image/out).", en: "(downloads the release into image/out)." })}
                </li>
                <li>
                  Linux/WSL: <code>sudo bash image/appliance/build.sh</code>{" "}
                  {t({
                    pt: "(losetup + chroot; não roda neste Windows).",
                    en: "(losetup + chroot; does not run on this Windows PC).",
                  })}
                </li>
                <Li
                  pt="Grave com Raspberry Pi Imager → Use custom. Pi 3, 4 ou 5."
                  en="Flash with Raspberry Pi Imager → Use custom. Pi 3, 4 or 5."
                />
                <li>
                  {t({ pt: "No boot,", en: "At boot," })} <code>ham-cockpit.target</code>{" "}
                  {t({
                    pt: "sobe docker, nginx:80, ser2net, Wavelog, Gate, SSH. Sem Ethernet, NetworkManager cria o AP 192.168.4.1 (DHCP 192.168.4.50–150).",
                    en: "starts docker, nginx:80, ser2net, Wavelog, Gate, SSH. With no Ethernet, NetworkManager creates AP 192.168.4.1 (DHCP 192.168.4.50–150).",
                  })}
                </li>
                <Li
                  pt="Wavelog puxa as imagens Docker no primeiro boot com rede — a img.xz não as embute."
                  en="Wavelog pulls Docker images on the first boot with a network — the img.xz does not embed them."
                />
              </ul>
            </Sec>

            <Sec id="fluxo" title={t({ pt: "Fluxo de funcionamento", en: "How the station runs" })}>
              <ol>
                <li>
                  <strong>Power.</strong>{" "}
                  {t({
                    pt: "Ubuntu sobe, systemd inicia os daemons. Status no console mostra o que está em execução.",
                    en: "Ubuntu comes up, systemd starts the daemons. Status in the console shows what is running.",
                  })}
                </li>
                <li>
                  <strong>Login.</strong>{" "}
                  {t({
                    pt: "admin/1234. O clique em Entrar tenta o rádio marcado Principal (GATT se for Icom Bluetooth CI-V; senão POST /api/radios/connect no USB).",
                    en: "admin/1234. Sign in tries the radio marked Primary (GATT if it is Icom Bluetooth CI-V; otherwise POST /api/radios/connect on USB).",
                  })}
                </li>
                <li>
                  <strong>Wizard</strong>{" "}
                  {t({
                    pt: "(menu Configuração): serial livre → porta TCP a partir de 4001 → SPE / Hamplus / Palstar / LDG / LP-100A / ACOM → início automático.",
                    en: "(Setup menu): free serial → TCP port from 4001 → SPE / Hamplus / Palstar / LDG / LP-100A / ACOM → start on boot.",
                  })}
                </li>
                <li>
                  <strong>{t({ pt: "Aba do dispositivo", en: "Device tab" })}</strong>{" "}
                  {t({
                    pt: "escolhe a conexão IP. O aparelho nunca abre o /dev/tty… direto.",
                    en: "picks the IP connection. The box never opens /dev/tty… itself.",
                  })}
                </li>
                <li>
                  <strong>{t({ pt: "Painel.", en: "Panel." })}</strong>{" "}
                  {t({
                    pt: "VFO, modo, PTT, bandas. Com CI-V grant 0x64, o que você toca no navegador mexe no 705 (freq, PTT 1C 00, modo 26 00, S-meter 15 02).",
                    en: "VFO, mode, PTT, bands. With CI-V grant 0x64, what you touch in the browser moves the 705 (freq, PTT 1C 00, mode 26 00, S-meter 15 02).",
                  })}
                </li>
                <li>
                  <strong>{t({ pt: "Digital.", en: "Digital." })}</strong>{" "}
                  {t({
                    pt: "WSJT-X → Hamlib NET :4532 + UDP 2333 → Gate → Wavelog. O QSO não se copia à mão.",
                    en: "WSJT-X → Hamlib NET :4532 + UDP 2333 → Gate → Wavelog. You do not copy the QSO by hand.",
                  })}
                </li>
              </ol>
            </Sec>

            <Sec id="console" title={t({ pt: "Console, tela e contas", en: "Console, screen, and accounts" })}>
              <Photo
                src={PRODUCT.console}
                alt={t({
                  pt: "Notebook com o console Ham Cockpit e o rádio ao lado",
                  en: "Laptop with the Ham Cockpit console and the radio beside it",
                })}
                caption={t({
                  pt: "Menu à esquerda, VFO no topo, chips CI-V / SPP. No celular o mesmo menu abre em ☰. Idioma PT-BR / EN-US.",
                  en: "Menu on the left, VFO on top, CI-V / SPP chips. On a phone the same menu opens from ☰. Language PT-BR / EN-US.",
                })}
              />
              <ul>
                <Li
                  pt="URL: http://IP-do-Pi/console ou http://ham-cockpit.local/console ou http://192.168.4.1/console."
                  en="URL: http://Pi-IP/console or http://ham-cockpit.local/console or http://192.168.4.1/console."
                />
                <Li
                  pt="Usuário padrão admin / 1234. Contas extras em Admin (grupo sudo, SSH :22)."
                  en="Default user admin / 1234. Extra accounts in Admin (sudo group, SSH :22)."
                />
                <Li
                  pt="Root por senha no SSH está desligado. O terminal do console usa sudo no serviço hamcockpit."
                  en="Root password SSH is off. The console terminal uses sudo as the hamcockpit service."
                />
                <Li
                  pt="HDMI VFO: kiosk no monitor do Pi (CTRL+X volta ao console)."
                  en="HDMI VFO: kiosk on the Pi monitor (CTRL+X returns to the console)."
                />
                <Li
                  pt="Firefox não tem Web Bluetooth — use Chrome ou Edge. Origem segura: HTTPS ou o IP do Pi na LAN."
                  en="Firefox has no Web Bluetooth — use Chrome or Edge. Secure origin: HTTPS or the Pi IP on the LAN."
                />
              </ul>
            </Sec>

            <Sec id="equipamentos" title={t({ pt: "Rádios suportados", en: "Supported radios" })}>
              <EquipmentGuide lang={lang} />
            </Sec>

            <Sec id="radio-ble" title={t({ pt: "IC-705 por Bluetooth (GATT CI-V)", en: "IC-705 over Bluetooth (GATT CI-V)" })}>
              <Photo
                src={PRODUCT.radio}
                alt={t({ pt: "Rádio QRP portátil e celular com o console", en: "Portable QRP radio and a phone with the console" })}
                caption={t({
                  pt: "CI-V por Web Bluetooth. Sem cabo, sem divisor TTL, sem ESP32.",
                  en: "CI-V over Web Bluetooth. No cable, no TTL splitter, no ESP32.",
                })}
              />
              <FigIc705
                caption={t({
                  pt: "No rádio: Set → Bluetooth Set → Pairing Reception (só na 1.ª vez). No console: Icom · Bluetooth · CI-V · 0xA4 · Conectar · aceite Ham-Cockpit-Web01.",
                  en: "On the radio: Set → Bluetooth Set → Pairing Reception (first time only). In the console: Icom · Bluetooth · CI-V · 0xA4 · Connect · accept Ham-Cockpit-Web01.",
                })}
              />
              <h3>{t({ pt: "Protocolo", en: "Protocol" })}</h3>
              <ul>
                <li>
                  {t({ pt: "Serviço GATT", en: "GATT service" })} <code>14cf8001-1ec2-d408-1b04-2eb270f14203</code>
                </li>
                <Li
                  pt="Características 14cf8002 (CI-V) e 14cf8003 (dados)"
                  en="Characteristics 14cf8002 (CI-V) and 14cf8003 (data)"
                />
                <li>
                  Handshake 0x61 (UUID) + 0x62 ({t({ pt: "nome", en: "name" })} {APP_BLE_NAME}) + 0x63 (token) → grant 0x64
                </li>
                <li>PTT 1C 00 00/01 · VFO 07 00/01 · {t({ pt: "modo", en: "mode" })} 26 00 + 06 · S-meter poll 15 02 · DV = 0x17</li>
              </ul>
              <p>
                {t({
                  pt: "Depois de uma autorização neste navegador, o rádio Principal reconecta no login sem “escolher outro dispositivo”. Deixe Pairing Reception fechado nas vezes seguintes; Bluetooth ON no 705. O áudio RX não vem no GATT — USB áudio é o caminho Icom para o PC.",
                  en: "After a grant in this browser, the Primary radio reconnects at login without “choose another device”. Leave Pairing Reception closed later; Bluetooth ON on the 705. RX audio is not on GATT — USB audio is the Icom path to the PC.",
                })}
              </p>
            </Sec>

            <Sec
              id="radio-usb"
              title={t({ pt: "Outros rádios: USB, CAT, ser2net, Hamlib", en: "Other radios: USB, CAT, ser2net, Hamlib" })}
            >
              <p>
                {t({
                  pt: "Cat-USB não abre a serial no Node. Cadastre IP+porta+TTY na aba ser2net (tipo Rádio) e escolha essa conexão no rádio. Hamlib (rigctld) liga em 127.0.0.1:essa-porta.",
                  en: "Cat-USB does not open the serial port in Node. Register IP+port+TTY on the ser2net tab (Radio type) and pick that connection on the radio. Hamlib (rigctld) attaches to 127.0.0.1:that-port.",
                })}
              </p>
              <FigSer2net
                caption={t({
                  pt: "TTY → ser2net :4001 → rigctld -r 127.0.0.1:4001 -t 4532. WSJT-X usa NET rigctl, nunca o cabo.",
                  en: "TTY → ser2net :4001 → rigctld -r 127.0.0.1:4001 -t 4532. WSJT-X uses NET rigctl, never the cable.",
                })}
              />
              <ul>
                <Li
                  pt="Icom USB: CI-V, endereço do rádio (7300 0x94, 7610 0x76, 9700 0x88, 7100 0x18)."
                  en="Icom USB: CI-V, radio address (7300 0x94, 7610 0x76, 9700 0x88, 7100 0x18)."
                />
                <Li
                  pt="Kenwood / Yaesu: CAT 38400 típico. Flex / Ten-Tec: baud do manual."
                  en="Kenwood / Yaesu: typical CAT 38400. Flex / Ten-Tec: baud from the manual."
                />
                <Li
                  pt="IC-705 USB também pode ir por ser2net; o caminho nativo do produto é GATT."
                  en="IC-705 USB can also go through ser2net; the native product path is GATT."
                />
                <li>
                  {t({ pt: "Prefira", en: "Prefer" })} <code>/dev/serial/by-id/usb-…</code> —{" "}
                  {t({
                    pt: "o número ttyUSB muda, o by-id não.",
                    en: "the ttyUSB number changes, by-id does not.",
                  })}
                </li>
              </ul>
            </Sec>

            <Sec id="lextel" title={t({ pt: "Lextel MS-2000 (SPP Classic)", en: "Lextel MS-2000 (Classic SPP)" })}>
              <FigDualBt
                caption={t({
                  pt: "Não é o GATT do 705. É Bluetooth Classic UUID 00001101. No Pi: /opt/ham-cockpit/bin/lextel-bt. PIN 1234 ou 0000.",
                  en: "Not the 705 GATT. Classic Bluetooth UUID 00001101. On the Pi: /opt/ham-cockpit/bin/lextel-bt. PIN 1234 or 0000.",
                })}
              />
              <p>
                {t({
                  pt: "Só escuta (PEP, média, ROE, V, Z, AM). O formato do quadro não é público — o decoder aceita ASCII/CSV/JSON e aprende pacotes binários repetidos.",
                  en: "Listen-only (PEP, average, SWR, V, Z, AM). The frame format is not public — the decoder accepts ASCII/CSV/JSON and learns repeating binary packets.",
                })}{" "}
                <code>wantOpen</code>{" "}
                {t({
                  pt: "no servidor reabre o SPP se o Windows soltar o COM no handshake GATT. No Windows use a COM de saída, não a de entrada.",
                  en: "on the server reopens SPP if Windows drops the COM during the GATT handshake. On Windows use the outgoing COM, not the incoming one.",
                })}
              </p>
            </Sec>

            <Sec id="acessorios" title={t({ pt: "Acessórios no wizard (ser2net)", en: "Accessories in the wizard (ser2net)" })}>
              <Photo
                src={PRODUCT.gear}
                alt={t({ pt: "Wattímetro, amplificador e USB-RS232", en: "Wattmeter, amplifier, and USB-RS232" })}
                caption={t({
                  pt: "Cada acessório = uma conexão IP. Baud e cabo estão na tabela; o GPIO do Pi não entra.",
                  en: "Each accessory = one IP connection. Baud and cable are in the table; the Pi GPIO stays out.",
                })}
              />
              <div className="overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
                    <tr>
                      <th className="px-3 py-2">{t({ pt: "Acessório", en: "Accessory" })}</th>
                      <th className="px-3 py-2">Baud</th>
                      <th className="px-3 py-2">{t({ pt: "Cabo", en: "Cable" })}</th>
                      <th className="px-3 py-2">{t({ pt: "O que o console faz", en: "What the console does" })}</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#c5d4e0]">
                    {ACC_ROWS.map((row) => (
                      <tr key={row.name} className="border-t border-[rgba(79,195,247,0.08)]">
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.baud}</td>
                        <td className="px-3 py-2">{t(row.cable)}</td>
                        <td className="px-3 py-2">{t(row.does)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                {t({
                  pt: "AT-100ProII não tem jack METER — o painel LDG nesse modelo é só imitação dos botões. Firmware LP-100A < 1.2.0.0 usa 38400; < 1.0.3 usa 19200 (ajuste o baud na conexão ser2net).",
                  en: "AT-100ProII has no METER jack — the LDG panel on that model is button mimicry only. LP-100A firmware < 1.2.0.0 uses 38400; < 1.0.3 uses 19200 (set baud on the ser2net connection).",
                })}
              </p>
            </Sec>

            <Sec id="wavelog" title={t({ pt: "Wavelog — o logbook da estação", en: "Wavelog — the station logbook" })}>
              <Photo
                src={PRODUCT.logbook}
                alt={t({
                  pt: "Logbook Wavelog no notebook, com o rádio e o Pi na mesa",
                  en: "Wavelog logbook on a laptop, with the radio and Pi on the desk",
                })}
                caption={t({
                  pt: "Wavelog 3.x em Docker (ghcr.io/wavelog/wavelog) na porta 8086. MariaDB no container wavelog-db — a 3306 não é publicada.",
                  en: "Wavelog 3.x in Docker (ghcr.io/wavelog/wavelog) on port 8086. MariaDB in container wavelog-db — 3306 is not published.",
                })}
              />
              <p>
                {t({
                  pt: "O Wavelog é o logbook PHP da estação (fork moderno do Cloudlog). No Ham Cockpit ele não divide pasta nem a porta 80 com o console: vive em /opt/wavelog, sobe com wavelog.service no boot e abre em http://IP-do-Pi:8086. Primeiro acesso: /install. Host do banco: wavelog-db. A URL da API termina em index.php.",
                  en: "Wavelog is the station PHP logbook (modern Cloudlog fork). In Ham Cockpit it does not share a folder or port 80 with the console: it lives in /opt/wavelog, starts with wavelog.service at boot, and opens at http://Pi-IP:8086. First visit: /install. Database host: wavelog-db. The API URL ends in index.php.",
                })}
              </p>
              <h3>{t({ pt: "Integrações nativas do Wavelog", en: "Native Wavelog integrations" })}</h3>
              <ul>
                <Li
                  pt="Logbook: QSO, DXCC/WAS/IOTA/SOTA/POTA/WWFF, QSL (papel, LoTW, eQSL, Club Log, HRDlog), OQRS, import/export ADIF."
                  en="Logbook: QSO, DXCC/WAS/IOTA/SOTA/POTA/WWFF, QSL (paper, LoTW, eQSL, Club Log, HRDlog), OQRS, ADIF import/export."
                />
                <Li
                  pt="Callbook: QRZ, HamQTH, QRZCQ — lookup ao digitar o indicativo (cache ~4 h)."
                  en="Callbook: QRZ, HamQTH, QRZCQ — lookup as you type the callsign (cache ~4 h)."
                />
                <Li
                  pt="Rádio CAT: POST /index.php/api/radio (legado) ou /api/v2/radio. O Gate do Ham Cockpit publica freq/modo a cada 4 s; o logbook mostra o rádio no dropdown Hardware Interfaces."
                  en="CAT radio: POST /index.php/api/radio (legacy) or /api/v2/radio. Ham Cockpit Gate publishes freq/mode every 4 s; the logbook shows the radio in the Hardware Interfaces dropdown."
                />
                <Li
                  pt="Bandmap / cluster: clique em um spot dispara o callback QSY (GET http://IP:54321/{freqHz}/{mode}). Não use 127.0.0.1 se o navegador não for o Pi."
                  en="Bandmap / cluster: clicking a spot fires the QSY callback (GET http://IP:54321/{freqHz}/{mode}). Do not use 127.0.0.1 if the browser is not the Pi."
                />
                <Li
                  pt="Winkeyer: macros F1–F10, WPM, Tune, no motor de contest quando habilitado nas configurações."
                  en="Winkeyer: F1–F10 macros, WPM, Tune, in the contest engine when enabled in settings."
                />
                <Li
                  pt="Wavelog Worker (opcional): WebSocket em tempo real para multi-op. No Pi o caminho nativo é o Gate + Hamlib, sem Worker."
                  en="Wavelog Worker (optional): real-time WebSocket for multi-op. On the Pi the native path is Gate + Hamlib, no Worker."
                />
              </ul>
              <h3>{t({ pt: "Operação com o rádio", en: "Operating with the radio" })}</h3>
              <FigWavelogCat
                caption={t({
                  pt: "Rádio → ser2net → rigctld :4532 → Gate lê f/m → POST api/radio. O Wavelog nunca abre a TTY.",
                  en: "Radio → ser2net → rigctld :4532 → Gate reads f/m → POST api/radio. Wavelog never opens the TTY.",
                })}
              />
              <ul>
                <Li
                  pt="No logbook: Hardware Interfaces → o rádio aparece com o nome RADIO_NAME (padrão IC-705). Edit → Callback URL = http://IP-do-Pi:54321"
                  en="In the logbook: Hardware Interfaces → the radio shows up as RADIO_NAME (default IC-705). Edit → Callback URL = http://Pi-IP:54321"
                />
                <Li
                  pt="QSO live: escolha CAT radio (não Manual) para o logger e o contest lerem frequência/modo do Gate."
                  en="Live QSO: pick CAT radio (not Manual) so the logger and contest read frequency/mode from the Gate."
                />
                <Li
                  pt="Quick QSY: no campo de indicativo do contest, digite kHz e Tab/Space/Enter — o Wavelog chama o Gate, o Gate manda F e M no Hamlib, o rádio vai."
                  en="Quick QSY: in the contest callsign field, type kHz and Tab/Space/Enter — Wavelog calls the Gate, the Gate sends F and M on Hamlib, the radio moves."
                />
                <Li
                  pt="WSJT-X/JTDX controlam o rádio por Hamlib NET 127.0.0.1:4532 (no PC da LAN: IP-do-Pi:4532). O Gate não usa Internal Hamlib."
                  en="WSJT-X/JTDX control the radio via Hamlib NET 127.0.0.1:4532 (from a LAN PC: Pi-IP:4532). The Gate does not use Internal Hamlib."
                />
              </ul>
              <p>
                {t({ pt: "No console Ham Cockpit, aba Wavelog:", en: "In the Ham Cockpit console, Wavelog tab:" })}{" "}
                {t({
                  pt: "cole a chave API (Admin → API) e o Station ID do perfil. Testar API deve ficar verde. Abrir logbook / Abrir instalador.",
                  en: "paste the API key (Admin → API) and the Station ID of the profile. Test API should go green. Open logbook / Open installer.",
                })}
              </p>
            </Sec>

            <Sec id="wlg" title={t({ pt: "WaveLogGate — o serviço UDP da estação", en: "WaveLogGate — the station UDP service" })}>
              <Photo
                src={PRODUCT.gate}
                alt={t({
                  pt: "Pi e WSJT-X no shack digital: o Gate escuta o UDP do programa e grava no Wavelog",
                  en: "Pi and WSJT-X in a digital shack: the Gate listens to the app UDP and logs into Wavelog",
                })}
                caption={t({
                  pt: "Não é o WavelogGate GUI do DJ7NT. É o processo headless Node em /opt/wavelog-gate, systemd waveloggate.service, sem DISPLAY.",
                  en: "This is not DJ7NT's GUI WavelogGate. It is the headless Node process in /opt/wavelog-gate, systemd waveloggate.service, no DISPLAY.",
                })}
              />
              <FigWavelogArch
                caption={t({
                  pt: "Três fluxos no mesmo processo: QSO UDP → api/qso; CAT Hamlib → api/radio a cada 4 s; cluster → GET :54321/{Hz}/{modo} → F/M no rigctld.",
                  en: "Three flows in one process: UDP QSO → api/qso; Hamlib CAT → api/radio every 4 s; cluster → GET :54321/{Hz}/{mode} → F/M on rigctld.",
                })}
              />
              <FigWavelog
                caption={t({
                  pt: "WSJT-X Secondary UDP server = IP do Pi, porta 2333. Pacote tipo 5 (QSO) ou 12 (ADIF) vira contato. Duplicata em 15 s é ignorada.",
                  en: "WSJT-X Secondary UDP server = Pi IP, port 2333. Type 5 (QSO) or type 12 (ADIF) packets become contacts. A duplicate within 15 s is ignored.",
                })}
              />
              <h3>{t({ pt: "O que o Gate faz", en: "What the Gate does" })}</h3>
              <ul>
                <Li
                  pt="Escuta UDP 0.0.0.0:2333 (protocolo WSJT-X: magic 0xadbccbda). Aceita também ADIF em texto (FLDigi e similares)."
                  en="Listens UDP 0.0.0.0:2333 (WSJT-X protocol: magic 0xadbccbda). Also accepts ADIF text (FLDigi and similar)."
                />
                <Li
                  pt="Monta ADIF (call, grid, mode, freq, RST, potência, comentário, operator, my call/grid, STX/SRX de contest) e POST em api/qso com key + station_profile_id."
                  en="Builds ADIF (call, grid, mode, freq, RST, power, comment, operator, my call/grid, contest STX/SRX) and POSTs api/qso with key + station_profile_id."
                />
                <Li
                  pt="Se o Wavelog estiver fora, o QSO vai para queue.jsonl e a fila esvazia a cada 20 s."
                  en="If Wavelog is down, the QSO goes to queue.jsonl and the queue flushes every 20 s."
                />
                <Li
                  pt="PUBLISH_CAT=1 (padrão): a cada 4 s lê f e m no Hamlib e POST api/radio com RADIO_NAME."
                  en="PUBLISH_CAT=1 (default): every 4 s reads f and m from Hamlib and POSTs api/radio with RADIO_NAME."
                />
                <Li
                  pt="HTTP :54321 — GET /status e GET /{freqHz}/{mode} (ex.: /14074000/FT8) para QSY a partir do bandmap."
                  en="HTTP :54321 — GET /status and GET /{freqHz}/{mode} (e.g. /14074000/FT8) for QSY from the bandmap."
                />
              </ul>
              <h3>{t({ pt: "Configuração", en: "Setup" })}</h3>
              <ul>
                <li>
                  <code>/opt/wavelog-gate/wavelog-gate.env</code> — WAVELOG_URL, WAVELOG_API_KEY, WAVELOG_STATION_ID,
                  RADIO_NAME, HAMLIB_HOST/PORT, UDP_PORT, QSY_PORT, PUBLISH_CAT.
                </li>
                <Li
                  pt="A aba Wavelog do console espelha esses campos. Salve a chave API depois do /install."
                  en="The console Wavelog tab mirrors those fields. Save the API key after /install."
                />
                <Li
                  pt="WSJT-X: File → Settings → Reporting → Secondary UDP server = IP do Pi, porta 2333, Enable logged ADIF broadcast. Rig: Hamlib NET, 127.0.0.1:4532, modelo 3085 no IC-705."
                  en="WSJT-X: File → Settings → Reporting → Secondary UDP server = Pi IP, port 2333, Enable logged ADIF broadcast. Rig: Hamlib NET, 127.0.0.1:4532, model 3085 on the IC-705."
                />
                <Li
                  pt="Não ative Internal Hamlib no Gate. Um só dono da TTY: ser2net."
                  en="Do not enable Internal Hamlib on the Gate. One TTY owner: ser2net."
                />
              </ul>
            </Sec>

            <Sec id="contest" title={t({ pt: "Módulo de contest do Wavelog", en: "Wavelog contest module" })}>
              <Photo
                src={PRODUCT.contest}
                alt={t({
                  pt: "Motor de contest: QSO logger, rádio CAT, Super Check Partial, mapa e relógio UTC",
                  en: "Contest engine: QSO logger, CAT radio, Super Check Partial, map, and UTC clock",
                })}
                caption={t({
                  pt: "Wavelog 3.0+ Contest Logging Engine. CAT radio no Ham Cockpit = o rádio que o Gate publica. Quick QSY usa o callback :54321.",
                  en: "Wavelog 3.0+ Contest Logging Engine. CAT radio in Ham Cockpit = the radio the Gate publishes. Quick QSY uses the :54321 callback.",
                })}
              />
              <FigWavelogContest
                caption={t({
                  pt: "Contest Manager → START → Logging Engine. Fonte CAT radio lê o Gate. Enter grava o QSO no logbook da sessão.",
                  en: "Contest Manager → START → Logging Engine. CAT radio source reads the Gate. Enter writes the QSO into the session logbook.",
                })}
              />
              <p>
                {t({
                  pt: "O motor de contest foi reescrito no Wavelog 3.0.0 (antes era o logger Cloudlog). Cobre SO e multi-op / club station. No Pi você abre http://IP:8086 → Contesting.",
                  en: "The contest engine was rewritten in Wavelog 3.0.0 (it used to be the Cloudlog logger). It covers SO and multi-op / club station. On the Pi you open http://IP:8086 → Contesting.",
                })}
              </p>
              <h3>{t({ pt: "Como ligar no Ham Cockpit", en: "How it hooks into Ham Cockpit" })}</h3>
              <ol>
                <li>
                  {t({
                    pt: "Gate no ar, Publicar CAT ligado, Testar API verde. O rádio IC-705 (ou o RADIO_NAME) aparece no Wavelog.",
                    en: "Gate up, Publish CAT on, Test API green. The IC-705 radio (or RADIO_NAME) appears in Wavelog.",
                  })}
                </li>
                <li>
                  {t({
                    pt: "Hardware Interfaces → Edit → Callback URL http://IP-do-Pi:54321 (não 127.0.0.1 se você opera no notebook).",
                    en: "Hardware Interfaces → Edit → Callback URL http://Pi-IP:54321 (not 127.0.0.1 if you operate from a laptop).",
                  })}
                </li>
                <li>
                  {t({
                    pt: "Contest Manager: nova sessão (contest ADIF, início/fim, station_id, campos de exchange: serial, grid, texto).",
                    en: "Contest Manager: new session (ADIF contest, start/end, station_id, exchange fields: serial, grid, text).",
                  })}
                </li>
                <li>
                  {t({
                    pt: "START abre o Logging Engine. No painel Radio escolha CAT radio (não Manual). Bandas HF/VHF/SHF seguem o rádio.",
                    en: "START opens the Logging Engine. In the Radio panel pick CAT radio (not Manual). HF/VHF/SHF bands follow the radio.",
                  })}
                </li>
              </ol>
              <h3>{t({ pt: "Logging Engine", en: "Logging Engine" })}</h3>
              <ul>
                <Li
                  pt="QSO Logger: indicativo (DXCC/callbook ao digitar), RST 59, Nr. S/R (serial), Grid, Exch. Tab só nos campos ativos. Enter grava. Escape limpa."
                  en="QSO Logger: callsign (DXCC/callbook as you type), RST 59, Nr. S/R (serial), Grid, Exch. Tab only on active fields. Enter saves. Escape clears."
                />
                <Li
                  pt="Worked-before: badge vermelho se o call já está na sessão (informativo; ainda pode gravar)."
                  en="Worked-before: red badge if the call is already in the session (informational; you can still save)."
                />
                <Li
                  pt="Quick QSY: número em kHz no campo de call + Tab/Space/Enter. Offset na faixa ou QSY de banda. O Gate manda F/M no Hamlib."
                  en="Quick QSY: kHz number in the call field + Tab/Space/Enter. In-band offset or band QSY. The Gate sends F/M on Hamlib."
                />
                <Li
                  pt="SCP (Super Check Partial): correspondência local no navegador; ? é curinga (DL?A)."
                  en="SCP (Super Check Partial): local matching in the browser; ? is a wildcard (DL?A)."
                />
                <Li
                  pt="Mapa Leaflet: marcadores, night terminator, great-circle, grids Maidenhead, auto-fit."
                  en="Leaflet map: markers, night terminator, great-circle, Maidenhead grids, auto-fit."
                />
                <Li
                  pt="Winkeyer: F1–F10, WPM, Tune, Stop — lê call, RST, serial, exch e grid do formulário."
                  en="Winkeyer: F1–F10, WPM, Tune, Stop — reads call, RST, serial, exch, and grid from the form."
                />
                <Li
                  pt="Multi-op: lista compartilhada em tempo real. Só o operador que logou edita/apaga. Serial: vermelho = preview, verde = reservado (Space ou Tab no exchange)."
                  en="Multi-op: shared live list. Only the operator who logged a QSO can edit/delete it. Serial: red = preview, green = reserved (Space or Tab into exchange)."
                />
                <Li
                  pt="WSJT-X no contest digital: o Gate já manda STX/SRX no ADIF (stx_string / srx_string). O QSO cai no logbook; associe à sessão (Import Historical ou API /api/v2/contest)."
                  en="WSJT-X in a digital contest: the Gate already sends STX/SRX in ADIF (stx_string / srx_string). The QSO lands in the logbook; attach it to the session (Import Historical or API /api/v2/contest)."
                />
              </ul>
            </Sec>

            <Sec id="mmdvm" title={t({ pt: "MMDVM — hotspot e repetidora (WPSD)", en: "MMDVM — hotspot and repeater (WPSD)" })}>
              <FigMmdvm
                caption={t({
                  pt: "Rádio DV → modem UART 115200 → MMDVMHost → DMRGateway 127.0.0.1:62031 (BrandMeister, TGIF, DMR+, XLX).",
                  en: "DV radio → UART modem 115200 → MMDVMHost → DMRGateway 127.0.0.1:62031 (BrandMeister, TGIF, DMR+, XLX).",
                })}
              />
              <p>
                {t({
                  pt: "WPSD (W0CHP-PiStar-Dash) é a suíte DV sucessora do Pi-Star. O site canônico é wpsd.radio; o Gitea repo.w0chp.net está atrás de Anubis. O Ham Cockpit usa a mesma pilha de daemons, não o dashboard PHP: o console React na aba Operação → MMDVM segue Space Grotesk, IBM Plex Mono, navy #0d1b2a, ciano #4fc3f7 e âmbar #FFB300.",
                  en: "WPSD (W0CHP-PiStar-Dash) is the DV suite that grew out of Pi-Star. The canonical site is wpsd.radio; the Gitea at repo.w0chp.net sits behind Anubis. Ham Cockpit uses the same daemon stack, not the PHP dashboard: the React console on Operate → MMDVM follows Space Grotesk, IBM Plex Mono, navy #0d1b2a, cyan #4fc3f7, and amber #FFB300.",
                })}
              </p>
              <h3>{t({ pt: "Fontes públicas analisadas", en: "Public sources we studied" })}</h3>
              <ul>
                <Li
                  pt="WPSD-M17/WPSD-WebCode (PHP dashboard, GPL-3): last heard em mmdvmhost/functions.php, API JSON /api, Instant Mode Manager, configure.php lê /etc/mmdvmhost e /etc/dmrgateway."
                  en="WPSD-M17/WPSD-WebCode (PHP dashboard, GPL-3): last heard in mmdvmhost/functions.php, JSON API /api, Instant Mode Manager, configure.php reads /etc/mmdvmhost and /etc/dmrgateway."
                />
                <Li
                  pt="g4klx/MMDVMHost e g4klx/DMRGateway (GPL-2): Host no UART, DMR Type=Gateway, Remote Control TCP 7642."
                  en="g4klx/MMDVMHost and g4klx/DMRGateway (GPL-2): Host on UART, DMR Type=Gateway, Remote Control TCP 7642."
                />
                <Li
                  pt="manual.wpsd.radio: DMRGateway é o método suportado (não DMR direto no Host). Last heard JSON em /api/?limit=10."
                  en="manual.wpsd.radio: DMRGateway is the supported method (not direct DMR in Host). Last heard JSON at /api/?limit=10."
                />
              </ul>
              <h3>{t({ pt: "Como liga no Ham Cockpit", en: "How it hooks into Ham Cockpit" })}</h3>
              <ul>
                <Li
                  pt="INI em /opt/ham-cockpit/mmdvm (ou /etc/mmdvmhost se o Pi já for WPSD). Logs em /var/log/mmdvm ou /var/log/pi-star."
                  en="INI in /opt/ham-cockpit/mmdvm (or /etc/mmdvmhost if the Pi is already WPSD). Logs in /var/log/mmdvm or /var/log/pi-star."
                />
                <Li
                  pt="systemd mmdvmhost.service + dmrgateway.service. Binários em /usr/local/bin via deploy/mmdvm/build-binaries.sh (g4klx) no bake. ConditionPathExists: o target sobe mesmo sem o modem."
                  en="systemd mmdvmhost.service + dmrgateway.service. Binaries in /usr/local/bin via deploy/mmdvm/build-binaries.sh (g4klx) at bake time. ConditionPathExists: the target still boots without the modem."
                />
                <Li
                  pt="HAT MMDVM no GPIO é 3,3 V — isso é o projeto do hat, não RS232 de amp. USB ZUMspot em /dev/ttyACM0. Nunca mapeie essa TTY no ser2net."
                  en="An MMDVM HAT on GPIO is 3.3 V — that is the hat design, not amp RS232. USB ZUMspot on /dev/ttyACM0. Never map that TTY in ser2net."
                />
                <Li
                  pt="LCD Nextion no header do modem: Display=Nextion, Port=modem, Transparent Data SendFrameType=1 e NextionDriver (on7lds) com Port=modem — igual WPSD. Baud da tela no modem costuma ser 9600. OLED I2C: Display=OLED Type=3."
                  en="Nextion LCD on the modem header: Display=Nextion, Port=modem, Transparent Data SendFrameType=1 and NextionDriver (on7lds) with Port=modem — same as WPSD. Modem-side screen baud is usually 9600. I2C OLED: Display=OLED Type=3."
                />
                <Li
                  pt="Modos nesta fase: DMR (DMRGateway), D-Star (ircDDBGateway) e YSF (YSFGateway). P25/NXDN/M17/POCSAG ficam para depois. HAT ADF7021 ouve um modo de cada vez."
                  en="Modes in this phase: DMR (DMRGateway), D-Star (ircDDBGateway), and YSF (YSFGateway). P25/NXDN/M17/POCSAG wait. ADF7021 HATs hear one mode at a time."
                />
                <Li
                  pt="Instant Mode Manager: Pause/Resume para DMR, YSF ou D-Star (para o systemd do gateway). Resume All restaura."
                  en="Instant Mode Manager: Pause/Resume for DMR, YSF, or D-Star (stops that gateway unit). Resume All restores."
                />
                <Li
                  pt="YSF Manager: Startup YSF/FCS → Network Startup no ysfgateway.ini e restart só do YSFGateway. D-Star Manager: reflector + módulo → ircddbgateway.conf."
                  en="YSF Manager: YSF/FCS startup → Network Startup in ysfgateway.ini and restart only YSFGateway. D-Star Manager: reflector + module → ircddbgateway.conf."
                />
                <Li
                  pt="DMR Network Manager: o chip da rede (BrandMeister, DMR+, TGIF, XLX) grava Enabled no dmrgateway.ini e reinicia só o DMRGateway."
                  en="DMR Network Manager: the network chip (BrandMeister, DMR+, TGIF, XLX) writes Enabled in dmrgateway.ini and restarts only DMRGateway."
                />
                <Li
                  pt="Remote Control TCP 7642: Enviar TG manda talkgroup TS TG. Last heard usa o filtro WPSD-WebCode getHeardList."
                  en="Remote Control TCP 7642: Send TG issues talkgroup TS TG. Last heard uses the WPSD-WebCode getHeardList filter."
                />
                <Li
                  pt="Não instale Apache/PHP do Pi-Star na porta 80. Fontes canônicas: repo.w0chp.net/WPSD-Dev (WebCode, unit_files, Binaries) e manual.wpsd.radio."
                  en="Do not install Pi-Star Apache/PHP on port 80. Canonical sources: repo.w0chp.net/WPSD-Dev (WebCode, unit_files, Binaries) and manual.wpsd.radio."
                />
              </ul>
            </Sec>

            <Sec id="rede" title={t({ pt: "Wi‑Fi da casa e AP de campo", en: "Home Wi‑Fi and the field AP" })}>
              <ul>
                <Li
                  pt="Aba WiFi: hostname (vira nome.local), uplink Ethernet ou STA, scan, DHCP ou IP fixo (IP, máscara, GW, DNS)."
                  en="WiFi tab: hostname (becomes name.local), Ethernet or STA uplink, scan, DHCP or static IP (IP, mask, GW, DNS)."
                />
                <Li
                  pt="AP Ham-Cockpit-XXXX senha hamcockpit em 192.168.4.1 — para o campo, mesmo com STA ligada."
                  en="AP Ham-Cockpit-XXXX password hamcockpit at 192.168.4.1 — for the field, even with STA up."
                />
                <Li
                  pt="Status mostra o IP vivo da LAN e o do AP. SSH :22 com hamcockpit / 1234."
                  en="Status shows the live LAN IP and the AP IP. SSH :22 as hamcockpit / 1234."
                />
              </ul>
            </Sec>

            <Sec id="portas" title={t({ pt: "Mapa de portas e pastas", en: "Port and folder map" })}>
              <div className="overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
                    <tr>
                      <th className="px-3 py-2">{t({ pt: "O quê", en: "What" })}</th>
                      <th className="px-3 py-2">{t({ pt: "Onde", en: "Where" })}</th>
                      <th className="px-3 py-2">{t({ pt: "Porta", en: "Port" })}</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#c5d4e0]">
                    {PORT_ROWS.map((row) => (
                      <tr key={row.what} className="border-t border-[rgba(79,195,247,0.08)]">
                        <td className="px-3 py-2">{row.what}</td>
                        <td className="px-3 py-2">{row.where}</td>
                        <td className="px-3 py-2">{row.port}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sec>

            <Sec id="cabos" title={t({ pt: "Cabos e níveis elétricos", en: "Cables and electrical levels" })}>
              <FigTtl
                caption={t({
                  pt: "USB e Bluetooth: sem conversor. RS232 de PC: MAX3232. GPIO uart2–5: 3,3 V apenas.",
                  en: "USB and Bluetooth: no converter. PC RS232: MAX3232. GPIO uart2–5: 3.3 V only.",
                })}
              />
              <FigAcomCable
                caption={t({
                  pt: "ACOM: null-modem mínimo. LP-100A: cabo reto. LDG METER: TTL 5 V, pinos 2 GND, 3 RX, 4 TX — não ligue o +12 V do pino 1.",
                  en: "ACOM: minimal null-modem. LP-100A: straight cable. LDG METER: TTL 5 V, pins 2 GND, 3 RX, 4 TX — do not connect pin 1 +12 V.",
                })}
              />
            </Sec>

            <Sec id="admin" title={t({ pt: "Serviços, atualizações, backup", en: "Services, updates, backup" })}>
              <p>
                {t({
                  pt: "Aba Serviços: cada interruptor é início automático no próximo boot (rádio, bluetooth, lextel, ser2net, wavelog, mmdvm, web…). Desligar o Webserver impede o console depois de reiniciar. Atualizações: app (GitHub fviudes/ham-cockpit), OS, ser2net, hamlib (libhamlib-utils), Wavelog, Gate. Backup grava ser2net, rádios, layouts, LDG, LP-100A, rede, serviços, Lextel, MMDVM.",
                  en: "Services tab: each switch is start-on-boot (radio, bluetooth, lextel, ser2net, wavelog, mmdvm, web…). Turning off Webserver blocks the console after reboot. Updates: app (GitHub fviudes/ham-cockpit), OS, ser2net, hamlib (libhamlib-utils), Wavelog, Gate. Backup saves ser2net, radios, layouts, LDG, LP-100A, net, services, Lextel, MMDVM.",
                })}
              </p>
            </Sec>

            <Sec id="config" title={t({ pt: "Referência rápida de configuração", en: "Quick config reference" })}>
              <pre>{`SSID AP        Ham-Cockpit-XXXX
${t({ pt: "Senha AP", en: "AP password" }).padEnd(14)}hamcockpit
Login          admin / 1234
Hostname       ham-cockpit.local
BLE ${t({ pt: "nome", en: "name" }).padEnd(10)}${APP_BLE_NAME}
CI-V 705       0xA4
GATT           14cf8001 / 14cf8002 / 14cf8003
Lextel PIN     1234 ${pin} 0000
MMDVM UART     /dev/ttyAMA0 115200
DMRGateway     127.0.0.1:62031 ↔ Host :62032
Remote         TCP 7642
${t({ pt: "Imagem", en: "Image" }).padEnd(14)}image/out/ham-cockpit-${APP_VERSION}-raspi.img.xz
Release        github.com/fviudes/ham-cockpit/releases/tag/v${APP_VERSION}`}</pre>
            </Sec>

            <Sec id="receitas" title={t({ pt: "Estações de exemplo", en: "Sample stations" })}>
              <ul>
                <li>
                  <strong>{t({ pt: "Campo:", en: "Field:" })}</strong>{" "}
                  {t({
                    pt: "Pi no AP, 705 Principal GATT, notebook no Ham-Cockpit-XXXX.",
                    en: "Pi on the AP, 705 Primary GATT, laptop on Ham-Cockpit-XXXX.",
                  })}
                </li>
                <li>
                  <strong>FT8:</strong>{" "}
                  {t({
                    pt: "Ethernet, Wavelog :8086/install, Gate 2333, WSJT-X Hamlib 3085 em 127.0.0.1:4532.",
                    en: "Ethernet, Wavelog :8086/install, Gate 2333, WSJT-X Hamlib 3085 at 127.0.0.1:4532.",
                  })}
                </li>
                <li>
                  <strong>HF:</strong>{" "}
                  {t({
                    pt: "7300 USB 0x94 Principal, SPE 9600, ACOM 1200, LP-100A 115200, Hamlib só no rádio.",
                    en: "7300 USB 0x94 Primary, SPE 9600, ACOM 1200, LP-100A 115200, Hamlib only on the radio.",
                  })}
                </li>
                <li>
                  <strong>MMDVM:</strong>{" "}
                  {t({
                    pt: "HAT em /dev/ttyAMA0 115200, Operação → MMDVM, ID DMR, BrandMeister no DMRGateway. Sem PHP na 80.",
                    en: "HAT on /dev/ttyAMA0 115200, Operate → MMDVM, DMR ID, BrandMeister in DMRGateway. No PHP on 80.",
                  })}
                </li>
              </ul>
            </Sec>

            <Sec id="problemas" title={t({ pt: "Se algo não ligar", en: "If something will not come up" })}>
              <ul>
                <Li
                  pt="Sem Web Bluetooth: Chrome/Edge, não Firefox. Autorize o 705 uma vez nesta origem."
                  en="No Web Bluetooth: Chrome/Edge, not Firefox. Grant the 705 once on this origin."
                />
                <Li
                  pt="705 não reconecta: Bluetooth ON, Pairing Reception fechado, rádio marcado Principal, clique Entrar."
                  en="705 will not reconnect: Bluetooth ON, Pairing Reception closed, radio marked Primary, click Sign in."
                />
                <Li
                  pt="COM em uso: outro programa abriu a TTY. Deixe só o ser2net."
                  en="COM in use: another program opened the TTY. Leave only ser2net."
                />
                <Li
                  pt="Lextel mudo: COM de saída; PIN; o helper lextel-bt no Pi."
                  en="Silent Lextel: outgoing COM; PIN; the lextel-bt helper on the Pi."
                />
                <Li
                  pt="Wavelog 8086 vazio: primeiro boot ainda puxando Docker; Ethernet precisa existir. QSO não entra: Secondary UDP 2333, chave API, Station ID, Testar API verde. Contest sem freq: Publicar CAT e Callback http://IP-do-Pi:54321."
                  en="Empty Wavelog 8086: first boot still pulling Docker; Ethernet must be present. QSO does not land: Secondary UDP 2333, API key, Station ID, Test API green. Contest with no freq: Publish CAT and Callback http://Pi-IP:54321."
                />
                <Li
                  pt="Amp morto no GPIO: já era. Troque para USB-RS232."
                  en="Dead amp on the GPIO: it is gone. Switch to USB-RS232."
                />
                <Li
                  pt="MMDVMHost ausente: coloque os binários WPSD em /usr/local/bin. Modem mudo: tire a TTY do ser2net; HAT usa ttyAMA0 a 115200."
                  en="MMDVMHost missing: put WPSD binaries in /usr/local/bin. Silent modem: take that TTY off ser2net; the HAT uses ttyAMA0 at 115200."
                />
              </ul>
              <button
                type="button"
                onClick={() => navigate("/console/manual")}
                className="mt-4 rounded-lg bg-[#4fc3f7] px-6 py-3 font-semibold text-[#0d1b2a] hover:bg-[#80d8ff]"
              >
                {t({ pt: "Manual do operador no console (PT-BR / EN-US)", en: "Operator manual in the console (PT-BR / EN-US)" })}
              </button>
            </Sec>
          </motion.article>
        </div>
      </div>
    </div>
  );
}

function Li({ pt, en }: Pair) {
  const { t } = useSiteLang();
  return <li>{t({ pt, en })}</li>;
}

function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-4 font-['Space_Grotesk'] text-2xl font-bold text-white">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-[#94a3b8] [&_a]:text-[#4fc3f7] [&_a]:underline [&_code]:font-['IBM_Plex_Mono'] [&_code]:text-[13px] [&_code]:text-[#4fc3f7] [&_h3]:mt-2 [&_h3]:font-['Space_Grotesk'] [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[rgba(79,195,247,0.16)] [&_pre]:bg-[#071018] [&_pre]:p-4 [&_pre]:font-['IBM_Plex_Mono'] [&_pre]:text-xs [&_pre]:leading-relaxed [&_pre]:text-[#c5d4e0] [&_strong]:text-[#c5d4e0] [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

const ACC_ROWS: { name: string; baud: string; cable: Pair; does: Pair }[] = [
  { name: "SPE Expert", baud: "9600 8N1", cable: { pt: "MAX3232", en: "MAX3232" }, does: { pt: "ampctld :4531", en: "ampctld :4531" } },
  {
    name: "Hamplus AS-603WL",
    baud: "9600 8N1",
    cable: { pt: "MAX3232", en: "MAX3232" },
    does: { pt: "ANT 1–6, rádio 1–3, rotor", en: "ANT 1–6, radio 1–3, rotator" },
  },
  {
    name: "Palstar AT-AUTO",
    baud: "9600 8N1",
    cable: { pt: "MAX3232", en: "MAX3232" },
    does: { pt: "Auto / Manual / Bypass", en: "Auto / Manual / Bypass" },
  },
  {
    name: "LDG AT-600/1000 ProII",
    baud: "38400 8N1",
    cable: { pt: "USB-TTL no jack METER (TTL 5 V)", en: "USB-TTL on the METER jack (TTL 5 V)" },
    does: { pt: "espaço+byte: T F P C M A Z", en: "space+byte: T F P C M A Z" },
  },
  {
    name: "TelePost LP-100A",
    baud: "115200 8N1",
    cable: { pt: "DB9 reto (não null-modem)", en: "Straight DB9 (not null-modem)" },
    does: { pt: "Poll P; A alarme ROE; F Avg/Peak/Tune. Não envie M.", en: "Poll P; A SWR alarm; F Avg/Peak/Tune. Do not send M." },
  },
  {
    name: "ACOM 2000A",
    baud: "1200 8N1",
    cable: { pt: "Null-modem só 2–3 / 3–2 / 5–5", en: "Null-modem 2–3 / 3–2 / 5–5 only" },
    does: { pt: "RPON RTS+DTR ~10 s; warmup 150 s; CAT no RCU", en: "RPON RTS+DTR ~10 s; warmup 150 s; CAT on the RCU" },
  },
];

const PORT_ROWS = [
  { what: "Console", where: "/opt/ham-cockpit", port: "TCP 80" },
  { what: "Wavelog", where: "/opt/wavelog", port: "TCP 8086" },
  { what: "WaveLogGate", where: "/opt/wavelog-gate", port: "UDP 2333 · TCP 54321/54322" },
  { what: "ser2net", where: "/opt/ser2net", port: "127.0.0.1:4001–4006" },
  { what: "rigctld 705", where: "libhamlib-utils", port: "TCP 4532 (-m 3085)" },
  { what: "ampctld SPE", where: "libhamlib-utils", port: "TCP 4531" },
  { what: "SSH", where: "sshd", port: "TCP 22" },
  { what: "MMDVMHost", where: "/opt/ham-cockpit/mmdvm", port: "UART · Remote 7642" },
  { what: "DMRGateway", where: "/opt/ham-cockpit/mmdvm", port: "127.0.0.1:62031/62032" },
];
