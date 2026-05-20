/*
 * Docs Page — ESP32 CI-V Gateway v1.0 COMPLETO
 * Design: Blueprint Técnico
 * Documentação técnica completa com guia de instalação
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

const sections = [
  { id: "visao", label: "Visão Geral" },
  { id: "requisitos", label: "Requisitos" },
  { id: "instalacao", label: "Instalação" },
  { id: "pinagem", label: "Pinagem" },
  { id: "webserver", label: "WebServer" },
  { id: "comandos", label: "Comandos Serial" },
  { id: "api", label: "API REST" },
  { id: "modelos", label: "Modelos Icom" },
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
              <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest">v1.0 COMPLETO</span>
            </div>
            <h1 className="font-['Space_Grotesk'] font-bold text-5xl text-white">Documentação Técnica</h1>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="lg:col-span-1">
              <div className="sticky top-20 p-4 border border-[rgba(79,195,247,0.18)] rounded-sm bg-[#0a1118]">
                <p className="text-[10px] text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] uppercase tracking-widest mb-4">Seções</p>
                <div className="space-y-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full text-left px-3 py-2 rounded-sm text-sm transition-colors font-['IBM_Plex_Sans'] ${
                        activeSection === section.id
                          ? "bg-[#4fc3f7]/20 text-[#4fc3f7]"
                          : "text-[#94a3b8] hover:text-[#4fc3f7]"
                      }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Content */}
            <motion.div initial="hidden" animate="visible" variants={fadeUp} className="lg:col-span-3 space-y-8">
              {/* Visão Geral */}
              {activeSection === "visao" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="01" label="Visão Geral" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">O que é o ESP32 CI-V Gateway?</h2>
                  <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] mb-4">
                    O ESP32 CI-V Gateway é um firmware completo que transforma um microcontrolador ESP32 em um gateway de controle remoto para rádios Icom. Ele oferece múltiplas formas de conectividade: Bluetooth SPP, WiFi Access Point e WebServer integrado.
                  </p>
                  <h3 className="font-['Space_Grotesk'] font-bold text-white mb-3">Funcionalidades Principais:</h3>
                  <ul className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">
                    <li>✓ Bluetooth SPP para controle remoto via smartphone/tablet</li>
                    <li>✓ WiFi Access Point com DHCP integrado</li>
                    <li>✓ WebServer com interface de configuração</li>
                    <li>✓ 4 Saídas CI-V Físicas para múltiplos rádios</li>
                    <li>✓ Protocolo CI-V Icom com bridge bidirecional</li>
                    <li>✓ Configuração persistente via NVS</li>
                    <li>✓ API REST JSON para integração</li>
                    <li>✓ Comandos via Serial para configuração avançada</li>
                  </ul>
                </TechCornerBox>
              )}

              {/* Requisitos */}
              {activeSection === "requisitos" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="02" label="Requisitos" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Requisitos de Hardware e Software</h2>
                  
                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Hardware</h3>
                  <ul className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-6">
                    <li>• ESP32 com 8 MB de Flash (recomendado)</li>
                    <li>• Cabo USB para programação</li>
                    <li>• Conversor de nível lógico 3.3V ↔ 5V (4x, para cada porta CI-V)</li>
                    <li>• Cabos de conexão para rádios Icom</li>
                  </ul>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Software</h3>
                  <ul className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-6">
                    <li>• Arduino IDE 2.0 ou superior</li>
                    <li>• ESP32 Arduino Core 2.0.11 ou superior</li>
                    <li>• ArduinoJson 6.21.0</li>
                  </ul>

                  <Alert type="warning">
                    <strong>Importante:</strong> O firmware foi otimizado para ESP32 com 8 MB de Flash. Se você usar um ESP32 com 4 MB, será necessário usar uma versão reduzida sem WebServer.
                  </Alert>
                </TechCornerBox>
              )}

              {/* Instalação */}
              {activeSection === "instalacao" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="03" label="Instalação" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Passo a Passo de Instalação</h2>
                  
                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Passo 1: Instalar Arduino IDE</h3>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-4">
                    Baixe e instale a Arduino IDE 2.0+ em: https://www.arduino.cc/en/software
                  </p>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Passo 2: Adicionar ESP32 Board</h3>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-2">
                    No Arduino IDE, vá para: <strong>File → Preferences</strong>
                  </p>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-4">
                    Adicione esta URL em "Additional Boards Manager URLs":
                  </p>
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded-sm mb-4 font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7] overflow-x-auto">
                    https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
                  </div>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Passo 3: Instalar Bibliotecas</h3>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-2">
                    Vá para: <strong>Tools → Manage Libraries</strong>
                  </p>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-4">
                    Procure e instale: <strong>ArduinoJson</strong> (versão 6.21.0)
                  </p>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Passo 4: Fazer Upload</h3>
                  <ol className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-4">
                    <li>1. Abra o arquivo: <strong>ESP32_CIV_Gateway_Complete_v1.0.ino</strong></li>
                    <li>2. Selecione a placa: <strong>Tools → Board → ESP32 → ESP32 Dev Module</strong></li>
                    <li>3. Selecione a porta COM do ESP32</li>
                    <li>4. Clique em: <strong>Sketch → Upload</strong></li>
                  </ol>

                  <Alert type="success">
                    Quando o upload terminar, você verá a mensagem "Leaving... Hard resetting via RTS pin..." no console.
                  </Alert>
                </TechCornerBox>
              )}

              {/* Pinagem */}
              {activeSection === "pinagem" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="04" label="Pinagem" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Pinagem das 4 Saídas CI-V</h2>
                  
                  <div className="space-y-4 mb-6">
                    {[
                      { port: "PORT 1", uart: "UART1", rx: "GPIO 9", tx: "GPIO 10" },
                      { port: "PORT 2", uart: "UART2", rx: "GPIO 16", tx: "GPIO 17" },
                      { port: "PORT 3", uart: "UART0", rx: "GPIO 3", tx: "GPIO 1" },
                      { port: "PORT 4", uart: "GPIO", rx: "GPIO 14", tx: "GPIO 15" },
                    ].map((p, i) => (
                      <div key={i} className="p-4 bg-[#0a1118] border border-[#4fc3f7]/20 rounded-sm">
                        <p className="font-['Space_Grotesk'] font-bold text-[#4fc3f7] mb-2">{p.port} ({p.uart})</p>
                        <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">RX: <strong>{p.rx}</strong> | TX: <strong>{p.tx}</strong></p>
                      </div>
                    ))}
                  </div>

                  <Alert type="warning">
                    <strong>Importante:</strong> Use um conversor de nível lógico 3.3V ↔ 5V para cada porta CI-V. O ESP32 opera em 3.3V e os rádios Icom em 5V.
                  </Alert>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Outros Pinos</h3>
                  <ul className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">
                    <li>• GPIO 2: LED Status (indica sistema ativo)</li>
                    <li>• GND: Terra (conectar ao rádio)</li>
                    <li>• 5V: Alimentação (se necessário)</li>
                  </ul>
                </TechCornerBox>
              )}

              {/* WebServer */}
              {activeSection === "webserver" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="05" label="WebServer" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Interface Web de Configuração</h2>
                  
                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Acessar o WebServer</h3>
                  <ol className="space-y-2 text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-6">
                    <li>1. Conecte seu computador/smartphone à rede WiFi: <strong>ESP32-CIV</strong></li>
                    <li>2. Abra um navegador web</li>
                    <li>3. Acesse: <strong>http://192.168.4.1</strong></li>
                  </ol>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Abas de Configuração</h3>
                  <ul className="space-y-3 text-sm text-[#94a3b8] font-['IBM_Plex_Sans']">
                    <li><strong>Status:</strong> Mostra status do Bluetooth, WiFi, IP e porta ativa</li>
                    <li><strong>WiFi:</strong> Configurar SSID e senha da rede</li>
                    <li><strong>Bluetooth:</strong> Alterar nome do dispositivo Bluetooth</li>
                    <li><strong>CI-V:</strong> Selecionar porta ativa, baud rate e endereço</li>
                  </ul>

                  <Alert type="info">
                    Todas as configurações são salvas automaticamente no NVS (Non-Volatile Storage) e persistem após reinicialização.
                  </Alert>
                </TechCornerBox>
              )}

              {/* Comandos Serial */}
              {activeSection === "comandos" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="06" label="Comandos Serial" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Configuração via Monitor Serial</h2>
                  
                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Abrir Monitor Serial</h3>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-4">
                    Arduino IDE: <strong>Tools → Serial Monitor</strong> (velocidade: 115200 bps)
                  </p>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">Comandos Disponíveis</h3>
                  <div className="space-y-3 mb-6">
                    {[
                      { cmd: "help", desc: "Lista todos os comandos" },
                      { cmd: "status", desc: "Mostra status do sistema" },
                      { cmd: "config", desc: "Mostra configuração atual" },
                      { cmd: "ports", desc: "Mostra pinagem das 4 portas" },
                      { cmd: "select_port <N>", desc: "Seleciona porta (1-4)" },
                      { cmd: "set_bt <NAME>", desc: "Alterar nome do Bluetooth" },
                      { cmd: "set_baud <N> <BAUD>", desc: "Alterar baud rate (9600, 19200, 38400)" },
                      { cmd: "set_addr <N> <HEX>", desc: "Alterar endereço CI-V (ex: 0x94)" },
                      { cmd: "reboot", desc: "Reiniciar o ESP32" },
                    ].map((item, i) => (
                      <div key={i} className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded-sm">
                        <p className="font-['IBM_Plex_Mono'] text-[#4fc3f7] text-sm mb-1">{item.cmd}</p>
                        <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans']">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </TechCornerBox>
              )}

              {/* API REST */}
              {activeSection === "api" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="07" label="API REST" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Endpoints da API JSON</h2>
                  
                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">GET /api/config</h3>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-2">Retorna a configuração atual</p>
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded-sm mb-4 font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7] overflow-x-auto">
                    curl http://192.168.4.1/api/config
                  </div>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">GET /api/status</h3>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-2">Retorna o status do sistema</p>
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded-sm mb-4 font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7] overflow-x-auto">
                    curl http://192.168.4.1/api/status
                  </div>

                  <h3 className="font-['Space_Grotesk'] font-bold text-[#FFB300] mb-3">POST /api/save</h3>
                  <p className="text-sm text-[#94a3b8] font-['IBM_Plex_Sans'] mb-2">Salva nova configuração</p>
                  <div className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded-sm font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7] overflow-x-auto">
                    curl -X POST http://192.168.4.1/api/save -H "Content-Type: application/json" -d {`'{"wifi_ssid":"MySSID","bt_name":"ESP32-CIV"}'`}
                  </div>
                </TechCornerBox>
              )}

              {/* Modelos Icom */}
              {activeSection === "modelos" && (
                <TechCornerBox className="p-6">
                  <SectionLabel number="08" label="Modelos Icom" />
                  <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Endereços CI-V Pré-Configurados</h2>
                  
                  <div className="grid grid-cols-2 gap-3 mb-6">
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
                      <div key={i} className="p-3 bg-[#0a1118] border border-[#4fc3f7]/20 rounded-sm">
                        <p className="font-['Space_Grotesk'] font-bold text-white">{m.model}</p>
                        <p className="text-xs text-[#4fc3f7] font-['IBM_Plex_Mono']">{m.addr}</p>
                      </div>
                    ))}
                  </div>

                  <Alert type="info">
                    Para usar um modelo não listado, consulte a documentação do rádio para encontrar o endereço CI-V correto.
                  </Alert>
                </TechCornerBox>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
