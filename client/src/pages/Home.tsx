/*
 * Home Page — ESP32 CI-V Gateway
 * Design: Blueprint Técnico
 * Seções: Hero, Features, Diagrama CI-V, Topologia de Rede, CTA
 */
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Wifi, Bluetooth, Server, Settings, Radio, Network,
  Download, ChevronRight, Cpu, Shield, Zap, GitBranch
} from "lucide-react";
import NavBar from "@/components/NavBar";

// ============================================================
//  Dados das Funcionalidades
// ============================================================
const features = [
  {
    icon: Bluetooth,
    number: "01",
    title: "Bluetooth SPP",
    desc: "Conecte aplicativos de controle de rádio via Bluetooth Serial Port Profile. Compatível com RigControl, SDR Touch e outros apps CI-V.",
    color: "#4fc3f7",
  },
  {
    icon: Wifi,
    number: "02",
    title: "WiFi AP + STA",
    desc: "Opera como ponto de acesso independente ou conecta-se a uma rede local existente. Suporte a IP estático e DHCP no modo STA.",
    color: "#4fc3f7",
  },
  {
    icon: Settings,
    number: "03",
    title: "Página de Configuração",
    desc: "Interface web embarcada acessível via HTTP. Configure todas as opções do dispositivo sem precisar de software adicional.",
    color: "#ffb300",
  },
  {
    icon: Radio,
    number: "04",
    title: "Protocolo CI-V Icom",
    desc: "Implementação completa do protocolo CI-V para controle de transceivers Icom. Suporte a leitura/escrita de frequência, modo e PTT.",
    color: "#ffb300",
  },
  {
    icon: Server,
    number: "05",
    title: "Servidor DHCP",
    desc: "Distribui endereços IP automaticamente para clientes WiFi conectados ao AP. Pool configurável via interface web.",
    color: "#10b981",
  },
  {
    icon: Network,
    number: "06",
    title: "Discovery de Rede",
    desc: "Scan automático de redes WiFi disponíveis. Conexão a AP local com suporte a WPA/WPA2 e configuração de IP estático.",
    color: "#10b981",
  },
];

const civModels = [
  { addr: "0x88", model: "IC-7200", band: "HF/50 MHz" },
  { addr: "0x8A", model: "IC-7100", band: "HF/VHF/UHF" },
  { addr: "0x94", model: "IC-7300", band: "HF/50 MHz" },
  { addr: "0x96", model: "IC-7610", band: "HF/50 MHz" },
  { addr: "0xA0", model: "IC-9700", band: "VHF/UHF/SHF" },
  { addr: "0xA2", model: "IC-705", band: "HF/VHF/UHF" },
];

const specs = [
  { label: "Microcontrolador", value: "ESP32-WROOM-32" },
  { label: "CPU", value: "Dual-Core Xtensa LX6 @ 240 MHz" },
  { label: "Flash", value: "4 MB" },
  { label: "SRAM", value: "520 KB" },
  { label: "WiFi", value: "802.11 b/g/n 2.4 GHz" },
  { label: "Bluetooth", value: "v4.2 BR/EDR + BLE" },
  { label: "CI-V UART", value: "GPIO 16 (RX) / 17 (TX)" },
  { label: "CI-V Baud", value: "9600 bps (configurável)" },
  { label: "Web Server", value: "HTTP porta 80" },
  { label: "mDNS", value: "esp32-civ.local" },
  { label: "Armazenamento", value: "NVS (Non-Volatile Storage)" },
  { label: "Alimentação", value: "5V via USB / 3.3V GPIO" },
];

// ============================================================
//  Animações
// ============================================================
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, ease: "easeOut" as const } },
};

// ============================================================
//  Componentes
// ============================================================
function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]/60 tracking-[0.15em] uppercase">
        {number}
      </span>
      <div className="h-px flex-1 max-w-[40px] bg-[rgba(79,195,247,0.2)]" />
      <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]/60 tracking-[0.12em] uppercase">
        {label}
      </span>
    </div>
  );
}

