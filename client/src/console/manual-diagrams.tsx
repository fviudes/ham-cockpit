/** Illustrated diagrams for the operator manual. Inline SVG — no image assets. */

export function FigStation({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 220" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="220" rx="12" fill="#071018" />
        <Box x={20} y={54} w={130} h={70} title="IC-705" sub="GATT · CI-V" fill="#12324a" />
        <Box x={20} y={140} w={130} h={50} title="MS-2000" sub="SPP Classic" fill="#1a2e1a" />
        <Arrow x1={150} y1={89} x2={230} y2={110} label="BLE" />
        <Arrow x1={150} y1={165} x2={230} y2={130} label="SPP" />
        <Box x={232} y={70} w={180} h={90} title="Ham Cockpit" sub="Raspberry Pi · :80" fill="#0d2a3a" accent />
        <Arrow x1={412} y1={115} x2={498} y2={115} label="HTTP" />
        <Box x={500} y={70} w={90} h={90} title="Você" sub="Chrome" fill="#12324a" />
        <Box x={610} y={28} w={90} h={54} title="Wavelog" sub=":8086" fill="#2a2410" />
        <Box x={610} y={98} w={90} h={54} title="Hamlib" sub=":4532" fill="#2a2410" />
        <Box x={610} y={168} w={90} h={36} title="WSJT-X" sub="UDP 2333" fill="#2a2410" />
        <Arrow x1={545} y1={90} x2={610} y2={55} />
        <Arrow x1={545} y1={115} x2={610} y2={125} />
        <Arrow x1={545} y1={145} x2={610} y2={186} />
      </svg>
    </Figure>
  );
}

export function FigBoot({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 150" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="150" rx="12" fill="#071018" />
        <Step n="1" x={16} title="Grave o cartão" sub="flash.ps1 · ISO" />
        <Chev x={144} />
        <Step n="2" x={158} title="Ligue o Pi" sub="LED verde" />
        <Chev x={286} />
        <Step n="3" x={300} title="Wi‑Fi do Pi" sub="Ham-Cockpit-XXXX" />
        <Chev x={428} />
        <Step n="4" x={442} title="Abra o site" sub="192.168.4.1" />
        <Chev x={570} />
        <Step n="5" x={584} title="admin / 1234" sub="entrar" />
      </svg>
    </Figure>
  );
}

export function FigIc705({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 210" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="210" rx="12" fill="#071018" />
        <Box x={24} y={28} w={210} h={154} title="No IC-705" sub={"Menu → Set\nBluetooth Set\nPairing Reception\n(deixe aberto)"} fill="#1a2430" />
        <Arrow x1={234} y1={105} x2={300} y2={105} label="1" />
        <Box x={302} y={28} w={200} h={154} title="No console" sub={"Dispositivos → Rádio\nIcom · Bluetooth · CI-V\n0xA4 · Conectar\naceite Ham-Cockpit-Web01"} fill="#0d2a3a" accent />
        <Arrow x1={502} y1={105} x2={568} y2={105} label="2" />
        <Box x={570} y={28} w={126} h={154} title="Pronto" sub={"CI-V OK\nchip verde\ncheckbox Principal"} fill="#122a1c" />
      </svg>
    </Figure>
  );
}

export function FigDualBt({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 170" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="170" rx="12" fill="#071018" />
        <Box x={40} y={40} w={150} h={90} title="IC-705" sub="BLE GATT" fill="#12324a" />
        <Box x={530} y={40} w={150} h={90} title="MS-2000" sub="Classic SPP" fill="#1a2e1a" />
        <Box x={270} y={30} w={180} h={110} title="Um adaptador" sub={"dois rádios ao mesmo tempo\nGATT + SPP"} fill="#0d2a3a" accent />
        <Arrow x1={190} y1={85} x2={270} y2={85} />
        <Arrow x1={450} y1={85} x2={530} y2={85} />
      </svg>
    </Figure>
  );
}

