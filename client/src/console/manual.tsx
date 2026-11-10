import type { Lang } from "./i18n";
import { useConsole } from "./state";
import { GhostBtn, PageHead, Panel, PanelTitle } from "./widgets";
import {
  FigAcomCable,
  FigBoot,
  FigDualBt,
  FigIc705,
  FigScreen,
  FigSer2net,
  FigStation,
  FigTtl,
  FigWavelog,
  FigWavelogArch,
  FigWavelogCat,
  FigWavelogContest,
  FigMmdvm,
} from "./manual-diagrams";
import { PRODUCT, Photo } from "@/pages/product-media";
import { useLocation } from "wouter";
import type { ReactNode } from "react";

type Pair = { pt: string; en: string };

const TOC: { id: string; title: Pair }[] = [
  { id: "o-que-e", title: { pt: "O que é o Ham Cockpit", en: "What Ham Cockpit is" } },
  { id: "mapa", title: { pt: "Mapa da estação", en: "Station map" } },
  { id: "primeiro", title: { pt: "Primeiro acesso", en: "First login" } },
  { id: "tela", title: { pt: "Como ler a tela", en: "How to read the screen" } },
  { id: "radio-ble", title: { pt: "Conectar o IC-705 (Bluetooth)", en: "Connect the IC-705 (Bluetooth)" } },
  { id: "radio-usb", title: { pt: "Outros rádios (USB / CAT)", en: "Other radios (USB / CAT)" } },
  { id: "principal", title: { pt: "Rádio principal", en: "Primary radio" } },
  { id: "painel", title: { pt: "Operar no Painel", en: "Operate from the Panel" } },
  { id: "varios-bt", title: { pt: "Vários Bluetooth juntos", en: "Several Bluetooth links" } },
  { id: "lextel", title: { pt: "Lextel MS-2000", en: "Lextel MS-2000" } },
  { id: "spe", title: { pt: "SPE Expert", en: "SPE Expert" } },
  { id: "hamplus", title: { pt: "Hamplus AS-603WL", en: "Hamplus AS-603WL" } },
  { id: "palstar", title: { pt: "Palstar AT-AUTO", en: "Palstar AT-AUTO" } },
  { id: "ldg", title: { pt: "LDG AT Pro II", en: "LDG AT Pro II" } },
  { id: "lp100a", title: { pt: "TelePost LP-100A", en: "TelePost LP-100A" } },
  { id: "acom", title: { pt: "ACOM 2000A", en: "ACOM 2000A" } },
  { id: "wavelog", title: { pt: "Wavelog e WaveLogGate", en: "Wavelog and WaveLogGate" } },
  { id: "mmdvm", title: { pt: "MMDVM (WPSD / Pi-Star)", en: "MMDVM (WPSD / Pi-Star)" } },
  { id: "ser2net", title: { pt: "ser2net e Hamlib", en: "ser2net and Hamlib" } },
  { id: "wizard", title: { pt: "Config Device Wizard", en: "Config Device Wizard" } },
  { id: "wifi", title: { pt: "Wi‑Fi da casa e do Pi", en: "Home Wi‑Fi and the Pi AP" } },
  { id: "bluetooth", title: { pt: "Aba Bluetooth", en: "Bluetooth tab" } },
  { id: "sistema", title: { pt: "Status, logs, terminal, admin, backup", en: "Status, logs, terminal, admin, backup" } },
  { id: "niveis", title: { pt: "Níveis elétricos e cabos", en: "Electrical levels and cables" } },
  { id: "receitas", title: { pt: "Estações de exemplo", en: "Example stations" } },
  { id: "problemas", title: { pt: "Se algo não ligar", en: "If something will not come up" } },
];

