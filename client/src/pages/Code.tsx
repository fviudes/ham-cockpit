/*
 * Code Page — ESP32 CI-V Gateway
 * Design: Blueprint Técnico
 * Exibe o código-fonte com syntax highlighting e download
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import NavBar from "@/components/NavBar";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]/60 tracking-[0.15em] uppercase">{number}</span>
      <div className="h-px flex-1 max-w-[40px] bg-[rgba(79,195,247,0.2)]" />
      <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]/60 tracking-[0.12em] uppercase">{label}</span>
    </div>
  );
}

// ============================================================
//  Seções do Código
// ============================================================
const codeSections = [
  {
    id: "includes",
    title: "Includes e Definições",
    description: "Bibliotecas necessárias, definições de pinos e constantes do protocolo CI-V.",
    lines: `#include <Arduino.h>
#include <WiFi.h>
#include <WiFiAP.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <BluetoothSerial.h>

// Pinagem
#define PIN_LED_STATUS    2
#define PIN_CIV_TX        17
#define PIN_CIV_RX        16
#define CIV_UART_BAUD     9600

// Constantes CI-V
#define CIV_PREAMBLE      0xFE
#define CIV_TERMINATOR    0xFD
#define CIV_CONTROLLER    0xE0   // ESP32
#define CIV_CMD_FREQ      0x03   // Ler frequência
#define CIV_CMD_SET_FREQ  0x05   // Definir frequência
#define CIV_CMD_MODE      0x04   // Ler modo
#define CIV_CMD_PTT_ON    0x1C   // Controle PTT`,
  },
  {
    id: "config",
    title: "Estrutura de Configuração",
    description: "Struct com todas as configurações persistidas na NVS do ESP32.",
    lines: `struct Config {
  // Rede AP
  String  apSSID;          // SSID do Access Point
  String  apPassword;      // Senha WPA2
  String  apIP;            // IP do dispositivo
  String  apGateway;       // Gateway
  String  apSubnet;        // Máscara de sub-rede
  String  dhcpStart;       // Início do pool DHCP
  String  dhcpEnd;         // Fim do pool DHCP

  // Rede STA
  bool    staEnabled;      // Habilitar modo STA
  String  staSSID;         // SSID da rede local
  String  staPassword;     // Senha WPA/WPA2
  String  staStaticIP;     // IP estático (opcional)
  bool    staDHCP;         // Usar DHCP no STA

  // Bluetooth
  bool    btEnabled;       // Habilitar Bluetooth
  String  btName;          // Nome do dispositivo BT

  // CI-V
  uint8_t civAddress;      // Endereço hex do rádio
  uint32_t civBaud;        // Velocidade UART CI-V
} cfg;`,
  },
  {
    id: "wifi-ap",
    title: "Inicialização WiFi AP",
    description: "Configuração do Access Point com IP estático e servidor DHCP integrado.",
    lines: `void startAP() {
  IPAddress apIP    = parseIP(cfg.apIP);
  IPAddress apGW    = parseIP(cfg.apGateway);
  IPAddress apSub   = parseIP(cfg.apSubnet);

  // Modo AP+STA simultâneo se STA habilitado
  WiFi.mode(cfg.staEnabled ? WIFI_AP_STA : WIFI_AP);

  // Configurar IP estático do AP
  WiFi.softAPConfig(apIP, apGW, apSub);

  // Iniciar AP com SSID e senha WPA2
  WiFi.softAP(cfg.apSSID.c_str(),
              cfg.apPassword.c_str());

  // O servidor DHCP é iniciado automaticamente
  // pelo ESP32 Arduino Core junto com o AP
  state.apActive = true;

  Serial.printf("[WiFi-AP] SSID: %s | IP: %s\\n",
    cfg.apSSID.c_str(),
    WiFi.softAPIP().toString().c_str());
}`,
  },
  {
    id: "wifi-sta",
    title: "Conexão WiFi STA",
    description: "Conexão a rede local com suporte a IP estático e DHCP.",
    lines: `void startSTA() {
  // Configurar IP estático se necessário
  if (!cfg.staDHCP && cfg.staStaticIP.length() > 0) {
    WiFi.config(
      parseIP(cfg.staStaticIP),
      parseIP(cfg.staGateway),
      parseIP(cfg.staSubnet)
    );
  }

  WiFi.begin(cfg.staSSID.c_str(),
             cfg.staPassword.c_str());

  // Aguardar conexão (timeout 15 segundos)
  uint8_t tries = 0;
  while (WiFi.status() != WL_CONNECTED
         && tries < 30) {
    delay(500);
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    state.staConnected = true;
    state.staIP = WiFi.localIP().toString();
    Serial.printf("[WiFi-STA] IP: %s\\n",
                  state.staIP.c_str());
  }
}`,
  },
  {
    id: "bluetooth",
    title: "Bluetooth SPP",
    description: "Inicialização e loop de recebimento de dados via Bluetooth Serial.",
    lines: `BluetoothSerial SerialBT;

void startBluetooth() {
  // Iniciar com nome configurável
  SerialBT.begin(cfg.btName.c_str());
  Serial.printf("[BT] Iniciado: %s\\n",
                cfg.btName.c_str());
}

void handleBluetooth() {
  if (!cfg.btEnabled) return;

  // Monitorar estado de conexão
  bool connected = SerialBT.connected();
  if (connected != state.btConnected) {
    state.btConnected = connected;
    Serial.println(connected
      ? "[BT] Cliente conectado."
      : "[BT] Cliente desconectado.");
  }

  // Receber dados e encaminhar para CI-V
  while (SerialBT.available()) {
    uint8_t b = SerialBT.read();
    civSerial.write(b);  // Forward para CI-V UART
    state.lastBtActivity = millis();
  }
}`,
  },
  {
    id: "civ",
    title: "Protocolo CI-V",
    description: "Processamento de frames CI-V e bridge bidirecional Bluetooth↔CI-V.",
    lines: `HardwareSerial civSerial(2);  // UART2

void startCIV() {
  civSerial.begin(cfg.civBaud, SERIAL_8N1,
                  PIN_CIV_RX, PIN_CIV_TX);
  state.civActive = true;
}

// Enviar comando CI-V para o rádio
void sendCIVCommand(uint8_t addr, uint8_t cmd,
                    uint8_t* data, uint8_t dataLen) {
  uint8_t frame[64];
  uint8_t idx = 0;

  frame[idx++] = CIV_PREAMBLE;    // 0xFE
  frame[idx++] = CIV_PREAMBLE;    // 0xFE
  frame[idx++] = addr;             // Dest (rádio)
  frame[idx++] = CIV_CONTROLLER;  // Src (ESP32 = 0xE0)
  frame[idx++] = cmd;              // Comando

  for (uint8_t i = 0; i < dataLen; i++)
    frame[idx++] = data[i];

  frame[idx++] = CIV_TERMINATOR;  // 0xFD

  civSerial.write(frame, idx);
}

// Processar frame recebido do rádio
void processCIVFrame(uint8_t* buf, uint8_t len) {
  if (len < 4) return;
  if (buf[0] != 0xFE || buf[1] != 0xFE) return;

  uint8_t destAddr = buf[2];
  uint8_t srcAddr  = buf[3];
  uint8_t cmd      = buf[4];

  // Encaminhar resposta para Bluetooth
  if (state.btConnected) {
    SerialBT.write(buf, len);
  }
}`,
  },
  {
    id: "webserver",
    title: "Servidor Web e API REST",
    description: "Configuração das rotas HTTP para a interface de configuração e API JSON.",
    lines: `AsyncWebServer webServer(80);

void setupWebServer() {
  // Página de configuração (HTML em PROGMEM)
  webServer.on("/", HTTP_GET,
    [](AsyncWebServerRequest* req) {
      req->send_P(200, "text/html", CONFIG_HTML);
    }
  );

  // API: Status do sistema
  webServer.on("/api/status", HTTP_GET,
    [](AsyncWebServerRequest* req) {
      req->send(200, "application/json",
                getStatusJSON());
    }
  );

  // API: Salvar config AP (POST com JSON)
  webServer.on("/api/config/ap", HTTP_POST,
    [](AsyncWebServerRequest* req) {},
    nullptr,
    [](AsyncWebServerRequest* req,
       uint8_t* data, size_t len,
       size_t, size_t) {
      DynamicJsonDocument doc(512);
      deserializeJson(doc, data, len);
      cfg.apSSID = doc["apSSID"].as<String>();
      cfg.apPassword = doc["apPass"].as<String>();
      saveConfig();
      stopAP(); delay(100); startAP();
      req->send(200, "application/json",
                "{\\"ok\\":true}");
    }
  );

  // API: Scan de redes WiFi
  webServer.on("/api/wifi/scan", HTTP_GET,
    scanWiFiNetworks);

  webServer.begin();
}`,
  },
  {
    id: "nvs",
    title: "Persistência NVS",
    description: "Salvar e carregar configurações na memória não-volátil do ESP32.",
    lines: `Preferences prefs;

void loadConfig() {
  prefs.begin("civ-gw", false);

  cfg.apSSID     = prefs.getString("apSSID",
                     "ESP32-CIV-GW");
  cfg.apPassword = prefs.getString("apPass",
                     "esp32civ");
  cfg.apIP       = prefs.getString("apIP",
                     "192.168.4.1");
  cfg.btEnabled  = prefs.getBool("btEnabled",
                     true);
  cfg.btName     = prefs.getString("btName",
                     "ESP32-CIV");
  cfg.civAddress = (uint8_t)prefs.getUInt(
                     "civAddr", 0x94);
  cfg.civBaud    = prefs.getUInt("civBaud",
                     9600);
  prefs.end();
}

void saveConfig() {
  prefs.begin("civ-gw", false);
  prefs.putString("apSSID",    cfg.apSSID);
  prefs.putString("apPass",    cfg.apPassword);
  prefs.putBool("btEnabled",   cfg.btEnabled);
  prefs.putString("btName",    cfg.btName);
  prefs.putUInt("civAddr",     cfg.civAddress);
  prefs.putUInt("civBaud",     cfg.civBaud);
  prefs.end();
}`,
  },
];

// ============================================================
//  Componente de Seção de Código
// ============================================================
function CodeSection({ section }: { section: typeof codeSections[0] }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(section.lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-[rgba(79,195,247,0.15)] rounded-sm overflow-hidden mb-3">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-[rgba(26,39,68,0.7)] hover:bg-[rgba(26,39,68,0.9)] transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown size={14} className="text-[#4fc3f7]/60" />
          ) : (
            <ChevronRight size={14} className="text-[#4fc3f7]/60" />
          )}
          <span className="font-['Space_Grotesk'] font-semibold text-sm text-white">
            {section.title}
          </span>
          <span className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans'] hidden sm:block">
            — {section.description}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); copy(); }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-['IBM_Plex_Mono'] text-[#94a3b8] hover:text-[#4fc3f7] border border-[rgba(79,195,247,0.1)] rounded-sm transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </button>

      {expanded && (
        <div className="bg-[rgba(11,20,35,0.8)] overflow-x-auto">
          <pre className="p-4 text-xs font-['IBM_Plex_Mono'] leading-relaxed">
            {section.lines.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none w-8 flex-shrink-0 text-[#4fc3f7]/20 text-right pr-3 font-['IBM_Plex_Mono']">
                  {i + 1}
                </span>
                <span className="text-[#e2e8f0]">{line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Página
// ============================================================
export default function Code() {
  const [copiedAll, setCopiedAll] = useState(false);

  const copyAll = () => {
    const all = codeSections.map((s) => `// === ${s.title} ===\n${s.lines}`).join("\n\n");
    navigator.clipboard.writeText(all);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0d1b2a]">
      <NavBar />
      <div className="pt-14">
        <div className="container py-10">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
            <SectionLabel number="SRC" label="Código-Fonte" />
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-white mb-2">
                  ESP32_CIV_Gateway.ino
                </h1>
                <p className="text-[#94a3b8] text-sm font-['IBM_Plex_Sans']">
                  Código-fonte completo organizado por módulos funcionais.
                  Clique em cada seção para expandir ou recolher.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={copyAll}
                  className="flex items-center gap-2 px-4 py-2 border border-[rgba(79,195,247,0.2)] text-[#4fc3f7] text-xs font-['IBM_Plex_Mono'] rounded-sm hover:bg-[rgba(79,195,247,0.08)] transition-colors"
                >
                  {copiedAll ? <Check size={13} /> : <Copy size={13} />}
                  {copiedAll ? "Copiado!" : "Copiar Tudo"}
                </button>
                <a
                  href="/manus-storage/ESP32_CIV_Gateway_3429e4d6.ino"
                  download="ESP32_CIV_Gateway.ino"
                  className="flex items-center gap-2 px-4 py-2 bg-[#4fc3f7] text-[#0d1b2a] text-xs font-bold font-['IBM_Plex_Mono'] rounded-sm hover:bg-[#81d4fa] transition-colors active:scale-95"
                >
                  <Download size={13} />
                  Download .ino
                </a>
              </div>
            </div>
          </motion.div>

          {/* File header */}
          <div className="mb-4 p-3 bg-[rgba(11,20,35,0.8)] border border-[rgba(79,195,247,0.1)] rounded-sm font-['IBM_Plex_Mono'] text-xs">
            <div className="text-[#546e7a]">{"/*"}</div>
            <div className="text-[#546e7a] pl-1">{"* ESP32 CI-V Gateway — Firmware Completo"}</div>
            <div className="text-[#546e7a] pl-1">{"* Funcionalidades: Bluetooth SPP, WiFi AP+STA,"}</div>
            <div className="text-[#546e7a] pl-1">{"*   Servidor DHCP, Protocolo CI-V Icom, Web Config"}</div>
            <div className="text-[#546e7a] pl-1">{"* Plataforma: ESP32 Arduino Core >= 2.0.0"}</div>
            <div className="text-[#546e7a] pl-1">{"* Licença: MIT"}</div>
            <div className="text-[#546e7a]">{"*/"}</div>
          </div>

          {/* Code sections */}
          <div>
            {codeSections.map((section) => (
              <CodeSection key={section.id} section={section} />
            ))}
          </div>

          {/* Download CTA */}
          <div className="mt-8 p-6 border border-[rgba(79,195,247,0.15)] rounded-sm bg-[rgba(26,39,68,0.4)] text-center">
            <p className="text-[#94a3b8] text-sm mb-4 font-['IBM_Plex_Sans']">
              Este é um resumo dos módulos principais. O arquivo completo inclui o HTML da
              interface web embarcada, todas as rotas da API REST e o código de inicialização.
            </p>
            <a
              href="/manus-storage/ESP32_CIV_Gateway_3429e4d6.ino"
              download="ESP32_CIV_Gateway.ino"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#4fc3f7] text-[#0d1b2a] font-bold text-sm rounded font-['IBM_Plex_Mono'] hover:bg-[#81d4fa] transition-colors active:scale-95"
            >
              <Download size={16} />
              Download Arquivo Completo — ESP32_CIV_Gateway.ino
            </a>
          </div>
        </div>
      </div>

      <footer className="border-t border-[rgba(79,195,247,0.08)] py-6">
        <div className="container text-center">
          <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Mono']">
            ESP32 CI-V Gateway — MIT License — Código Open Source
          </p>
        </div>
      </footer>
    </div>
  );
}