export function FigWavelog({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 130" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="130" rx="12" fill="#071018" />
        <Step n="1" x={12} w={118} title="WSJT-X" sub="UDP 2333" />
        <Chev x={134} />
        <Step n="2" x={152} w={118} title="WaveLogGate" sub="pacote QSO" />
        <Chev x={274} />
        <Step n="3" x={292} w={118} title="API Wavelog" sub="chave + station" />
        <Chev x={414} />
        <Step n="4" x={432} w={118} title="Logbook" sub=":8086" />
        <Chev x={554} />
        <Step n="5" x={572} w={136} title="QSO salvo" sub="automático" />
      </svg>
    </Figure>
  );
}

export function FigWavelogArch({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 250" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="250" rx="12" fill="#071018" />
        <Box x={16} y={18} w={150} h={64} title="WSJT-X / JTDX" sub="UDP Secondary 2333" fill="#2a2410" />
        <Box x={16} y={98} w={150} h={64} title="Hamlib NET" sub="rigctld :4532" fill="#2a2410" />
        <Box x={16} y={178} w={150} h={54} title="Cluster / Bandmap" sub="callback QSY" fill="#2a2410" />
        <Arrow x1={166} y1={50} x2={248} y2={92} label="QSO" />
        <Arrow x1={166} y1={130} x2={248} y2={118} label="f / m" />
        <Arrow x1={248} y1={160} x2={166} y2={200} label="QSY" />
        <Box x={250} y={78} w={200} h={94} title="WaveLogGate" sub={"headless · /opt/wavelog-gate\nUDP 2333 · HTTP 54321"} fill="#0d2a3a" accent />
        <Arrow x1={450} y1={110} x2={528} y2={70} label="api/qso" />
        <Arrow x1={450} y1={140} x2={528} y2={150} label="api/radio" />
        <Box x={530} y={28} w={174} h={80} title="Wavelog" sub="Docker :8086 · MariaDB" fill="#12324a" />
        <Box x={530} y={124} w={174} h={54} title="Live CAT" sub="freq + mode" fill="#12324a" />
        <Box x={530} y={192} w={174} h={40} title="queue.jsonl" sub="if API is down" fill="#1a2e1a" />
      </svg>
    </Figure>
  );
}

export function FigWavelogCat({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 150" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="150" rx="12" fill="#071018" />
        <Box x={16} y={36} w={130} h={78} title="Rádio" sub="USB CAT / GATT" fill="#12324a" />
        <Arrow x1={146} y1={75} x2={210} y2={75} />
        <Box x={212} y={36} w={140} h={78} title="ser2net + rigctld" sub="127.0.0.1:4532" fill="#0d2a3a" accent />
        <Arrow x1={352} y1={75} x2={416} y2={75} label="f / m 4 s" />
        <Box x={418} y={36} w={130} h={78} title="Gate" sub="PUBLISH_CAT=1" fill="#2a2410" />
        <Arrow x1={548} y1={75} x2={592} y2={75} />
        <Box x={594} y={36} w={110} h={78} title="Wavelog" sub="api/radio" fill="#12324a" />
      </svg>
    </Figure>
  );
}

export function FigWavelogContest({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 150" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="150" rx="12" fill="#071018" />
        <Step n="1" x={12} w={128} title="Sessão" sub="Contest Manager" />
        <Chev x={144} />
        <Step n="2" x={158} w={128} title="START" sub="Logging Engine" />
        <Chev x={290} />
        <Step n="3" x={304} w={128} title="CAT radio" sub="freq do Gate" />
        <Chev x={436} />
        <Step n="4" x={450} w={128} title="QSO Enter" sub="serial / exch" />
        <Chev x={582} />
        <Step n="5" x={580} w={128} title="Logbook" sub="Cabrillo / ADIF" />
      </svg>
    </Figure>
  );
}

