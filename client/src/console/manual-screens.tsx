import { useEffect, useState } from "react";
import { useSiteLang, type Pair } from "@/pages/site-lang";
import { SCREEN_SIZES } from "./manual-screens.sizes";

/**
 * Capturas reais do console (modo demonstração) usadas no manual do dispositivo e no portal.
 * Arquivos em client/public/telas/<nome>.webp — gerados por `node scripts/capture-manual.mjs`
 * (ver docs/capturas-manual.md). Dados fictícios: indicativo PY2XYZ, IPs de exemplo.
 */
type ScreenText = { alt: Pair; caption: Pair };

export const SCREENS: Record<string, ScreenText> = {
  "console-login": {
    alt: { pt: "Tela de login do console Ham Cockpit", en: "Ham Cockpit console sign-in screen" },
    caption: { pt: "Tela de entrada do console: usuário e senha.", en: "Console sign-in: user and password." },
  },
  "console-painel": {
    alt: { pt: "Painel do console com VFO, banda, modo e ganhos do rádio", en: "Console panel with VFO, band, mode and radio gains" },
    caption: {
      pt: "Operação → Painel: VFO, botões de banda, modo, PTT e ganhos RF/AF do rádio principal.",
      en: "Operation → Panel: VFO, band buttons, mode, PTT and RF/AF gains of the primary radio.",
    },
  },
  "console-painel-tx": {
    alt: { pt: "Painel do console com o PTT ativo em transmissão", en: "Console panel with PTT active (transmitting)" },
    caption: {
      pt: "Painel em transmissão: com o PTT ligado, o console e os indicadores de potência mostram o TX.",
      en: "Panel while transmitting: with PTT on, the console and power meters show TX.",
    },
  },
  "console-menu-celular": {
    alt: { pt: "Menu lateral do console aberto no celular", en: "Console side menu open on a phone" },
    caption: { pt: "No celular, o botão ☰ abre o mesmo menu da versão para PC.", en: "On a phone the ☰ button opens the same menu as the desktop layout." },
  },
  "console-status": {
    alt: { pt: "Tela Status com SoC, temperatura, memória, disco e serviços", en: "Status screen with SoC, temperature, memory, disk and services" },
    caption: {
      pt: "Sistema → Status: Raspberry Pi (SoC, temperatura, memória, disco, carga) e a situação de cada serviço.",
      en: "System → Status: Raspberry Pi (SoC, temperature, memory, disk, load) and the state of each service.",
    },
  },
  "console-status-celular": {
    alt: { pt: "Tela Status no celular", en: "Status screen on a phone" },
    caption: { pt: "A mesma tela Status em uma tela de celular.", en: "The same Status screen on a phone." },
  },
  "console-servicos": {
    alt: { pt: "Lista de serviços do Ham Cockpit com botões de iniciar, parar e reiniciar", en: "Ham Cockpit services list with start, stop and restart buttons" },
    caption: {
      pt: "Admin → Serviços: cada serviço mostra a situação e permite iniciar, parar ou reiniciar.",
      en: "Admin → Services: each service shows its state and can be started, stopped or restarted.",
    },
  },
  "console-atualizacoes": {
    alt: { pt: "Tela de atualizações com uma nova versão disponível", en: "Updates screen with a new version available" },
    caption: {
      pt: "Admin → Atualização: versão instalada, versão disponível e o botão para atualizar (OTA).",
      en: "Admin → Update: installed version, available version and the update (OTA) button.",
    },
  },
  "console-atualizacoes-progresso": {
    alt: { pt: "Atualização em andamento com barras de progresso", en: "Update in progress with progress bars" },
    caption: {
      pt: "Atualização em andamento: o console mostra o progresso do aplicativo e do Wavelog. Não desligue o Pi.",
      en: "Update in progress: the console shows progress for the app and Wavelog. Do not power off the Pi.",
    },
  },
  "console-admin": {
    alt: { pt: "Tela Admin com troca de senha e usuários Linux", en: "Admin screen with password change and Linux users" },
    caption: {
      pt: "Admin: trocar a senha, criar usuários (SSH e sudo) e reiniciar ou restaurar o dispositivo.",
      en: "Admin: change the password, create users (SSH and sudo) and restart or reset the device.",
    },
  },
  "console-backup": {
    alt: { pt: "Tela de backup e restauração da configuração", en: "Configuration backup and restore screen" },
    caption: { pt: "Admin → Backup: baixar e restaurar a configuração da estação.", en: "Admin → Backup: download and restore the station configuration." },
  },
  "console-terminal": {
    alt: { pt: "Terminal web do console", en: "Console web terminal" },
    caption: { pt: "Admin → Terminal: shell no navegador, sem precisar de SSH.", en: "Admin → Terminal: a shell in the browser, no SSH needed." },
  },
  "console-logs": {
    alt: { pt: "Diário do sistema com filtros por serviço", en: "System log with per-service filters" },
    caption: { pt: "Admin → Logs: diário do sistema com filtros por serviço (BLE, CIV, WiFi, ser2net, MMDVM…).", en: "Admin → Logs: system log with per-service filters (BLE, CIV, WiFi, ser2net, MMDVM…)." },
  },
  "console-rede-wifi": {
    alt: { pt: "Tela de Wi‑Fi com redes e Wi‑Fi do próprio Pi", en: "Wi‑Fi screen with networks and the Pi's own AP" },
    caption: {
      pt: "Rede → WiFi: conexão à rede da casa (STA) e Wi‑Fi do próprio Pi (AP) para uso no campo.",
      en: "Network → WiFi: home network (STA) and the Pi's own Wi‑Fi (AP) for field use.",
    },
  },
  "console-bluetooth": {
    alt: { pt: "Tela Bluetooth com dispositivos pareados", en: "Bluetooth screen with paired devices" },
    caption: { pt: "Rede → Bluetooth: adaptador, busca e dispositivos pareados.", en: "Network → Bluetooth: adapter, scan and paired devices." },
  },
  "console-radio-ic705-lan": {
    alt: { pt: "Cadastro do IC-705 pela rede (Icom LAN)", en: "IC-705 registration over the network (Icom LAN)" },
    caption: {
      pt: "Rádio → IC-705 pela rede (Icom LAN): IP do rádio, usuário e senha do rádio e conexão CI-V remota.",
      en: "Radio → IC-705 over the network (Icom LAN): radio IP, radio user and password, remote CI-V connection.",
    },
  },
  "console-ser2net": {
    alt: { pt: "Tela ser2net com conexões IP para portas seriais", en: "ser2net screen with IP connections for serial ports" },
    caption: {
      pt: "ser2net: cada serial (rádio, amplificador, sintonizador…) vira uma conexão IP em 127.0.0.1 e uma porta TCP.",
      en: "ser2net: each serial port (radio, amplifier, tuner…) becomes an IP connection on 127.0.0.1 and a TCP port.",
    },
  },
  "console-wavelog": {
    alt: { pt: "Tela Wavelog e WaveLogGate com banco de dados e serviços", en: "Wavelog and WaveLogGate screen with database and services" },
    caption: {
      pt: "Operação → Wavelog: banco de dados, logbook, WaveLogGate (UDP 2333) e mapa de portas e pastas.",
      en: "Operation → Wavelog: database, logbook, WaveLogGate (UDP 2333) and port/folder map.",
    },
  },
  "console-mmdvm": {
    alt: { pt: "Tela MMDVM com estado do hotspot e display Nextion", en: "MMDVM screen with hotspot state and Nextion display" },
    caption: { pt: "Operação → MMDVM: estado do hotspot e a simulação do display Nextion.", en: "Operation → MMDVM: hotspot state and the Nextion display preview." },
  },
  "console-mmdvm-redes": {
    alt: { pt: "MMDVM com a seção de redes DMR Gateway", en: "MMDVM with the DMR Gateway networks section" },
    caption: { pt: "MMDVM → Redes DMR Gateway: redes ligadas e status de cada uma.", en: "MMDVM → DMR Gateway networks: connected networks and their status." },
  },
  "console-mmdvm-ouvidos": {
    alt: { pt: "MMDVM com a lista de últimos ouvidos", en: "MMDVM with the last-heard list" },
    caption: { pt: "MMDVM → Últimos ouvidos: quem transmitiu na rede, com modo e duração.", en: "MMDVM → Last heard: who transmitted on the network, with mode and duration." },
  },
  "console-spe": {
    alt: { pt: "Painel do amplificador SPE Expert 1.3K-FA", en: "SPE Expert 1.3K-FA amplifier panel" },
    caption: { pt: "Dispositivos → SPE: réplica do painel frontal do Expert 1.3K-FA.", en: "Devices → SPE: replica of the Expert 1.3K-FA front panel." },
  },
  "console-ldg": {
    alt: { pt: "Tela do sintonizador LDG AT com medidores de potência e ROE", en: "LDG AT tuner screen with power and SWR meters" },
    caption: { pt: "Dispositivos → LDG AT: sintonizador automático com potência, ROE e comandos.", en: "Devices → LDG AT: automatic tuner with power, SWR and commands." },
  },
  "console-lp100a": {
    alt: { pt: "Tela do wattímetro LP-100A com potência, impedância e ROE", en: "LP-100A wattmeter screen with power, impedance and SWR" },
    caption: { pt: "Dispositivos → LP-100A: potência, impedância, fase e ROE em tempo real.", en: "Devices → LP-100A: power, impedance, phase and SWR in real time." },
  },
  "console-lextel": {
    alt: { pt: "Tela do wattímetro Lextel MS-2000 com leitura em transmissão", en: "Lextel MS-2000 wattmeter screen reading during transmission" },
    caption: { pt: "Dispositivos → Lextel: PEP, média, refletida, ROE e o dump do Bluetooth Classic (SPP).", en: "Devices → Lextel: PEP, average, reflected, SWR and the Bluetooth Classic (SPP) dump." },
  },
  "console-hamplus": {
    alt: { pt: "Painel da chave de antena Hamplus AS-603WL", en: "Hamplus AS-603WL antenna switch panel" },
    caption: { pt: "Dispositivos → Hamplus: chave de antena, rotor e chave de rádio.", en: "Devices → Hamplus: antenna switch, rotor and radio switch." },
  },
  "console-palstar": {
    alt: { pt: "Painel do sintonizador Palstar AT-AUTO", en: "Palstar AT-AUTO tuner panel" },
    caption: { pt: "Dispositivos → Palstar: modos Auto, Manual e Bypass, antena e Tune.", en: "Devices → Palstar: Auto, Manual and Bypass modes, antenna and Tune." },
  },
  "console-acom": {
    alt: { pt: "Painel do amplificador ACOM 2000A", en: "ACOM 2000A amplifier panel" },
    caption: { pt: "Dispositivos → ACOM: amplificador 2000A com banda, antena e controle de operação.", en: "Devices → ACOM: 2000A amplifier with band, antenna and operate control." },
  },
  "console-assistente": {
    alt: { pt: "Assistente Config Device Wizard", en: "Config Device Wizard" },
    caption: { pt: "Config Device Wizard: cadastra rádio e acessórios em passos guiados.", en: "Config Device Wizard: registers the radio and accessories in guided steps." },
  },
};

