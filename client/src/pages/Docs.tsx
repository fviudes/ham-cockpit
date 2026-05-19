/*
 * Docs Page — ESP32 CI-V Gateway
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

// ============================================================
//  Conteúdo da Documentação
// ============================================================
const sections = [
  { id: "requisitos", label: "Requisitos" },
  { id: "instalacao", label: "Instalação" },
  { id: "pinagem", label: "Pinagem" },
  { id: "wifi-ap", label: "WiFi AP" },
  { id: "wifi-sta", label: "WiFi STA" },
  { id: "bluetooth", label: "Bluetooth" },
  { id: "civ", label: "Protocolo CI-V" },
  { id: "dhcp", label: "Servidor DHCP" },
  { id: "webui", label: "Interface Web" },
  { id: "api", label: "API REST" },
  { id: "nvs", label: "Persistência NVS" },
  { id: "troubleshooting", label: "Solução de Problemas" },
];

export default function Docs() {
  const [activeSection, setActiveSection] = useState("requisitos");

  return (
    <div className="min-h-screen bg-[#0d1b2a]">
      <NavBar />
      <div className="pt-14">
        <div className="container py-10">
          <div className="flex gap-8">
            {/* Sidebar */}
            <aside className="hidden lg:block w-52 flex-shrink-0">
              <div className="sticky top-20">
                <p className="text-[10px] text-[#4fc3f7]/50 font-['IBM_Plex_Mono'] uppercase tracking-widest mb-3">
                  Conteúdo
                </p>
                <nav className="space-y-0.5">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      onClick={() => setActiveSection(s.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-sm font-['IBM_Plex_Sans'] transition-all ${
                        activeSection === s.id
                          ? "text-[#4fc3f7] bg-[rgba(79,195,247,0.1)] border-l-2 border-[#4fc3f7]"
                          : "text-[#94a3b8] hover:text-white border-l-2 border-transparent"
                      }`}
                    >
                      <ChevronRight size={10} className="opacity-50" />
                      {s.label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <main className="flex-1 min-w-0 max-w-3xl">
              <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                <SectionLabel number="DOC" label="Documentação Técnica" />
                <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-white mb-2">
                  ESP32 CI-V Gateway
                </h1>
                <p className="text-[#94a3b8] text-base mb-10 font-['IBM_Plex_Sans']">
                  Guia completo de instalação, configuração e uso do firmware.
                </p>
              </motion.div>

              {/* ===== REQUISITOS ===== */}
              <section id="requisitos" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  01 — Requisitos de Hardware e Software
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  O firmware foi desenvolvido e testado com o módulo ESP32-WROOM-32. Outros módulos
                  ESP32 com suporte a Bluetooth Classic (BR/EDR) também são compatíveis, desde que
                  possuam pelo menos 4 MB de Flash e 520 KB de SRAM.
                </p>
                <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.5)] mb-4">
                  <h3 className="text-sm font-semibold text-white font-['Space_Grotesk'] mb-3">Hardware Necessário</h3>
                  <div className="space-y-1.5 text-xs font-['IBM_Plex_Mono']">
                    {[
                      ["Módulo", "ESP32-WROOM-32 ou equivalente"],
                      ["Flash", "Mínimo 4 MB"],
                      ["Interface CI-V", "Cabo serial 3.3V (TTL) para porta CI-V do rádio"],
                      ["Alimentação", "5V via USB ou fonte externa 3.3V"],
                      ["LED Status", "LED + resistor 220Ω no GPIO 2 (opcional)"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-4">
                        <span className="text-[#4fc3f7]/70 w-28 flex-shrink-0">{k}</span>
                        <span className="text-[#e2e8f0]">{v}</span>
                      </div>
                    ))}
                  </div>
                </TechCornerBox>
                <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.5)]">
                  <h3 className="text-sm font-semibold text-white font-['Space_Grotesk'] mb-3">Dependências de Software</h3>
                  <div className="space-y-1.5 text-xs font-['IBM_Plex_Mono']">
                    {[
                      ["Arduino IDE", "≥ 2.0 ou PlatformIO"],
                      ["ESP32 Arduino Core", "≥ 2.0.0 (Espressif)"],
                      ["ESPAsyncWebServer", "me-no-dev/ESPAsyncWebServer"],
                      ["AsyncTCP", "me-no-dev/AsyncTCP"],
                      ["ArduinoJson", "≥ 6.x (Benoit Blanchon)"],
                      ["BluetoothSerial", "Incluída no ESP32 Core"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-4">
                        <span className="text-[#4fc3f7]/70 w-40 flex-shrink-0">{k}</span>
                        <span className="text-[#e2e8f0]">{v}</span>
                      </div>
                    ))}
                  </div>
                </TechCornerBox>
              </section>

              {/* ===== INSTALAÇÃO ===== */}
              <section id="instalacao" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  02 — Instalação e Upload
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  Siga os passos abaixo para instalar o firmware no ESP32 usando o Arduino IDE.
                </p>

                <Alert type="info">
                  Certifique-se de selecionar a placa correta no Arduino IDE: <strong>ESP32 Dev Module</strong> ou
                  o módulo específico que você está usando. A partição deve ter pelo menos 4 MB de Flash.
                </Alert>

                <div className="space-y-4">
                  {[
                    {
                      step: "1",
                      title: "Instalar o ESP32 Arduino Core",
                      content: `No Arduino IDE, vá em Arquivo > Preferências e adicione a URL do gerenciador de placas:`,
                      code: "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json",
                      lang: "text",
                    },
                    {
                      step: "2",
                      title: "Instalar as Bibliotecas",
                      content: "Instale as seguintes bibliotecas via Gerenciador de Bibliotecas (Sketch > Incluir Biblioteca > Gerenciar Bibliotecas):",
                      code: `ESPAsyncWebServer  (by me-no-dev)
AsyncTCP           (by me-no-dev)
ArduinoJson        (by Benoit Blanchon, versão 6.x)`,
                      lang: "text",
                    },
                    {
                      step: "3",
                      title: "Configurar a Partição",
                      content: "Em Ferramentas > Partition Scheme, selecione:",
                      code: `Huge APP (3MB No OTA/1MB SPIFFS)
// ou
Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)`,
                      lang: "text",
                    },
                    {
                      step: "4",
                      title: "Upload do Firmware",
                      content: "Conecte o ESP32 via USB, selecione a porta correta e clique em Upload:",
                      code: `Placa:    ESP32 Dev Module
Upload Speed: 921600
CPU Frequency: 240 MHz
Flash Size: 4MB`,
                      lang: "text",
                    },
                  ].map((item) => (
                    <TechCornerBox key={item.step} className="p-5 bg-[rgba(26,39,68,0.5)]">
                      <div className="flex gap-3">
                        <div className="w-6 h-6 flex items-center justify-center rounded-sm bg-[rgba(79,195,247,0.15)] text-[#4fc3f7] text-xs font-bold font-['IBM_Plex_Mono'] flex-shrink-0">
                          {item.step}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-white font-['Space_Grotesk'] mb-2">{item.title}</h3>
                          <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans'] mb-2">{item.content}</p>
                          <CodeSnippet code={item.code} lang={item.lang} />
                        </div>
                      </div>
                    </TechCornerBox>
                  ))}
                </div>

                <Alert type="success">
                  Após o upload, o ESP32 criará automaticamente a rede WiFi <strong>ESP32-CIV-GW</strong> com
                  senha <strong>esp32civ</strong>. Conecte-se a esta rede e acesse <strong>http://192.168.4.1</strong>.
                </Alert>
              </section>

              {/* ===== PINAGEM ===== */}
              <section id="pinagem" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  03 — Pinagem e Conexões
                </h2>
                <TechCornerBox className="p-5 bg-[rgba(26,39,68,0.5)] mb-4">
                  <table className="w-full text-xs font-['IBM_Plex_Mono']">
                    <thead>
                      <tr className="text-[#4fc3f7]/70">
                        <th className="text-left pb-2 font-medium">GPIO</th>
                        <th className="text-left pb-2 font-medium">Função</th>
                        <th className="text-left pb-2 font-medium">Conexão</th>
                        <th className="text-left pb-2 font-medium">Obs.</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#e2e8f0]">
                      {[
                        ["GPIO 16", "CI-V RX", "TX do rádio (CI-V)", "UART2 RX"],
                        ["GPIO 17", "CI-V TX", "RX do rádio (CI-V)", "UART2 TX"],
                        ["GPIO 2", "LED Status", "LED + R 220Ω → GND", "LED onboard"],
                        ["GND", "Terra", "GND do rádio", "Referência comum"],
                        ["3.3V", "VCC", "—", "Nível lógico CI-V"],
                      ].map(([gpio, func, conn, obs]) => (
                        <tr key={gpio} className="border-t border-[rgba(79,195,247,0.08)]">
                          <td className="py-2 text-[#ffb300]">{gpio}</td>
                          <td className="py-2">{func}</td>
                          <td className="py-2 text-[#94a3b8]">{conn}</td>
                          <td className="py-2 text-[#94a3b8]">{obs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TechCornerBox>
                <Alert type="warning">
                  A porta CI-V dos transceivers Icom opera em nível lógico de 5V em alguns modelos.
                  Utilize um conversor de nível lógico (level shifter) 3.3V↔5V para proteger o ESP32.
                  Verifique o manual do seu transceiver antes de conectar.
                </Alert>
              </section>

              {/* ===== WiFi AP ===== */}
              <section id="wifi-ap" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  04 — WiFi — Modo Access Point (AP)
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  No modo AP, o ESP32 cria sua própria rede WiFi independente. Dispositivos de controle
                  (smartphones, tablets, laptops) conectam-se diretamente ao ESP32 sem necessidade de
                  roteador externo. Este é o modo padrão de operação.
                </p>
                <CodeSnippet lang="cpp" code={`// Configuração padrão do AP
#define DEFAULT_AP_SSID    "ESP32-CIV-GW"
#define DEFAULT_AP_PASS    "esp32civ"
#define DEFAULT_AP_IP      "192.168.4.1"
#define DEFAULT_AP_SUBNET  "255.255.255.0"

// Inicialização do AP com IP estático
WiFi.mode(WIFI_AP);
WiFi.softAPConfig(apIP, apGateway, apSubnet);
WiFi.softAP(cfg.apSSID.c_str(), cfg.apPassword.c_str());`} />
                <p className="text-[#94a3b8] text-sm leading-relaxed font-['IBM_Plex_Sans']">
                  Após a conexão ao AP, acesse a interface de configuração em{" "}
                  <code className="text-[#4fc3f7] font-['IBM_Plex_Mono']">http://192.168.4.1</code> ou via
                  mDNS em <code className="text-[#4fc3f7] font-['IBM_Plex_Mono']">http://esp32-civ.local</code>.
                </p>
              </section>

              {/* ===== WiFi STA ===== */}
              <section id="wifi-sta" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  05 — WiFi — Modo Station (STA)
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  O modo STA permite que o ESP32 se conecte a uma rede WiFi local existente, integrando-se
                  à infraestrutura de rede doméstica ou de laboratório. Neste modo, o AP interno continua
                  funcionando simultaneamente (modo AP+STA).
                </p>
                <CodeSnippet lang="cpp" code={`// Modo AP+STA simultâneo
WiFi.mode(WIFI_AP_STA);

// Configurar IP estático (opcional)
if (!cfg.staDHCP) {
  WiFi.config(parseIP(cfg.staStaticIP),
              parseIP(cfg.staGateway),
              parseIP(cfg.staSubnet));
}

// Conectar à rede local
WiFi.begin(cfg.staSSID.c_str(), cfg.staPassword.c_str());`} />
                <p className="text-[#94a3b8] text-sm leading-relaxed font-['IBM_Plex_Sans']">
                  O scan de redes disponíveis pode ser acionado pela interface web, que lista todas as
                  redes detectadas com RSSI e tipo de criptografia. Selecione a rede desejada e informe
                  a senha WPA/WPA2.
                </p>
              </section>

              {/* ===== BLUETOOTH ===== */}
              <section id="bluetooth" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  06 — Bluetooth (SPP — Serial Port Profile)
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  O firmware implementa o perfil SPP (Serial Port Profile) do Bluetooth Classic, que emula
                  uma porta serial sobre Bluetooth. Aplicativos de controle de rádio como RigControl,
                  SDR Touch e outros que suportam CI-V via Bluetooth podem conectar-se diretamente ao ESP32.
                </p>
                <CodeSnippet lang="cpp" code={`// Inicializar Bluetooth SPP
BluetoothSerial SerialBT;
SerialBT.begin("ESP32-CIV");  // Nome visível no pareamento

// Verificar conexão e receber dados
if (SerialBT.connected()) {
  while (SerialBT.available()) {
    uint8_t b = SerialBT.read();
    // Encaminhar para CI-V UART
    civSerial.write(b);
  }
}`} />
                <Alert type="info">
                  O Bluetooth Classic (BR/EDR) e o BLE não podem operar simultaneamente no ESP32.
                  O firmware utiliza Bluetooth Classic via BluetoothSerial para máxima compatibilidade
                  com aplicativos de controle de rádio.
                </Alert>
              </section>

              {/* ===== CI-V ===== */}
              <section id="civ" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  07 — Protocolo CI-V Icom
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  O CI-V (Computer Interface V) é o protocolo serial proprietário da Icom para controle
                  remoto de transceivers. Opera via UART com configuração 8N1 e velocidade padrão de
                  9600 bps. Cada transceiver possui um endereço hexadecimal único.
                </p>
                <CodeSnippet lang="cpp" code={`// Estrutura de um frame CI-V
// FE FE [dest] [src] [cmd] [data...] FD
//
// Exemplo: Ler frequência do IC-7300 (addr 0x94)
// FE FE 94 E0 03 FD
//
// Enviar comando CI-V
void sendCIVCommand(uint8_t addr, uint8_t cmd,
                    uint8_t* data, uint8_t dataLen) {
  uint8_t frame[64];
  uint8_t idx = 0;
  frame[idx++] = 0xFE;  // Preamble
  frame[idx++] = 0xFE;  // Preamble
  frame[idx++] = addr;  // Endereço destino (rádio)
  frame[idx++] = 0xE0;  // Endereço origem (ESP32)
  frame[idx++] = cmd;   // Comando
  for (uint8_t i = 0; i < dataLen; i++)
    frame[idx++] = data[i];
  frame[idx++] = 0xFD;  // Terminator
  civSerial.write(frame, idx);
}`} />
                <p className="text-[#94a3b8] text-sm leading-relaxed font-['IBM_Plex_Sans']">
                  O firmware atua como bridge bidirecional: dados recebidos via Bluetooth são encaminhados
                  para a UART CI-V, e respostas do rádio são retransmitidas via Bluetooth para o aplicativo
                  de controle. O endereço CI-V do rádio é configurável pela interface web.
                </p>
              </section>

              {/* ===== DHCP ===== */}
              <section id="dhcp" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  08 — Servidor DHCP
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  O servidor DHCP é ativado automaticamente junto com o modo AP. Clientes WiFi que se
                  conectam ao AP do ESP32 recebem automaticamente um endereço IP no intervalo configurado,
                  sem necessidade de configuração manual.
                </p>
                <TechCornerBox className="p-4 bg-[rgba(26,39,68,0.5)] mb-4">
                  <div className="text-xs font-['IBM_Plex_Mono'] space-y-1">
                    <div className="flex gap-4">
                      <span className="text-[#4fc3f7]/70 w-32">IP do Gateway</span>
                      <span className="text-[#e2e8f0]">192.168.4.1</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-[#4fc3f7]/70 w-32">Pool DHCP</span>
                      <span className="text-[#e2e8f0]">192.168.4.100 — 192.168.4.200</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-[#4fc3f7]/70 w-32">Máscara</span>
                      <span className="text-[#e2e8f0]">255.255.255.0 (/24)</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-[#4fc3f7]/70 w-32">DNS</span>
                      <span className="text-[#e2e8f0]">192.168.4.1 (próprio dispositivo)</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-[#4fc3f7]/70 w-32">Lease Time</span>
                      <span className="text-[#e2e8f0]">24 horas</span>
                    </div>
                  </div>
                </TechCornerBox>
                <p className="text-[#94a3b8] text-sm leading-relaxed font-['IBM_Plex_Sans']">
                  O pool DHCP e o IP do dispositivo são configuráveis pela interface web. Após alterar
                  as configurações de rede, o AP é reiniciado automaticamente para aplicar as mudanças.
                </p>
              </section>

              {/* ===== WEB UI ===== */}
              <section id="webui" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  09 — Interface Web de Configuração
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  A interface web é servida diretamente pelo ESP32 via HTTP. O HTML completo é armazenado
                  em PROGMEM para economizar RAM. A interface é responsiva e funciona em qualquer navegador
                  moderno, incluindo smartphones.
                </p>
                <TechCornerBox className="p-4 bg-[rgba(26,39,68,0.5)]">
                  <h3 className="text-sm font-semibold text-white font-['Space_Grotesk'] mb-3">Abas de Configuração</h3>
                  <div className="space-y-2 text-xs font-['IBM_Plex_Sans']">
                    {[
                      ["WiFi AP", "SSID, senha WPA2, IP do dispositivo, gateway, máscara, pool DHCP"],
                      ["WiFi STA", "Habilitar/desabilitar, scan de redes, SSID, senha, IP estático ou DHCP"],
                      ["Bluetooth", "Habilitar/desabilitar, nome do dispositivo BT"],
                      ["CI-V", "Endereço do rádio (lista de modelos Icom), velocidade UART"],
                      ["Monitor", "Log de dados CI-V e Bluetooth em tempo real, reinicialização"],
                    ].map(([tab, desc]) => (
                      <div key={tab} className="flex gap-3">
                        <span className="text-[#4fc3f7] font-medium w-24 flex-shrink-0 font-['IBM_Plex_Mono']">{tab}</span>
                        <span className="text-[#94a3b8]">{desc}</span>
                      </div>
                    ))}
                  </div>
                </TechCornerBox>
              </section>

              {/* ===== API ===== */}
              <section id="api" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  10 — API REST
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  O firmware expõe uma API REST JSON para integração com outros sistemas ou automação
                  de configurações.
                </p>
                <TechCornerBox className="p-4 bg-[rgba(26,39,68,0.5)]">
                  <table className="w-full text-xs font-['IBM_Plex_Mono']">
                    <thead>
                      <tr className="text-[#4fc3f7]/70">
                        <th className="text-left pb-2 font-medium">Método</th>
                        <th className="text-left pb-2 font-medium">Endpoint</th>
                        <th className="text-left pb-2 font-medium">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#e2e8f0]">
                      {[
                        ["GET", "/api/config", "Retorna configuração atual (JSON)"],
                        ["GET", "/api/status", "Retorna status do sistema (JSON)"],
                        ["POST", "/api/config/ap", "Salvar configuração WiFi AP"],
                        ["POST", "/api/config/sta", "Salvar configuração WiFi STA"],
                        ["POST", "/api/config/bt", "Salvar configuração Bluetooth"],
                        ["POST", "/api/config/civ", "Salvar configuração CI-V"],
                        ["GET", "/api/wifi/scan", "Escanear redes WiFi disponíveis"],
                        ["POST", "/api/wifi/disconnect", "Desconectar do STA"],
                        ["POST", "/api/civ/test", "Testar comunicação CI-V"],
                        ["POST", "/api/reboot", "Reiniciar o dispositivo"],
                      ].map(([method, endpoint, desc]) => (
                        <tr key={endpoint} className="border-t border-[rgba(79,195,247,0.08)]">
                          <td className="py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              method === "GET"
                                ? "bg-[rgba(79,195,247,0.15)] text-[#4fc3f7]"
                                : "bg-[rgba(255,179,0,0.15)] text-[#ffb300]"
                            }`}>{method}</span>
                          </td>
                          <td className="py-1.5 text-[#94a3b8]">{endpoint}</td>
                          <td className="py-1.5 text-[#e2e8f0]">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TechCornerBox>
              </section>

              {/* ===== NVS ===== */}
              <section id="nvs" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  11 — Persistência de Configurações (NVS)
                </h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed mb-4 font-['IBM_Plex_Sans']">
                  Todas as configurações são armazenadas na NVS (Non-Volatile Storage) do ESP32, que
                  persiste os dados mesmo após reinicializações ou cortes de energia. A NVS utiliza
                  a memória Flash do ESP32 com proteção contra corrupção de dados.
                </p>
                <CodeSnippet lang="cpp" code={`// Salvar configuração na NVS
Preferences prefs;
prefs.begin("civ-gw", false);  // namespace "civ-gw"
prefs.putString("apSSID",  cfg.apSSID);
prefs.putBool("btEnabled", cfg.btEnabled);
prefs.putUInt("civAddr",   cfg.civAddress);
prefs.end();

// Carregar configuração da NVS
prefs.begin("civ-gw", true);   // read-only
cfg.apSSID    = prefs.getString("apSSID", "ESP32-CIV-GW");
cfg.btEnabled = prefs.getBool("btEnabled", true);
cfg.civAddress = prefs.getUInt("civAddr", 0x94);
prefs.end();`} />
              </section>

              {/* ===== TROUBLESHOOTING ===== */}
              <section id="troubleshooting" className="mb-12">
                <h2 className="font-['Space_Grotesk'] font-bold text-xl text-[#4fc3f7] mb-4 pb-2 border-b border-[rgba(79,195,247,0.15)]">
                  12 — Solução de Problemas
                </h2>
                <div className="space-y-4">
                  {[
                    {
                      problem: "Não consigo ver a rede WiFi ESP32-CIV-GW",
                      solution: "Verifique se o upload foi concluído com sucesso. Abra o Monitor Serial (115200 bps) e confirme a mensagem '[WiFi-AP] SSID: ESP32-CIV-GW'. Se não aparecer, verifique a partição selecionada.",
                    },
                    {
                      problem: "A página de configuração não carrega",
                      solution: "Certifique-se de estar conectado à rede ESP32-CIV-GW e acesse exatamente http://192.168.4.1 (sem HTTPS). Desative VPN ou proxy no dispositivo.",
                    },
                    {
                      problem: "Bluetooth não aparece para pareamento",
                      solution: "Verifique se o Bluetooth está habilitado na interface web. O ESP32 deve aparecer como 'ESP32-CIV' na lista de dispositivos Bluetooth. Alguns dispositivos requerem que o Bluetooth seja ativado antes de escanear.",
                    },
                    {
                      problem: "CI-V não responde ao teste",
                      solution: "Verifique a pinagem (GPIO 16 = RX, GPIO 17 = TX), o nível lógico (3.3V vs 5V) e o endereço CI-V configurado. Confirme que o rádio está ligado e com a porta CI-V ativa. Teste com velocidade 9600 bps primeiro.",
                    },
                    {
                      problem: "Erro de compilação: 'BluetoothSerial.h not found'",
                      solution: "O ESP32 Arduino Core deve ser versão ≥ 2.0.0. Atualize via Gerenciador de Placas. Certifique-se de que está usando um módulo ESP32 com suporte a Bluetooth Classic (não ESP32-S2 ou ESP32-C3).",
                    },
                  ].map((item) => (
                    <TechCornerBox key={item.problem} className="p-4 bg-[rgba(26,39,68,0.5)]">
                      <div className="flex gap-2 mb-2">
                        <Terminal size={14} className="text-[#ffb300] flex-shrink-0 mt-0.5" />
                        <h3 className="text-sm font-semibold text-[#ffb300] font-['Space_Grotesk']">{item.problem}</h3>
                      </div>
                      <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans'] leading-relaxed pl-5">{item.solution}</p>
                    </TechCornerBox>
                  ))}
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[rgba(79,195,247,0.08)] py-6">
        <div className="container text-center">
          <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Mono']">
            ESP32 CI-V Gateway — Documentação Técnica — MIT License
          </p>
        </div>
      </footer>
    </div>
  );
}