export function FigMmdvm({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 160" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="160" rx="12" fill="#071018" />
        <Box x={12} y={36} w={110} h={88} title="Rádio DV" sub="DMR · YSF · M17" fill="#12324a" />
        <Arrow x1={122} y1={80} x2={168} y2={80} label="RF" />
        <Box x={170} y={36} w={120} h={88} title="Modem" sub={"HAT 3,3 V\n/dev/ttyAMA0"} fill="#2a2410" />
        <Arrow x1={290} y1={80} x2={336} y2={80} label="115200" />
        <Box x={338} y={28} w={160} h={104} title="MMDVMHost" sub={"WPSD INI\nRemote :7642"} fill="#0d2a3a" accent />
        <Arrow x1={498} y1={80} x2={544} y2={80} label="62031" />
        <Box x={546} y={36} w={162} h={88} title="DMRGateway" sub="BM · TGIF · XLX" fill="#12324a" />
      </svg>
    </Figure>
  );
}

export function FigSer2net({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 110" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="110" rx="12" fill="#071018" />
        <Box x={16} y={28} w={120} h={54} title="USB / TTY" sub="só o ser2net" fill="#12324a" />
        <Arrow x1={136} y1={55} x2={188} y2={55} />
        <Box x={190} y={28} w={140} h={54} title="ser2net" sub="127.0.0.1:4001" fill="#0d2a3a" accent />
        <Arrow x1={330} y1={55} x2={382} y2={55} />
        <Box x={384} y={28} w={150} h={54} title="rigctld" sub="-r 127.0.0.1:4001" fill="#12324a" />
        <Arrow x1={534} y1={55} x2={586} y2={55} />
        <Box x={588} y={28} w={116} h={54} title="Apps" sub="Hamlib :4532" fill="#2a2410" />
      </svg>
    </Figure>
  );
}

export function FigTtl({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 160" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="160" rx="12" fill="#071018" />
        <Box x={20} y={40} w={150} h={80} title="Pi GPIO" sub="3,3 V UART" fill="#3a1a1a" />
        <text x={188} y={84} fill="#f87171" fontSize="13" fontFamily="IBM Plex Mono, monospace">
          NÃO
        </text>
        <Arrow x1={170} y1={80} x2={250} y2={80} />
        <Box x={252} y={40} w={160} h={80} title="SPE / Palstar" sub="RS232 ±12 V" fill="#3a1a1a" />
        <text x={430} y={36} fill="#34d399" fontSize="12" fontFamily="IBM Plex Sans, sans-serif">
          Use USB-serial + MAX3232
        </text>
        <Box x={500} y={40} w={200} h={80} title="USB-RS232" sub="MAX3232 · DB9" fill="#122a1c" />
      </svg>
    </Figure>
  );
}

export function FigAcomCable({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 140" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="140" rx="12" fill="#071018" />
        <Box x={30} y={30} w={200} h={80} title="PC / Pi USB" sub="adaptador RS232" fill="#12324a" />
        <text x={250} y={55} fill="#ffb300" fontSize="11" fontFamily="IBM Plex Mono, monospace">
          2↔3  3↔2  5↔5
        </text>
        <text x={250} y={74} fill="#8ea0b3" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
          null-modem curto
        </text>
        <text x={250} y={92} fill="#f87171" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
          sem pinos extras
        </text>
        <Arrow x1={230} y1={70} x2={430} y2={70} />
        <Box x={432} y={30} w={256} h={80} title="ACOM 2000A DB9" sub="1200 8N1 · CAT no RCU, não aqui" fill="#0d2a3a" accent />
      </svg>
    </Figure>
  );
}

