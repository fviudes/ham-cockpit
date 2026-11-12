import type { Lang } from "./i18n";
import { IS_PORTAL } from "@/lib/portal";
import { useSiteLang } from "@/pages/site-lang";
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
import { EquipmentGuide } from "./equipment-guide";
import { Screen } from "./manual-screens";
import { PRODUCT, Photo } from "@/pages/product-media";
import { useLocation } from "wouter";
import type { ReactNode } from "react";

type Pair = { pt: string; en: string };

const TOC: { id: string; title: Pair }[] = [
  { id: "o-que-e", title: { pt: "O que é o Ham Cockpit", en: "What Ham Cockpit is" } },
  { id: "mapa", title: { pt: "Mapa da estação", en: "Station map" } },
  { id: "primeiro", title: { pt: "Primeiro acesso", en: "First login" } },
  { id: "tela", title: { pt: "Como ler a tela", en: "How to read the screen" } },
  { id: "equipamentos", title: { pt: "Rádios suportados", en: "Supported radios" } },
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

function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-[rgba(79,195,247,0.14)] bg-[#0b1520] p-5 ${className}`}>{children}</div>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 font-['Space_Grotesk'] text-sm font-semibold tracking-wide text-[#ffb300]">{children}</h2>;
}

function PageHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-['IBM_Plex_Mono'] text-[11px] font-semibold tracking-[0.18em] text-[#4fc3f7]/70 uppercase">
          {kicker}
        </p>
        <h1 className="font-['Space_Grotesk'] text-2xl font-semibold text-white">{title}</h1>
      </div>
    </div>
  );
}

