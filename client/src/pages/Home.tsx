/*
 * Home Page — ESP32 CI-V Gateway
 * Design: Blueprint Técnico
 * Apresentação do firmware v3.1 QUAD com 4 saídas CI-V físicas
 */
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Wifi, Bluetooth, Server, Settings, Radio, Network,
  Download, ChevronRight, Cpu, Zap, BookOpen, Code, Plus
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
                  Firmware Open Source — v3.1 QUAD
                </span>
              </div>
              <h1 className="font-['Space_Grotesk'] font-bold text-5xl leading-tight text-white mb-4">
                Gateway CI-V <span className="text-[#4fc3f7]">Icom</span> para ESP32
              </h1>
              <p className="text-[#94a3b8] text-lg leading-relaxed font-['IBM_Plex_Sans'] mb-8">
                Firmware ultra-otimizado para ESP32 com suporte a <strong className="text-[#FFB300]">4 saídas CI-V físicas</strong>, Bluetooth SPP para controle remoto, configuração persistente via NVS e comandos via Serial. Apenas <strong className="text-[#FFB300]">140 KB</strong>, cabe em qualquer ESP32 de 4 MB.
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
                  title: "Ultra-Otimizado",
                  desc: "Apenas 140 KB de tamanho, cabe em qualquer ESP32 de 4 MB",
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

        {/* Pinagem Section */}
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

        {/* Versões Section */}
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
                <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest uppercase">Versões</span>
              </div>
              <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
                Escolha a versão ideal para seu caso
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { v: "1.0", size: "150 KB", features: "Bluetooth + CI-V", color: "border-[#4fc3f7]/30" },
                { v: "2.0", size: "220 KB", features: "WiFi + Bluetooth + WebServer", color: "border-[#4fc3f7]/30" },
                { v: "2.1", size: "180 KB", features: "WiFi + Bluetooth (sem Web)", color: "border-[#4fc3f7]/30" },
                { v: "3.1 QUAD", size: "140 KB", features: "4 Saídas CI-V + Bluetooth", color: "border-[#FFB300]" },
              ].map((ver, i) => (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                  className={`p-6 border ${ver.color} rounded-lg bg-[#0d1b2a]/50 ${ver.v === "3.1 QUAD" ? "ring-2 ring-[#FFB300]/50" : ""}`}
                >
                  <h3 className="font-['Space_Grotesk'] font-bold text-white text-xl mb-2">v{ver.v}</h3>
                  <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-sm font-bold mb-2">{ver.size}</p>
                  <p className="text-[#94a3b8] text-xs font-['IBM_Plex_Sans']">{ver.features}</p>
                </motion.div>
              ))}
            </div>
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

        {/* CTA Section */}
        <section className="py-20 border-t border-[#4fc3f7]/20">
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
                Acesse a documentação completa para instalar e configurar o firmware no seu ESP32.
              </p>
              <Link href="/docs">
                <a className="inline-flex items-center gap-2 px-8 py-4 bg-[#4fc3f7] text-[#0d1b2a] font-bold rounded-lg hover:bg-[#80d8ff] transition-colors">
                  <Download size={20} />
                  Baixar Firmware v3.1 QUAD
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
