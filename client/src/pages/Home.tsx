import { motion } from "framer-motion";
import {
  Antenna,
  Bluetooth,
  BookMarked,
  BookOpen,
  Cable,
  Gauge,
  Radio,
  Shield,
  Star,
  Waves,
  Wifi,
  Workflow,
} from "lucide-react";
import { useLocation } from "wouter";
import NavBar from "@/components/NavBar";
import {
  FigBoot,
  FigDualBt,
  FigIc705,
  FigAcomCable,
  FigScreen,
  FigSer2net,
  FigStation,
  FigTtl,
  FigWavelog,
} from "@/console/manual-diagrams";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.12 } },
};

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />

      <section className="border-b border-[rgba(79,195,247,0.1)] pt-24 pb-16">
        <div className="container grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <p className="mb-3 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">
              APPLIANCE DA ESTAÇÃO · v0.1.00
            </p>
            <h1 className="mb-5 font-['Space_Grotesk'] text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
              Um Pi. Um browser.
              <span className="text-[#4fc3f7]"> Toda a estação.</span>
            </h1>
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#94a3b8]">
              O Ham Cockpit é o computador do shack: Raspberry Pi com console no Chrome. Fala com o IC-705 por Bluetooth GATT, com o Lextel por SPP Classic, com USB/CAT, Wavelog, Hamlib e os amps — sem firmware ESP32 e sem seis programas Windows abertos ao mesmo tempo.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate("/console")}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4fc3f7] px-7 py-3.5 font-bold text-[#0d1b2a] hover:bg-[#80d8ff]"
              >
                <Radio size={18} />
                Abrir o console
              </button>
              <button
                type="button"
                onClick={() => navigate("/docs")}
                className="inline-flex items-center gap-2 rounded-lg border border-[#4fc3f7] px-7 py-3.5 font-bold text-[#4fc3f7] hover:bg-[rgba(79,195,247,0.1)]"
              >
                Ver como liga
              </button>
            </div>
            <p className="mt-5 font-['IBM_Plex_Mono'] text-[11px] text-[#5d7184]">
              Chrome ou Edge · admin / 1234 · http://192.168.4.1/console
            </p>
          </motion.div>
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="min-w-0">
            <FigStation caption="O Pi é o hub: IC-705 em BLE, MS-2000 em SPP, você no Chrome, Wavelog e Hamlib no mesmo aparelho." />
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="01" label="Ganhos reais" title="O que muda no shack no primeiro dia" />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          >
            {GAINS.map((g) => (
              <motion.div
                key={g.stat}
                variants={fadeUp}
                className="rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-5"
              >
                <p className="font-['IBM_Plex_Mono'] text-3xl font-semibold text-[#4fc3f7]">{g.stat}</p>
                <h3 className="mt-2 font-['Space_Grotesk'] font-semibold text-white">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{g.body}</p>
              </motion.div>
            ))}
          </motion.div>
          <div className="mt-8 overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
                <tr>
                  <th className="px-4 py-3">Antes (PC + ESP32 + cabos)</th>
                  <th className="px-4 py-3">Com Ham Cockpit</th>
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {COMPARE.map((row) => (
                  <tr key={row[0]} className="border-t border-[rgba(79,195,247,0.08)]">
                    <td className="px-4 py-3 text-[#8ea0b3]">{row[0]}</td>
                    <td className="px-4 py-3 text-[#34d399]">{row[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="02" label="Como funciona" title="Do cartão SD ao QSO, sem Linux" />
          <FigBoot caption="Grave a ISO, ligue o Pi, entre no Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit), abra 192.168.4.1 — admin / 1234." />
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <FigIc705 caption="IC-705: Pairing Reception aberto no rádio → Conectar no console → aceite Ham-Cockpit-Web01. CI-V em 0xA4." />
            <FigDualBt caption="GATT do 705 e SPP do wattímetro no mesmo adaptador. Se o Windows soltar o COM, o Ham Cockpit reabre o SPP sozinho." />
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="03" label="Console" title="A tela que o operador usa" />
          <p className="mb-6 max-w-3xl text-lg text-[#94a3b8]">
            Menu à esquerda, VFO no topo, chips do rádio e do MS-2000, idioma PT/EN. Cada equipamento tem a própria aba. O manual do operador vive dentro do próprio console.
          </p>
          <FigScreen caption="Chips verdes = CI-V e SPP no ar. No celular o mesmo menu abre pelo botão ☰." />
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="04" label="Funcionalidades" title="Tudo o que a plataforma entrega hoje" />
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {FEATURES.map((f) => (
              <motion.article
                key={f.title}
                variants={fadeUp}
                className="rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-5 hover:border-[#4fc3f7]/45"
              >
                <f.icon size={28} className="mb-3 text-[#4fc3f7]" />
                <h3 className="font-['Space_Grotesk'] font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{f.body}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="05" label="Log e digital" title="QSO entra sozinho. A COM não briga." />
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <FigWavelog caption="WSJT-X Secondary UDP 2333 → WaveLogGate → API Wavelog → contato no logbook :8086." />
              <p className="mt-3 text-sm leading-relaxed text-[#94a3b8]">
                Wavelog (PHP) e Ham Cockpit não partilham a porta 80. O logbook fica em :8086. Cole a chave API e o Station ID uma vez; cada pacote UDP vira QSO.
              </p>
            </div>
            <div>
              <FigSer2net caption="TTY → ser2net :4001 → rigctld -m 3085 → Hamlib NET :4532. Só o ser2net abre o cabo." />
              <p className="mt-3 text-sm leading-relaxed text-[#94a3b8]">
                WSJT-X, JTDX e o Gate usam Hamlib NET. Nunca dois programas na mesma serial — o clássico “COM em uso” some.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="06" label="Estações de exemplo" title="Três receitas prontas" />
          <div className="grid gap-4 lg:grid-cols-3">
            {RECIPES.map((r) => (
              <article key={r.title} className="rounded-xl border border-[rgba(255,179,0,0.22)] bg-[#10160c] p-5">
                <p className="font-['IBM_Plex_Mono'] text-[11px] tracking-wide text-[#FFB300] uppercase">{r.kicker}</p>
                <h3 className="mt-1 font-['Space_Grotesk'] text-lg font-semibold text-white">{r.title}</h3>
                <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-[#c5d4e0]">
                  {r.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="07" label="Cabos" title="USB e Bluetooth. Nunca GPIO no amp." />
          <p className="mb-6 max-w-3xl text-[#94a3b8]">
            IC-705 e Lextel entram por Bluetooth. Outros rádios por USB-CAT. SPE, Palstar, Hamplus e ACOM são RS232 de PC (±12 V). O GPIO do Pi é 3,3 V — cabo de amp no header mata o SoC.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <FigTtl caption="GPIO 3,3 V não liga em SPE/Palstar. Use USB-serial MAX3232." />
            <FigAcomCable caption="ACOM 2000A: 1200 8N1, null-modem só 2–3 / 3–2 / 5–5. CAT do rádio no RCU." />
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="08" label="Rádios" title="CI-V e CAT no mesmo cadastro" />
          <p className="mb-6 max-w-3xl text-[#94a3b8]">
            Icom no Bluetooth (IC-705, endereço 0xA4) ou no USB. Kenwood, Yaesu, Flex e Ten-Tec por Cat-USB. Um checkbox marca o rádio principal — o console reconecta sozinho na próxima abertura.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {CIV.map((m) => (
              <div key={m.model} className="rounded-lg border border-[rgba(79,195,247,0.16)] bg-[#0b1520] px-4 py-3 text-center">
                <p className="font-['Space_Grotesk'] font-semibold text-white">{m.model}</p>
                <p className="font-['IBM_Plex_Mono'] text-sm text-[#4fc3f7]">{m.addr}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container text-center">
          <h2 className="mb-4 font-['Space_Grotesk'] text-4xl font-bold text-white">Ligue a estação agora</h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-[#94a3b8]">
            O console já está neste site. O manual do operador (23 capítulos, diagramas e exemplos) fica em Sistema → Manual, também em inglês.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/console")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4fc3f7] px-8 py-4 font-bold text-[#0d1b2a] hover:bg-[#80d8ff]"
            >
              Abrir o console
            </button>
            <button
              type="button"
              onClick={() => navigate("/console/manual")}
              className="inline-flex items-center gap-2 rounded-lg border border-[#4fc3f7] px-8 py-4 font-bold text-[#4fc3f7] hover:bg-[rgba(79,195,247,0.1)]"
            >
              Manual do operador
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[rgba(79,195,247,0.1)] py-8">
        <div className="container flex flex-wrap items-center justify-between gap-3 text-xs text-[#5d7184]">
          <span className="font-['IBM_Plex_Mono']">Ham Cockpit v0.1.00 · Raspberry Pi 3 / 4 · Ubuntu Server</span>
          <span>Não é firmware ESP32. O gateway CI-V no microcontrolador ficou para trás.</span>
        </div>
      </footer>
    </div>
  );
}

function Kicker({ n, label, title }: { n: string; label: string; title: string }) {
  return (
    <div className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-['IBM_Plex_Mono'] text-xs font-bold text-[#FFB300]">{n}</span>
        <span className="font-['IBM_Plex_Mono'] text-xs tracking-widest text-[#4fc3f7]/60">{label}</span>
      </div>
      <h2 className="font-['Space_Grotesk'] text-3xl font-bold text-white sm:text-4xl">{title}</h2>
    </div>
  );
}

const GAINS = [
  {
    stat: "1",
    title: "janela no lugar de seis",
    body: "Rádio, wattímetro, logbook, Hamlib e amps no mesmo Chrome. Sem RigControl + Director + terminal + COM monitor ao mesmo tempo.",
  },
  {
    stat: "2",
    title: "Bluetooth juntos",
    body: "IC-705 GATT e Lextel SPP no mesmo dongle. O Windows pode soltar o COM um segundo; o Ham Cockpit reabre o SPP sozinho.",
  },
  {
    stat: "0",
    title: "cabo no IC-705",
    body: "CI-V por Web Bluetooth. Pairing Reception no rádio, Conectar no console, endereço 0xA4. Sem divisor TTL e sem ESP32.",
  },
  {
    stat: "auto",
    title: "QSO no log",
    body: "WSJT-X manda UDP 2333. WaveLogGate grava no Wavelog. Você não copia o contato à mão no fim do pile-up.",
  },
];

const COMPARE = [
  ["Firmware no ESP32, 4 UARTs, conversor 3,3↔5 V por rádio", "Appliance no Raspberry Pi; USB-serial e Bluetooth nativos"],
  ["Um programa por equipamento, cada um dono da COM", "ser2net dono da TTY; Hamlib NET :4532 para todos os apps"],
  ["IC-705 só com cabo CI-V ou app de terceiro", "GATT no Chrome, handshake 0x61–0x64, rádio principal no boot"],
  ["Lextel cai quando outro Bluetooth liga", "SPP Classic escuta-only e reconecta se o COM cair"],
  ["Logbook noutro PC, UDP perdido na LAN", "Wavelog :8086 e Gate no mesmo Pi, UDP 2333 local"],
  ["Documentação de pinagem GPIO", "Manual do operador com 23 capítulos, PT e EN, no próprio console"],
];

const FEATURES = [
  {
    icon: Antenna,
    title: "Rádio Icom, Kenwood, Yaesu, Flex, Ten-Tec",
    body: "Cadastro com fabricante, USB ou Bluetooth, CI-V ou CAT, baud e endereço. Checkbox Principal reconecta no boot.",
  },
  {
    icon: Radio,
    title: "Painel VFO",
    body: "Frequência, modo, PTT, bandas, RF/AF gain. Com o 705 em CI-V OK, o que você toca no browser mexe no rádio.",
  },
  {
    icon: Bluetooth,
    title: "IC-705 GATT",
    body: "Web Bluetooth serviço 14cf8001, nome Ham-Cockpit-Web01, grant 0x64. Chrome ou Edge em HTTPS ou localhost.",
  },
  {
    icon: Waves,
    title: "Lextel MS-2000",
    body: "Bluetooth Classic SPP, só escuta. PEP, média, ROE, V, Z, AM. Decoder aprende o quadro no dump.",
  },
  {
    icon: BookMarked,
    title: "Wavelog + WaveLogGate",
    body: "Logbook isolado na 8086. Gate UDP 2333. Publicar CAT opcional. Sem Apache na porta 80.",
  },
  {
    icon: Cable,
    title: "ser2net + Hamlib",
    body: "TCP 127.0.0.1:4001–4005. rigctld IC-705 -m 3085. ACOM em 1200 8N1 sem ampctld.",
  },
  {
    icon: Gauge,
    title: "SPE, Hamplus, Palstar, ACOM",
    body: "Painéis do Expert 1.3K-FA, AS-603WL, AT-AUTO e 2000A (RPON, 150 s, null-modem 2–3/5–5).",
  },
  {
    icon: Wifi,
    title: "Wi‑Fi AP e da casa",
    body: "AP Ham-Cockpit-XXXX em 192.168.4.1 para o campo. STA na rede de casa com DHCP ou IP fixo.",
  },
  {
    icon: Shield,
    title: "Status, logs, terminal, admin",
    body: "Saúde do Pi, diário filtrável, shell root, usuários sudo, SSH :22, reboot e reset de fábrica.",
  },
  {
    icon: Workflow,
    title: "Config Device Wizard",
    body: "Três passos: serial → IP:porta do ser2net, escolher o acessório, ligar o início automático.",
  },
  {
    icon: Star,
    title: "Rádio principal",
    body: "Checkbox na tabela. Só um é principal. Na próxima abertura o console reconecta sozinho — BLE silencioso no 705, USB nos outros.",
  },
  {
    icon: BookOpen,
    title: "Manual do operador",
    body: "23 capítulos no próprio console, PT e EN, com diagramas e o botão que abre a aba certa. Sem PDF separado.",
  },
];

const RECIPES = [
  {
    kicker: "Receita A",
    title: "IC-705 no campo",
    points: [
      "Pi no AP Ham-Cockpit-XXXX, notebook no mesmo Wi‑Fi",
      "Rádio Bluetooth CI-V 0xA4 marcado Principal",
      "Painel para QSY; Lextel opcional no mesmo Bluetooth",
    ],
  },
  {
    kicker: "Receita B",
    title: "Shack FT8",
    points: [
      "Pi na Ethernet; console em ham-cockpit.local",
      "705 GATT + MS-2000 SPP (COM de saída)",
      "Wavelog :8086, Gate 2333, ser2net + Hamlib 3085 no WSJT-X",
    ],
  },
  {
    kicker: "Receita C",
    title: "HF com SPE e ACOM",
    points: [
      "Icom USB CI-V (7300 0x94) como Principal",
      "Dois USB-RS232 MAX3232: SPE 9600 e ACOM 1200",
      "Hamlib só no rádio; CAT do 2000A no RCU, não na DB9 do amp",
    ],
  },
];

const CIV = [
  { model: "IC-705", addr: "0xA4" },
  { model: "IC-7300", addr: "0x94" },
  { model: "IC-7100", addr: "0x18" },
  { model: "IC-7610", addr: "0x76" },
  { model: "IC-9700", addr: "0x88" },
  { model: "IC-7000", addr: "0x70" },
  { model: "IC-706", addr: "0x48" },
  { model: "Kenwood / Yaesu / Flex / Ten-Tec", addr: "CAT USB" },
];
