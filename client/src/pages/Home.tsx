/*
 * Home Page — ESP32 CI-V Gateway
 * Design: Blueprint Técnico
 * Apresentação do firmware v1.0 COMPLETO com Bluetooth + WiFi AP + WebServer + 4 saídas CI-V
 */
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Wifi, Bluetooth, Server, Settings, Radio, Network,
  Download, ChevronRight, Cpu, Zap, BookOpen, Code, Plus, Globe, Lock
} from "lucide-react";
import NavBar from "@/components/NavBar";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col">
      <NavBar />
      <div className="pt-14">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(45deg, transparent 48%, #4fc3f7 49%, #4fc3f7 51%, transparent 52%),
                                linear-gradient(-45deg, transparent 48%, #4fc3f7 49%, #4fc3f7 51%, transparent 52%)`,
              backgroundSize: "60px 60px",
            }}
          />
          <div className="container relative z-10">
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="max-w-3xl">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={20} className="text-[#4fc3f7]" />
                <span className="text-xs font-['IBM_Plex_Mono'] text-[#4fc3f7]/60 tracking-widest uppercase">
                  Firmware Open Source — v1.0 COMPLETO
                </span>
              </div>
              <h1 className="font-['Space_Grotesk'] font-bold text-5xl leading-tight text-white mb-4">
                Gateway CI-V <span className="text-[#4fc3f7]">Icom</span> para ESP32
              </h1>
              <p className="text-[#94a3b8] text-lg leading-relaxed font-['IBM_Plex_Sans'] mb-8">
                Firmware completo para ESP32 com suporte a <strong className="text-[#FFB300]">Bluetooth SPP</strong>, <strong className="text-[#FFB300]">WiFi AP</strong>, <strong className="text-[#FFB300]">WebServer</strong>, <strong className="text-[#FFB300]">4 saídas CI-V físicas</strong>, configuração persistente via NVS e API REST JSON. Otimizado para ESP32 com 8 MB de Flash.
              </p>
              <div className="flex gap-4 flex-wrap">
                <Link href="/docs">
                  <a className="inline-flex items-center gap-2 px-6 py-3 bg-[#4fc3f7] text-[#0d1b2a] font-bold rounded-lg hover:bg-[#80d8ff] transition-colors">
                    <BookOpen size={18} />
                    Documentação
                  </a>
                </Link>
                <Link href="/code">
                  <a className="inline-flex items-center gap-2 px-6 py-3 border border-[#4fc3f7] text-[#4fc3f7] font-bold rounded-lg hover:bg-[#4fc3f7]/10 transition-colors">
                    <Code size={18} />
                    Ver Código
                  </a>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 border-t border-[#4fc3f7]/20">
          <div className="container">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-sm font-bold">01</span>
                <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest uppercase">Funcionalidades</span>
              </div>
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
                Tudo que você precisa em um único firmware
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  icon: Bluetooth,
                  title: "Bluetooth SPP",
                  desc: "Controle remoto via aplicativos de controle CI-V (RigControl, SDR Touch, etc.)",
                },
                {
                  icon: Wifi,
                  title: "WiFi Access Point",
                  desc: "Cria rede WiFi própria com DHCP integrado para configuração remota",
                },
                {
                  icon: Server,
                  title: "WebServer Integrado",
                  desc: "Interface web de configuração em tempo real via navegador",
                },
                {
                  icon: Plus,
                  title: "4 Saídas CI-V Físicas",
                  desc: "Conecte até 4 rádios Icom diferentes simultaneamente via GPIO do ESP32",
                },
                {
                  icon: Settings,
                  title: "Configuração Persistente",
                  desc: "Todas as configurações salvas em NVS (Non-Volatile Storage) do ESP32",
                },
                {
                  icon: Radio,
                  title: "Protocolo CI-V Icom",
                  desc: "Bridge bidirecional entre Bluetooth e porta CI-V com suporte a 8 modelos",
                },
                {
                  icon: Zap,
                  title: "Comandos via Serial",
                  desc: "Configure tudo via Monitor Serial sem necessidade de interface web",
                },
                {
                  icon: Cpu,
                  title: "API REST JSON",
                  desc: "Endpoints HTTP para integração com aplicações externas",
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                  className="p-6 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50 hover:border-[#4fc3f7] transition-colors"
                >
                  <feature.icon className="text-[#4fc3f7] mb-3" size={24} />
                  <h3 className="font-['Space_Grotesk'] font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-[#94a3b8] text-sm font-['IBM_Plex_Sans']">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Arquitetura Section */}
        <section className="py-20 border-t border-[#4fc3f7]/20 bg-[#0a1118]">
          <div className="container">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-sm font-bold">02</span>
                <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest uppercase">Arquitetura</span>
              </div>
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
                Topologia de Rede e Conectividade
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Network Topology */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="p-6 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50"
              >
                <h3 className="font-['Space_Grotesk'] font-bold text-[#4fc3f7] mb-4">Topologia de Rede</h3>
                <div className="space-y-4 text-sm font-['IBM_Plex_Sans']">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#4fc3f7]/20 flex items-center justify-center">
                      <Wifi size={16} className="text-[#4fc3f7]" />
                    </div>
                    <div>
                      <p className="text-white font-bold">WiFi AP</p>
                      <p className="text-[#94a3b8] text-xs">SSID: ESP32-CIV | IP: 192.168.4.1</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#4fc3f7]/20 flex items-center justify-center">
                      <Bluetooth size={16} className="text-[#4fc3f7]" />
                    </div>
                    <div>
                      <p className="text-white font-bold">Bluetooth SPP</p>
                      <p className="text-[#94a3b8] text-xs">Pareamento aberto | Sem senha</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#4fc3f7]/20 flex items-center justify-center">
                      <Server size={16} className="text-[#4fc3f7]" />
                    </div>
                    <div>
                      <p className="text-white font-bold">WebServer</p>
                      <p className="text-[#94a3b8] text-xs">http://192.168.4.1 | API REST</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#4fc3f7]/20 flex items-center justify-center">
                      <Radio size={16} className="text-[#4fc3f7]" />
                    </div>
                    <div>
                      <p className="text-white font-bold">CI-V Bridge</p>
                      <p className="text-[#94a3b8] text-xs">4 portas UART | Bidirecional</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Conexão Física */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="p-6 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50"
              >
                <h3 className="font-['Space_Grotesk'] font-bold text-[#4fc3f7] mb-4">Conexão Física</h3>
                <div className="space-y-3 text-sm font-['IBM_Plex_Sans']">
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded">
                    <p className="text-[#FFB300] font-bold">ESP32 ↔ Rádio Icom</p>
                    <p className="text-[#94a3b8] text-xs mt-1">Conversor 3.3V ↔ 5V (obrigatório)</p>
                  </div>
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded">
                    <p className="text-[#FFB300] font-bold">Smartphone/Tablet</p>
                    <p className="text-[#94a3b8] text-xs mt-1">Conecta via Bluetooth SPP ou WiFi</p>
                  </div>
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded">
                    <p className="text-[#FFB300] font-bold">Computador</p>
                    <p className="text-[#94a3b8] text-xs mt-1">Acessa WebServer em 192.168.4.1</p>
                  </div>
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded">
                    <p className="text-[#FFB300] font-bold">Monitor Serial</p>
                    <p className="text-[#94a3b8] text-xs mt-1">Configuração via comandos (115200 bps)</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Pinagem Section */}
        <section className="py-20 border-t border-[#4fc3f7]/20">
          <div className="container">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-sm font-bold">03</span>
                <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest uppercase">Pinagem</span>
              </div>
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
                4 Saídas CI-V Físicas
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { port: "PORT 1", uart: "UART1", rx: "GPIO 9", tx: "GPIO 10" },
                { port: "PORT 2", uart: "UART2", rx: "GPIO 16", tx: "GPIO 17" },
                { port: "PORT 3", uart: "UART0", rx: "GPIO 3", tx: "GPIO 1" },
                { port: "PORT 4", uart: "GPIO", rx: "GPIO 14", tx: "GPIO 15" },
              ].map((port, i) => (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                  className="p-6 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-['Space_Grotesk'] font-bold text-[#4fc3f7] text-lg">{port.port}</h3>
                    <span className="text-[#94a3b8] text-xs font-['IBM_Plex_Mono']">{port.uart}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[#94a3b8] font-['IBM_Plex_Sans']">RX:</span>
                      <span className="text-white font-['IBM_Plex_Mono'] font-bold">{port.rx}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#94a3b8] font-['IBM_Plex_Sans']">TX:</span>
                      <span className="text-white font-['IBM_Plex_Mono'] font-bold">{port.tx}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mt-8 p-4 bg-[#FFB300]/10 border border-[#FFB300]/30 rounded-lg"
            >
              <p className="text-[#FFB300] font-['IBM_Plex_Sans'] text-sm">
                <strong>⚠️ Importante:</strong> Use um conversor de nível lógico 3.3V↔5V para cada porta CI-V para proteger o ESP32 contra tensões de 5V dos rádios Icom.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Modelos Suportados */}
        <section className="py-20 border-t border-[#4fc3f7]/20 bg-[#0a1118]">
          <div className="container">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-sm font-bold">04</span>
                <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest uppercase">Modelos Icom</span>
              </div>
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
                8 Modelos Pré-Configurados
              </h2>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { model: "IC-7300", addr: "0x94" },
                { model: "IC-7100", addr: "0x18" },
                { model: "IC-7610", addr: "0x76" },
                { model: "IC-705", addr: "0x98" },
                { model: "IC-9700", addr: "0x88" },
                { model: "IC-7000", addr: "0x70" },
                { model: "IC-706", addr: "0x48" },
                { model: "IC-2730", addr: "0x39" },
              ].map((model, i) => (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                  className="p-4 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50 text-center"
                >
                  <p className="font-['Space_Grotesk'] font-bold text-white mb-1">{model.model}</p>
                  <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs">{model.addr}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Especificações */}
        <section className="py-20 border-t border-[#4fc3f7]/20">
          <div className="container">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mb-12"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-sm font-bold">05</span>
                <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest uppercase">Especificações</span>
              </div>
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
                Detalhes Técnicos
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="p-6 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50"
              >
                <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-4">Hardware</h3>
                <ul className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">
                  <li>• ESP32 (8 MB Flash recomendado)</li>
                  <li>• 4 Portas UART</li>
                  <li>• Bluetooth SPP</li>
                  <li>• WiFi 802.11 b/g/n</li>
                  <li>• LED Status (GPIO 2)</li>
                </ul>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="p-6 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50"
              >
                <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-4">Software</h3>
                <ul className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">
                  <li>• Arduino IDE 2.0+</li>
                  <li>• ESP32 Core 2.0.11+</li>
                  <li>• ArduinoJson 6.21.0</li>
                  <li>• Bibliotecas nativas</li>
                  <li>• NVS Storage</li>
                </ul>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="p-6 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50"
              >
                <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-4">Conectividade</h3>
                <ul className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">
                  <li>• Bluetooth: SPP (pareamento)</li>
                  <li>• WiFi: AP + DHCP</li>
                  <li>• WebServer: HTTP</li>
                  <li>• Serial: 115200 bps</li>
                  <li>• API: REST JSON</li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 border-t border-[#4fc3f7]/20 bg-[#0a1118]">
          <div className="container">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center max-w-2xl mx-auto"
            >
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white mb-4">
                Comece Agora
              </h2>
              <p className="text-[#94a3b8] text-lg font-['IBM_Plex_Sans'] mb-8">
                Acesse a documentação completa para instalar e configurar o firmware no seu ESP32 com 8 MB de Flash.
              </p>
              <Link href="/docs">
                <a className="inline-flex items-center gap-2 px-8 py-4 bg-[#4fc3f7] text-[#0d1b2a] font-bold rounded-lg hover:bg-[#80d8ff] transition-colors">
                  <Download size={20} />
                  Baixar Firmware v1.0 COMPLETO
                  <ChevronRight size={20} />
                </a>
              </Link>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  );
}