export function ManualPage() {
  const { tx, lang } = useConsole();
  const t = (p: Pair) => (lang === "en" ? p.en : p.pt);
  return (
    <div>
      <PageHead kicker={tx("manual")} title={t({ pt: "Manual do operador", en: "Operator's manual" })} />
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">
        {t({
          pt: "Este manual descreve o aparelho Ham Cockpit (Raspberry Pi + console no navegador) do jeito que um operador usa no shack: ligar, entrar, cadastrar rádio, wattímetro, logbook e programas digitais. Não é preciso saber Linux. Siga as seções na ordem na primeira vez; depois use o índice.",
          en: "This manual describes the Ham Cockpit appliance (Raspberry Pi + browser console) the way an operator uses it in the shack: power up, sign in, register a radio, wattmeter, logbook and digital apps. You do not need Linux. Follow the sections in order the first time; afterwards use the table of contents.",
        })}
      </p>

      <Panel className="mb-6">
        <PanelTitle>{t({ pt: "Índice", en: "Contents" })}</PanelTitle>
        <ol className="grid gap-1 sm:grid-cols-2">
          {TOC.map((item, i) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="text-sm text-[#4fc3f7] hover:underline">
                {i + 1}. {t(item.title)}
              </a>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="space-y-6">
        <Section id="o-que-e" title={t(TOC[0]!.title)}>
          <Photo
            src={PRODUCT.hero}
            alt="Raspberry Pi Ham Cockpit, dongle Bluetooth e cartão da imagem OS"
            caption={t({
              pt: "O produto: Pi 3/4, Ubuntu 24.04, imagem ham-cockpit-0.1.02-raspi.img.xz em image/out.",
              en: "The product: Pi 3/4, Ubuntu 24.04, ham-cockpit-0.1.02-raspi.img.xz in image/out.",
            })}
          />
          <P
            pt="O Ham Cockpit é o computador da estação. Ele fica sempre ligado no shack, fala com o rádio (USB ou Bluetooth), com o wattímetro Lextel, com amplificadores e chaves, e publica um site. Você abre esse site no celular, no notebook ou no PC da mesa — Chrome ou Edge."
            en="Ham Cockpit is the station computer. It stays on in the shack, talks to the radio (USB or Bluetooth), the Lextel wattmeter, amplifiers and switches, and publishes a website. You open that site on a phone, laptop or desk PC — Chrome or Edge."
          />
          <P
            pt="O firmware antigo no ESP32 não entra aqui. O rádio Icom CI-V por Bluetooth (IC-705) usa o Web Bluetooth do navegador. O Lextel usa Bluetooth Classic SPP (vira uma porta COM no Windows, ou /dev/rfcomm no Pi). São dois Bluetooth diferentes e os dois podem ficar ligados juntos."
            en="The old ESP32 firmware is not used here. Icom CI-V over Bluetooth (IC-705) uses the browser's Web Bluetooth. Lextel uses Bluetooth Classic SPP (a COM port on Windows, or /dev/rfcomm on the Pi). Those are two different Bluetooth kinds and both can stay up together."
          />
          <Callout tone="info">
            <S
              pt="Endereços úteis: console http://IP-do-Pi/console (ou http://192.168.4.1/console no Wi‑Fi do próprio Pi). Logbook Wavelog: http://IP-do-Pi:8086. Nome na rede: ham-cockpit.local."
              en="Useful addresses: console http://PI-IP/console (or http://192.168.4.1/console on the Pi's own Wi‑Fi). Wavelog logbook: http://PI-IP:8086. Network name: ham-cockpit.local."
            />
          </Callout>
        </Section>

        <Section id="mapa" title={t(TOC[1]!.title)}>
          <Photo
            src={PRODUCT.shack}
            alt="Estação com Pi, rádio e wattímetro"
            caption={t({
              pt: "Arquitetura em estrela: o Pi no centro. Rádio GATT/USB, Lextel SPP, acessórios em ser2net.",
              en: "Star architecture: Pi in the center. Radio GATT/USB, Lextel SPP, accessories on ser2net.",
            })}
          />
          <P
            pt="Pense na estação como uma estrela: no centro o Pi, em volta o rádio, o wattímetro, o logbook e o seu computador. Nada disso precisa estar no mesmo cabo."
            en="Think of the station as a star: the Pi in the center, radio, wattmeter, logbook and your computer around it. None of that has to share one cable."
          />
          <FigStation
            caption={t({
              pt: "Figura 1 — O Pi é o hub. IC-705 chega por BLE; MS-2000 por SPP; você usa o Chrome; Wavelog e Hamlib rodam no mesmo Pi.",
              en: "Figure 1 — The Pi is the hub. IC-705 arrives over BLE; MS-2000 over SPP; you use Chrome; Wavelog and Hamlib run on the same Pi.",
            })}
          />
          <MenuTable lang={lang} />
        </Section>

        <Section id="primeiro" title={t(TOC[2]!.title)}>
          <P
            pt="Na primeira vez o Pi ainda não conhece a internet da casa. Ele cria uma rede própria. É igual ligar um roteador novo."
            en="The first time, the Pi does not know the house internet yet. It creates its own network. Same idea as a brand-new router."
          />
          <FigBoot
            caption={t({
              pt: "Figura 2 — Do cartão SD até o login. Sem cabo de rede: use o Wi‑Fi Ham-Cockpit-XXXX, senha hamcockpit.",
              en: "Figure 2 — From the SD card to login. No Ethernet: join Wi‑Fi Ham-Cockpit-XXXX, password hamcockpit.",
            })}
          />
          <Steps
            items={[
              {
                pt: "Grave a imagem Ham Cockpit OS no cartão microSD (script flash.ps1). Encaixe no Pi 3 ou Pi 4 e ligue a fonte oficial.",
                en: "Flash the Ham Cockpit OS image on the microSD card (flash.ps1). Seat it in a Pi 3 or Pi 4 and use the official PSU.",
              },
              {
                pt: "No telefone ou notebook, abra a lista de Wi‑Fi. Entre em Ham-Cockpit-XXXX (os quatro caracteres mudam por aparelho). Senha: hamcockpit.",
                en: "On the phone or laptop, open Wi‑Fi. Join Ham-Cockpit-XXXX (the four characters change per unit). Password: hamcockpit.",
              },
              {
                pt: "Navegador: http://192.168.4.1/console — usuário admin, senha 1234. Troque a senha depois em Admin.",
                en: "Browser: http://192.168.4.1/console — user admin, password 1234. Change it later under Admin.",
              },
              {
                pt: "Quando quiser internet da casa, abra WiFi, preencha o SSID e a senha da sua rede e Salvar. O Pi passa a ter dois IPs: o AP 192.168.4.1 e o IP que o roteador der (veja Status).",
                en: "When you want house internet, open WiFi, fill in your SSID and password, Save. The Pi then has two IPs: AP 192.168.4.1 and whatever the router assigns (see Status).",
              },
            ]}
          />
          <Callout tone="warn">
            <S
              pt="Use Chrome ou Edge. O Bluetooth do IC-705 (Web Bluetooth) não funciona no Firefox nem no Safari. Em PC, o endereço precisa ser https:// ou http://localhost."
              en="Use Chrome or Edge. IC-705 Bluetooth (Web Bluetooth) does not work in Firefox or Safari. On a PC the address must be https:// or http://localhost."
            />
          </Callout>
        </Section>

        <Section id="tela" title={t(TOC[3]!.title)}>
          <Photo
            src={PRODUCT.console}
            alt="Console Ham Cockpit no portátil"
            caption={t({
              pt: "A tela do operador: VFO, chips CI-V/SPP, menu à esquerda. Chrome ou Edge.",
              en: "Operator screen: VFO, CI-V/SPP chips, left menu. Chrome or Edge.",
            })}
          />
          <FigScreen
            caption={t({
              pt: "Figura 3 — Menu à esquerda, frequência no topo, chips do rádio e do MS-2000, idioma PT-BR / EN-US à direita.",
              en: "Figure 3 — Menu on the left, frequency on top, radio and MS-2000 chips, PT-BR / EN-US language on the right.",
            })}
          />
          <Ul
            items={[
              {
                pt: "Chip do rádio verde = CI-V ou CAT no ar. Cinza com traço = ainda não conectou.",
                en: "Green radio chip = CI-V or CAT is up. Grey dash = not connected yet.",
              },
              {
                pt: "Chip MS-2000 SPP verde = wattímetro enviando (ou tentando reabrir o COM). Toque nele para ir à aba Lextel.",
                en: "Green MS-2000 SPP chip = wattmeter streaming (or reopening COM). Tap it to open the Lextel tab.",
              },
              {
                pt: "PT-BR / EN troca o idioma do console inteiro, inclusive este manual.",
                en: "PT-BR / EN-US switches the whole console language, including this manual.",
              },
              {
                pt: "No celular, o botão de menu (☰) abre a mesma lista.",
                en: "On a phone, the menu button (☰) opens the same list.",
              },
            ]}
          />
        </Section>

        <Section id="radio-ble" title={t(TOC[4]!.title)}>
          <P
            pt="O IC-705 não usa cabo. O Chrome fala GATT com o rádio (serviço 14cf8001), faz um handshake CI-V (0x61, 0x62, 0x63) e espera o rádio liberar (0x64). Endereço CI-V padrão do 705: 0xA4."
            en="The IC-705 needs no cable. Chrome speaks GATT with the radio (service 14cf8001), does a CI-V handshake (0x61, 0x62, 0x63) and waits for the radio to grant (0x64). Default CI-V address of the 705: 0xA4."
          />
          <FigIc705
            caption={t({
              pt: "Figura 4 — Deixe Pairing Reception aberto no rádio, depois Conectar no console, depois aceite Ham-Cockpit-Web01.",
              en: "Figure 4 — Leave Pairing Reception open on the radio, then Connect in the console, then accept Ham-Cockpit-Web01.",
            })}
          />
          <Example
            title={t({ pt: "Exemplo — IC-705 no notebook Windows", en: "Example — IC-705 on a Windows laptop" })}
          >
            <Steps
              items={[
                { pt: "Ligue o IC-705. Bluetooth do rádio em ON.", en: "Power the IC-705. Radio Bluetooth ON." },
                {
                  pt: "No rádio: Menu → Set → Bluetooth Set → Pairing Reception. Não saia dessa tela.",
                  en: "On the radio: Menu → Set → Bluetooth Set → Pairing Reception. Stay on that screen.",
                },
                {
                  pt: "No console: Dispositivos → Rádio. Fabricante Icom, modo Bluetooth, protocolo CI-V, endereço IC-705 (0xA4).",
                  en: "In the console: Devices → Radio. Maker Icom, Bluetooth, CI-V, address IC-705 (0xA4).",
                },
                {
                  pt: "Toque em Conectar. No popup do Chrome escolha ICOM BT(IC-705). Se o rádio mostrar Ham-Cockpit-Web01, aceite. PIN do Windows, se pedir: 0000.",
                  en: "Tap Connect. In the Chrome picker choose ICOM BT(IC-705). If the radio shows Ham-Cockpit-Web01, accept. Windows PIN, if asked: 0000.",
                },
                {
                  pt: "Os cards Conexão / Dispositivo / CI-V ficam verdes (CI-V OK). A linha em Rádios cadastrados mostra GATT 0xA4. Marque Principal.",
                  en: "Connection / Device / CI-V cards turn green (CI-V OK). The registered-radios row shows GATT 0xA4. Tick Primary.",
                },
              ]}
            />
          </Example>
          <GoTab page="ic705" label={t({ pt: "Abrir a aba Rádio", en: "Open the Radio tab" })} />
          <Callout tone="warn">
            <S
              pt="Se travar em “Handshake CI-V”: volte ao Pairing Reception, desligue o Bluetooth do rádio e ligue de novo, depois Conectar. O Chrome só mostra o rádio se a tela de pareamento estiver aberta na primeira vez."
              en="If it sticks on “CI-V handshake”: go back to Pairing Reception, toggle radio Bluetooth off/on, then Connect. Chrome only lists the radio if the pairing screen is open the first time."
            />
          </Callout>
        </Section>

        <Section id="radio-usb" title={t(TOC[5]!.title)}>
          <P
            pt="Kenwood, Yaesu, Flex, Ten-Tec e Icom por cabo usam Cat-USB. A serial do rádio entra primeiro no ser2net (IP 127.0.0.1, porta sequencial, TTY). Na aba Rádio escolha fabricante, Cat-USB e a conexão ser2net já cadastrada — IP/porta/serial vêm dali. Só o Bluetooth configura o dispositivo direto. Icom no cabo pode ser CI-V (0x94 no 7300, 0xA4 no 705) ou CAT serial clássico."
            en="Kenwood, Yaesu, Flex, Ten-Tec and cabled Icom use Cat-USB. Register the radio serial in ser2net first (IP 127.0.0.1, sequential port, TTY). On the Radio tab pick maker, Cat-USB and that ser2net connection — IP/port/serial come from there. Only Bluetooth configures the device directly. Cabled Icom can be CI-V (0x94 on a 7300, 0xA4 on a 705) or classic serial CAT."
          />
          <Example title={t({ pt: "Exemplo — IC-7300 no USB", en: "Example — IC-7300 on USB" })}>
            <Steps
              items={[
                {
                  pt: "No ser2net (ou no wizard tipo Rádio): serial do 7300, IP 127.0.0.1, porta 4001, baud 19200. Salvar.",
                  en: "On ser2net (or the wizard, Radio type): 7300 serial, IP 127.0.0.1, port 4001, baud 19200. Save.",
                },
                {
                  pt: "Aba Rádio: fabricante Icom, Cat-USB, a conexão ser2net, protocolo CI-V, endereço IC-7300 (0x94).",
                  en: "Radio tab: maker Icom, Cat-USB, the ser2net connection, CI-V, address IC-7300 (0x94).",
                },
                { pt: "Conectar. A linha cadastrada mostra 127.0.0.1:4001 e Conectado.", en: "Connect. The saved row shows 127.0.0.1:4001 and Connected." },
              ]}
            />
          </Example>
          <P
            pt="Velocidades típicas: Icom CI-V 19200 ou 115200; Kenwood/Yaesu 38400; Ten-Tec 57600; Bluetooth não-Icom 9600."
            en="Typical bauds: Icom CI-V 19200 or 115200; Kenwood/Yaesu 38400; Ten-Tec 57600; non-Icom Bluetooth 9600."
          />
        </Section>

        <Section id="principal" title={t(TOC[6]!.title)}>
          <P
            pt="Na tabela Rádios cadastrados a primeira coluna é Principal. Só um rádio fica marcado. Ao abrir o console, a estação tenta ligar sozinha nesse rádio. Marcar outro como principal não derruba o Lextel nem os outros Bluetooth."
            en="In Registered radios the first column is Primary. Only one radio is ticked. When you open the console the station tries to connect that radio by itself. Ticking another primary does not drop Lextel or the other Bluetooth links."
          />
          <Ul
            items={[
              {
                pt: "IC-705: a reconexão silenciosa só funciona depois da primeira vez que o Chrome ganhou permissão. Se o seletor Bluetooth aparecer, aceite de novo.",
                en: "IC-705: silent reconnect only works after Chrome was granted the device once. If the Bluetooth picker appears, accept again.",
              },
              {
                pt: "USB: o Pi reabre a mesma COM. Se o cabo não estiver lá, a linha fica Desconectado — plugue e toque em Conectar.",
                en: "USB: the Pi reopens the same COM. If the cable is missing the row stays Disconnected — plug in and tap Connect.",
              },
            ]}
          />
        </Section>

        <Section id="painel" title={t(TOC[7]!.title)}>
          <P
            pt="Operação → Painel é o VFO da estação. Com o IC-705 em CI-V OK, mudar frequência, modo ou PTT aqui mexe no rádio de verdade."
            en="Operation → Panel is the station VFO. With the IC-705 on CI-V OK, changing frequency, mode or PTT here moves the real radio."
          />
          <Ul
            items={[
              { pt: "Setas ▲ ▼: ±1 kHz. Campo Frequência manual + Aplicar: vai direto ao Hertz.", en: "▲ ▼ arrows: ±1 kHz. Manual frequency + Apply: jumps to the hertz you typed." },
              { pt: "Botões de banda (160 m … 70 cm): QSY para o centro da faixa.", en: "Band buttons (160 m … 70 cm): QSY to the band center." },
              { pt: "USB / LSB / CW / AM / FM / RTTY: modo. PTT ON / OFF: transmite (cuidado com a antena).", en: "USB / LSB / CW / AM / FM / RTTY: mode. PTT ON / OFF: transmits (watch the antenna)." },
              { pt: "RF gain e AF gain: deslizantes. O selo BLE CAT verde confirma que o Painel está falando com o rádio.", en: "RF gain and AF gain sliders. The green BLE CAT badge confirms the Panel is talking to the radio." },
              { pt: "+ dispositivo abre a lista do que ainda não está no painel. O X no canto do card tira o dispositivo. Salvar o layout salva a página neste usuário.", en: "+ device lists what is not on the panel yet. The X on a card removes it. Save layout keeps the page for this user." },
            ]}
          />
          <GoTab page="radio" label={t({ pt: "Abrir o Painel", en: "Open the Panel" })} />
        </Section>

        <Section id="varios-bt" title={t(TOC[8]!.title)}>
          <P
            pt="O adaptador Bluetooth do Pi ou do PC aguenta vários aparelhos ao mesmo tempo. O IC-705 (BLE) não deve derrubar o MS-2000 (Classic). Se o Windows soltar o COM do Lextel no instante do GATT, o Ham Cockpit reabre o SPP sozinho — o chip MS-2000 SPP permanece verde."
            en="The Pi or PC Bluetooth adapter can hold several devices at once. The IC-705 (BLE) must not drop the MS-2000 (Classic). If Windows drops the Lextel COM the moment GATT comes up, Ham Cockpit reopens SPP by itself — the MS-2000 SPP chip stays green."
          />
          <FigDualBt
            caption={t({
              pt: "Figura 5 — GATT do 705 e SPP do wattímetro no mesmo dongle. Não desligue o Bluetooth do Windows no meio do QSO.",
              en: "Figure 5 — 705 GATT and wattmeter SPP on the same dongle. Do not toggle Windows Bluetooth mid-QSO.",
            })}
          />
        </Section>

        <Section id="lextel" title={t(TOC[9]!.title)}>
          <P
            pt="O Monitor Station (MS-600 a MS-2000) manda PEP, média, refletida, ROE, tensão, Z e AM por Bluetooth Classic SPP. O Ham Cockpit só escuta — nunca manda comando ao wattímetro. Não é BLE: o Chrome não abre esse rádio."
            en="The Monitor Station (MS-600 through MS-2000) sends PEP, average, reflected, SWR, voltage, Z and AM over Bluetooth Classic SPP. Ham Cockpit only listens — it never sends a command to the wattmeter. It is not BLE: Chrome cannot open that radio."
          />
          <Steps
            items={[
              {
                pt: "No wattímetro, ligue o Bluetooth. PIN típico 1234 (HC-05) ou 0000.",
                en: "On the wattmeter, turn Bluetooth on. Typical PIN 1234 (HC-05) or 0000.",
              },
              {
                pt: "Windows: Configurações → Bluetooth, pareie o MS-2000. Aparece um COM de saída (ex.: COM5). Não use o COM de “entrada”.",
                en: "Windows: Settings → Bluetooth, pair the MS-2000. An outgoing COM appears (e.g. COM5). Do not use the “incoming” COM.",
              },
              {
                pt: "Aba Lextel → Procurar MS-2000 → escolha o COM (ou o nome Monitor Station) → Conectar SPP. Deixe Reconectar no boot marcado.",
                en: "Lextel tab → Scan for MS-2000 → pick the COM (or Monitor Station) → Connect SPP. Leave Reconnect on boot ticked.",
              },
              {
                pt: "Faça um TX curto. Os bytes sobem no dump. Se o decoder ainda estiver “Aprendendo”, toque em Aprender com o dump.",
                en: "Do a short TX. Bytes show in the dump. If the decoder still says “Learning”, tap Learn from dump.",
              },
            ]}
          />
          <GoTab page="lextel" label={t({ pt: "Abrir Lextel", en: "Open Lextel" })} />
          <Callout tone="ok">
            <S
              pt="No Raspberry Pi o helper /opt/ham-cockpit/bin/lextel-bt faz scan, pareamento e rfcomm. A aba Lextel chama /api/lextel — você não precisa do terminal."
              en="On the Raspberry Pi the helper /opt/ham-cockpit/bin/lextel-bt does scan, pairing and rfcomm. The Lextel tab calls /api/lextel — you do not need the terminal."
            />
          </Callout>
        </Section>

        <Section id="spe" title={t(TOC[10]!.title)}>
          <P
            pt="Aba SPE mostra o Expert 1.3K-FA como o painel frontal: RF OUT, PWR L/M/H, SWR ATU/ANT, V/I PA, banda, antena, input. Os chips On / Off / OP / PWR / Antena / Input repetem as teclas do amp. Crie a conexão IP no ser2net (RS232 9600 via USB-serial + MAX3232 — nunca no GPIO 3,3 V) e selecione-a nesta aba. O amp fala só em TCP."
            en="The SPE tab mirrors the Expert 1.3K-FA front panel: RF OUT, PWR L/M/H, SWR ATU/ANT, V/I PA, band, antenna, input. On / Off / OP / PWR / Antenna / Input chips match the amp keys. Create the IP connection in ser2net (RS232 9600 via USB-serial + MAX3232 — never the 3.3 V GPIO) and select it on this tab. The amp talks TCP only."
          />
          <GoTab page="spe" label={t({ pt: "Abrir SPE", en: "Open SPE" })} />
        </Section>

        <Section id="hamplus" title={t(TOC[11]!.title)}>
          <P
            pt="Hamplus AS-603WL: LEDs Power / Send / Split, graus do rotor (Rotor 1 ou 2), chave de antena ANT 1–6 e chave de rádio 1–3. RS232 ±12 V — conversor MAX3232. Crie a conexão no ser2net e selecione-a nesta aba. As posições 7–10 e rádios 4–5 ficam apagadas neste modelo."
            en="Hamplus AS-603WL: Power / Send / Split LEDs, rotor degrees (Rotor 1 or 2), antenna switch ANT 1–6 and radio switch 1–3. RS232 ±12 V — MAX3232 converter. Create the ser2net connection and select it on this tab. Positions 7–10 and radios 4–5 stay dimmed on this model."
          />
          <GoTab page="hamplus" label={t({ pt: "Abrir Hamplus", en: "Open Hamplus" })} />
        </Section>

        <Section id="palstar" title={t(TOC[12]!.title)}>
          <P
            pt="Palstar AT-AUTO: modos Auto / Manual / Bypass, antena Coax ou Balanced, Tune e Home L&C. Também é RS232 de nível de PC — crie a conexão no ser2net e selecione-a nesta aba. Use o conversor; o GPIO do Pi queima se ligar o cabo direto."
            en="Palstar AT-AUTO: Auto / Manual / Bypass, Coax or Balanced antenna, Tune and Home L&C. Also PC-level RS232 — create the ser2net connection and select it on this tab. Use a converter; the Pi GPIO will fry on a direct cable."
          />
          <GoTab page="palstar" label={t({ pt: "Abrir Palstar", en: "Open Palstar" })} />
        </Section>

        <Section id="ldg" title={t(TOC[13]!.title)}>
          <P
            pt="AT-1000ProII e AT-600ProII usam o jack mini-DIN de 4 pinos do medidor (M-1000/M-600): TTL 5 V, 38400 8N1. Cadastre o USB-TTL no ser2net e selecione a conexão IP nesta aba — o acoplador não abre a serial. Comando = espaço + um byte. O AT-100ProII não tem este jack."
            en="AT-1000ProII and AT-600ProII use the 4-pin mini-DIN meter jack (M-1000/M-600): TTL 5 V, 38400 8N1. Register the USB-TTL in ser2net and pick the IP connection on this tab — the tuner never opens the serial port. Command = space + one byte. The AT-100ProII has no such jack."
          />
          <GoTab page="ldg" label={t({ pt: "Abrir LDG AT", en: "Open LDG AT" })} />
        </Section>

        <Section id="lp100a" title={t(TOC[14]!.title)}>
          <P
            pt="Wattímetro vetorial TelePost. RS232 115200 8N1, cabo reto DB9 (não null-modem). Cadastre o USB-RS232 no ser2net e escolha a conexão IP na aba LP-100A. O console pede P ~5 vezes por segundo e lê Power, Z, fase, alarme de ROE, indicativo, faixa, Peak/Avg/Tune, dBm e SWR. A e F ciclam alarme e modo do medidor. Não envie M — muda a tela e a telemetria para. Deixe o medidor em Watts. PTT RCA e segundo coupler são só no hardware."
            en="TelePost vector RF wattmeter. RS232 115200 8N1, straight-through DB9 (not null-modem). Register the USB-RS232 in ser2net and pick the IP connection on the LP-100A tab. The console polls P ~5 times per second and reads Power, Z, phase, SWR alarm, callsign, range, Peak/Avg/Tune, dBm and SWR. A and F cycle alarm and meter mode. Do not send M — it changes the screen and telemetry stops. Keep the meter on Watts. RCA PTT loop and dual coupler are hardware-only."
          />
          <GoTab page="lp100a" label={t({ pt: "Abrir LP-100A", en: "Open LP-100A" })} />
        </Section>

        <Section id="acom" title={t(TOC[15]!.title)}>
          <P
            pt="O 2000A fala RS232 1200 8N1 na DB9 traseira, no estilo ACOM Director Classic. O CAT do rádio vai no conector CAT do RCU, não nesta serial."
            en="The 2000A speaks RS232 1200 8N1 on the rear DB9, ACOM Director Classic style. Radio CAT goes to the RCU CAT jack, not this serial."
          />
          <FigAcomCable
            caption={t({
              pt: "Figura 6 — Cabo null-modem só com 2–3, 3–2 e 5–5. Cabo “completo” usa pinos extras e pode brigar com o RCU.",
              en: "Figure 6 — Null-modem with 2–3, 3–2 and 5–5 only. A “full” cable uses extra pins and can fight the RCU.",
            })}
          />
          <Steps
            items={[
              {
                pt: "Marque RPON (RTS+DTR) se quiser ligar o amp pelo PC (o adaptador segura RTS+DTR ~10 s). Sem RPON, use o interruptor da frente.",
                en: "Tick RPON (RTS+DTR) if you want the PC to power the amp (the adapter holds RTS+DTR ~10 s). Without RPON, use the front switch.",
              },
              {
                pt: "Ligar → aguarde o aquecimento 150 s (card ON mostra a contagem). Só então OPERATE.",
                en: "Power on → wait the 150 s warmup (ON card shows the count). Only then OPERATE.",
              },
              {
                pt: "STANDBY / Auto Tune / Medir HV / banda HF / ANT 1–10 como no Director. TX no LCD é o PTT do amp.",
                en: "STANDBY / Auto Tune / Measure HV / HF band / ANT 1–10 as in Director. TX on the LCD is amp PTT.",
              },
            ]}
          />
          <GoTab page="acom" label={t({ pt: "Abrir ACOM", en: "Open ACOM" })} />
        </Section>

        <Section id="wavelog" title={t(TOC[16]!.title)}>
          <Photo
            src={PRODUCT.logbook}
            alt={t({ pt: "Logbook Wavelog no notebook", en: "Wavelog logbook on a laptop" })}
            caption={t({
              pt: "Wavelog em Docker :8086. Não divide a porta 80 com o console. MariaDB fica no container wavelog-db.",
              en: "Wavelog in Docker :8086. It does not share port 80 with the console. MariaDB stays in container wavelog-db.",
            })}
          />
          <P
            pt="Wavelog é o logbook PHP da estação (fork do Cloudlog, imagem ghcr.io/wavelog/wavelog). Ham Cockpit não compartilha pasta nem a porta 80. O logbook vive em /opt/wavelog na 8086. O WaveLogGate headless vive em /opt/wavelog-gate: escuta UDP 2333, publica CAT e faz QSY HTTP. Não é o programa GUI WavelogGate do DJ7NT — é o serviço Node da imagem, sem DISPLAY."
            en="Wavelog is the station PHP logbook (Cloudlog fork, image ghcr.io/wavelog/wavelog). Ham Cockpit does not share a folder or port 80. The logbook lives in /opt/wavelog on 8086. The headless WaveLogGate lives in /opt/wavelog-gate: it listens UDP 2333, publishes CAT, and does HTTP QSY. It is not DJ7NT's GUI WavelogGate — it is the image's Node service, with no DISPLAY."
          />
          <FigWavelogArch
            caption={t({
              pt: "Figura 7 — Três fluxos: QSO UDP → api/qso; Hamlib f/m → api/radio; cluster → GET :54321/{Hz}/{modo}.",
              en: "Figure 7 — Three flows: UDP QSO → api/qso; Hamlib f/m → api/radio; cluster → GET :54321/{Hz}/{mode}.",
            })}
          />
          <FigWavelog
            caption={t({
              pt: "Figura 8 — WSJT-X Secondary UDP 2333 → Gate → API Wavelog → QSO no logbook. Tipo 5 (QSO) ou 12 (ADIF). Duplicata em 15 s é ignorada; se a API cair, queue.jsonl.",
              en: "Figure 8 — WSJT-X Secondary UDP 2333 → Gate → Wavelog API → QSO in the logbook. Type 5 (QSO) or 12 (ADIF). A duplicate within 15 s is ignored; if the API is down, queue.jsonl.",
            })}
          />
          <P
            pt="Integrações nativas do Wavelog: LoTW, eQSL, Club Log, HRDlog, OQRS, ADIF, DXCC/WAS/IOTA/SOTA/POTA/WWFF, callbook QRZ/HamQTH/QRZCQ, bandmap/cluster, Winkeyer, motor de contest 3.0, API legado e API v2."
            en="Native Wavelog integrations: LoTW, eQSL, Club Log, HRDlog, OQRS, ADIF, DXCC/WAS/IOTA/SOTA/POTA/WWFF, QRZ/HamQTH/QRZCQ callbook, bandmap/cluster, Winkeyer, 3.0 contest engine, legacy API and API v2."
          />
          <FigWavelogCat
            caption={t({
              pt: "Figura 9 — Operação com o rádio: só o ser2net abre a TTY. O Gate lê Hamlib NET :4532 a cada 4 s (PUBLISH_CAT) e o Wavelog mostra o rádio em Hardware Interfaces.",
              en: "Figure 9 — Operating with the radio: only ser2net opens the TTY. The Gate reads Hamlib NET :4532 every 4 s (PUBLISH_CAT) and Wavelog shows the radio under Hardware Interfaces.",
            })}
          />
          <Steps
            items={[
              {
                pt: "Primeiro acesso: http://IP-do-Pi:8086/install. Host do banco: wavelog-db. URL da API termina em index.php.",
                en: "First visit: http://PI-IP:8086/install. Database host: wavelog-db. The API URL ends in index.php.",
              },
              {
                pt: "Admin → API: copie a chave. Station ID do perfil. Cole na aba Wavelog do console. Testar API verde.",
                en: "Admin → API: copy the key. Station ID of the profile. Paste them on the console Wavelog tab. Test API green.",
              },
              {
                pt: "WSJT-X / JTDX: Secondary UDP = IP do Pi, porta 2333, Enable logged ADIF broadcast. Rig = Hamlib NET 127.0.0.1:4532 (3085 no 705). Sem Internal Hamlib no Gate.",
                en: "WSJT-X / JTDX: Secondary UDP = Pi IP, port 2333, Enable logged ADIF broadcast. Rig = Hamlib NET 127.0.0.1:4532 (3085 on the 705). No Internal Hamlib on the Gate.",
              },
              {
                pt: "Hardware Interfaces no Wavelog: Callback URL = http://IP-do-Pi:54321 (não 127.0.0.1 se o browser for o notebook). Clique no cluster = QSY no rádio.",
                en: "Hardware Interfaces in Wavelog: Callback URL = http://PI-IP:54321 (not 127.0.0.1 if the browser is the laptop). Click the cluster = QSY on the radio.",
              },
            ]}
          />
          <Photo
            src={PRODUCT.contest}
            alt={t({ pt: "Motor de contest do Wavelog", en: "Wavelog contest engine" })}
            caption={t({
              pt: "Contest Logging Engine 3.0: QSO logger, CAT radio, SCP, mapa, UTC. Fonte CAT radio = o rádio que o Gate publica.",
              en: "Contest Logging Engine 3.0: QSO logger, CAT radio, SCP, map, UTC. CAT radio source = the radio the Gate publishes.",
            })}
          />
          <FigWavelogContest
            caption={t({
              pt: "Figura 10 — Contest Manager → START → Logging Engine. CAT radio lê o Gate. Quick QSY (kHz + Tab) chama :54321. Enter grava serial/exch no logbook.",
              en: "Figure 10 — Contest Manager → START → Logging Engine. CAT radio reads the Gate. Quick QSY (kHz + Tab) hits :54321. Enter writes serial/exch into the logbook.",
            })}
          />
          <Ul
            items={[
              {
                pt: "Sessão: contest ADIF, início/fim, station_id, campos serial / grid / exchange. Multi-op: serial vermelho = preview, verde = reservado.",
                en: "Session: ADIF contest, start/end, station_id, serial / grid / exchange fields. Multi-op: red serial = preview, green = reserved.",
              },
              {
                pt: "Quick QSY no campo de call: kHz + Tab/Space/Enter. Winkeyer F1–F10 se habilitado. SCP com curinga ?.",
                en: "Quick QSY in the call field: kHz + Tab/Space/Enter. Winkeyer F1–F10 if enabled. SCP with ? wildcard.",
              },
              {
                pt: "FT8 de contest: o Gate já manda stx_string/srx_string no ADIF. Associe os QSOs à sessão (Import Historical ou API /api/v2/contest).",
                en: "Contest FT8: the Gate already sends stx_string/srx_string in ADIF. Attach QSOs to the session (Import Historical or API /api/v2/contest).",
              },
            ]}
          />
          <Callout tone="warn">
            <S
              pt="Não instale Apache/PHP na porta 80 nem publique MariaDB na 3306. O nginx do Ham Cockpit já ocupa a 80. Env do Gate: /opt/wavelog-gate/wavelog-gate.env."
              en="Do not install Apache/PHP on port 80 or publish MariaDB on 3306. Ham Cockpit nginx already owns 80. Gate env: /opt/wavelog-gate/wavelog-gate.env."
            />
          </Callout>
          <GoTab page="wavelog" label={t({ pt: "Abrir Wavelog", en: "Open Wavelog" })} />
        </Section>

        <Section id="mmdvm" title={t(TOC[17]!.title)}>
          <P
            pt="A aba Operação → MMDVM controla um hotspot ou repetidora digital no mesmo Pi. A pilha é a do WPSD (e do Pi-Star): MMDVMHost no UART do modem e DMRGateway em loopback. O dashboard PHP não é instalado — o console Ham Cockpit já é o site, com as mesmas cores, fontes e painéis."
            en="Operate → MMDVM drives a digital hotspot or repeater on the same Pi. The stack is WPSD's (and Pi-Star's): MMDVMHost on the modem UART and DMRGateway on loopback. The PHP dashboard is not installed — the Ham Cockpit console already is the site, with the same colors, fonts, and panels."
          />
          <FigMmdvm
            caption={t({
              pt: "Figura — rádio DV → modem 115200 → MMDVMHost → DMRGateway :62031 (BrandMeister / TGIF / XLX).",
              en: "Figure — DV radio → modem 115200 → MMDVMHost → DMRGateway :62031 (BrandMeister / TGIF / XLX).",
            })}
          />
          <Steps
            items={[
              {
                pt: "Ligue o HAT MMDVM no GPIO (3,3 V, /dev/ttyAMA0) ou um ZUMspot USB (/dev/ttyACM0). Não coloque essa TTY no ser2net.",
                en: "Fit the MMDVM HAT on GPIO (3.3 V, /dev/ttyAMA0) or a USB ZUMspot (/dev/ttyACM0). Do not put that TTY on ser2net.",
              },
              {
                pt: "Instale MMDVMHost e DMRGateway em /usr/local/bin (binários WPSD ou compile g4klx). O INI já vive em /opt/ham-cockpit/mmdvm.",
                en: "Install MMDVMHost and DMRGateway in /usr/local/bin (WPSD binaries or build g4klx). The INI already lives in /opt/ham-cockpit/mmdvm.",
              },
              {
                pt: "No console: indicativo, ID DMR, frequência, color code, modos, redes BrandMeister/TGIF. Salvar e reiniciar.",
                en: "In the console: callsign, DMR ID, frequency, color code, modes, BrandMeister/TGIF networks. Save and restart.",
              },
            ]}
          />
          <Callout tone="warn">
            <S
              pt="HAT ADF7021 (ZUMspot, HS_Hat, Dual Hat) ouve um modo de cada vez. Duplexo (TS1+TS2) só em modem duplex. Não instale Apache/PHP do Pi-Star na porta 80."
              en="ADF7021 HATs (ZUMspot, HS_Hat, Dual Hat) hear one mode at a time. Duplex (TS1+TS2) needs a duplex modem. Do not install Pi-Star Apache/PHP on port 80."
            />
          </Callout>
          <GoTab page="mmdvm" label={t({ pt: "Abrir MMDVM", en: "Open MMDVM" })} />
        </Section>

        <Section id="ser2net" title={t(TOC[18]!.title)}>
          <P
            pt="O ser2net é o único processo que pode abrir a TTY de CAT e acessório. Rádio Cat-USB, SPE, Hamplus, Palstar, LDG, LP-100A e ACOM falam só em IP (127.0.0.1:porta). Bluetooth do rádio (GATT/SPP) continua direto. A exceção é o modem MMDVM: MMDVMHost é o dono exclusivo dessa UART."
            en="ser2net is the only process allowed to open the CAT and accessory TTY. Cat-USB radio, SPE, Hamplus, Palstar, LDG, LP-100A and ACOM talk IP only (127.0.0.1:port). Radio Bluetooth (GATT/SPP) stays direct. The exception is the MMDVM modem: MMDVMHost exclusively owns that UART."
          />
          <FigSer2net
            caption={t({
              pt: "Figura 8 — TTY → ser2net :4001 → rigctld -r 127.0.0.1:4001 → NET :4532. Nunca dois programas na mesma serial.",
              en: "Figure 8 — TTY → ser2net :4001 → rigctld -r 127.0.0.1:4001 → NET :4532. Never two programs on the same serial.",
            })}
          />
          <Example title={t({ pt: "Exemplo — IC-705 no Hamlib (modelo 3085)", en: "Example — IC-705 in Hamlib (model 3085)" })}>
            <Steps
              items={[
                {
                  pt: "Aba ser2net → nome “ic705”, porta de rede 4001, serial do rádio, baud 115200 (USB) ou o serviço TCP do CI-V. Salvar. Iniciar ser2net.",
                  en: "ser2net tab → name “ic705”, network port 4001, radio serial, baud 115200 (USB) or the CI-V TCP service. Save. Start ser2net.",
                },
                {
                  pt: "Iniciar Hamlib. rigctld usa -m 3085 -r 127.0.0.1:4001 -t 4532. No WSJT-X: Rig = Hamlib NET rig, Network server 127.0.0.1:4532 (no próprio Pi) ou IP-do-Pi:4532 na LAN.",
                  en: "Start Hamlib. rigctld uses -m 3085 -r 127.0.0.1:4001 -t 4532. In WSJT-X: Rig = Hamlib NET rig, Network server 127.0.0.1:4532 (on the Pi) or PI-IP:4532 on the LAN.",
                },
              ]}
            />
          </Example>
          <P
            pt="TCP só em 127.0.0.1:4001–4005 na imagem. ACOM 2000A em :4005 a 1200 8N1, sem ampctld (Hamlib não tem modelo). Pasta: /opt/ser2net."
            en="TCP is 127.0.0.1:4001–4005 on the image. ACOM 2000A on :4005 at 1200 8N1, no ampctld (Hamlib has no model). Folder: /opt/ser2net."
          />
          <GoTab page="ser2net" label={t({ pt: "Abrir ser2net", en: "Open ser2net" })} />
        </Section>

        <Section id="wizard" title={t(TOC[19]!.title)}>
          <P
            pt="O Config Device Wizard (topo do menu) cadastra um acessório em três passos: (1) IP 127.0.0.1 e porta TCP sequencial a partir de 4001, ligada a uma serial livre; (2) o dispositivo (SPE, Hamplus, Palstar, LDG, LP-100A, ACOM); (3) início automático e Finalizar. Lextel e o rádio no Bluetooth não entram. Cat-USB do rádio usa uma conexão tipo Rádio na aba ser2net."
            en="Config Device Wizard (top of the menu) registers an accessory in three steps: (1) IP 127.0.0.1 and a sequential TCP port from 4001 bound to a free serial; (2) the device (SPE, Hamplus, Palstar, LDG, LP-100A, ACOM); (3) autostart and Finish. Lextel and Bluetooth radio stay out. Cat-USB radio uses a Radio-type connection on the ser2net tab."
          />
          <GoTab page="wizard" label={t({ pt: "Abrir o wizard", en: "Open the wizard" })} />
        </Section>

        <Section id="wifi" title={t(TOC[20]!.title)}>
          <P
            pt="Aba WiFi: (1) nome na rede, que vira nome.local na LAN; (2) tipo de conexão — cabo Ethernet ou Wi‑Fi da casa; (3) Procurar redes e Conectar com a senha; (4) DHCP ou IP fixo (IP, máscara, gateway, DNS primário e secundário); (5) Access Point Ham Cockpit em 192.168.4.1 para o campo. Redes gravadas voltam sozinhas no boot do Pi."
            en="WiFi tab: (1) device name, which becomes name.local on the LAN; (2) uplink — Ethernet cable or house Wi‑Fi; (3) Scan networks and Connect with the password; (4) DHCP or static IP (address, mask, gateway, primary and secondary DNS); (5) Ham Cockpit AP at 192.168.4.1 for the field. Saved networks rejoin on Pi boot."
          />
          <GoTab page="wifi" label={t({ pt: "Abrir WiFi", en: "Open WiFi" })} />
        </Section>

        <Section id="bluetooth" title={t(TOC[21]!.title)}>
          <P
            pt="A aba Bluetooth é um atalho: um painel para o IC-705 (GATT) e outro para o Lextel (SPP), mais o nome/PIN do adaptador. O fluxo completo do 705 está em Rádio; o do wattímetro em Lextel. Scan nesta aba também abre o seletor Chrome."
            en="The Bluetooth tab is a shortcut: one panel for the IC-705 (GATT) and one for Lextel (SPP), plus adapter name/PIN. The full 705 flow lives under Radio; the wattmeter under Lextel. Scan here also opens the Chrome picker."
          />
          <GoTab page="bluetooth" label={t({ pt: "Abrir Bluetooth", en: "Open Bluetooth" })} />
        </Section>

        <Section id="sistema" title={t(TOC[22]!.title)}>
          <Ul
            items={[
              {
                pt: "Status — saúde do Pi (CPU, RAM, rede), IPs AP/STA, mDNS ham-cockpit.local, e um cartão por serviço (rádio, CI-V, Wavelog, Gate, ser2net, Hamlib, ACOM, Lextel, SSH).",
                en: "Status — Pi health (CPU, RAM, network), AP/STA IPs, mDNS ham-cockpit.local, and a card per service (radio, CI-V, Wavelog, Gate, ser2net, Hamlib, ACOM, Lextel, SSH).",
              },
              {
                pt: "Logs — diário filtrável (BLE, CI-V, IC705, RADIO, WiFi, SYS, WLOG, S2N, ACOM, LEXTEL, ERRO). Use quando o handshake falhar ou o SPP cair.",
                en: "Logs — filterable diary (BLE, CI-V, IC705, RADIO, WiFi, SYS, WLOG, S2N, ACOM, LEXTEL, ERRO). Use when handshake fails or SPP drops.",
              },
              {
                pt: "Terminal — shell root no Pi, já autenticado. Para manutenção. SSH externo é na porta 22 com os usuários da aba Admin (root por senha está desligado).",
                en: "Terminal — root shell on the Pi, already signed in. For maintenance. External SSH is port 22 with Admin-tab users (root password login is off).",
              },
              {
                pt: "Admin — troca a senha do console, cria usuários Linux no grupo sudo, reinicia, reset de fábrica (apaga o WiFi da casa e volta ao AP). A aba Atualização tem o card Ham Cockpit (versão instalada vs github.com/fviudes/ham-cockpit/update na main) e os demais componentes. Aba Backup grava em /backup as configs da estação, o WaveLogGate e o Wavelog. Restore exige um checkbox de confirmação: tudo volta à data/hora do arquivo e o que veio depois se perde.",
                en: "Admin — change console password, create Linux sudo users, reboot, factory reset (wipes house Wi‑Fi and returns to the AP). The Update tab has the Ham Cockpit card (installed version vs github.com/fviudes/ham-cockpit/update on main) plus the other components. The Backup tab writes station configs, WaveLogGate and Wavelog under /backup. Restore needs a confirmation checkbox: everything returns to that file's date/time and later data is lost.",
              },
            ]}
          />
        </Section>

        <Section id="niveis" title={t(TOC[23]!.title)}>
          <P
            pt="USB e Bluetooth não precisam de conversor. Tudo que nasceu RS232 de PC (±12 V) precisa de MAX3232 (ou cabo USB-RS232 pronto). GPIO uart2–5 do Pi é 3,3 V — um cabo SPE/Palstar/Hamplus/ACOM direto no header mata o SoC."
            en="USB and Bluetooth need no converter. Anything born as PC RS232 (±12 V) needs MAX3232 (or a ready USB-RS232 cable). Pi GPIO uart2–5 is 3.3 V — a SPE/Palstar/Hamplus/ACOM cable straight on the header kills the SoC."
          />
          <FigTtl
            caption={t({
              pt: "Figura 9 — GPIO 3,3 V não liga em RS232 ±12 V. O caminho certo é USB-serial com MAX3232.",
              en: "Figure 9 — 3.3 V GPIO does not meet ±12 V RS232. The right path is USB-serial with MAX3232.",
            })}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
                <tr>
                  <th className="py-2">{t({ pt: "Dispositivo", en: "Device" })}</th>
                  <th>{t({ pt: "Nível", en: "Level" })}</th>
                  <th>{t({ pt: "Conversão", en: "Conversion" })}</th>
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {[
                  ["IC-705", "USB / BLE / CAT", t({ pt: "sem conversor", en: "no converter" })],
                  ["Icom CI-V cabo", "5 V TTL", t({ pt: "divisor no TX", en: "divider on TX" })],
                  ["SPE Expert", "RS232 / 5 V", "MAX3232"],
                  ["Hamplus / Palstar / LP-100A", "±12 V RS232", "MAX3232"],
                  ["LDG AT-600/1000ProII", "TTL 5 V 38400", t({ pt: "USB-TTL no jack METER", en: "USB-TTL on the METER jack" })],
                  ["ACOM 2000A", "RS232 1200 8N1", t({ pt: "MAX3232 · null-modem 2–3 / 5–5", en: "MAX3232 · null-modem 2–3 / 5–5" })],
                  ["Lextel MS-2000", "BT Classic SPP", t({ pt: "sem conversor", en: "no converter" })],
                ].map((r) => (
                  <tr key={r[0]} className="border-t border-[rgba(79,195,247,0.08)]">
                    {r.map((c) => (
                      <td key={c} className="py-2 pr-3">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P
            pt="Prefira sempre /dev/serial/by-id/… no Pi (o nome não muda quando troca de USB). No Windows o Gerenciador de Dispositivos mostra a COM."
            en="On the Pi always prefer /dev/serial/by-id/… (the name stays when you move USB ports). On Windows, Device Manager shows the COM."
          />
        </Section>

        <Section id="receitas" title={t(TOC[24]!.title)}>
          <Example title={t({ pt: "Receita A — Só o IC-705 no campo", en: "Recipe A — IC-705 only, portable" })}>
            <Ul
              items={[
                { pt: "Pi no AP Ham-Cockpit-XXXX. Notebook no mesmo Wi‑Fi. Chrome → 192.168.4.1/console.", en: "Pi on AP Ham-Cockpit-XXXX. Laptop on that Wi‑Fi. Chrome → 192.168.4.1/console." },
                { pt: "Rádio: Icom Bluetooth CI-V 0xA4, Principal, Conectar com Pairing Reception aberto.", en: "Radio: Icom Bluetooth CI-V 0xA4, Primary, Connect with Pairing Reception open." },
                { pt: "Painel para QSY. Lextel opcional no mesmo Bluetooth.", en: "Panel for QSY. Optional Lextel on the same Bluetooth." },
              ]}
            />
          </Example>
          <Example title={t({ pt: "Receita B — Shack digital (FT8)", en: "Recipe B — Digital shack (FT8)" })}>
            <Ul
              items={[
                { pt: "Pi na Ethernet/Wi‑Fi da casa. Console em http://ham-cockpit.local/console.", en: "Pi on house Ethernet/Wi‑Fi. Console at http://ham-cockpit.local/console." },
                { pt: "IC-705 GATT + MS-2000 SPP (COM outgoing) + Principal no 705.", en: "IC-705 GATT + MS-2000 SPP (outgoing COM) + Primary on the 705." },
                { pt: "Wavelog instalado em :8086, Gate UDP 2333, chave API colada.", en: "Wavelog installed on :8086, Gate UDP 2333, API key pasted." },
                { pt: "ser2net :4001 + Hamlib 3085 :4532. WSJT-X: Hamlib NET + Secondary UDP 2333.", en: "ser2net :4001 + Hamlib 3085 :4532. WSJT-X: Hamlib NET + Secondary UDP 2333." },
              ]}
            />
          </Example>
          <Example title={t({ pt: "Receita C — HF com SPE e ACOM", en: "Recipe C — HF with SPE and ACOM" })}>
            <Ul
              items={[
                { pt: "Rádio Icom USB CI-V (7300 0x94) como Principal.", en: "Icom USB CI-V (7300 0x94) as Primary." },
                { pt: "Dois USB-RS232 MAX3232: SPE 9600 e ACOM 1200 null-modem 2–3/5–5.", en: "Two USB-RS232 MAX3232 sticks: SPE 9600 and ACOM 1200 null-modem 2–3/5–5." },
                { pt: "Config Device Wizard: serial → IP:porta, dispositivo, início automático. Hamlib só no rádio.", en: "Config Device Wizard: serial → IP:port, device, autostart. Hamlib only on the radio." },
                { pt: "ACOM: RPON se for ligar pelo PC; esperar 150 s; OPERATE. CAT do rádio no RCU, não na DB9 do amp.", en: "ACOM: RPON if powering from the PC; wait 150 s; OPERATE. Radio CAT on the RCU, not the amp DB9." },
              ]}
            />
          </Example>
        </Section>

        <Section id="problemas" title={t(TOC[25]!.title)}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
                <tr>
                  <th className="py-2 pr-3">{t({ pt: "Sintoma", en: "Symptom" })}</th>
                  <th>{t({ pt: "O que fazer", en: "What to do" })}</th>
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {(
                  [
                    {
                      pt: ["Não abre 192.168.4.1", "Está no Wi‑Fi Ham-Cockpit-XXXX? Senha hamcockpit. Espere o Pi terminar o boot (LED verde irregular)."],
                      en: ["192.168.4.1 will not open", "Are you on Wi‑Fi Ham-Cockpit-XXXX? Password hamcockpit. Wait for boot (uneven green LED)."],
                    },
                    {
                      pt: ["Login recusado", "admin / 1234. Se mudou em Admin e esqueceu: reset de fábrica (botão na aba Admin) volta o AP e a senha padrão."],
                      en: ["Login rejected", "admin / 1234. If you changed it under Admin and forgot: factory reset (Admin tab) restores the AP and default password."],
                    },
                    {
                      pt: ["Chrome não lista o IC-705", "HTTPS ou localhost; Pairing Reception aberto; Bluetooth ON no rádio; não use Firefox."],
                      en: ["Chrome does not list the IC-705", "HTTPS or localhost; Pairing Reception open; radio Bluetooth ON; do not use Firefox."],
                    },
                    {
                      pt: ["Handshake CI-V eterno", "Aceite Ham-Cockpit-Web01 no 705. PIN 0000 no Windows. Tente Conectar de novo sem fechar o pareamento."],
                      en: ["CI-V handshake forever", "Accept Ham-Cockpit-Web01 on the 705. PIN 0000 on Windows. Connect again without leaving pairing."],
                    },
                    {
                      pt: ["Lextel cai ao ligar o 705", "Normal no Windows por um segundo. O SPP reabre sozinho. Confirme o COM de saída, não o de entrada. Reconectar no boot marcado."],
                      en: ["Lextel drops when the 705 connects", "Normal on Windows for a second. SPP reopens itself. Confirm the outgoing COM, not incoming. Reconnect on boot ticked."],
                    },
                    {
                      pt: ["Wattímetro sem watts", "TX um pouco; Aprender com o dump. Decoder ASCII/CSV/JSON ou quadro binário repetido."],
                      en: ["Wattmeter shows no watts", "TX briefly; Learn from dump. ASCII/CSV/JSON decoder or a repeating binary frame."],
                    },
                    {
                      pt: ["WSJT-X não mexe o rádio", "Hamlib NET 127.0.0.1:4532; ser2net dono da TTY; modelo 3085 no 705. Não abra a COM no WSJT-X."],
                      en: ["WSJT-X does not move the radio", "Hamlib NET 127.0.0.1:4532; ser2net owns the TTY; model 3085 on the 705. Do not open the COM in WSJT-X."],
                    },
                    {
                      pt: ["QSO não entra no Wavelog", "Gate iniciado; UDP 2333 no WSJT-X; chave API e Station ID; Testar API verde; Docker no Pi."],
                      en: ["QSO does not hit Wavelog", "Gate running; UDP 2333 in WSJT-X; API key and Station ID; Test API green; Docker on the Pi."],
                    },
                    {
                      pt: ["ACOM não liga pelo PC", "RPON marcado; cabo só 2–3/3–2/5–5; 1200 8N1. Senão use o botão da frente e espere 150 s."],
                      en: ["ACOM will not power from the PC", "RPON ticked; cable 2–3/3–2/5–5 only; 1200 8N1. Otherwise use the front switch and wait 150 s."],
                    },
                  ] as { pt: [string, string]; en: [string, string] }[]
                ).map((row) => {
                  const [a, b] = lang === "en" ? row.en : row.pt;
                  return (
                    <tr key={a} className="border-t border-[rgba(79,195,247,0.08)] align-top">
                      <td className="py-2 pr-4 font-semibold text-[#4fc3f7]">{a}</td>
                      <td className="py-2">{b}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Panel>
      <h2 id={id} className="mb-4 scroll-mt-24 font-['Space_Grotesk'] text-lg font-semibold text-white">
        {title}
      </h2>
      {children}
    </Panel>
  );
}

function P({ pt, en }: Pair) {
  const { lang } = useConsole();
  return <p className="mb-3 text-sm leading-relaxed text-[#c5d4e0]">{lang === "en" ? en : pt}</p>;
}

function S({ pt, en }: Pair) {
  const { lang } = useConsole();
  return <>{lang === "en" ? en : pt}</>;
}

function Steps({ items }: { items: Pair[] }) {
  const { lang } = useConsole();
  return (
    <ol className="my-3 space-y-2">
      {items.map((item, i) => (
        <li key={item.pt} className="flex gap-3 text-sm leading-relaxed text-[#c5d4e0]">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold text-[#071018]">
            {i + 1}
          </span>
          <span>{lang === "en" ? item.en : item.pt}</span>
        </li>
      ))}
    </ol>
  );
}

function Ul({ items }: { items: Pair[] }) {
  const { lang } = useConsole();
  return (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#c5d4e0]">
      {items.map((item) => (
        <li key={item.pt}>{lang === "en" ? item.en : item.pt}</li>
      ))}
    </ul>
  );
}

function Callout({ tone, children }: { tone: "info" | "warn" | "ok"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-[rgba(255,179,0,0.35)] bg-[rgba(255,179,0,0.08)] text-[#ffd27a]"
      : tone === "ok"
        ? "border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] text-[#6ee7b7]"
        : "border-[rgba(79,195,247,0.35)] bg-[rgba(79,195,247,0.08)] text-[#9adaf7]";
  return <div className={`my-3 rounded-lg border px-3 py-2 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="my-3 rounded-lg border border-[rgba(255,179,0,0.22)] bg-[#10160c] p-4">
      <p className="mb-2 font-['IBM_Plex_Mono'] text-[11px] tracking-wide text-[#ffb300] uppercase">{title}</p>
      {children}
    </div>
  );
}

function GoTab({ page, label }: { page: string; label: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="mt-3">
      <GhostBtn onClick={() => navigate(`/console/${page}`)}>{label}</GhostBtn>
    </div>
  );
}

function MenuTable({ lang }: { lang: Lang }) {
  const rows =
    lang === "en"
      ? [
          ["Panel", "VFO, PTT, mode, bands — operate the primary radio"],
          ["Wavelog", "Logbook :8086 + UDP Gate 2333"],
          ["MMDVM", "WPSD hotspot: MMDVMHost + DMRGateway, last heard"],
          ["ser2net", "Serial over TCP + Hamlib NET"],
          ["Config Device Wizard", "Serial → IP:port, pick device, autostart"],
          ["Radio", "Register IC-705 / USB / CAT, Primary checkbox"],
          ["SPE · Hamplus · Palstar · LDG · LP-100A · ACOM", "Amp, switch, tuner, wattmeter, 2000A"],
          ["Lextel", "MS-2000 Classic SPP telemetry"],
          ["WiFi · Bluetooth", "House network, AP, GATT shortcut"],
          ["Status · Admin", "Health; Admin tabs: users, Services, Updates, Backup, Logs, Terminal"],
        ]
      : [
          ["Painel", "VFO, PTT, modo, bandas — opera o rádio principal"],
          ["Wavelog", "Logbook :8086 + Gate UDP 2333"],
          ["MMDVM", "Hotspot WPSD: MMDVMHost + DMRGateway, últimos ouvidos"],
          ["ser2net", "Serial na rede + Hamlib NET"],
          ["Config Device Wizard", "Serial → IP:porta, dispositivo, início automático"],
          ["Rádio", "Cadastra IC-705 / USB / CAT, checkbox Principal"],
          ["SPE · Hamplus · Palstar · LDG · LP-100A · ACOM", "Amp, chave, tuner, wattímetro, 2000A"],
          ["Lextel", "Telemetria MS-2000 Classic SPP"],
          ["WiFi · Bluetooth", "Rede da casa, AP, atalho GATT"],
          ["Status · Admin", "Saúde; abas Admin: usuários, Serviços, Atualização, Backup, Logs, Terminal"],
        ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
          <tr>
            <th className="py-2 pr-3">{lang === "en" ? "Menu" : "Menu"}</th>
            <th>{lang === "en" ? "What it is for" : "Para que serve"}</th>
          </tr>
        </thead>
        <tbody className="text-[#c5d4e0]">
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-[rgba(79,195,247,0.08)]">
              <td className="py-2 pr-3 font-semibold text-[#4fc3f7]">{r[0]}</td>
              <td className="py-2">{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
