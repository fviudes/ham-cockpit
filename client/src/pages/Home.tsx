/*
 * Home Page — ESP32 CI-V Gateway v1.0 COMPLETO
 * Design: Blueprint Técnico
 * Hero, features, pinagem, modelos Icom e CTA de download
 */
import { motion } from "framer-motion";
import { Download, Bluetooth, Wifi, Cpu, Radio, Zap, Settings, Code } from "lucide-react";
import { useLocation } from "wouter";
import NavBar from "@/components/NavBar";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col">
      <NavBar />

      {/* Hero Section */}
      <section className="pt-20 pb-16 border-b border-[rgba(79,195,247,0.1)]">
        <div className="container">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-xs font-bold">FIRMWARE OPEN SOURCE</span>
              <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest">v1.0 COMPLETO</span>
            </div>
            <h1 className="font-['Space_Grotesk'] font-bold text-6xl text-white mb-6 leading-tight">
              Gateway CI-V <span className="text-[#4fc3f7]">Icom</span> para ESP32
            </h1>
            <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-xl mb-8 leading-relaxed">
              Firmware ultra-otimizado para ESP32 com suporte a <strong>4 saídas CI-V físicas</strong>, Bluetooth SPP para controle remoto, configuração persistente via NVS e comandos via Serial. Apenas <strong>1.2 MB</strong>, cabe em qualquer ESP32 de 8 MB.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => navigate("/docs")}
                className="inline-flex items-center gap-2 px-8 py-4 border border-[#4fc3f7] text-[#4fc3f7] font-bold rounded-lg hover:bg-[rgba(79,195,247,0.1)] transition-colors"
              >
                <Code size={20} />
                Documentação
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 border-b border-[rgba(79,195,247,0.1)]">
        <div className="container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-xs font-bold">01</span>
              <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest">FUNCIONALIDADES</span>
            </div>
            <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
              Tudo que você precisa em um único firmware
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[
              { icon: Bluetooth, title: "Bluetooth SPP", desc: "Controle remoto via aplicativos de controle CI-V (RigControl, SDR Touch, etc.)" },
              { icon: Radio, title: "4 Saídas CI-V", desc: "Conecte até 4 rádios Icom diferentes simultaneamente via GPIO" },
              { icon: Wifi, title: "WiFi AP + DHCP", desc: "Crie uma rede WiFi própria com servidor DHCP integrado" },
              { icon: Settings, title: "Configuração Web", desc: "Interface web em http://192.168.4.1 para configurar tudo" },
              { icon: Cpu, title: "API REST JSON", desc: "Endpoints HTTP para integração com sistemas customizados" },
              { icon: Zap, title: "Comandos Serial", desc: "Configure via Monitor Serial com comandos simples e intuitivos" },
              { icon: Code, title: "Código Aberto", desc: "Firmware 100% open source, customizável e extensível" },
              { icon: Download, title: "Apenas 1.2 MB", desc: "Cabe em qualquer ESP32 de 4 MB ou superior" },
            ].map((feature, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="p-6 border border-[rgba(79,195,247,0.18)] rounded-sm hover:border-[#4fc3f7]/50 transition-colors group"
              >
                <feature.icon size={32} className="text-[#4fc3f7] mb-4 group-hover:text-[#FFB300] transition-colors" />
                <h3 className="font-['Space_Grotesk'] font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">{feature.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pinagem Section */}
      <section className="py-16 border-b border-[rgba(79,195,247,0.1)]">
        <div className="container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-xs font-bold">02</span>
              <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest">PINAGEM</span>
            </div>
            <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
              4 Saídas CI-V Físicas
            </h2>
            <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-lg mt-3">
              Cada porta pode ser configurada independentemente com baud rate e endereço CI-V diferentes
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {[
              { port: "PORT 1", uart: "UART1", rx: "GPIO 9", tx: "GPIO 10" },
              { port: "PORT 2", uart: "UART2", rx: "GPIO 16", tx: "GPIO 17" },
              { port: "PORT 3", uart: "UART0", rx: "GPIO 3", tx: "GPIO 1" },
              { port: "PORT 4", uart: "GPIO", rx: "GPIO 14", tx: "GPIO 15" },
            ].map((p, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="p-4 bg-[rgba(79,195,247,0.05)] border border-[#4fc3f7]/20 rounded-sm"
              >
                <p className="font-['Space_Grotesk'] font-bold text-[#4fc3f7] mb-3">{p.port}</p>
                <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans'] mb-2">
                  <strong>UART:</strong> {p.uart}
                </p>
                <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans'] mb-1">
                  <strong>RX:</strong> {p.rx}
                </p>
                <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans']">
                  <strong>TX:</strong> {p.tx}
                </p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="mt-8 p-4 bg-[rgba(255,179,0,0.08)] border border-[#FFB300]/30 rounded-sm"
          >
            <p className="text-sm text-[#e2e8f0] font-['IBM_Plex_Sans']">
              <strong>⚠️ Importante:</strong> Use um conversor de nível lógico 3.3V ↔ 5V para cada porta CI-V. O ESP32 opera em 3.3V e os rádios Icom em 5V.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Modelos Icom Section */}
      <section className="py-16 border-b border-[rgba(79,195,247,0.1)]">
        <div className="container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-xs font-bold">03</span>
              <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest">MODELOS ICOM</span>
            </div>
            <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
              Endereços CI-V Pré-Configurados
            </h2>
            <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-lg mt-3">
              Suporte a 8 modelos populares. Outros modelos podem ser configurados manualmente
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {[
              { model: "IC-7300", addr: "0x94" },
              { model: "IC-7100", addr: "0x18" },
              { model: "IC-7610", addr: "0x76" },
              { model: "IC-705", addr: "0x98" },
              { model: "IC-9700", addr: "0x88" },
              { model: "IC-7000", addr: "0x70" },
              { model: "IC-706", addr: "0x48" },
              { model: "IC-2730", addr: "0x39" },
            ].map((m, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="p-4 bg-[rgba(79,195,247,0.05)] border border-[#4fc3f7]/20 rounded-sm text-center"
              >
                <p className="font-['Space_Grotesk'] font-bold text-white mb-2">{m.model}</p>
                <p className="text-sm text-[#4fc3f7] font-['IBM_Plex_Mono']">{m.addr}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center"
          >
            <h2 className="font-['Space_Grotesk'] font-bold text-4xl text-white mb-6">Comece Agora</h2>
            <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-lg mb-8 max-w-2xl mx-auto">
              Baixe o firmware, siga o guia de instalação e configure seu ESP32 em menos de 10 minutos
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <button
                onClick={() => navigate("/docs")}
                className="inline-flex items-center gap-2 px-8 py-4 border border-[#4fc3f7] text-[#4fc3f7] font-bold rounded-lg hover:bg-[rgba(79,195,247,0.1)] transition-colors"
              >
                Ler Documentação
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