export type ScreenName = keyof typeof SCREENS;

/**
 * Figura de captura real: `loading="lazy"`, largura responsiva, legenda e clique para ampliar.
 * `narrow` limita a largura (capturas de celular).
 */
export function Screen({ name, narrow = false, className = "" }: { name: string; narrow?: boolean; className?: string }) {
  const { lang } = useSiteLang();
  const [open, setOpen] = useState(false);
  const info = SCREENS[name];
  const size = SCREEN_SIZES[name];
  const src = `/telas/${name}.webp`;
  const alt = info ? info.alt[lang === "en" ? "en" : "pt"] : name;
  const caption = info ? info.caption[lang === "en" ? "en" : "pt"] : "";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const zoomLabel = lang === "en" ? "Click to enlarge" : "Clique para ampliar";

  return (
    <>
      <figure
        className={`overflow-hidden rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#071018] ${narrow ? "mx-auto max-w-[260px]" : ""} ${className}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full cursor-zoom-in"
          title={zoomLabel}
          aria-label={`${alt} — ${zoomLabel}`}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            width={size?.[0]}
            height={size?.[1]}
            className="h-auto w-full"
          />
        </button>
        <figcaption className="px-4 py-2.5 text-xs leading-relaxed text-[#8ea0b3]">
          {caption} <span className="text-[#5d7186]">({zoomLabel.toLowerCase()})</span>
        </figcaption>
      </figure>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-start justify-center overflow-auto bg-black/85 p-3 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed right-4 top-4 rounded-lg border border-[rgba(79,195,247,0.4)] bg-[#0a1520] px-3 py-1.5 text-sm text-[#4fc3f7]"
          >
            {lang === "en" ? "Close" : "Fechar"} ✕
          </button>
          <img src={src} alt={alt} className="h-auto max-w-full rounded-lg border border-[rgba(79,195,247,0.25)]" style={{ width: size?.[0] }} />
        </div>
      ) : null}
    </>
  );
}
