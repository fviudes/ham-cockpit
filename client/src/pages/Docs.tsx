/*
 * Docs Page — ESP32 CI-V Gateway v3.1 QUAD
 * Design: Blueprint Técnico
 * Documentação técnica completa com guia de instalação e 4 saídas CI-V
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, AlertTriangle, CheckCircle, Info, Terminal } from "lucide-react";
import NavBar from "@/components/NavBar";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.45, delay: i * 0.06, ease: "easeOut" as const },
  }),
};

function TechCornerBox({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-[rgba(79,195,247,0.18)] rounded-sm ${className}`}>
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#4fc3f7]/60 rounded-tl-sm" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#4fc3f7]/60 rounded-br-sm" />
      {children}
    </div>
  );
}

function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]/60 tracking-[0.15em] uppercase">{number}</span>
      <div className="h-px flex-1 max-w-[40px] bg-[rgba(79,195,247,0.2)]" />
      <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]/60 tracking-[0.12em] uppercase">{label}</span>
    </div>
  );
}

function Alert({ type, children }: { type: "info" | "warning" | "success"; children: React.ReactNode }) {
  const styles = {
    info: { bg: "rgba(79,195,247,0.08)", border: "rgba(79,195,247,0.25)", icon: Info, color: "#4fc3f7" },
    warning: { bg: "rgba(255,179,0,0.08)", border: "rgba(255,179,0,0.25)", icon: AlertTriangle, color: "#ffb300" },
    success: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", icon: CheckCircle, color: "#10b981" },
  }[type];
  return (
    <div className="flex gap-3 p-4 rounded-sm my-4" style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
      <styles.icon size={16} style={{ color: styles.color }} className="flex-shrink-0 mt-0.5" />
      <div className="text-sm text-[#e2e8f0] font-['IBM_Plex_Sans'] leading-relaxed">{children}</div>
    </div>
  );
}

function CodeSnippet({ code, lang = "cpp" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative my-4 rounded-sm overflow-hidden border border-[rgba(79,195,247,0.12)]">
      <div className="flex items-center justify-between px-4 py-2 bg-[rgba(11,20,35,0.9)] border-b border-[rgba(79,195,247,0.1)]">
        <span className="text-[10px] text-[#4fc3f7]/50 font-['IBM_Plex_Mono'] uppercase tracking-widest">{lang}</span>
        <button
          onClick={copy}
          className="text-[10px] text-[#94a3b8] hover:text-[#4fc3f7] font-['IBM_Plex_Mono'] transition-colors"
        >
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="p-4 bg-[rgba(11,20,35,0.7)] overflow-x-auto text-xs font-['IBM_Plex_Mono'] leading-relaxed text-[#e2e8f0]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const sections = [
  { id: "visao", label: "Visão Geral" },
  { id: "requisitos", label: "Requisitos" },
  { id: "instalacao", label: "Instalação" },
  { id: "pinagem", label: "Pinagem" },
  { id: "comandos", label: "Comandos" },
  { id: "modelos", label: "Modelos Icom" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export default function Docs() {
  const [activeSection, setActiveSection] = useState("visao");

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col">
      <NavBar />
      <div className="pt-14">
        <div className="container py-12">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-xs font-bold">DOCS</span>
              <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest">v3.1 QUAD</span>
            </div>
            <h1 className="font-['Space_Grotesk'] font-bold text-4xl text-white">
              Documentação Técnica
            </h1>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-20">
                <TechCornerBox className="p-4">
                  <nav className="space-y-2">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`w-full text-left px-3 py-2 text-sm font-['IBM_Plex_Sans'] transition-colors ${
                          activeSection === section.id
                            ? "text-[#4fc3f7] bg-[rgba(79,195,247,0.1)]"
                            : "text-[#94a3b8] hover:text-[#4fc3f7]"
                        }`}
                      >
                        {section.label}
                      </button>
                    ))}
                  </nav>
                </TechCornerBox>
              </div>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">
              {/* Visão Geral */}
              {activeSection === "visao" && (
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                  <SectionLabel number="01" label="Visão Geral" />
                  <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] leading-relaxed">
                    O <strong className="text-[#e2e8f0]">ESP32 CI-V Gateway v3.1 QUAD</strong> é um firmware ultra-otimizado que transforma um ESP32 em um gateway de controle para rádios Icom. Suporta até <strong className="text-[#FFB300]">4 saídas CI-V físicas</strong> simultâneas, permitindo controlar múltiplos rádios via Bluetooth SPP.
                  </p>
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <TechCornerBox className="p-4">
                      <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold mb-1">Tamanho</p>
                      <p className="text-white font-['Space_Grotesk'] font-bold text-lg">140 KB</p>
                      <p className="text-[#94a3b8] text-xs mt-1">11% do espaço disponível</p>
                    </TechCornerBox>
                    <TechCornerBox className="p-4">
                      <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold mb-1">Saídas CI-V</p>
                      <p className="text-white font-['Space_Grotesk'] font-bold text-lg">4 Portas</p>
                      <p className="text-[#94a3b8] text-xs mt-1">UART1, UART2, UART0, GPIO</p>
                    </TechCornerBox>
                  </div>
                </motion.div>
              )}

              {/* Requisitos */}
              {activeSection === "requisitos" && (
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                  <SectionLabel number="02" label="Requisitos" />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-2">Hardware</h3>
                      <ul className="space-y-2 text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">
                        <li>• ESP32 DevKit com 4 MB de Flash</li>
                        <li>• Cabo USB para programação</li>
                        <li>• 4x Conversor de nível lógico 3.3V↔5V (recomendado)</li>
                        <li>• Conectores para CI-V dos rádios</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-2">Software</h3>
                      <ul className="space-y-2 text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">
                        <li>• Arduino IDE ≥ 2.0</li>
                        <li>• ESP32 Arduino Core ≥ 2.0.0</li>
                        <li>• Nenhuma biblioteca externa necessária</li>
                      </ul>
                    </div>
                  </div>
                  <Alert type="warning">
                    Remova todas as bibliotecas externas (ESPAsyncWebServer, AsyncTCP, ArduinoJson) antes de compilar.
                  </Alert>
                </motion.div>
              )}

              {/* Instalação */}
              {activeSection === "instalacao" && (
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                  <SectionLabel number="03" label="Instalação" />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-3">Passo 1: Configurar Arduino IDE</h3>
                      <CodeSnippet code={`Ferramentas:
  Placa: ESP32 Dev Module
  Upload Speed: 921600
  CPU Frequency: 240 MHz
  Flash Size: 4MB
  Partition Scheme: Default 4MB with spiffs
  Port: COM3 (ou sua porta)`} lang="config" />
                    </div>
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-3">Passo 2: Abrir Arquivo</h3>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm mb-2">
                        File → Open → ESP32_CIV_v3_1_Quad.ino
                      </p>
                    </div>
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-3">Passo 3: Compilar</h3>
                      <CodeSnippet code={`Sketch → Compile

Resultado esperado:
Sketch uses 135678 bytes (10%) of program storage space.
Global variables use 28456 bytes (8%) of dynamic memory.`} lang="terminal" />
                    </div>
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-3">Passo 4: Upload</h3>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">
                        Sketch → Upload
                      </p>
                    </div>
                  </div>
                  <Alert type="success">
                    Se o percentual for menor que 50%, está pronto para upload!
                  </Alert>
                </motion.div>
              )}

              {/* Pinagem */}
              {activeSection === "pinagem" && (
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                  <SectionLabel number="04" label="Pinagem" />
                  <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm mb-4">
                    O ESP32 possui 4 saídas CI-V físicas independentes, cada uma em um UART diferente:
                  </p>
                  <div className="space-y-3">
                    {[
                      { port: "PORT 1", uart: "UART1", rx: "GPIO 9", tx: "GPIO 10" },
                      { port: "PORT 2", uart: "UART2", rx: "GPIO 16", tx: "GPIO 17" },
                      { port: "PORT 3", uart: "UART0", rx: "GPIO 3", tx: "GPIO 1" },
                      { port: "PORT 4", uart: "GPIO", rx: "GPIO 14", tx: "GPIO 15" },
                    ].map((p, i) => (
                      <TechCornerBox key={i} className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold">{p.port}</p>
                            <p className="text-[#94a3b8] font-['IBM_Plex_Mono'] text-xs">{p.uart}</p>
                          </div>
                        </div>
                        <div className="space-y-1 text-sm font-['IBM_Plex_Mono']">
                          <p className="text-[#e2e8f0]">RX: <span className="text-[#FFB300]">{p.rx}</span></p>
                          <p className="text-[#e2e8f0]">TX: <span className="text-[#FFB300]">{p.tx}</span></p>
                        </div>
                      </TechCornerBox>
                    ))}
                  </div>
                  <Alert type="warning">
                    Use um conversor de nível lógico 3.3V↔5V para cada porta CI-V para proteger o ESP32 contra tensões de 5V dos rádios Icom.
                  </Alert>
                </motion.div>
              )}

              {/* Comandos */}
              {activeSection === "comandos" && (
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                  <SectionLabel number="05" label="Comandos Serial" />
                  <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm mb-4">
                    Configure o dispositivo via Monitor Serial (115200 bps) usando os seguintes comandos:
                  </p>
                  <div className="space-y-4">
                    <TechCornerBox className="p-4">
                      <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold mb-2">help</p>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">Lista todos os comandos disponíveis</p>
                    </TechCornerBox>
                    <TechCornerBox className="p-4">
                      <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold mb-2">status</p>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">Mostra status do sistema (Bluetooth, CI-V)</p>
                    </TechCornerBox>
                    <TechCornerBox className="p-4">
                      <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold mb-2">select_port &lt;N&gt;</p>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">Seleciona a porta ativa (1-4)</p>
                    </TechCornerBox>
                    <TechCornerBox className="p-4">
                      <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold mb-2">set_baud &lt;N&gt; &lt;BAUD&gt;</p>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">Altera baud rate da porta N (9600, 19200, 38400)</p>
                    </TechCornerBox>
                    <TechCornerBox className="p-4">
                      <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs font-bold mb-2">set_addr &lt;N&gt; &lt;HEX&gt;</p>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">Altera endereço CI-V da porta N (ex: 0x94)</p>
                    </TechCornerBox>
                  </div>
                </motion.div>
              )}

              {/* Modelos Icom */}
              {activeSection === "modelos" && (
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                  <SectionLabel number="06" label="Modelos Icom Suportados" />
                  <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm mb-4">
                    O firmware suporta 8 modelos Icom pré-configurados. Use o comando <code className="text-[#FFB300]">set_addr &lt;PORT&gt; &lt;HEX&gt;</code> para alterar:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
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
                      <TechCornerBox key={i} className="p-3">
                        <p className="text-white font-['Space_Grotesk'] font-bold text-sm">{m.model}</p>
                        <p className="text-[#4fc3f7] font-['IBM_Plex_Mono'] text-xs mt-1">{m.addr}</p>
                      </TechCornerBox>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Troubleshooting */}
              {activeSection === "troubleshooting" && (
                <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-6">
                  <SectionLabel number="07" label="Troubleshooting" />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-2">❌ "Sketch too big"</h3>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm mb-2">
                        Você ainda tem bibliotecas externas instaladas.
                      </p>
                      <ol className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm space-y-1 ml-4">
                        <li>1. Desinstale ESPAsyncWebServer, AsyncTCP, ArduinoJson</li>
                        <li>2. Limpe o cache: File → Preferences → Clear cache</li>
                        <li>3. Feche e reabra o Arduino IDE</li>
                        <li>4. Compile novamente</li>
                      </ol>
                    </div>
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-2">❌ Bluetooth não aparece</h3>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">
                        Abra Monitor Serial (115200 bps) e verifique se aparece: <code className="text-[#FFB300]">[BT] ✓ Nome: ESP32-CIV</code>
                      </p>
                    </div>
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold mb-2">❌ CI-V não responde</h3>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-sm">
                        Verifique: pinagem correta, nível lógico 3.3V↔5V, baud rate correto, endereço CI-V correto.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
