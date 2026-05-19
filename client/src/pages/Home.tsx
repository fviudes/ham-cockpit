/*
 * Home Page — ESP32 CI-V Gateway
 * Design: Blueprint Técnico
 * Apresentação do firmware v4.0 MINIMAL com hero, features e CTA
 */
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Wifi, Bluetooth, Server, Settings, Radio, Network,
  Download, ChevronRight, Cpu, Zap, BookOpen, Code
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
                  Firmware Open Source — v4.0 MINIMAL
                </span>
              </div>
              <h1 className="font-['Space_Grotesk'] font-bold text-5xl leading-tight text-white mb-4">
                Gateway CI-V <span className="text-[#4fc3f7]">Icom</span> para ESP32
              </h1>
              <p className="text-[#94a3b8] text-lg leading-relaxed font-['IBM_Plex_Sans'] mb-8">
                Firmware ultra-otimizado para ESP32 com integração do protocolo CI-V da Icom, Bluetooth SPP, WiFi AP com DHCP, interface web de configuração e API REST. Compilado com WebServer nativa — apenas 450 KB, cabe em qualquer ESP32 de 4 MB.
              </p>
              <div className="flex gap-3 flex-wrap">
                <Link href="/codigo-fonte">
                  <a className="inline-flex items-center gap-2 px-6 py-3 bg-[#4fc3f7] text-[#0d1b2a] font-bold rounded hover:bg-[#81d4fa] transition-colors">
                    <Download size={16} />
                    Download v4.0 MINIMAL
                  </a>
                </Link>
                <Link href="/documentacao">
                  <a className="inline-flex items-center gap-2 px-6 py-3 border border-[#4fc3f7] text-[#4fc3f7] font-bold rounded hover:bg-[rgba(79,195,247,0.1)] transition-colors">
                    <BookOpen size={16} />
                    Documentação
                  </a>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 bg-[rgba(79,195,247,0.02)] border-y border-[rgba(79,195,247,0.1)]">
          <div className="container">
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-12">
              <span className="text-xs font-['IBM_Plex_Mono'] text-[#4fc3f7]/60 tracking-widest uppercase">
                02 — Funcionalidades
              </span>
              <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-2">
                Tudo que você precisa em um único firmware
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  icon: Bluetooth,
                  label: "Bluetooth SPP",
                  desc: "Conecte aplicativos de controle remoto via Bluetooth Classic (RigControl, SDR Touch, etc.)",
                },
                {
                  icon: Wifi,
                  label: "WiFi AP",
                  desc: "Crie sua própria rede WiFi (ESP32-CIV-GW) com IP estático configurável",
                },
                {
                  icon: Zap,
                  label: "Servidor DHCP",
                  desc: "Clientes WiFi recebem IP automaticamente no intervalo configurado",
                },
                {
                  icon: Radio,
                  label: "Protocolo CI-V",
                  desc: "Bridge bidirecional com radios Icom (8 modelos pré-configurados)",
                },
                {
                  icon: Settings,
                  label: "Web Config",
                  desc: "Interface minimalista mas completa via navegador — 4 abas de configuração",
                },
                {
                  icon: Server,
                  label: "Persistência NVS",
                  desc: "Todas as configurações salvas na memória Flash — sobrevivem a reinicializações",
                },
              ].map((f, i) => (
                <motion.div key={i} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                  <div className="p-4 border border-[rgba(79,195,247,0.15)] rounded-sm bg-[rgba(26,39,68,0.3)] hover:bg-[rgba(26,39,68,0.5)] transition-colors">
                    <div className="flex items-start gap-3">
                      <f.icon size={20} className="text-[#4fc3f7] flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-['Space_Grotesk'] font-semibold text-white mb-1">{f.label}</h3>
                        <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans']">{f.desc}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Specs Section */}
        <section className="py-16">
          <div className="container">
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-12">
              <span className="text-xs font-['IBM_Plex_Mono'] text-[#4fc3f7]/60 tracking-widest uppercase">
                03 — Especificações Técnicas
              </span>
              <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-2">
                Ultra-Otimizado com WebServer Nativa
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  label: "Tamanho do Firmware",
                  value: "~450 KB",
                  detail: "v4.0 MINIMAL — 37% do espaço disponível",
                },
                {
                  label: "Memória RAM Usada",
                  value: "~28 KB",
                  detail: "Deixa ~300 KB livres para aplicações",
                },
                {
                  label: "Bibliotecas",
                  value: "Apenas 1",
                  detail: "ArduinoJson 6.21.0 — sem ESPAsyncWebServer",
                },
              ].map((s, i) => (
                <motion.div key={i} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                  <div className="text-center p-6 border border-[rgba(79,195,247,0.15)] rounded-sm bg-[rgba(26,39,68,0.3)]">
                    <div className="text-3xl font-bold text-[#4fc3f7] mb-2">{s.value}</div>
                    <div className="font-['Space_Grotesk'] font-semibold text-white mb-1">{s.label}</div>
                    <div className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans']">{s.detail}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Modelos Icom Suportados */}
        <section className="py-16 bg-[rgba(79,195,247,0.02)] border-y border-[rgba(79,195,247,0.1)]">
          <div className="container">
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-12">
              <span className="text-xs font-['IBM_Plex_Mono'] text-[#4fc3f7]/60 tracking-widest uppercase">
                04 — Modelos Icom Suportados
              </span>
              <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-2">
                8 Modelos Pré-Configurados
              </h2>
            </motion.div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["IC-7300", "IC-7100", "IC-7610", "IC-705", "IC-9700", "IC-746PRO", "IC-756PRO", "IC-910H"].map(
                (model, i) => (
                  <motion.div key={i} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                    <div className="p-4 text-center border border-[rgba(79,195,247,0.15)] rounded-sm bg-[rgba(26,39,68,0.3)]">
                      <div className="font-['IBM_Plex_Mono'] font-semibold text-[#4fc3f7]">{model}</div>
                    </div>
                  </motion.div>
                )
              )}
            </div>
          </div>
        </section>

        {/* Quick Start */}
        <section className="py-16">
          <div className="container">
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-12">
              <span className="text-xs font-['IBM_Plex_Mono'] text-[#4fc3f7]/60 tracking-widest uppercase">
                05 — Início Rápido
              </span>
              <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mt-2">
                5 Passos para Começar
              </h2>
            </motion.div>
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Remova ESPAsyncWebServer",
                  desc: "Desinstale ESPAsyncWebServer, AsyncTCP e ArduinoJson antigo via Gerenciador de Bibliotecas",
                },
                {
                  step: "2",
                  title: "Instale ArduinoJson",
                  desc: "Instale ArduinoJson versão 6.21.0 via Gerenciador de Bibliotecas",
                },
                {
                  step: "3",
                  title: "Download do Firmware",
                  desc: "Baixe ESP32_CIV_Gateway_Minimal.ino e abra no Arduino IDE",
                },
                {
                  step: "4",
                  title: "Compile e Upload",
                  desc: "Selecione ESP32 Dev Module, partição Default 4MB, e faça upload",
                },
                {
                  step: "5",
                  title: "Configure",
                  desc: "Acesse http://192.168.4.1 e configure Bluetooth e CI-V",
                },
              ].map((item, i) => (
                <motion.div key={i} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                  <div className="flex gap-4 p-4 border border-[rgba(79,195,247,0.15)] rounded-sm bg-[rgba(26,39,68,0.3)]">
                    <div className="w-8 h-8 flex items-center justify-center rounded-sm bg-[rgba(79,195,247,0.15)] text-[#4fc3f7] font-bold flex-shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h3 className="font-['Space_Grotesk'] font-semibold text-white">{item.title}</h3>
                      <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans']">{item.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 border-t border-[rgba(79,195,247,0.1)]">
          <div className="container text-center">
            <motion.div initial="hidden" animate="visible" variants={fadeUp}>
              <h2 className="font-['Space_Grotesk'] font-bold text-3xl text-white mb-4">
                Pronto para Começar?
              </h2>
              <p className="text-[#94a3b8] text-lg mb-8 font-['IBM_Plex_Sans'] max-w-xl mx-auto">
                Baixe a versão v4.0 MINIMAL, remova ESPAsyncWebServer, instale ArduinoJson, e faça upload. Leva menos de 5 minutos!
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Link href="/codigo-fonte">
                  <a className="inline-flex items-center gap-2 px-8 py-4 bg-[#4fc3f7] text-[#0d1b2a] font-bold text-lg rounded hover:bg-[#81d4fa] transition-colors">
                    <Download size={20} />
                    Download v4.0 MINIMAL
                  </a>
                </Link>
                <Link href="/documentacao">
                  <a className="inline-flex items-center gap-2 px-8 py-4 border border-[#4fc3f7] text-[#4fc3f7] font-bold text-lg rounded hover:bg-[rgba(79,195,247,0.1)] transition-colors">
                    <BookOpen size={20} />
                    Guia de Instalação
                  </a>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[rgba(79,195,247,0.08)] py-6 mt-auto">
          <div className="container text-center">
            <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Mono']">
              ESP32 CI-V Gateway v4.0 MINIMAL — Firmware Open Source — MIT License
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