function TechCornerBox({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-[rgba(79,195,247,0.18)] rounded-sm ${className}`}>
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#4fc3f7]/60 rounded-tl-sm" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#4fc3f7]/60 rounded-br-sm" />
      {children}
    </div>
  );
}

// ============================================================
//  Página Principal
// ============================================================
export default function Home() {
  return (
    <div className="min-h-screen bg-[#0d1b2a]">
      <NavBar />

      {/* ==================== HERO ==================== */}
      <section className="relative pt-14 overflow-hidden">
        {/* Hero image background */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663676318426/3yxnxmtQW9QeDjDTDDhyGY/hero-esp32-blueprint-JRrYskB628fDwSTieKmA9Z.webp"
            alt="ESP32 Blueprint"
            className="w-full h-full object-cover object-center opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d1b2a]/60 via-[#0d1b2a]/40 to-[#0d1b2a]" />
        </div>

        <div className="relative z-10 container pt-20 pb-24">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="max-w-3xl"
          >
            <SectionLabel number="ESP32 — FIRMWARE v1.0" label="Projeto Open Source" />

            <h1 className="font-['Space_Grotesk'] font-bold text-4xl md:text-5xl lg:text-6xl text-white leading-[1.1] tracking-tight mt-4 mb-6">
              Gateway CI-V{" "}
              <span className="text-[#4fc3f7]">Icom</span>
              <br />
              para ESP32
            </h1>

            <p className="text-[#94a3b8] text-lg leading-relaxed max-w-2xl mb-8 font-['IBM_Plex_Sans']">
              Firmware completo para ESP32 com integração do protocolo CI-V da Icom,
              conectividade Bluetooth e WiFi, servidor DHCP embarcado e página de
              configuração acessível via navegador. Ideal para radioamadores e
              desenvolvedores de hardware.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href="/manus-storage/ESP32_CIV_Gateway_3429e4d6.ino"
                download="ESP32_CIV_Gateway.ino"
                className="flex items-center gap-2 px-5 py-2.5 bg-[#4fc3f7] text-[#0d1b2a] font-semibold text-sm rounded font-['IBM_Plex_Mono'] hover:bg-[#81d4fa] transition-colors active:scale-95"
              >
                <Download size={15} />
                Download Firmware (.ino)
              </a>
              <Link
                href="/docs"
                className="flex items-center gap-2 px-5 py-2.5 border border-[rgba(79,195,247,0.3)] text-[#4fc3f7] font-semibold text-sm rounded font-['IBM_Plex_Mono'] hover:bg-[rgba(79,195,247,0.08)] transition-colors"
              >
                Documentação
                <ChevronRight size={15} />
              </Link>
            </div>

            {/* Status indicators */}
            <div className="flex flex-wrap gap-4 mt-8">
              {[
                { label: "Bluetooth SPP", active: true },
                { label: "WiFi AP+STA", active: true },
                { label: "DHCP Server", active: true },
                { label: "CI-V Icom", active: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={`led ${item.active ? "led-green" : "led-off"}`} />
                  <span className="text-xs text-[#94a3b8] font-['IBM_Plex_Mono']">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== FEATURES ==================== */}
      <section className="py-20 container">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
        >
          <SectionLabel number="02" label="Funcionalidades" />
          <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-3 mb-2">
            Tudo que você precisa em um único firmware
          </h2>
          <p className="text-[#94a3b8] text-base mb-12 max-w-2xl font-['IBM_Plex_Sans']">
            Desenvolvido especificamente para o ecossistema de rádio Icom, com foco em
            facilidade de configuração e confiabilidade operacional.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.number}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              variants={fadeUp}
            >
              <TechCornerBox className="feature-card p-5 h-full bg-[rgba(26,39,68,0.6)] hover:bg-[rgba(26,39,68,0.9)]">
                <div className="flex items-start gap-4">
                  <div
                    className="w-9 h-9 flex items-center justify-center rounded-sm flex-shrink-0 mt-0.5"
                    style={{ background: `${f.color}15`, border: `1px solid ${f.color}30` }}
                  >
                    <f.icon size={17} style={{ color: f.color }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-['IBM_Plex_Mono'] text-[10px] text-[#4fc3f7]/40 tracking-widest">
                        {f.number}
                      </span>
                    </div>
                    <h3 className="font-['Space_Grotesk'] font-semibold text-white text-base mb-2">
                      {f.title}
                    </h3>
                    <p className="text-[#94a3b8] text-sm leading-relaxed font-['IBM_Plex_Sans']">
                      {f.desc}
                    </p>
                  </div>
                </div>
              </TechCornerBox>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==================== DIAGRAMA CI-V ==================== */}
      <section className="py-20 border-t border-[rgba(79,195,247,0.08)]">
        <div className="container">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="mb-10"
          >
            <SectionLabel number="03" label="Protocolo CI-V" />
            <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-3 mb-2">
              Fluxo de Comunicação CI-V
            </h2>
            <p className="text-[#94a3b8] text-base max-w-2xl font-['IBM_Plex_Sans']">
              O protocolo CI-V (Computer Interface V) da Icom permite controle bidirecional
              de transceivers via interface serial. O ESP32 atua como bridge entre Bluetooth
              e a porta CI-V do rádio.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663676318426/3yxnxmtQW9QeDjDTDDhyGY/civ-protocol-diagram-gCqLjxXgk3nbQ2yVrB9xLR.webp"
                alt="Diagrama CI-V Protocol"
                className="w-full rounded border border-[rgba(79,195,247,0.15)] shadow-lg shadow-[rgba(79,195,247,0.05)]"
              />
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={1}
              variants={fadeUp}
              className="space-y-4"
            >
              {/* Frame format */}
              <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.6)]">
                <h3 className="font-['Space_Grotesk'] font-semibold text-[#4fc3f7] text-sm uppercase tracking-wider mb-4">
                  Formato do Frame CI-V
                </h3>
                <div className="font-['IBM_Plex_Mono'] text-xs">
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {[
                      { byte: "FE", label: "Preamble", color: "#4fc3f7" },
                      { byte: "FE", label: "Preamble", color: "#4fc3f7" },
                      { byte: "94", label: "Dest Addr", color: "#ffb300" },
                      { byte: "E0", label: "Src Addr", color: "#ffb300" },
                      { byte: "03", label: "Command", color: "#10b981" },
                      { byte: "...", label: "Data", color: "#94a3b8" },
                      { byte: "FD", label: "Terminator", color: "#ef4444" },
                    ].map((item, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div
                          className="px-2 py-1 rounded-sm text-[#0d1b2a] font-bold text-xs"
                          style={{ background: item.color }}
                        >
                          {item.byte}
                        </div>
                        <span className="text-[9px] text-[#94a3b8] text-center leading-tight max-w-[40px]">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </TechCornerBox>

              {/* Comandos comuns */}
              <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.6)]">
                <h3 className="font-['Space_Grotesk'] font-semibold text-[#4fc3f7] text-sm uppercase tracking-wider mb-3">
                  Comandos Implementados
                </h3>
                <table className="w-full text-xs font-['IBM_Plex_Mono']">
                  <thead>
                    <tr className="text-[#4fc3f7]/60">
                      <th className="text-left pb-2 font-medium">Cmd</th>
                      <th className="text-left pb-2 font-medium">Função</th>
                      <th className="text-left pb-2 font-medium">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#94a3b8]">
                    {[
                      { cmd: "0x03", func: "Ler Frequência", type: "Read" },
                      { cmd: "0x05", func: "Definir Frequência", type: "Write" },
                      { cmd: "0x04", func: "Ler Modo", type: "Read" },
                      { cmd: "0x06", func: "Definir Modo", type: "Write" },
                      { cmd: "0x1C", func: "Controle PTT", type: "Write" },
                    ].map((row) => (
                      <tr key={row.cmd} className="border-t border-[rgba(79,195,247,0.08)]">
                        <td className="py-1.5 text-[#ffb300]">{row.cmd}</td>
                        <td className="py-1.5">{row.func}</td>
                        <td className="py-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] ${
                              row.type === "Read"
                                ? "bg-[rgba(79,195,247,0.15)] text-[#4fc3f7]"
                                : "bg-[rgba(255,179,0,0.15)] text-[#ffb300]"
                            }`}
                          >
                            {row.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TechCornerBox>

              {/* Modelos suportados */}
              <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.6)]">
                <h3 className="font-['Space_Grotesk'] font-semibold text-[#4fc3f7] text-sm uppercase tracking-wider mb-3">
                  Modelos Icom Suportados
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {civModels.map((m) => (
                    <div
                      key={m.addr}
                      className="flex items-center gap-2 p-2 rounded-sm bg-[rgba(79,195,247,0.04)] border border-[rgba(79,195,247,0.08)]"
                    >
                      <span className="font-['IBM_Plex_Mono'] text-[10px] text-[#ffb300] font-medium">
                        {m.addr}
                      </span>
                      <div>
                        <div className="text-xs text-white font-medium font-['IBM_Plex_Sans']">
                          {m.model}
                        </div>
                        <div className="text-[10px] text-[#94a3b8]">{m.band}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </TechCornerBox>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ==================== TOPOLOGIA DE REDE ==================== */}
      <section className="py-20 border-t border-[rgba(79,195,247,0.08)]">
        <div className="container">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="mb-10"
          >
            <SectionLabel number="04" label="Topologia de Rede" />
            <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-3 mb-2">
              Arquitetura de Rede do Gateway
            </h2>
            <p className="text-[#94a3b8] text-base max-w-2xl font-['IBM_Plex_Sans']">
              O ESP32 opera simultaneamente como ponto de acesso WiFi (AP), cliente de rede
              local (STA) e servidor DHCP, criando uma rede isolada para os dispositivos
              de controle.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={1}
              variants={fadeUp}
              className="space-y-4"
            >
              <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.6)]">
                <h3 className="font-['Space_Grotesk'] font-semibold text-[#4fc3f7] text-sm uppercase tracking-wider mb-4">
                  Configuração Padrão de Rede
                </h3>
                <div className="space-y-2 font-['IBM_Plex_Mono'] text-xs">
                  {[
                    { key: "AP SSID", val: "ESP32-CIV-GW", color: "#4fc3f7" },
                    { key: "AP IP", val: "192.168.4.1", color: "#ffb300" },
                    { key: "Subnet", val: "255.255.255.0", color: "#94a3b8" },
                    { key: "DHCP Pool", val: "192.168.4.100 — 200", color: "#10b981" },
                    { key: "mDNS", val: "esp32-civ.local", color: "#4fc3f7" },
                    { key: "Web UI", val: "http://192.168.4.1/", color: "#ffb300" },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between py-1.5 border-b border-[rgba(79,195,247,0.06)]"
                    >
                      <span className="text-[#94a3b8]">{item.key}</span>
                      <span style={{ color: item.color }}>{item.val}</span>
                    </div>
                  ))}
                </div>
              </TechCornerBox>

              <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.6)]">
                <h3 className="font-['Space_Grotesk'] font-semibold text-[#4fc3f7] text-sm uppercase tracking-wider mb-3">
                  Especificações Técnicas
                </h3>
                <div className="grid grid-cols-1 gap-y-1.5 font-['IBM_Plex_Mono'] text-xs">
                  {specs.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-start justify-between gap-4 py-1 border-b border-[rgba(79,195,247,0.06)]"
                    >
                      <span className="text-[#94a3b8] flex-shrink-0">{s.label}</span>
                      <span className="text-white text-right">{s.value}</span>
                    </div>
                  ))}
                </div>
              </TechCornerBox>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663676318426/3yxnxmtQW9QeDjDTDDhyGY/network-topology-Rz2aiscFheXb58aZammiXg.webp"
                alt="Topologia de Rede ESP32"
                className="w-full rounded border border-[rgba(79,195,247,0.15)] shadow-lg shadow-[rgba(79,195,247,0.05)]"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ==================== PÁGINA DE CONFIGURAÇÃO ==================== */}
      <section className="py-20 border-t border-[rgba(79,195,247,0.08)]">
        <div className="container">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="mb-10"
          >
            <SectionLabel number="05" label="Interface Web" />
            <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-3 mb-2">
              Página de Configuração Embarcada
            </h2>
            <p className="text-[#94a3b8] text-base max-w-2xl font-['IBM_Plex_Sans']">
              Acesse <code className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-sm">http://192.168.4.1</code> após
              conectar ao AP do ESP32 para configurar todos os parâmetros do dispositivo
              diretamente pelo navegador.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663676318426/3yxnxmtQW9QeDjDTDDhyGY/esp32-config-panel-aHy4jSobHVqBYz59AbmqqJ.webp"
                alt="Página de Configuração ESP32"
                className="w-full rounded border border-[rgba(79,195,247,0.15)] shadow-lg"
              />
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={1}
              variants={fadeUp}
              className="space-y-3"
            >
              {[
                {
                  icon: Wifi,
                  title: "Configuração WiFi AP",
                  desc: "Altere o SSID, senha WPA2, endereço IP e máscara de sub-rede do ponto de acesso.",
                },
                {
                  icon: Network,
                  title: "Conexão a Rede Local",
                  desc: "Scan automático de redes disponíveis, conexão com WPA/WPA2 e suporte a IP estático.",
                },
                {
                  icon: Bluetooth,
                  title: "Controle Bluetooth",
                  desc: "Habilite/desabilite o Bluetooth e altere o nome de pareamento do dispositivo.",
                },
                {
                  icon: Radio,
                  title: "Endereço CI-V",
                  desc: "Selecione o endereço CI-V do transceiver conectado a partir de uma lista de modelos Icom.",
                },
                {
                  icon: Server,
                  title: "Pool DHCP",
                  desc: "Configure o intervalo de IPs distribuídos automaticamente para clientes WiFi.",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  custom={i}
                  variants={fadeUp}
                  className="flex items-start gap-3 p-3.5 rounded-sm border border-[rgba(79,195,247,0.1)] bg-[rgba(26,39,68,0.4)] hover:border-[rgba(79,195,247,0.25)] transition-colors"
                >
                  <div className="w-7 h-7 flex items-center justify-center rounded-sm bg-[rgba(79,195,247,0.1)] flex-shrink-0 mt-0.5">
                    <item.icon size={14} className="text-[#4fc3f7]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white font-['Space_Grotesk'] mb-0.5">
                      {item.title}
                    </div>
                    <div className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans'] leading-relaxed">
                      {item.desc}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ==================== CTA / DOWNLOAD ==================== */}
      <section className="py-20 border-t border-[rgba(79,195,247,0.08)]">
        <div className="container">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
          >
            <TechCornerBox className="p-10 bg-[rgba(26,39,68,0.5)] text-center max-w-3xl mx-auto">
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 flex items-center justify-center rounded-sm border border-[rgba(79,195,247,0.3)] bg-[rgba(79,195,247,0.08)]">
                  <Cpu size={28} className="text-[#4fc3f7]" />
                </div>
              </div>
              <SectionLabel number="06" label="Download" />
              <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-3 mb-3">
                Comece a usar agora
              </h2>
              <p className="text-[#94a3b8] text-base mb-8 max-w-xl mx-auto font-['IBM_Plex_Sans']">
                Baixe o firmware completo, instale as dependências no Arduino IDE e
                faça o upload para o seu ESP32. Consulte a documentação para o guia
                de instalação passo a passo.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="/manus-storage/ESP32_CIV_Gateway_3429e4d6.ino"
                  download="ESP32_CIV_Gateway.ino"
                  className="flex items-center gap-2 px-6 py-3 bg-[#4fc3f7] text-[#0d1b2a] font-bold text-sm rounded font-['IBM_Plex_Mono'] hover:bg-[#81d4fa] transition-colors active:scale-95"
                >
                  <Download size={16} />
                  Download ESP32_CIV_Gateway.ino
                </a>
                <Link
                  href="/docs"
                  className="flex items-center gap-2 px-6 py-3 border border-[rgba(79,195,247,0.3)] text-[#4fc3f7] font-semibold text-sm rounded font-['IBM_Plex_Mono'] hover:bg-[rgba(79,195,247,0.08)] transition-colors"
                >
                  <GitBranch size={16} />
                  Guia de Instalação
                </Link>
              </div>

              {/* Dependencies */}
              <div className="mt-8 pt-6 border-t border-[rgba(79,195,247,0.1)]">
                <p className="text-xs text-[#94a3b8] mb-3 font-['IBM_Plex_Mono'] uppercase tracking-wider">
                  Dependências (Arduino Library Manager)
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "ESP32 Arduino Core ≥ 2.0",
                    "ESPAsyncWebServer",
                    "AsyncTCP",
                    "ArduinoJson ≥ 6.x",
                    "BluetoothSerial (built-in)",
                  ].map((dep) => (
                    <span
                      key={dep}
                      className="px-2.5 py-1 text-xs font-['IBM_Plex_Mono'] text-[#4fc3f7] border border-[rgba(79,195,247,0.2)] rounded-sm bg-[rgba(79,195,247,0.05)]"
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            </TechCornerBox>
          </motion.div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="border-t border-[rgba(79,195,247,0.08)] py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-[#4fc3f7]/60" />
            <span className="text-xs text-[#94a3b8] font-['IBM_Plex_Mono']">
              ESP32 CI-V Gateway — Firmware Open Source
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="text-xs text-[#94a3b8] hover:text-[#4fc3f7] font-['IBM_Plex_Mono'] transition-colors">
              Documentação
            </Link>
            <Link href="/code" className="text-xs text-[#94a3b8] hover:text-[#4fc3f7] font-['IBM_Plex_Mono'] transition-colors">
              Código-Fonte
            </Link>
            <span className="text-xs text-[#4fc3f7]/40 font-['IBM_Plex_Mono']">MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
