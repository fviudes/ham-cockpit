import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import NavBar from "@/components/NavBar";
import { FigAcomCable, FigBoot, FigIc705, FigSer2net, FigTtl, FigWavelog } from "@/console/manual-diagrams";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const sections = [
  { id: "visao", label: "O que é" },
  { id: "ligar", label: "Primeiro acesso" },
  { id: "radio", label: "Rádio e Lextel" },
  { id: "digital", label: "Wavelog e Hamlib" },
  { id: "cabos", label: "Cabos" },
  { id: "manual", label: "Manual completo" },
];

export default function Docs() {
  const [active, setActive] = useState("visao");
  const [, navigate] = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <div className="pt-14">
        <div className="container py-12">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
            <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">DOCUMENTAÇÃO · v2.0</p>
            <h1 className="font-['Space_Grotesk'] text-4xl font-bold text-white sm:text-5xl">Ham Cockpit, sem ESP32</h1>
            <p className="mt-3 max-w-2xl text-[#94a3b8]">
              Guia público. O manual do operador (23 capítulos, PT e EN, diagramas e exemplos) está no console, em Sistema → Manual.
            </p>
          </motion.div>

          <div className="grid gap-6 lg:grid-cols-4">
            <aside className="lg:col-span-1">
              <div className="sticky top-20 rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0a1118] p-4">
                <p className="mb-3 font-['IBM_Plex_Mono'] text-[10px] tracking-widest text-[#4fc3f7]/60 uppercase">Seções</p>
                <div className="space-y-1">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActive(s.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        active === s.id ? "bg-[#4fc3f7]/15 text-[#4fc3f7]" : "text-[#94a3b8] hover:text-[#4fc3f7]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <motion.div key={active} initial="hidden" animate="visible" variants={fadeUp} className="lg:col-span-3">
              <div className="rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-6">
                {active === "visao" && (
                  <>
                    <h2 className="mb-3 font-['Space_Grotesk'] text-2xl font-bold text-white">O que é o Ham Cockpit</h2>
                    <p className="mb-3 leading-relaxed text-[#94a3b8]">
                      Appliance da estação num Raspberry Pi 3 ou 4 (Debian Bookworm). O console é este site: rádio, wattímetro, logbook, Hamlib, SPE, Hamplus, Palstar, ACOM, Wi‑Fi e admin. Não há firmware ESP32 nem 4 UARTs CI-V no GPIO.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-[#c5d4e0]">
                      <li>IC-705 por Web Bluetooth GATT (CI-V 0xA4)</li>
                      <li>Lextel MS-2000 por Bluetooth Classic SPP (só escuta)</li>
                      <li>Outros rádios por USB/CAT</li>
                      <li>Wavelog na 8086, WaveLogGate UDP 2333, ser2net + Hamlib :4532</li>
                    </ul>
                  </>
                )}
                {active === "ligar" && (
                  <>
                    <h2 className="mb-3 font-['Space_Grotesk'] text-2xl font-bold text-white">Primeiro acesso</h2>
                    <FigBoot caption="ISO no cartão → Pi ligado → Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit) → http://192.168.4.1/console → admin / 1234." />
                    <p className="mt-3 text-sm text-[#94a3b8]">
                      Use Chrome ou Edge. Web Bluetooth não funciona no Firefox. Depois, em WiFi, entre na rede da casa; o Pi fica com o AP 192.168.4.1 e o IP do roteador (veja Status). Nome na LAN: ham-cockpit.local.
                    </p>
                  </>
                )}
                {active === "radio" && (
                  <>
                    <h2 className="mb-3 font-['Space_Grotesk'] text-2xl font-bold text-white">Rádio e Lextel</h2>
                    <FigIc705 caption="Pairing Reception no IC-705, Conectar no console, aceite Ham-Cockpit-Web01. PIN Windows 0000 se pedir." />
                    <p className="mt-3 text-sm leading-relaxed text-[#94a3b8]">
                      Marque Principal na tabela de rádios cadastrados para o console reconectar sozinho. O Lextel é outro Bluetooth (Classic SPP, COM de saída no Windows). Os dois ficam ligados juntos; se o COM cair no handshake GATT, o SPP reabre sozinho.
                    </p>
                  </>
                )}
                {active === "digital" && (
                  <>
                    <h2 className="mb-3 font-['Space_Grotesk'] text-2xl font-bold text-white">Wavelog e Hamlib</h2>
                    <FigWavelog caption="WSJT-X UDP 2333 → Gate → API Wavelog → QSO no logbook." />
                    <FigSer2net caption="TTY → ser2net :4001 → rigctld -m 3085 → NET :4532. Só um processo na serial." />
                    <p className="mt-3 text-sm text-[#94a3b8]">
                      Instalador do logbook: http://IP-do-Pi:8086/install, host do banco wavelog-db. Não coloque Apache na porta 80.
                    </p>
                  </>
                )}
                {active === "cabos" && (
                  <>
                    <h2 className="mb-3 font-['Space_Grotesk'] text-2xl font-bold text-white">Níveis elétricos</h2>
                    <FigTtl caption="GPIO do Pi é 3,3 V. SPE, Palstar e Hamplus são RS232 de PC. Use USB-serial MAX3232." />
                    <FigAcomCable caption="ACOM 2000A: 1200 8N1, null-modem só 2–3 / 3–2 / 5–5. CAT do rádio no RCU, não nesta DB9." />
                    <p className="mt-3 text-sm text-[#94a3b8]">
                      USB e Bluetooth não precisam de conversor. No Pi prefira /dev/serial/by-id/… — o nome não muda quando troca de USB.
                    </p>
                  </>
                )}
                {active === "manual" && (
                  <>
                    <h2 className="mb-3 font-['Space_Grotesk'] text-2xl font-bold text-white">Manual do operador</h2>
                    <p className="mb-4 text-sm leading-relaxed text-[#94a3b8]">
                      23 capítulos com índice, passos, receitas (campo, FT8, HF com SPE/ACOM) e tabela de problemas. PT-BR e EN. Cada secção tem um botão para abrir a aba correspondente.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate("/console/manual")}
                      className="rounded-lg bg-[#4fc3f7] px-6 py-3 font-semibold text-[#0d1b2a] hover:bg-[#80d8ff]"
                    >
                      Abrir o manual no console
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