function GhostBtn({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-[rgba(79,195,247,0.28)] px-4 text-sm font-semibold text-[#4fc3f7] transition-colors hover:bg-[#4fc3f7]/10"
    >
      {children}
    </button>
  );
}

/** Conteúdo do manual. No console fica dentro do layout; no portal (`/manual`) ganha cabeçalho do site. */
export function ManualPage() {
  const { lang } = useSiteLang();
  const t = (p: Pair) => (lang === "en" ? p.en : p.pt);
  return (
    <div>
      <PageHead
        kicker={t({ pt: "Ajuda", en: "Help" })}
        title={t({ pt: "Manual do operador", en: "Operator's manual" })}
      />
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">
        {t({
          pt: "Este manual mostra como usar o Ham Cockpit (um Raspberry Pi com o console no navegador) no dia a dia do shack: ligar, entrar, cadastrar o rádio, o wattímetro, o logbook e os programas digitais. Você não precisa saber Linux. Na primeira vez, siga as seções na ordem. Depois, use o índice.",
          en: "This manual shows how to use Ham Cockpit (a Raspberry Pi with the console in your browser) in everyday shack work: power up, sign in, register the radio, the wattmeter, the logbook and the digital apps. You do not need Linux. The first time, follow the sections in order. Afterwards, use the table of contents.",
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
              pt: "O produto: Raspberry Pi 3, 4 ou 5 com Ubuntu 24.04 e a imagem do Ham Cockpit gravada no cartão.",
              en: "The product: Raspberry Pi 3, 4 or 5 with Ubuntu 24.04 and the Ham Cockpit image written to the card.",
            })}
          />
          <P
            pt="O Ham Cockpit é o computador da estação. Ele fica ligado o tempo todo no shack. Conversa com o rádio (por USB ou Bluetooth), com o wattímetro Lextel, com os amplificadores e as chaves de antena, e publica um site. Você abre esse site no celular, no notebook ou no PC da mesa, usando Chrome ou Edge."
            en="Ham Cockpit is the station computer. It stays on in the shack, talks to the radio (USB or Bluetooth), the Lextel wattmeter, amplifiers and switches, and publishes a website. You open that site on a phone, laptop or desk PC — Chrome or Edge."
          />
          <P
            pt="O firmware antigo do ESP32 não é usado aqui. O IC-705 se conecta por Bluetooth LE, pelo Web Bluetooth do navegador. O Lextel usa Bluetooth Classic (SPP), que aparece como porta COM no Windows ou como /dev/rfcomm no Pi. São dois tipos de Bluetooth, e os dois funcionam ao mesmo tempo."
            en="The old ESP32 firmware is not used here. Icom CI-V over Bluetooth (IC-705) uses the browser's Web Bluetooth. Lextel uses Bluetooth Classic SPP (a COM port on Windows, or /dev/rfcomm on the Pi). Those are two different Bluetooth kinds and both can stay up together."
          />
          <Callout tone="info">
            <S
              pt="Acesso: na LAN, http://ham-cockpit.local/console (o IP do Pi também funciona). No Wi‑Fi próprio do Pi, http://192.168.4.1/console. Logbook Wavelog: http://ham-cockpit.local:8086 ou pelo IP do Pi na porta 8086."
              en="Access: on the LAN, http://ham-cockpit.local/console (the Pi IP also works). On the Pi's own Wi‑Fi, http://192.168.4.1/console. Wavelog logbook: http://ham-cockpit.local:8086 or the Pi IP on port 8086."
            />
          </Callout>
        </Section>

        <Section id="mapa" title={t(TOC[1]!.title)}>
          <Photo
            src={PRODUCT.shack}
            alt="Estação com Pi, rádio e wattímetro"
            caption={t({
              pt: "O Pi fica no centro. O rádio chega por Bluetooth ou USB, o Lextel por Bluetooth Classic e os acessórios pelo ser2net.",
              en: "Star architecture: Pi in the center. Radio GATT/USB, Lextel SPP, accessories on ser2net.",
            })}
          />
          <P
            pt="Pense na estação como uma estrela: o Pi fica no centro e, em volta, o rádio, o wattímetro, o logbook e o seu computador. Nada disso precisa dividir o mesmo cabo."
            en="Think of the station as a star: the Pi in the center, radio, wattmeter, logbook and your computer around it. None of that has to share one cable."
          />
          <FigStation
            caption={t({
              pt: "Figura 1 — O Pi é o centro. O IC-705 chega por Bluetooth LE, o MS-2000 por Bluetooth Classic (SPP), você usa o Chrome, e o Wavelog e o Hamlib rodam no próprio Pi.",
              en: "Figure 1 — The Pi is the hub. IC-705 arrives over BLE; MS-2000 over SPP; you use Chrome; Wavelog and Hamlib run on the same Pi.",
            })}
          />
          <MenuTable lang={lang} />
        </Section>

        <Section id="primeiro" title={t(TOC[2]!.title)}>
          <P
            pt="Na primeira vez, o Pi ainda não conhece o Wi‑Fi da sua casa. Por isso ele cria uma rede própria, como um roteador novo."
            en="The first time, the Pi does not know the house internet yet. It creates its own network. Same idea as a brand-new router."
          />
          <FigBoot
            caption={t({
              pt: "Figura 2 — Do cartão SD até o login. Sem cabo de rede, use o Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit).",
              en: "Figure 2 — From the SD card to login. No Ethernet: join Wi‑Fi Ham-Cockpit-XXXX, password hamcockpit.",
            })}
          />
          <Steps
            items={[
              {
                pt: "Grave a imagem do Ham Cockpit no cartão microSD com o Raspberry Pi Imager (opção Use custom). Coloque o cartão no Pi 3, 4 ou 5 e ligue a fonte oficial (Pi 5: 27 W / 5 A).",
                en: "Write the Ham Cockpit image to the microSD card with Raspberry Pi Imager (Use custom option). Put the card in a Pi 3, 4 or 5 and use the official PSU (Pi 5: 27 W / 5 A).",
              },
              {
                pt: "No celular ou no notebook, abra a lista de Wi‑Fi e entre na rede Ham-Cockpit-XXXX (os quatro últimos caracteres mudam de aparelho para aparelho). A senha é hamcockpit.",
                en: "On the phone or laptop, open Wi‑Fi. Join Ham-Cockpit-XXXX (the four characters change per unit). Password: hamcockpit.",
              },
              {
                pt: "No navegador, abra http://192.168.4.1/console. Usuário admin, senha 1234. Depois, troque a senha em Admin.",
                en: "Browser: http://192.168.4.1/console — user admin, password 1234. Change it later under Admin.",
              },
              {
                pt: "Para o Pi usar o Wi‑Fi da sua casa, abra WiFi, informe o nome (SSID) e a senha da sua rede e clique em Salvar. Depois, na rede da casa, abra http://ham-cockpit.local/console (ou o IP em Status). O Wi‑Fi próprio http://192.168.4.1 continua no campo.",
                en: "When you want house internet, open WiFi, fill in your SSID and password, Save. Then on the house network open http://ham-cockpit.local/console (or the IP in Status). The Pi Wi‑Fi http://192.168.4.1 stays available in the field.",
              },
            ]}
          />
          <Callout tone="warn">
            <S
              pt="Use Chrome ou Edge. O Bluetooth do IC-705 (Web Bluetooth) não funciona no Firefox nem no Safari. Em PC, o endereço precisa ser https:// ou http://localhost."
              en="Use Chrome or Edge. IC-705 Bluetooth (Web Bluetooth) does not work in Firefox or Safari. On a PC the address must be https:// or http://localhost."
            />
          </Callout>
          <Screen name="console-login" className="my-4" />
        </Section>

        <Section id="tela" title={t(TOC[3]!.title)}>
          <Photo
            src={PRODUCT.console}
            alt="Console Ham Cockpit no notebook"
            caption={t({
              pt: "A tela do operador: VFO no topo, indicadores CI-V e SPP e menu à esquerda.",
              en: "Operator screen: VFO, CI-V/SPP chips, left menu. Chrome or Edge.",
            })}
          />
          <FigScreen
            caption={t({
              pt: "Figura 3 — Menu à esquerda, frequência no topo, indicadores do rádio e do MS-2000 e troca de idioma (PT-BR / EN-US) à direita.",
              en: "Figure 3 — Menu on the left, frequency on top, radio and MS-2000 chips, PT-BR / EN-US language on the right.",
            })}
          />
          <Ul
            items={[
              {
                pt: "Indicador do rádio verde: CI-V ou CAT funcionando. Cinza com traço: ainda não conectou.",
                en: "Green radio chip = CI-V or CAT is up. Grey dash = not connected yet.",
              },
              {
                pt: "Indicador MS-2000 SPP verde: o wattímetro está enviando dados (ou o Pi está reabrindo a conexão). Toque nele para abrir a aba Lextel.",
                en: "Green MS-2000 SPP chip = wattmeter streaming (or reopening COM). Tap it to open the Lextel tab.",
              },
              {
                pt: "PT-BR / EN-US troca o idioma do console inteiro, inclusive este manual.",
                en: "PT-BR / EN-US switches the whole console language, including this manual.",
              },
              {
                pt: "No celular, o botão de menu (☰) abre a mesma lista.",
                en: "On a phone, the menu button (☰) opens the same list.",
              },
            ]}
          />
          <Screen name="console-painel" className="my-4" />
          <Screen name="console-menu-celular" narrow className="my-4" />
        </Section>

        <Section id="equipamentos" title={t(TOC[4]!.title)}>
          <P
            pt="Catálogo completo dos rádios: fabricantes, protocolos, portas, Hamlib e formas de conexão. O controle de CAT da estação é feito pelo rigctld (porta 4532)."
            en="Full radio catalog: makers, protocols, ports, Hamlib, and connection paths. The station CAT hub is rigctld (:4532)."
          />
          <EquipmentGuide lang={lang} />
        </Section>

        <Section id="radio-ble" title={t(TOC[5]!.title)}>
          <P
            pt="O IC-705 não usa cabo. O Chrome conversa com o rádio por Bluetooth LE (GATT, serviço 14cf8001), faz o handshake CI-V (0x61, 0x62 e 0x63) e espera o rádio liberar o acesso (0x64). O endereço CI-V padrão do 705 é 0xA4."
            en="The IC-705 needs no cable. Chrome speaks GATT with the radio (service 14cf8001), does a CI-V handshake (0x61, 0x62, 0x63) and waits for the radio to grant (0x64). Default CI-V address of the 705: 0xA4."
          />
          <FigIc705
            caption={t({
              pt: "Figura 4 — Deixe a tela Pairing Reception aberta no rádio, clique em Conectar no console e aceite Ham-Cockpit-Web01.",
              en: "Figure 4 — Leave Pairing Reception open on the radio, then Connect in the console, then accept Ham-Cockpit-Web01.",
            })}
          />
          <Example
            title={t({ pt: "Exemplo — IC-705 no notebook Windows", en: "Example — IC-705 on a Windows laptop" })}
          >
            <Steps
              items={[
                { pt: "Ligue o IC-705 e ative o Bluetooth do rádio (ON).", en: "Power the IC-705. Radio Bluetooth ON." },
                {
                  pt: "No rádio: Menu → Set → Bluetooth Set → Pairing Reception. Não saia dessa tela.",
                  en: "On the radio: Menu → Set → Bluetooth Set → Pairing Reception. Stay on that screen.",
                },
                {
                  pt: "No console, abra Dispositivos → Rádio. Escolha fabricante Icom, conexão Bluetooth, protocolo CI-V e endereço IC-705 (0xA4).",
                  en: "In the console: Devices → Radio. Maker Icom, Bluetooth, CI-V, address IC-705 (0xA4).",
                },
                {
                  pt: "Toque em Conectar. Na janela do Chrome, escolha ICOM BT(IC-705). Se o rádio mostrar Ham-Cockpit-Web01, aceite. Se o Windows pedir PIN, digite 0000.",
                  en: "Tap Connect. In the Chrome picker choose ICOM BT(IC-705). If the radio shows Ham-Cockpit-Web01, accept. Windows PIN, if asked: 0000.",
                },
                {
                  pt: "Os cartões Conexão, Dispositivo e CI-V ficam verdes (CI-V OK). Em Rádios cadastrados, a linha mostra GATT 0xA4. Marque Principal.",
                  en: "Connection / Device / CI-V cards turn green (CI-V OK). The registered-radios row shows GATT 0xA4. Tick Primary.",
                },
              ]}
            />
          </Example>
          <GoTab page="ic705" label={t({ pt: "Abrir a aba Rádio", en: "Open the Radio tab" })} />
          <Callout tone="warn">
            <S
              pt="Se travar em “Handshake CI-V”: volte ao Pairing Reception, desligue e ligue o Bluetooth do rádio e clique em Conectar de novo. Na primeira vez, o Chrome só lista o rádio se a tela de pareamento estiver aberta."
              en="If it sticks on “CI-V handshake”: go back to Pairing Reception, toggle radio Bluetooth off/on, then Connect. Chrome only lists the radio if the pairing screen is open the first time."
            />
          </Callout>
        </Section>

        <Section id="radio-usb" title={t(TOC[6]!.title)}>
          <P
            pt="Kenwood, Yaesu, Flex, Ten-Tec, Xiegu e Icom por cabo usam Cat-USB. Primeiro, cadastre a serial do rádio no ser2net (IP 127.0.0.1, porta em sequência e a serial). Depois, na aba Rádio, escolha o fabricante, Cat-USB e a conexão do ser2net: IP, porta e serial vêm dela. Só o Bluetooth é configurado direto no rádio. O Icom por cabo pode usar CI-V (0x94 no 7300, 0xA4 no 705) ou CAT serial clássico. HL2 e Anan usam um proxy CAT (Thetis ou piHPSDR), não a serial. O catálogo completo está na seção Rádios suportados, acima."
            en="Kenwood, Yaesu, Flex, Ten-Tec, Xiegu and cabled Icom use Cat-USB. Register the radio serial in ser2net first (IP 127.0.0.1, sequential port, TTY). On the Radio tab pick maker, Cat-USB and that ser2net connection — IP/port/serial come from there. Only Bluetooth configures the device directly. Cabled Icom can be CI-V (0x94 on a 7300, 0xA4 on a 705) or classic serial CAT. HL2/Anan use a CAT proxy (Thetis/piHPSDR), not the TTY. Full catalog (protocols, ports, Hamlib): Supported radios section above."
          />
          <Example title={t({ pt: "Exemplo — IC-7300 no USB", en: "Example — IC-7300 on USB" })}>
            <Steps
              items={[
                {
                  pt: "No ser2net (ou no wizard, tipo Rádio): escolha a serial do 7300, IP 127.0.0.1, porta 4001 e velocidade 19200. Salve.",
                  en: "On ser2net (or the wizard, Radio type): 7300 serial, IP 127.0.0.1, port 4001, baud 19200. Save.",
                },
                {
                  pt: "Na aba Rádio: fabricante Icom, Cat-USB, a conexão do ser2net, protocolo CI-V e endereço IC-7300 (0x94).",
                  en: "Radio tab: maker Icom, Cat-USB, the ser2net connection, CI-V, address IC-7300 (0x94).",
                },
                { pt: "Clique em Conectar. A linha cadastrada passa a mostrar 127.0.0.1:4001 e Conectado.", en: "Connect. The saved row shows 127.0.0.1:4001 and Connected." },
              ]}
            />
          </Example>
          <P
            pt="Velocidades típicas: Icom CI-V 19200 ou 115200; Kenwood e Yaesu 38400; Xiegu 19200; Ten-Tec 57600; Bluetooth de outras marcas 9600."
            en="Typical bauds: Icom CI-V 19200 or 115200; Kenwood/Yaesu 38400; Xiegu 19200; Ten-Tec 57600; non-Icom Bluetooth 9600."
          />
        </Section>

        <Section id="principal" title={t(TOC[7]!.title)}>
          <P
            pt="Na tabela Rádios cadastrados, a primeira coluna é Principal. Só um rádio fica marcado. Ao abrir o console, a estação tenta conectar sozinha nesse rádio. Marcar outro como Principal não derruba o Lextel nem as outras conexões Bluetooth."
            en="In Registered radios the first column is Primary. Only one radio is ticked. When you open the console the station tries to connect that radio by itself. Ticking another primary does not drop Lextel or the other Bluetooth links."
          />
          <Ul
            items={[
              {
                pt: "IC-705: a reconexão automática só funciona depois que o Chrome recebeu a permissão pela primeira vez. Se a janela de escolha do Bluetooth aparecer, escolha o rádio de novo.",
                en: "IC-705: silent reconnect only works after Chrome was granted the device once. If the Bluetooth picker appears, accept again.",
              },
              {
                pt: "USB: o Pi reabre a mesma porta serial. Se o cabo não estiver ligado, a linha fica Desconectado. Plugue o cabo e toque em Conectar.",
                en: "USB: the Pi reopens the same COM. If the cable is missing the row stays Disconnected — plug in and tap Connect.",
              },
            ]}
          />
          <Example
            title={t({ pt: "Exemplo — IC-705 pela rede (Icom LAN)", en: "Example — IC-705 over the network (Icom LAN)" })}
          >
            <Steps
              items={[
                {
                  pt: "No IC-705, ative a conexão de rede (Wi‑Fi) e anote o IP do rádio, o Network User e a senha.",
                  en: "On the IC-705 enable the network (Wi‑Fi) connection and note the radio IP, Network User and password.",
                },
                {
                  pt: "No console, abra Dispositivos → Rádio. Escolha fabricante Icom, modo de conexão Rede, informe o IP do rádio, a porta 50001, o usuário e a senha de rede, protocolo CI-V e endereço IC-705 (0xA4).",
                  en: "In the console open Devices → Radio. Maker Icom, connection mode Network, radio IP, port 50001, network user and password, CI-V, address IC-705 (0xA4).",
                },
                {
                  pt: "Clique em Conectar. O Pi autentica no rádio (UDP 50001–50003) e abre o CI-V no Painel e no Hamlib (TCP local 45002 → :4532). A linha em Rádios cadastrados mostra Rede e Conectado.",
                  en: "Click Connect. The Pi authenticates with the radio (UDP 50001–50003) and opens CI-V for the Panel and Hamlib (local TCP 45002 → :4532). The registered-radios row shows Network and Connected.",
                },
              ]}
            />
            <Screen name="console-radio-ic705-lan" className="my-4" />
          </Example>
        </Section>

        <Section id="painel" title={t(TOC[8]!.title)}>
          <P
            pt="Operação → Painel é o VFO da estação. Com o IC-705 em CI-V OK, mudar a frequência, o modo ou o PTT aqui altera o rádio de verdade."
            en="Operation → Panel is the station VFO. With the IC-705 on CI-V OK, changing frequency, mode or PTT here moves the real radio."
          />
          <Ul
            items={[
              { pt: "Setas ▲ ▼: mudam ±1 kHz. Para ir direto a uma frequência, digite em Frequência manual e clique em Aplicar.", en: "▲ ▼ arrows: ±1 kHz. Manual frequency + Apply: jumps to the hertz you typed." },
              { pt: "Botões de banda (160 m a 70 cm): levam o rádio ao centro da faixa.", en: "Band buttons (160 m … 70 cm): QSY to the band center." },
              { pt: "USB, LSB, CW, AM, FM e RTTY escolhem o modo. PTT ON / OFF transmite de verdade (cuidado com a antena).", en: "USB / LSB / CW / AM / FM / RTTY: mode. PTT ON / OFF: transmits (watch the antenna)." },
              { pt: "RF gain e AF gain são controles deslizantes. O selo BLE CAT verde confirma que o Painel está falando com o rádio.", en: "RF gain and AF gain sliders. The green BLE CAT badge confirms the Panel is talking to the radio." },
              { pt: "O botão + dispositivo mostra o que ainda não está no painel. O X no canto do cartão remove o dispositivo. Salvar layout salva a disposição da página para este usuário.", en: "+ device lists what is not on the panel yet. The X on a card removes it. Save layout keeps the page for this user." },
            ]}
          />
          <Screen name="console-painel" className="my-4" />
          <Screen name="console-painel-tx" className="my-4" />
          <GoTab page="radio" label={t({ pt: "Abrir o Painel", en: "Open the Panel" })} />
        </Section>

        <Section id="varios-bt" title={t(TOC[9]!.title)}>
          <P
            pt="O adaptador Bluetooth do Pi (ou do PC) aguenta vários aparelhos ao mesmo tempo. Conectar o IC-705 (Bluetooth LE) não deve derrubar o MS-2000 (Bluetooth Classic). Se o Windows soltar a COM do Lextel na hora da conexão do 705, o Ham Cockpit reabre o SPP sozinho, e o indicador MS-2000 SPP continua verde."
            en="The Pi or PC Bluetooth adapter can hold several devices at once. The IC-705 (BLE) must not drop the MS-2000 (Classic). If Windows drops the Lextel COM the moment GATT comes up, Ham Cockpit reopens SPP by itself — the MS-2000 SPP chip stays green."
          />
          <FigDualBt
            caption={t({
              pt: "Figura 5 — O 705 (GATT) e o wattímetro (SPP) usam o mesmo adaptador. Não desligue o Bluetooth do Windows no meio de um QSO.",
              en: "Figure 5 — 705 GATT and wattmeter SPP on the same dongle. Do not toggle Windows Bluetooth mid-QSO.",
            })}
          />
        </Section>

        <Section id="lextel" title={t(TOC[10]!.title)}>
          <P
            pt="O Monitor Station (do MS-600 ao MS-2000) envia PEP, média, refletida, ROE, tensão, Z e AM por Bluetooth Classic (SPP). O Ham Cockpit só escuta: nunca envia comando ao wattímetro. Não é Bluetooth LE, então o Chrome não abre esse aparelho."
            en="The Monitor Station (MS-600 through MS-2000) sends PEP, average, reflected, SWR, voltage, Z and AM over Bluetooth Classic SPP. Ham Cockpit only listens — it never sends a command to the wattmeter. It is not BLE: Chrome cannot open that radio."
          />
          <Steps
            items={[
              {
                pt: "No wattímetro, ligue o Bluetooth. O PIN costuma ser 1234 (HC-05) ou 0000.",
                en: "On the wattmeter, turn Bluetooth on. Typical PIN 1234 (HC-05) or 0000.",
              },
              {
                pt: "No Windows, abra Configurações → Bluetooth e pareie o MS-2000. Vai aparecer uma COM de saída (por exemplo, COM5). Não use a COM de “entrada”.",
                en: "Windows: Settings → Bluetooth, pair the MS-2000. An outgoing COM appears (e.g. COM5). Do not use the “incoming” COM.",
              },
              {
                pt: "Na aba Lextel, clique em Procurar MS-2000, escolha a COM (ou o nome Monitor Station) e clique em Conectar SPP. Deixe Reconectar no boot marcado.",
                en: "Lextel tab → Scan for MS-2000 → pick the COM (or Monitor Station) → Connect SPP. Leave Reconnect on boot ticked.",
              },
              {
                pt: "Faça uma transmissão curta. Os dados aparecem no dump. Se o decodificador ainda estiver em “Aprendendo”, toque em Aprender com o dump.",
                en: "Do a short TX. Bytes show in the dump. If the decoder still says “Learning”, tap Learn from dump.",
              },
            ]}
          />
          <Screen name="console-lextel" className="my-4" />
          <GoTab page="lextel" label={t({ pt: "Abrir Lextel", en: "Open Lextel" })} />
          <Callout tone="ok">
            <S
              pt="No Raspberry Pi, o programa auxiliar /opt/ham-cockpit/bin/lextel-bt faz a busca, o pareamento e o rfcomm. A aba Lextel usa esse programa: você não precisa do terminal."
              en="On the Raspberry Pi the helper /opt/ham-cockpit/bin/lextel-bt does scan, pairing and rfcomm. The Lextel tab calls /api/lextel — you do not need the terminal."
            />
          </Callout>
        </Section>

        <Section id="spe" title={t(TOC[11]!.title)}>
          <P
            pt="A aba SPE reproduz o painel frontal do Expert 1.3K-FA: RF OUT, PWR L/M/H, SWR ATU/ANT, V/I PA, banda, antena e entrada. Os botões On, Off, OP, PWR, Antena e Input repetem as teclas do amplificador. Crie a conexão IP no ser2net (RS232 a 9600 por USB-serial com MAX3232, nunca no GPIO de 3,3 V) e selecione-a nesta aba. O amplificador só fala por TCP."
            en="The SPE tab mirrors the Expert 1.3K-FA front panel: RF OUT, PWR L/M/H, SWR ATU/ANT, V/I PA, band, antenna, input. On / Off / OP / PWR / Antenna / Input chips match the amp keys. Create the IP connection in ser2net (RS232 9600 via USB-serial + MAX3232 — never the 3.3 V GPIO) and select it on this tab. The amp talks TCP only."
          />
          <Screen name="console-spe" className="my-4" />
          <GoTab page="spe" label={t({ pt: "Abrir SPE", en: "Open SPE" })} />
        </Section>

        <Section id="hamplus" title={t(TOC[12]!.title)}>
          <P
            pt="Hamplus AS-603WL: LEDs Power, Send e Split, graus do rotor (Rotor 1 ou 2), chave de antena ANT 1–6 e chave de rádio 1–3. É RS232 de ±12 V, então use um conversor MAX3232. Crie a conexão no ser2net e selecione-a nesta aba. As posições 7 a 10 e os rádios 4 e 5 ficam apagados neste modelo."
            en="Hamplus AS-603WL: Power / Send / Split LEDs, rotor degrees (Rotor 1 or 2), antenna switch ANT 1–6 and radio switch 1–3. RS232 ±12 V — MAX3232 converter. Create the ser2net connection and select it on this tab. Positions 7–10 and radios 4–5 stay dimmed on this model."
          />
          <Screen name="console-hamplus" className="my-4" />
          <GoTab page="hamplus" label={t({ pt: "Abrir Hamplus", en: "Open Hamplus" })} />
        </Section>

        <Section id="palstar" title={t(TOC[13]!.title)}>
          <P
            pt="Palstar AT-AUTO: modos Auto, Manual e Bypass, antena Coax ou Balanced, Tune e Home L&C. Também é RS232 de PC: crie a conexão no ser2net e selecione-a nesta aba. Use o conversor. Ligar o cabo direto no GPIO queima o Pi."
            en="Palstar AT-AUTO: Auto / Manual / Bypass, Coax or Balanced antenna, Tune and Home L&C. Also PC-level RS232 — create the ser2net connection and select it on this tab. Use a converter; the Pi GPIO will fry on a direct cable."
          />
          <Screen name="console-palstar" className="my-4" />
          <GoTab page="palstar" label={t({ pt: "Abrir Palstar", en: "Open Palstar" })} />
        </Section>

        <Section id="ldg" title={t(TOC[14]!.title)}>
          <P
            pt="O AT-1000ProII e o AT-600ProII usam o jack mini-DIN de 4 pinos do medidor (M-1000 ou M-600): TTL de 5 V, 38400 8N1. Cadastre o adaptador USB-TTL no ser2net e selecione a conexão IP nesta aba. Cada comando é um espaço seguido de um byte. O AT-100ProII não tem esse jack."
            en="AT-1000ProII and AT-600ProII use the 4-pin mini-DIN meter jack (M-1000/M-600): TTL 5 V, 38400 8N1. Register the USB-TTL in ser2net and pick the IP connection on this tab — the tuner never opens the serial port. Command = space + one byte. The AT-100ProII has no such jack."
          />
          <Screen name="console-ldg" className="my-4" />
          <GoTab page="ldg" label={t({ pt: "Abrir LDG AT", en: "Open LDG AT" })} />
        </Section>

        <Section id="lp100a" title={t(TOC[15]!.title)}>
          <P
            pt="Wattímetro vetorial TelePost. RS232 a 115200 8N1, cabo DB9 reto (não use null-modem). Cadastre o USB-RS232 no ser2net e escolha a conexão IP na aba LP-100A. O console consulta o medidor cerca de 5 vezes por segundo e mostra potência, Z, fase, alarme de ROE, indicativo, faixa, Peak/Avg/Tune, dBm e ROE. Os comandos A e F alternam o alarme e o modo do medidor. Não envie o comando M: ele muda a tela do medidor e a telemetria para. Deixe o medidor em Watts. O PTT por RCA e o segundo acoplador só funcionam no próprio hardware."
            en="TelePost vector RF wattmeter. RS232 115200 8N1, straight-through DB9 (not null-modem). Register the USB-RS232 in ser2net and pick the IP connection on the LP-100A tab. The console polls P ~5 times per second and reads Power, Z, phase, SWR alarm, callsign, range, Peak/Avg/Tune, dBm and SWR. A and F cycle alarm and meter mode. Do not send M — it changes the screen and telemetry stops. Keep the meter on Watts. RCA PTT loop and dual coupler are hardware-only."
          />
          <Screen name="console-lp100a" className="my-4" />
          <GoTab page="lp100a" label={t({ pt: "Abrir LP-100A", en: "Open LP-100A" })} />
        </Section>

        <Section id="acom" title={t(TOC[16]!.title)}>
          <P
            pt="O 2000A usa RS232 a 1200 8N1 na DB9 traseira, no estilo do ACOM Director Classic. O CAT do rádio vai no conector CAT do RCU, não nesta serial."
            en="The 2000A speaks RS232 1200 8N1 on the rear DB9, ACOM Director Classic style. Radio CAT goes to the RCU CAT jack, not this serial."
          />
          <FigAcomCable
            caption={t({
              pt: "Figura 6 — Cabo null-modem só com os pinos 2–3, 3–2 e 5–5. Um cabo “completo” usa pinos extras e pode atrapalhar o RCU.",
              en: "Figure 6 — Null-modem with 2–3, 3–2 and 5–5 only. A “full” cable uses extra pins and can fight the RCU.",
            })}
          />
          <Steps
            items={[
              {
                pt: "Marque RPON (RTS+DTR) se quiser ligar o amplificador pelo PC (o adaptador mantém RTS+DTR por cerca de 10 s). Sem o RPON, use a chave da frente.",
                en: "Tick RPON (RTS+DTR) if you want the PC to power the amp (the adapter holds RTS+DTR ~10 s). Without RPON, use the front switch.",
              },
              {
                pt: "Clique em Ligar e aguarde o aquecimento de 150 s (o cartão ON mostra a contagem). Só então use OPERATE.",
                en: "Power on → wait the 150 s warmup (ON card shows the count). Only then OPERATE.",
              },
              {
                pt: "STANDBY, Auto Tune, Medir HV, banda HF e ANT 1–10 funcionam como no Director. O TX no LCD é o PTT do amplificador.",
                en: "STANDBY / Auto Tune / Measure HV / HF band / ANT 1–10 as in Director. TX on the LCD is amp PTT.",
              },
            ]}
          />
          <Screen name="console-acom" className="my-4" />
          <GoTab page="acom" label={t({ pt: "Abrir ACOM", en: "Open ACOM" })} />
        </Section>

        <Section id="wavelog" title={t(TOC[17]!.title)}>
          <Photo
            src={PRODUCT.logbook}
            alt={t({ pt: "Logbook Wavelog no notebook", en: "Wavelog logbook on a laptop" })}
            caption={t({
              pt: "Wavelog em Docker, na porta 8086. Não divide a porta 80 com o console. O MariaDB fica no contêiner wavelog-db.",
              en: "Wavelog in Docker :8086. It does not share port 80 with the console. MariaDB stays in container wavelog-db.",
            })}
          />
          <P
            pt="O Wavelog é o logbook da estação (um fork do Cloudlog, na imagem ghcr.io/wavelog/wavelog). Ele fica em /opt/wavelog e usa a porta 8086, sem dividir a porta 80. O WaveLogGate fica em /opt/wavelog-gate: recebe o log por UDP 2333, publica o CAT e aceita QSY por HTTP. Não é o programa com janela do DJ7NT: é um serviço Node da imagem, sem tela."
            en="Wavelog is the station PHP logbook (Cloudlog fork, image ghcr.io/wavelog/wavelog). Ham Cockpit does not share a folder or port 80. The logbook lives in /opt/wavelog on 8086. The headless WaveLogGate lives in /opt/wavelog-gate: it listens UDP 2333, publishes CAT, and does HTTP QSY. It is not DJ7NT's GUI WavelogGate — it is the image's Node service, with no DISPLAY."
          />
          <FigWavelogArch
            caption={t({
              pt: "Figura 7 — Três fluxos: QSO por UDP → api/qso; frequência e modo do Hamlib → api/radio; cluster → GET :54321/{Hz}/{modo}.",
              en: "Figure 7 — Three flows: UDP QSO → api/qso; Hamlib f/m → api/radio; cluster → GET :54321/{Hz}/{mode}.",
            })}
          />
          <FigWavelog
            caption={t({
              pt: "Figura 8 — WSJT-X (UDP secundário 2333) → Gate → API do Wavelog → QSO no logbook. Aceita pacotes tipo 5 (QSO) e 12 (ADIF). Duplicata em até 15 s é ignorada; se a API cair, o QSO espera em queue.jsonl.",
              en: "Figure 8 — WSJT-X Secondary UDP 2333 → Gate → Wavelog API → QSO in the logbook. Type 5 (QSO) or 12 (ADIF). A duplicate within 15 s is ignored; if the API is down, queue.jsonl.",
            })}
          />
          <P
            pt="O Wavelog já traz: LoTW, eQSL, Club Log, HRDlog, OQRS, ADIF, DXCC, WAS, IOTA, SOTA, POTA, WWFF, consulta de indicativo (QRZ, HamQTH, QRZCQ), bandmap e cluster, Winkeyer, motor de contest 3.0 e as APIs legada e v2."
            en="Native Wavelog integrations: LoTW, eQSL, Club Log, HRDlog, OQRS, ADIF, DXCC/WAS/IOTA/SOTA/POTA/WWFF, QRZ/HamQTH/QRZCQ callbook, bandmap/cluster, Winkeyer, 3.0 contest engine, legacy API and API v2."
          />
          <FigWavelogCat
            caption={t({
              pt: "Figura 9 — Operando com o rádio: só o ser2net abre a porta serial. O Gate lê o Hamlib NET (:4532) a cada 4 s (PUBLISH_CAT) e o Wavelog mostra o rádio em Hardware Interfaces.",
              en: "Figure 9 — Operating with the radio: only ser2net opens the TTY. The Gate reads Hamlib NET :4532 every 4 s (PUBLISH_CAT) and Wavelog shows the radio under Hardware Interfaces.",
            })}
          />
          <Steps
            items={[
              {
                pt: "Primeiro acesso: abra http://IP-do-Pi:8086/install. O host do banco é wavelog-db. A URL da API termina em index.php.",
                en: "First visit: http://PI-IP:8086/install. Database host: wavelog-db. The API URL ends in index.php.",
              },
              {
                pt: "No Wavelog, abra Admin → API e copie a chave. Anote também o Station ID do perfil. Cole os dois na aba Wavelog do console e clique em Testar API: o resultado deve ficar verde.",
                en: "Admin → API: copy the key. Station ID of the profile. Paste them on the console Wavelog tab. Test API green.",
              },
              {
                pt: "No WSJT-X ou JTDX: em Secondary UDP server, use o IP do Pi e a porta 2333 e ative Enable logged ADIF broadcast. Em Rig, escolha Hamlib NET rigctl, 127.0.0.1:4532 (modelo 3085 no 705). Não use o Internal Hamlib no Gate.",
                en: "WSJT-X / JTDX: Secondary UDP = Pi IP, port 2333, Enable logged ADIF broadcast. Rig = Hamlib NET 127.0.0.1:4532 (3085 on the 705). No Internal Hamlib on the Gate.",
              },
              {
                pt: "No Wavelog, em Hardware Interfaces, use Callback URL = http://IP-do-Pi:54321 (não use 127.0.0.1 se o navegador estiver no notebook). Assim, clicar num spot do cluster muda a frequência do rádio.",
                en: "Hardware Interfaces in Wavelog: Callback URL = http://PI-IP:54321 (not 127.0.0.1 if the browser is the laptop). Click the cluster = QSY on the radio.",
              },
            ]}
          />
          <Photo
            src={PRODUCT.contest}
            alt={t({ pt: "Motor de contest do Wavelog", en: "Wavelog contest engine" })}
            caption={t({
              pt: "Contest Logging Engine 3.0: registro de QSO, rádio CAT, SCP, mapa e relógio UTC. A fonte CAT radio é o rádio que o Gate publica.",
              en: "Contest Logging Engine 3.0: QSO logger, CAT radio, SCP, map, UTC. CAT radio source = the radio the Gate publishes.",
            })}
          />
          <FigWavelogContest
            caption={t({
              pt: "Figura 10 — Contest Manager → START → Logging Engine. O CAT radio lê o Gate. O Quick QSY (kHz + Tab) chama a porta 54321. Enter grava número de série e exchange no logbook.",
              en: "Figure 10 — Contest Manager → START → Logging Engine. CAT radio reads the Gate. Quick QSY (kHz + Tab) hits :54321. Enter writes serial/exch into the logbook.",
            })}
          />
          <Ul
            items={[
              {
                pt: "Sessão: contest ADIF, início e fim, station_id e campos de série, grid e exchange. No multi-operador, série vermelha é prévia e verde é reservada.",
                en: "Session: ADIF contest, start/end, station_id, serial / grid / exchange fields. Multi-op: red serial = preview, green = reserved.",
              },
              {
                pt: "Quick QSY no campo do indicativo: digite kHz e use Tab, Espaço ou Enter. Winkeyer F1–F10, se habilitado. O SCP aceita o curinga ?.",
                en: "Quick QSY in the call field: kHz + Tab/Space/Enter. Winkeyer F1–F10 if enabled. SCP with ? wildcard.",
              },
              {
                pt: "FT8 em contest: o Gate já envia stx_string e srx_string no ADIF. Associe os QSOs à sessão (Import Historical ou API /api/v2/contest).",
                en: "Contest FT8: the Gate already sends stx_string/srx_string in ADIF. Attach QSOs to the session (Import Historical or API /api/v2/contest).",
              },
            ]}
          />
          <Callout tone="warn">
            <S
              pt="Não instale Apache nem PHP na porta 80 e não publique o MariaDB na 3306. O nginx do Ham Cockpit já usa a porta 80. A configuração do Gate fica em /opt/wavelog-gate/wavelog-gate.env."
              en="Do not install Apache/PHP on port 80 or publish MariaDB on 3306. Ham Cockpit nginx already owns 80. Gate env: /opt/wavelog-gate/wavelog-gate.env."
            />
          </Callout>
          <Screen name="console-wavelog" className="my-4" />
          <GoTab page="wavelog" label={t({ pt: "Abrir Wavelog", en: "Open Wavelog" })} />
        </Section>

        <Section id="mmdvm" title={t(TOC[18]!.title)}>
          <P
            pt="A aba Operação → MMDVM controla um hotspot ou uma repetidora digital no mesmo Pi. Os serviços são os do WPSD e do Pi-Star: o MMDVM Host fala com o modem pela UART e o DMR Gateway roda só dentro do Pi. O painel PHP não é instalado: o console do Ham Cockpit já faz esse papel, com o mesmo visual."
            en="Operate → MMDVM drives a digital hotspot or repeater on the same Pi. The stack is WPSD's (and Pi-Star's): MMDVM Host on the modem UART and DMR Gateway on loopback. The PHP dashboard is not installed — the Ham Cockpit console already is the site, with the same colors, fonts, and panels."
          />
          <FigMmdvm
            caption={t({
              pt: "Figura 11 — rádio digital → modem 115200 → MMDVM Host → DMR Gateway :62031 (BrandMeister, TGIF, XLX).",
              en: "Figure 11 — digital radio → modem 115200 → MMDVM Host → DMR Gateway :62031 (BrandMeister, TGIF, XLX).",
            })}
          />
          <Steps
            items={[
              {
                pt: "Encaixe o HAT MMDVM no GPIO (3,3 V, /dev/ttyAMA0) ou ligue um ZUMspot USB (/dev/ttyACM0). Não coloque essa porta serial no ser2net.",
                en: "Fit the MMDVM HAT on GPIO (3.3 V, /dev/ttyAMA0) or a USB ZUMspot (/dev/ttyACM0). Do not put that TTY on ser2net.",
              },
              {
                pt: "Instale o MMDVM Host e o DMR Gateway em /usr/local/bin (binários do WPSD ou compilados do g4klx). O arquivo INI já fica em /opt/ham-cockpit/mmdvm.",
                en: "Install MMDVM Host and DMR Gateway in /usr/local/bin (WPSD binaries or build g4klx). The INI already lives in /opt/ham-cockpit/mmdvm.",
              },
              {
                pt: "No console, informe indicativo, ID DMR, frequência, color code, modos e redes (BrandMeister, TGIF). Salve e reinicie.",
                en: "In the console: callsign, DMR ID, frequency, color code, modes, BrandMeister/TGIF networks. Save and restart.",
              },
            ]}
          />
          <Callout tone="warn">
            <S
              pt="Os HATs com ADF7021 (ZUMspot, HS_Hat, Dual Hat) ouvem um modo de cada vez. Duplex (TS1 + TS2) só funciona em modem duplex. Não instale o Apache nem o PHP do Pi-Star na porta 80."
              en="ADF7021 HATs (ZUMspot, HS_Hat, Dual Hat) hear one mode at a time. Duplex (TS1+TS2) needs a duplex modem. Do not install Pi-Star Apache/PHP on port 80."
            />
          </Callout>
          <Screen name="console-mmdvm" className="my-4" />
          <Screen name="console-mmdvm-redes" className="my-4" />
          <Screen name="console-mmdvm-ouvidos" className="my-4" />
          <GoTab page="mmdvm" label={t({ pt: "Abrir MMDVM", en: "Open MMDVM" })} />
        </Section>

        <Section id="ser2net" title={t(TOC[19]!.title)}>
          <P
            pt="O ser2net é o único programa que pode abrir a porta serial de CAT e de acessórios. Rádio Cat-USB, SPE, Hamplus, Palstar, LDG, LP-100A e ACOM se comunicam só por IP (127.0.0.1:porta). O Bluetooth do rádio (GATT e SPP) continua direto. A exceção é o modem MMDVM: o MMDVM Host é o dono exclusivo dessa UART."
            en="ser2net is the only process allowed to open the CAT and accessory TTY. Cat-USB radio, SPE, Hamplus, Palstar, LDG, LP-100A and ACOM talk IP only (127.0.0.1:port). Radio Bluetooth (GATT/SPP) stays direct. The exception is the MMDVM modem: MMDVM Host exclusively owns that UART."
          />
          <FigSer2net
            caption={t({
              pt: "Figura 12 — Porta serial → ser2net :4001 → rigctld -r 127.0.0.1:4001 → NET :4532. Nunca dois programas na mesma serial.",
              en: "Figure 12 — Serial port → ser2net :4001 → rigctld -r 127.0.0.1:4001 → NET :4532. Never two programs on the same serial.",
            })}
          />
          <Example title={t({ pt: "Exemplo — IC-705 no Hamlib (modelo 3085)", en: "Example — IC-705 in Hamlib (model 3085)" })}>
            <Steps
              items={[
                {
                  pt: "Na aba ser2net, crie a conexão: nome “ic705”, porta de rede 4001, a serial do rádio e velocidade 115200 (USB) ou o serviço TCP do CI-V. Salve e clique em Iniciar ser2net.",
                  en: "ser2net tab → name “ic705”, network port 4001, radio serial, baud 115200 (USB) or the CI-V TCP service. Save. Start ser2net.",
                },
                {
                  pt: "Clique em Iniciar Hamlib. O rigctld usa -m 3085 -r 127.0.0.1:4001 -t 4532. No WSJT-X, escolha Rig = Hamlib NET rigctl e Network Server = 127.0.0.1:4532 (no próprio Pi) ou IP-do-Pi:4532 (de outro computador da rede).",
                  en: "Start Hamlib. rigctld uses -m 3085 -r 127.0.0.1:4001 -t 4532. In WSJT-X: Rig = Hamlib NET rig, Network server 127.0.0.1:4532 (on the Pi) or PI-IP:4532 on the LAN.",
                },
              ]}
            />
          </Example>
          <P
            pt="Na imagem, as portas TCP ficam só em 127.0.0.1:4001 a 4005. O ACOM 2000A usa a :4005 a 1200 8N1, sem ampctld (o Hamlib não tem modelo para ele). Pasta: /opt/ser2net."
            en="TCP is 127.0.0.1:4001–4005 on the image. ACOM 2000A on :4005 at 1200 8N1, no ampctld (Hamlib has no model). Folder: /opt/ser2net."
          />
          <Screen name="console-ser2net" className="my-4" />
          <GoTab page="ser2net" label={t({ pt: "Abrir ser2net", en: "Open ser2net" })} />
        </Section>

        <Section id="wizard" title={t(TOC[20]!.title)}>
          <P
            pt="O Config Device Wizard (no topo do menu) cadastra um acessório em três passos: (1) IP 127.0.0.1 e uma porta TCP em sequência, a partir de 4001, ligada a uma serial livre; (2) o equipamento (SPE, Hamplus, Palstar, LDG, LP-100A ou ACOM); (3) início automático e Finalizar. O Lextel e o rádio Bluetooth não passam por ele. O rádio Cat-USB usa uma conexão do tipo Rádio na aba ser2net."
            en="Config Device Wizard (top of the menu) registers an accessory in three steps: (1) IP 127.0.0.1 and a sequential TCP port from 4001 bound to a free serial; (2) the device (SPE, Hamplus, Palstar, LDG, LP-100A, ACOM); (3) autostart and Finish. Lextel and Bluetooth radio stay out. Cat-USB radio uses a Radio-type connection on the ser2net tab."
          />
          <Screen name="console-assistente" className="my-4" />
          <GoTab page="wizard" label={t({ pt: "Abrir o wizard", en: "Open the wizard" })} />
        </Section>

        <Section id="wifi" title={t(TOC[21]!.title)}>
          <P
            pt="Aba WiFi: (1) nome do Pi na rede, que vira nome.local; (2) tipo de conexão: cabo de rede ou Wi‑Fi da casa; (3) Procurar redes e Conectar, com a senha; (4) DHCP ou IP fixo (IP, máscara, gateway e DNS primário e secundário); (5) Wi‑Fi próprio do Ham Cockpit em 192.168.4.1, para usar no campo. As redes salvas voltam sozinhas quando o Pi liga."
            en="WiFi tab: (1) device name, which becomes name.local on the LAN; (2) uplink — Ethernet cable or house Wi‑Fi; (3) Scan networks and Connect with the password; (4) DHCP or static IP (address, mask, gateway, primary and secondary DNS); (5) Ham Cockpit AP at 192.168.4.1 for the field. Saved networks rejoin on Pi boot."
          />
          <Screen name="console-rede-wifi" className="my-4" />
          <GoTab page="wifi" label={t({ pt: "Abrir WiFi", en: "Open WiFi" })} />
        </Section>

        <Section id="bluetooth" title={t(TOC[22]!.title)}>
          <P
            pt="A aba Bluetooth é um atalho: tem um painel para o IC-705 (GATT) e outro para o Lextel (SPP), além do nome e do PIN do adaptador. O passo a passo completo do 705 está em Rádio, e o do wattímetro em Lextel. O botão Scan desta aba também abre a janela de escolha do Chrome."
            en="The Bluetooth tab is a shortcut: one panel for the IC-705 (GATT) and one for Lextel (SPP), plus adapter name/PIN. The full 705 flow lives under Radio; the wattmeter under Lextel. Scan here also opens the Chrome picker."
          />
          <Screen name="console-bluetooth" className="my-4" />
          <GoTab page="bluetooth" label={t({ pt: "Abrir Bluetooth", en: "Open Bluetooth" })} />
        </Section>

        <Section id="sistema" title={t(TOC[23]!.title)}>
          <Ul
            items={[
              {
                pt: "Status: mostra a saúde do Pi (CPU, RAM, rede), os IPs do Wi‑Fi próprio e da rede da casa, o nome ham-cockpit.local e um cartão para cada serviço (rádio, CI-V, Wavelog, Gate, ser2net, Hamlib, ACOM, Lextel, SSH).",
                en: "Status — Pi health (CPU, RAM, network), AP/STA IPs, mDNS ham-cockpit.local, and a card per service (radio, CI-V, Wavelog, Gate, ser2net, Hamlib, ACOM, Lextel, SSH).",
              },
              {
                pt: "Logs: registro com filtros (BLE, CI-V, IC705, RADIO, WiFi, SYS, WLOG, S2N, ACOM, LEXTEL, ERRO). Use quando o handshake falhar ou o SPP cair.",
                en: "Logs — filterable diary (BLE, CI-V, IC705, RADIO, WiFi, SYS, WLOG, S2N, ACOM, LEXTEL, ERRO). Use when handshake fails or SPP drops.",
              },
              {
                pt: "Terminal: acesso de administrador ao Pi, já autenticado, para manutenção. O SSH de fora usa a porta 22 com os usuários da aba Admin (o login do root por senha está desligado).",
                en: "Terminal — root shell on the Pi, already signed in. For maintenance. External SSH is port 22 with Admin-tab users (root password login is off).",
              },
              {
                pt: "Admin: troca a senha do console, cria usuários Linux no grupo sudo, reinicia o Pi e faz o reset de fábrica (apaga o Wi‑Fi da casa e volta ao Wi‑Fi próprio). A aba Atualização mostra o cartão Ham Cockpit (versão instalada e versão disponível em github.com/fviudes/ham-cockpit, pasta update, na main) e os demais componentes. A aba Backup salva em /backup as configurações da estação, o WaveLogGate e o Wavelog. Para restaurar, é preciso marcar uma caixa de confirmação: tudo volta à data e hora do arquivo, e o que veio depois se perde.",
                en: "Admin — change console password, create Linux sudo users, reboot, factory reset (wipes house Wi‑Fi and returns to the AP). The Update tab has the Ham Cockpit card (installed version vs github.com/fviudes/ham-cockpit/update on main) plus the other components. The Backup tab writes station configs, WaveLogGate and Wavelog under /backup. Restore needs a confirmation checkbox: everything returns to that file's date/time and later data is lost.",
              },
            ]}
          />
          <Screen name="console-status" className="my-4" />
          <Screen name="console-status-celular" narrow className="my-4" />
          <Screen name="console-servicos" className="my-4" />
          <Screen name="console-atualizacoes" className="my-4" />
          <Screen name="console-atualizacoes-progresso" className="my-4" />
          <Screen name="console-admin" className="my-4" />
          <Screen name="console-backup" className="my-4" />
          <Screen name="console-terminal" className="my-4" />
          <Screen name="console-logs" className="my-4" />
        </Section>

        <Section id="niveis" title={t(TOC[24]!.title)}>
          <P
            pt="USB e Bluetooth não precisam de conversor. O que nasceu como RS232 de PC (±12 V) precisa de um MAX3232 (ou de um cabo USB-RS232 pronto). O GPIO uart2–5 do Pi é 3,3 V: ligar um cabo de SPE, Palstar, Hamplus ou ACOM direto nele queima o Pi."
            en="USB and Bluetooth need no converter. Anything born as PC RS232 (±12 V) needs MAX3232 (or a ready USB-RS232 cable). Pi GPIO uart2–5 is 3.3 V — a SPE/Palstar/Hamplus/ACOM cable straight on the header kills the SoC."
          />
          <FigTtl
            caption={t({
              pt: "Figura 13 — O GPIO de 3,3 V não pode receber RS232 de ±12 V. O caminho certo é USB-serial com MAX3232.",
              en: "Figure 13 — The 3.3 V GPIO must not meet ±12 V RS232. The right path is USB-serial with MAX3232.",
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
                  ["Icom CI-V cabo", "5 V TTL", t({ pt: "divisor de tensão no TX", en: "voltage divider on TX" })],
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
            pt="No Pi, prefira sempre /dev/serial/by-id/… (o nome não muda quando você troca de porta USB). No Windows, o Gerenciador de Dispositivos mostra a COM."
            en="On the Pi always prefer /dev/serial/by-id/… (the name stays when you move USB ports). On Windows, Device Manager shows the COM."
          />
        </Section>

        <Section id="receitas" title={t(TOC[25]!.title)}>
          <Example title={t({ pt: "Receita A — Só o IC-705 no campo", en: "Recipe A — IC-705 only, portable" })}>
            <Ul
              items={[
                { pt: "O Pi usa o Wi‑Fi próprio Ham-Cockpit-XXXX. O notebook entra nessa rede. No Chrome, abra 192.168.4.1/console.", en: "Pi on AP Ham-Cockpit-XXXX. Laptop on that Wi‑Fi. Chrome → 192.168.4.1/console." },
                { pt: "Rádio: Icom por Bluetooth, CI-V 0xA4, marcado como Principal. Clique em Conectar com o Pairing Reception aberto.", en: "Radio: Icom Bluetooth CI-V 0xA4, Primary, Connect with Pairing Reception open." },
                { pt: "Use o Painel para mudar de frequência. O Lextel é opcional e usa o mesmo Bluetooth.", en: "Panel for QSY. Optional Lextel on the same Bluetooth." },
              ]}
            />
          </Example>
          <Example title={t({ pt: "Receita B — Shack digital (FT8)", en: "Recipe B — Digital shack (FT8)" })}>
            <Ul
              items={[
                { pt: "Pi no cabo de rede ou no Wi‑Fi da casa. Console em http://ham-cockpit.local/console.", en: "Pi on house Ethernet/Wi‑Fi. Console at http://ham-cockpit.local/console." },
                { pt: "IC-705 por GATT, MS-2000 por SPP (COM de saída) e o 705 marcado como Principal.", en: "IC-705 GATT + MS-2000 SPP (outgoing COM) + Primary on the 705." },
                { pt: "Wavelog instalado na porta 8086, Gate na UDP 2333 e chave de API colada no console.", en: "Wavelog installed on :8086, Gate UDP 2333, API key pasted." },
                { pt: "ser2net na :4001 e Hamlib (modelo 3085) na :4532. No WSJT-X: Hamlib NET e Secondary UDP na 2333.", en: "ser2net na :4001 e Hamlib (modelo 3085) na :4532. No WSJT-X: Hamlib NET e Secondary UDP na 2333." },
              ]}
            />
          </Example>
          <Example title={t({ pt: "Receita C — HF com SPE e ACOM", en: "Recipe C — HF with SPE and ACOM" })}>
            <Ul
              items={[
                { pt: "Rádio Icom por USB, CI-V (7300: 0x94), marcado como Principal.", en: "Icom USB CI-V (7300 0x94) as Primary." },
                { pt: "Dois adaptadores USB-RS232 com MAX3232: SPE a 9600 e ACOM a 1200 (null-modem 2–3 e 5–5).", en: "Two USB-RS232 MAX3232 sticks: SPE 9600 and ACOM 1200 null-modem 2–3/5–5." },
                { pt: "Config Device Wizard: serial, IP e porta, equipamento e início automático. O Hamlib fica só no rádio.", en: "Config Device Wizard: serial → IP:port, device, autostart. Hamlib only on the radio." },
                { pt: "ACOM: use RPON se for ligar pelo PC, espere 150 s e então OPERATE. O CAT do rádio vai no RCU, não na DB9 do amplificador.", en: "ACOM: RPON if powering from the PC; wait 150 s; OPERATE. Radio CAT on the RCU, not the amp DB9." },
              ]}
            />
          </Example>
        </Section>

        <Section id="problemas" title={t(TOC[26]!.title)}>
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
                      pt: ["Não abre 192.168.4.1", "Você está no Wi‑Fi Ham-Cockpit-XXXX? A senha é hamcockpit. Espere o Pi terminar de ligar (o LED verde pisca de forma irregular enquanto ele liga)."],
                      en: ["192.168.4.1 will not open", "Are you on Wi‑Fi Ham-Cockpit-XXXX? Password hamcockpit. Wait for boot (uneven green LED)."],
                    },
                    {
                      pt: ["Login recusado", "Use admin / 1234. Se você trocou a senha em Admin e esqueceu, o reset de fábrica (botão na aba Admin) volta o Wi‑Fi próprio e a senha padrão."],
                      en: ["Login rejected", "admin / 1234. If you changed it under Admin and forgot: factory reset (Admin tab) restores the AP and default password."],
                    },
                    {
                      pt: ["Chrome não lista o IC-705", "Use HTTPS ou localhost, deixe o Pairing Reception aberto, ligue o Bluetooth do rádio e não use o Firefox."],
                      en: ["Chrome does not list the IC-705", "HTTPS or localhost; Pairing Reception open; radio Bluetooth ON; do not use Firefox."],
                    },
                    {
                      pt: ["Handshake CI-V que nunca termina", "Aceite Ham-Cockpit-Web01 no 705. No Windows, use o PIN 0000. Clique em Conectar de novo sem sair da tela de pareamento."],
                      en: ["CI-V handshake forever", "Accept Ham-Cockpit-Web01 on the 705. PIN 0000 on Windows. Connect again without leaving pairing."],
                    },
                    {
                      pt: ["Lextel cai ao ligar o 705", "Isso é normal no Windows e dura cerca de um segundo. O SPP reabre sozinho. Confirme se está usando a COM de saída (não a de entrada) e se Reconectar no boot está marcado."],
                      en: ["Lextel drops when the 705 connects", "Normal on Windows for a second. SPP reopens itself. Confirm the outgoing COM, not incoming. Reconnect on boot ticked."],
                    },
                    {
                      pt: ["Wattímetro sem leitura de watts", "Transmita por alguns segundos e toque em Aprender com o dump. O decodificador entende ASCII, CSV, JSON ou um quadro binário que se repete."],
                      en: ["Wattmeter shows no watts", "TX briefly; Learn from dump. ASCII/CSV/JSON decoder or a repeating binary frame."],
                    },
                    {
                      pt: ["O WSJT-X não controla o rádio", "Use Hamlib NET em 127.0.0.1:4532, deixe o ser2net como dono da porta serial e escolha o modelo 3085 no 705. Não abra a COM direto no WSJT-X."],
                      en: ["WSJT-X does not move the radio", "Hamlib NET 127.0.0.1:4532; ser2net owns the TTY; model 3085 on the 705. Do not open the COM in WSJT-X."],
                    },
                    {
                      pt: ["QSO não entra no Wavelog", "Confira se o Gate está iniciado, se o WSJT-X usa a UDP 2333, se a chave de API e o Station ID estão certos, se Testar API ficou verde e se o Docker está rodando no Pi."],
                      en: ["QSO does not hit Wavelog", "Gate running; UDP 2333 in WSJT-X; API key and Station ID; Test API green; Docker on the Pi."],
                    },
                    {
                      pt: ["ACOM não liga pelo PC", "Marque o RPON, use um cabo só com os pinos 2–3, 3–2 e 5–5 e configure 1200 8N1. Se não funcionar, use a chave da frente e espere 150 s."],
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
  const { lang } = useSiteLang();
  return <p className="mb-3 text-sm leading-relaxed text-[#c5d4e0]">{lang === "en" ? en : pt}</p>;
}

function S({ pt, en }: Pair) {
  const { lang } = useSiteLang();
  return <>{lang === "en" ? en : pt}</>;
}

function Steps({ items }: { items: Pair[] }) {
  const { lang } = useSiteLang();
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
  const { lang } = useSiteLang();
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
  // No portal não existe console: o botão que abre a aba some.
  if (IS_PORTAL) return null;
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
          ["MMDVM", "WPSD hotspot: MMDVM Host + DMR Gateway, last heard"],
          ["ser2net", "Serial over TCP + Hamlib NET"],
          ["Config Device Wizard", "Serial → IP:port, pick device, autostart"],
          ["Radio", "Register IC-705 / USB / CAT, Primary checkbox"],
          ["SPE · Hamplus · Palstar · LDG · LP-100A · ACOM", "Amp, switch, tuner, wattmeter, 2000A"],
          ["Lextel", "MS-2000 Classic SPP telemetry"],
          ["WiFi · Bluetooth", "House network, AP, GATT shortcut"],
          ["Status · Admin", "Health; Admin tabs: users, Services, Updates, Backup, Logs, Terminal"],
        ]
      : [
          ["Painel", "VFO, PTT, modo e bandas: opera o rádio principal"],
          ["Wavelog", "Logbook (:8086) e Gate (UDP 2333)"],
          ["MMDVM", "Hotspot digital: MMDVM Host, DMR Gateway e últimos ouvidos"],
          ["ser2net", "Serial pela rede e Hamlib NET"],
          ["Config Device Wizard", "Serial, IP e porta, equipamento e início automático"],
          ["Rádio", "Cadastra o IC-705 e rádios USB/CAT; caixa Principal"],
          ["SPE · Hamplus · Palstar · LDG · LP-100A · ACOM", "Amplificador, chave de antenas, acopladores, wattímetros e o 2000A"],
          ["Lextel", "Telemetria do MS-2000 (Bluetooth Classic SPP)"],
          ["WiFi · Bluetooth", "Rede da casa, Wi‑Fi do Pi e atalho do Bluetooth LE"],
          ["Status · Admin", "Saúde do Pi; Admin: usuários, Serviços, Atualização, Backup, Logs e Terminal"],
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
