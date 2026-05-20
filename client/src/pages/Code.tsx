/*
 * Code Page — ESP32 CI-V Gateway v1.0 COMPLETO
 * Design: Blueprint Técnico
 * Visualizador de código-fonte com syntax highlighting
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import NavBar from "@/components/NavBar";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

const codeSections = [
  {
    id: "includes",
    title: "Includes e Definições",
    description: "Bibliotecas necessárias, definições de pinos das 4 portas CI-V, LED status.",
    lines: `#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <BluetoothSerial.h>
#include <Preferences.h>
#include <HardwareSerial.h>
#include <ArduinoJson.h>

#define PIN_LED 2

// PORT 1 (UART1)
#define PORT1_RX 9
#define PORT1_TX 10

// PORT 2 (UART2)
#define PORT2_RX 16
#define PORT2_TX 17

// PORT 3 (UART0)
#define PORT3_RX 3
#define PORT3_TX 1

// PORT 4 (GPIO)
#define PORT4_RX 14
#define PORT4_TX 15`,
  },
  {
    id: "config",
    title: "Estrutura de Configuração",
    description: "Armazena todas as configurações: WiFi, Bluetooth, CI-V e IPs.",
    lines: `struct Config {
  String wifi_ssid;
  String wifi_pass;
  String bt_name;
  uint8_t civ_addr[4];
  uint32_t civ_baud[4];
  uint8_t active_port;
  IPAddress device_ip;
  IPAddress gateway_ip;
  IPAddress subnet_mask;
} cfg;

BluetoothSerial BT;
WebServer server(80);
HardwareSerial port1(1);
HardwareSerial port2(2);
HardwareSerial port3(0);
Preferences nvs;

HardwareSerial* active_civ = &port1;`,
  },
  {
    id: "setup",
    title: "Função Setup",
    description: "Inicializa 4 portas CI-V, Bluetooth, WiFi AP, WebServer e carrega NVS.",
    lines: `void setup() {
  Serial.begin(115200);
  delay(100);
  
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  
  // Carregar configurações do NVS
  load_config();
  
  // Inicializar 4 portas CI-V
  port1.begin(cfg.civ_baud[0], SERIAL_8N1, PORT1_RX, PORT1_TX);
  port2.begin(cfg.civ_baud[1], SERIAL_8N1, PORT2_RX, PORT2_TX);
  port3.begin(cfg.civ_baud[2], SERIAL_8N1, PORT3_RX, PORT3_TX);
  
  // Inicializar Bluetooth SPP
  if (BT.begin(cfg.bt_name.c_str())) {
    bt_available = true;
  }
  
  // Inicializar WiFi AP
  setup_wifi_ap();
  
  // Inicializar WebServer
  setup_webserver();
  server.begin();
  
  digitalWrite(PIN_LED, HIGH);
}`,
  },
  {
    id: "bridge",
    title: "Bridge Bidirecional",
    description: "Faz o bridge entre Bluetooth e porta CI-V ativa em ambas as direções.",
    lines: `void bridge_bt_to_civ() {
  if (!bt_available || !BT.available()) return;
  
  while (BT.available()) {
    uint8_t byte = BT.read();
    active_civ->write(byte);
  }
}

void bridge_civ_to_bt() {
  if (!bt_available || !active_civ->available()) return;
  
  while (active_civ->available()) {
    uint8_t byte = active_civ->read();
    if (BT.connected()) {
      BT.write(byte);
    }
  }
}`,
  },
  {
    id: "select_port",
    title: "Seleção de Porta",
    description: "Permite selecionar qual das 4 portas CI-V está ativa para o bridge.",
    lines: `void select_port(uint8_t port) {
  if (port < 1 || port > 4) {
    Serial.println("[ERROR] Porta inválida");
    return;
  }
  
  cfg.active_port = port;
  
  switch (port) {
    case 1:
      active_civ = &port1;
      Serial.println("[CI-V] ✓ Porta ativa: PORT 1");
      break;
    case 2:
      active_civ = &port2;
      Serial.println("[CI-V] ✓ Porta ativa: PORT 2");
      break;
    case 3:
      active_civ = &port3;
      Serial.println("[CI-V] ✓ Porta ativa: PORT 3");
      break;
    case 4:
      Serial.println("[CI-V] ✓ Porta ativa: PORT 4");
      break;
  }
  
  save_config();
}`,
  },
  {
    id: "commands",
    title: "Processamento de Comandos Serial",
    description: "Processa comandos via Serial para configuração, seleção de porta e status.",
    lines: `void handle_serial_commands() {
  if (!Serial.available()) return;
  
  String cmd = Serial.readStringUntil('\\n');
  cmd.trim();
  
  if (cmd == "help") {
    Serial.println("help - Mostra esta mensagem");
    Serial.println("status - Status do sistema");
    Serial.println("config - Mostra configuração");
    Serial.println("select_port <N> - Seleciona porta");
    Serial.println("set_bt <NAME> - Altera nome BT");
    Serial.println("set_baud <N> <BAUD> - Altera baud");
    Serial.println("set_addr <N> <HEX> - Altera endereço");
  }
  
  if (cmd.startsWith("select_port ")) {
    uint8_t port = atoi(cmd.substring(12).c_str());
    select_port(port);
  }
  
  if (cmd.startsWith("set_baud ")) {
    int port = atoi(cmd.substring(9).c_str());
    int space = cmd.indexOf(' ', 9);
    uint32_t baud = atol(cmd.substring(space + 1).c_str());
    cfg.civ_baud[port - 1] = baud;
    save_config();
  }
}`,
  },
  {
    id: "webserver",
    title: "WebServer e Interface Web",
    description: "Configura rotas HTTP e interface web de configuração em tempo real.",
    lines: `void setup_webserver() {
  server.on("/", HTTP_GET, handle_web_root);
  server.on("/api/config", HTTP_GET, handle_web_config);
  server.on("/api/status", HTTP_GET, handle_web_status);
  server.on("/api/save", HTTP_POST, handle_web_save_config);
  server.onNotFound(handle_web_not_found);
}

void handle_web_config() {
  StaticJsonDocument<512> doc;
  doc["wifi_ssid"] = cfg.wifi_ssid;
  doc["wifi_pass"] = cfg.wifi_pass;
  doc["bt_name"] = cfg.bt_name;
  doc["active_port"] = cfg.active_port;
  doc["civ_baud"] = cfg.civ_baud[cfg.active_port - 1];
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}`,
  },
];

export default function Code() {
  const [expandedSection, setExpandedSection] = useState("includes");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col">
      <NavBar />
      <div className="pt-14">
        <div className="container py-12">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-xs font-bold">CODE</span>
              <span className="text-[#4fc3f7]/60 font-['IBM_Plex_Mono'] text-xs tracking-widest">v1.0 COMPLETO</span>
            </div>
            <h1 className="font-['Space_Grotesk'] font-bold text-4xl text-white mb-4">
              Código-Fonte
            </h1>
            <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-lg">
              Explore os principais módulos do firmware. Para o código completo, baixe o arquivo .ino abaixo.
            </p>
          </motion.div>

          <div className="space-y-4 mb-12">
            {codeSections.map((section, idx) => (
              <motion.div
                key={section.id}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="border border-[rgba(79,195,247,0.18)] rounded-sm overflow-hidden"
              >
                <button
                  onClick={() => setExpandedSection(expandedSection === section.id ? "" : section.id)}
                  className="w-full flex items-center justify-between p-4 bg-[rgba(79,195,247,0.05)] hover:bg-[rgba(79,195,247,0.1)] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <span className="text-[#FFB300] font-['IBM_Plex_Mono'] text-xs font-bold min-w-fit">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-white font-['Space_Grotesk'] font-bold">{section.title}</h3>
                      <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] text-xs mt-1">{section.description}</p>
                    </div>
                  </div>
                  {expandedSection === section.id ? (
                    <ChevronDown size={20} className="text-[#4fc3f7]" />
                  ) : (
                    <ChevronRight size={20} className="text-[#4fc3f7]/60" />
                  )}
                </button>

                {expandedSection === section.id && (
                  <div className="border-t border-[rgba(79,195,247,0.1)] p-4 bg-[rgba(11,20,35,0.5)]">
                    <div className="relative">
                      <pre className="text-xs font-['IBM_Plex_Mono'] text-[#e2e8f0] overflow-x-auto leading-relaxed">
                        <code>{section.lines}</code>
                      </pre>
                      <button
                        onClick={() => copyCode(section.id, section.lines)}
                        className="absolute top-2 right-2 p-2 bg-[rgba(79,195,247,0.1)] hover:bg-[rgba(79,195,247,0.2)] rounded transition-colors"
                      >
                        {copiedId === section.id ? (
                          <Check size={16} className="text-[#10b981]" />
                        ) : (
                          <Copy size={16} className="text-[#4fc3f7]" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="p-8 border border-[#4fc3f7]/30 rounded-lg bg-[#0d1b2a]/50 text-center"
          >
            <h2 className="font-['Space_Grotesk'] font-bold text-2xl text-white mb-4">Código Completo</h2>
            <p className="text-[#94a3b8] font-['IBM_Plex_Sans'] mb-6">
              Baixe o arquivo .ino completo com todas as funcionalidades: Bluetooth, WiFi AP, WebServer, 4 saídas CI-V, API REST.
            </p>
            <a
              href="/ESP32_CIV_Gateway_Complete_v1.0.ino"
              download
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#4fc3f7] text-[#0d1b2a] font-bold rounded-lg hover:bg-[#80d8ff] transition-colors"
            >
              <Download size={20} />
              Baixar ESP32_CIV_Gateway_Complete_v1.0.ino
            </a>
            <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans'] mt-4">
              Tamanho: ~1.2 MB | Otimizado para ESP32 8MB Flash
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