export function FigScreen({ caption }: { caption: string }) {
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 720 220" className="h-auto w-full" role="img" aria-label={caption}>
        <rect width="720" height="220" rx="12" fill="#071018" />
        <rect x="12" y="12" width="140" height="196" rx="8" fill="#0b1520" stroke="#4fc3f733" />
        <text x="24" y="36" fill="#ffb300" fontSize="11" fontFamily="Space Grotesk, sans-serif">
          MENU
        </text>
        {["Painel", "Wavelog", "Rádio", "Lextel", "WiFi", "Manual"].map((t, i) => (
          <text key={t} x="24" y={60 + i * 22} fill={i === 2 ? "#4fc3f7" : "#8ea0b3"} fontSize="11" fontFamily="IBM Plex Sans, sans-serif">
            {t}
          </text>
        ))}
        <rect x="164" y="12" width="544" height="40" rx="8" fill="#0b1520" stroke="#4fc3f733" />
        <text x="180" y="38" fill="#7ee0ff" fontSize="16" fontFamily="IBM Plex Mono, monospace">
          7.100.00
        </text>
        <text x="300" y="36" fill="#8ea0b3" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
          MHz · USB
        </text>
        <rect x="430" y="20" width="88" height="24" rx="6" fill="#10b98126" />
        <text x="442" y="36" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono, monospace">
          IC-705 CI-V
        </text>
        <rect x="528" y="20" width="86" height="24" rx="6" fill="#10b98126" />
        <text x="538" y="36" fill="#34d399" fontSize="10" fontFamily="IBM Plex Mono, monospace">
          MS-2000 SPP
        </text>
        <rect x="624" y="20" width="70" height="24" rx="6" fill="#4fc3f722" />
        <text x="640" y="36" fill="#4fc3f7" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
          PT / EN
        </text>
        <rect x="164" y="64" width="544" height="144" rx="8" fill="#0b1520" stroke="#4fc3f733" />
        <text x="184" y="96" fill="#ffb300" fontSize="12" fontFamily="Space Grotesk, sans-serif">
          Área da página
        </text>
        <text x="184" y="120" fill="#8ea0b3" fontSize="11" fontFamily="IBM Plex Sans, sans-serif">
          Cada item do menu abre uma tela. Os chips no topo
        </text>
        <text x="184" y="138" fill="#8ea0b3" fontSize="11" fontFamily="IBM Plex Sans, sans-serif">
          mostram se o rádio principal e o Lextel estão no ar.
        </text>
      </svg>
    </Figure>
  );
}

function Figure({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#071018]">
      {children}
      <figcaption className="border-t border-[rgba(79,195,247,0.1)] px-4 py-2 text-xs leading-relaxed text-[#8ea0b3]">
        {caption}
      </figcaption>
    </figure>
  );
}

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  fill,
  accent,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  fill: string;
  accent?: boolean;
}) {
  const lines = sub.split("\n");
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={fill} stroke={accent ? "#4fc3f7" : "#4fc3f733"} />
      <text x={x + 12} y={y + 22} fill="#e8eef4" fontSize="13" fontFamily="Space Grotesk, sans-serif" fontWeight="600">
        {title}
      </text>
      {lines.map((line, i) => (
        <text key={line} x={x + 12} y={y + 42 + i * 14} fill="#8ea0b3" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
          {line}
        </text>
      ))}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  const id = `a${x1}${y1}${x2}${y2}`;
  return (
    <g>
      <defs>
        <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="#4fc3f7" />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4fc3f7" strokeWidth="1.5" markerEnd={`url(#${id})`} />
      {label ? (
        <text x={(x1 + x2) / 2} y={y1 - 6} fill="#ffb300" fontSize="9" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
          {label}
        </text>
      ) : null}
    </g>
  );
}

function Step({ n, x, title, sub, w = 128 }: { n: string; x: number; title: string; sub: string; w?: number }) {
  return (
    <g>
      <rect x={x} y={28} width={w} height={88} rx="8" fill="#0b1520" stroke="#4fc3f733" />
      <circle cx={x + 16} cy={46} r="10" fill="#4fc3f7" />
      <text x={x + 16} y={50} textAnchor="middle" fill="#071018" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        {n}
      </text>
      <text x={x + 12} y={74} fill="#e8eef4" fontSize="11" fontFamily="Space Grotesk, sans-serif">
        {title}
      </text>
      <text x={x + 12} y={92} fill="#8ea0b3" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
        {sub}
      </text>
    </g>
  );
}

function Chev({ x }: { x: number }) {
  return (
    <path d={`M${x} 68 l10 8 l-10 8`} fill="none" stroke="#4fc3f7" strokeWidth="1.5" />
  );
}
