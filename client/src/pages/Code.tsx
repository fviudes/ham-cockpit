/*
 * Code Page — ESP32 CI-V Gateway v4.0 MINIMAL
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

const codeSections = [
  {
    id: "includes",
    title: "Includes e Definições",
    description: "Bibliotecas necessárias (apenas ArduinoJson), definições de pinos e constantes do protocolo CI-V.",
    lines: `#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <BluetoothSerial.h>

#define PIN_LED 2
#define PIN_CIV_TX 17
#define PIN_CIV_RX 16

struct Cfg {
  String ap_ssid, ap_pass, ap_ip;
  bool bt_en;
  String bt_name;
  uint8_t civ_addr;
  uint32_t civ_baud;
} cfg;

WebServer srv(80);
BluetoothSerial BT;
HardwareSerial civ(2);
Preferences p;
bool bt_connected = false;`,
  },
  {
    id: "html",
    title: "Interface Web (HTML Minificado)",
    description: "HTML minificado armazenado em PROGMEM. Contém 4 abas: Status, WiFi AP, Bluetooth, CI-V.",
    lines: `const char HTML[] PROGMEM = "<!DOCTYPE html><html><head><meta charset=utf-8>"
"<meta name=viewport content=width=device-width><title>CI-V</title>"
"<style>body{font-family:Arial;background:#0d1b2a;color:#e2e8f0;padding:20px}"
".c{max-width:500px;margin:0 auto}h1{color:#4fc3f7}input,select{width:100%;"
"padding:8px;margin:5px 0;background:#1a2742;border:1px solid #4fc3f7;"
"color:#e2e8f0;box-sizing:border-box}button{padding:10px 15px;background:#4fc3f7;"
"color:#0d1b2a;border:0;cursor:pointer;margin:5px 5px 5px 0;font-weight:bold}"
".s{padding:10px;background:#1a2742;border-left:3px solid #4fc3f7;margin:10px 0}"
".t{display:none}.t.a{display:block}</style></head><body><div class=c>"
"<h1>ESP32 CI-V</h1><div style=margin-bottom:20px><button onclick=t('s')>Status</button>"
"<button onclick=t('a')>AP</button><button onclick=t('b')>BT</button>"
"<button onclick=t('c')>CI-V</button></div>"
// ... (continua com as abas e JavaScript)
"</body></html>";`,
  },
  {
    id: "setup",
    title: "Função Setup()",
    description: "Inicialização do firmware: Serial, GPIO, NVS, WiFi AP, Bluetooth e WebServer.",
    lines: `void setup(){
  Serial.begin(115200);
  delay(500);
  Serial.println("\\n[SETUP] ESP32 CI-V MINIMAL v4.0");
  
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  
  // Carregar configurações do NVS
  p.begin("civ", true);
  cfg.ap_ssid = p.getString("as", "ESP32-CIV-GW");
  cfg.ap_pass = p.getString("ap", "esp32civ");
  cfg.ap_ip = p.getString("ai", "192.168.4.1");
  cfg.bt_en = p.getBool("be", true);
  cfg.bt_name = p.getString("bn", "ESP32-CIV");
  cfg.civ_addr = (uint8_t)p.getUInt("ca", 0x94);
  cfg.civ_baud = p.getUInt("cb", 9600);
  p.end();
  
  // Inicializar CI-V UART
  civ.begin(cfg.civ_baud, SERIAL_8N1, PIN_CIV_RX, PIN_CIV_TX);
  
  // Inicializar WiFi AP
  IPAddress ip(192, 168, 4, 1);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(ip, ip, IPAddress(255, 255, 255, 0));
  WiFi.softAP(cfg.ap_ssid.c_str(), cfg.ap_pass.c_str());
  
  // Inicializar Bluetooth
  if(cfg.bt_en){
    BT.begin(cfg.bt_name.c_str());
  }
  
  setup_web();
  
  Serial.println("[SETUP] OK");
  digitalWrite(PIN_LED, HIGH);
}`,
  },
  {
    id: "loop",
    title: "Função Loop()",
    description: "Bridge bidirecional: CI-V UART ↔ Bluetooth SPP. Processa requisições HTTP.",
    lines: `void loop(){
  srv.handleClient();
  
  // CI-V para Bluetooth
  if(civ.available()){
    uint8_t b = civ.read();
    if(BT.connected()) BT.write(b);
  }
  
  // Bluetooth para CI-V
  if(BT.connected()){
    if(!bt_connected){
      bt_connected = true;
      Serial.println("[BT] Conectado");
    }
    while(BT.available()){
      uint8_t b = BT.read();
      civ.write(b);
    }
  } else {
    if(bt_connected){
      bt_connected = false;
      Serial.println("[BT] Desconectado");
    }
  }
  
  delay(5);
}`,
  },
  {
    id: "api",
    title: "Endpoints da API REST",
    description: "Rotas HTTP para status, configuração e teste de CI-V.",
    lines: `srv.on("/", HTTP_GET, [](){
  srv.send_P(200, "text/html", HTML);
});

srv.on("/api/st", HTTP_GET, [](){
  String json = "{\\\"ap\\\":1,\\\"bt\\\":";
  json += BT.connected() ? "1" : "0";
  json += ",\\\"ca\\\":" + String(cfg.civ_addr);
  json += ",\\\"cb\\\":" + String(cfg.civ_baud) + "}";
  srv.send(200, "application/json", json);
});

srv.on("/api/sap", HTTP_POST, [](){
  if(srv.hasArg("plain")){
    String body = srv.arg("plain");
    // Parse JSON e salvar em NVS
    cfg.ap_ssid = extractValue(body, "as");
    cfg.ap_pass = extractValue(body, "ap");
    cfg.ap_ip = extractValue(body, "ai");
    p.begin("civ", false);
    p.putString("as", cfg.ap_ssid);
    p.putString("ap", cfg.ap_pass);
    p.putString("ai", cfg.ap_ip);
    p.end();
  }
  srv.send(200, "text/plain", "OK");
});

srv.on("/api/scv", HTTP_POST, [](){
  // Salvar configuração CI-V e reiniciar UART
  cfg.civ_addr = extractHex(body, "ca");
  cfg.civ_baud = extractInt(body, "cb");
  civ.end();
  delay(100);
  civ.begin(cfg.civ_baud, SERIAL_8N1, PIN_CIV_RX, PIN_CIV_TX);
  srv.send(200, "text/plain", "OK");
});`,
  },
];

export default function Code() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["includes"]));

  const toggleSection = (id: string) => {
    const newSet = new Set(expandedSections);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedSections(newSet);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-[#0d1b2a]">
      <NavBar />
      <div className="pt-14">
        <div className="container py-10">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <SectionLabel number="CODE" label="Código-Fonte" />
            <h1 className="font-['Space_Grotesk'] font-bold text-3xl text-white mb-2">
              ESP32 CI-V Gateway v4.0 MINIMAL
            </h1>
            <p className="text-[#94a3b8] text-base mb-10 font-['IBM_Plex_Sans']">
              Código-fonte completo do firmware ultra-otimizado. Selecione as seções para explorar ou
              baixe o arquivo `.ino` completo.
            </p>
          </motion.div>

          {/* Download Button */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
            <a
              href="https://cdn.example.com/ESP32_CIV_Gateway_Minimal.ino"
              download
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#4fc3f7] text-[#0d1b2a] font-bold rounded hover:bg-[#81d4fa] transition-colors"
            >
              <Download size={16} />
              Download ESP32_CIV_Gateway_Minimal.ino
            </a>
          </motion.div>

          {/* Code Sections */}
          <div className="space-y-4">
            {codeSections.map((section, i) => (
              <motion.div
                key={section.id}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="border border-[rgba(79,195,247,0.15)] rounded-sm overflow-hidden bg-[rgba(26,39,68,0.3)]"
              >
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-[rgba(79,195,247,0.05)] transition-colors"
                >
                  <div className="flex-1 text-left">
                    <h3 className="font-['Space_Grotesk'] font-semibold text-white mb-1">{section.title}</h3>
                    <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Sans']">{section.description}</p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    {expandedSections.has(section.id) ? (
                      <ChevronDown size={20} className="text-[#4fc3f7]" />
                    ) : (
                      <ChevronRight size={20} className="text-[#4fc3f7]/50" />
                    )}
                  </div>
                </button>

                {/* Section Content */}
                {expandedSections.has(section.id) && (
                  <div className="border-t border-[rgba(79,195,247,0.1)]">
                    <div className="relative">
                      <div className="flex items-center justify-between px-4 py-2 bg-[rgba(11,20,35,0.9)] border-b border-[rgba(79,195,247,0.1)]">
                        <span className="text-[10px] text-[#4fc3f7]/50 font-['IBM_Plex_Mono'] uppercase tracking-widest">
                          cpp
                        </span>
                        <button
                          onClick={() => copyToClipboard(section.lines)}
                          className="flex items-center gap-1 text-[10px] text-[#94a3b8] hover:text-[#4fc3f7] font-['IBM_Plex_Mono'] transition-colors"
                        >
                          <Copy size={12} />
                          Copiar
                        </button>
                      </div>
                      <pre className="p-4 bg-[rgba(11,20,35,0.7)] overflow-x-auto text-xs font-['IBM_Plex_Mono'] leading-relaxed text-[#e2e8f0]">
                        <code>{section.lines}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Info Box */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mt-8 p-4 border border-[rgba(79,195,247,0.15)] rounded-sm bg-[rgba(26,39,68,0.3)]">
            <h3 className="font-['Space_Grotesk'] font-semibold text-white mb-2">Informações Adicionais</h3>
            <ul className="space-y-1.5 text-xs text-[#94a3b8] font-['IBM_Plex_Sans']">
              <li>• <strong>Tamanho total:</strong> ~450 KB (37% do espaço disponível)</li>
              <li>• <strong>Dependências:</strong> Apenas ArduinoJson 6.21.0</li>
              <li>• <strong>WebServer:</strong> Nativa do ESP32 (sem ESPAsyncWebServer)</li>
              <li>• <strong>Compilação:</strong> Leva ~30-45 segundos em máquina típica</li>
              <li>• <strong>Upload:</strong> Leva ~5-10 segundos via USB a 921600 bps</li>
            </ul>
          </motion.div>

          {/* Quick Reference */}
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mt-8 p-4 border border-[rgba(79,195,247,0.15)] rounded-sm bg-[rgba(26,39,68,0.3)]">
            <h3 className="font-['Space_Grotesk'] font-semibold text-white mb-3">Referência Rápida</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-['IBM_Plex_Mono']">
              {[
                ["Rede WiFi", "ESP32-CIV-GW"],
                ["Senha WiFi", "esp32civ"],
                ["IP Padrão", "192.168.4.1"],
                ["Porta HTTP", "80"],
                ["Baud Rate CI-V", "9600 bps"],
                ["GPIO CI-V RX", "GPIO 16"],
                ["GPIO CI-V TX", "GPIO 17"],
                ["GPIO LED", "GPIO 2"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[#4fc3f7]/70">{label}</span>
                  <span className="text-[#e2e8f0] font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[rgba(79,195,247,0.08)] py-6">
        <div className="container text-center">
          <p className="text-xs text-[#94a3b8] font-['IBM_Plex_Mono']">
            ESP32 CI-V Gateway v4.0 MINIMAL — Código-Fonte — MIT License
          </p>
        </div>
      </footer>
    </div>
  );
}
