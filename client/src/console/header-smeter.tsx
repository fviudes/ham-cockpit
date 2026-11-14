/**
 * Medidor do menu, no formato da skin ICOM / banner do Flexible S-Meter
 * (Jan Svabenik, HB9HSJ — flexiblesmeter.svabi.ch).
 *
 * Geometria do arco S: calibration.txt da skin (centro 246,490, 16 pontos
 * de S0 a S9+60). Agulha só se move com leitura real do rádio; sem sinal
 * fica no batente esquerdo (S0), sem número de dBm.
 */

const CX = 246;
const CY = 490;

/** Ângulos em graus a partir da vertical, da skin (S0 … S9, +10 … +60). */
const S_ANGLES = [
  -22.96, -20.05, -17.39, -15.18, -12.68, -10.42, -7.77, -5.21, -2.67, 0, 3.81, 6.86, 10.81, 14.53,
  18.36, 22.55,
];

const WHITE = "#f4f1ee";
const RED = "#ff1208";
const BLUE = "#0081ff";

function polar(deg: number, radius: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + Math.sin(rad) * radius, CY - Math.cos(rad) * radius];
}

function arcPath(radius: number, a0: number, a1: number): string {
  const [x0, y0] = polar(a0, radius);
  const [x1, y1] = polar(a1, radius);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function needleAngle(reading: number | null): number {
  if (reading == null || !Number.isFinite(reading)) return S_ANGLES[0]!;
  const v = Math.min(12, Math.max(0, reading));
  if (v <= 9) {
    const i = Math.floor(v);
    const f = v - i;
    return S_ANGLES[i]! + (S_ANGLES[i + 1]! - S_ANGLES[i]!) * f;
  }
  const steps = ((v - 9) / 3) * 6;
  const i = Math.min(5, Math.floor(steps));
  const f = steps - i;
  const a0 = S_ANGLES[9 + i]!;
  const a1 = S_ANGLES[Math.min(15, 10 + i)]!;
  return a0 + (a1 - a0) * f;
}

function Mark({
  angle,
  text,
  radius,
  fill,
  size,
}: {
  angle: number;
  text: string;
  radius: number;
  fill: string;
  size: number;
}) {
  const [x, y] = polar(angle, radius);
  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontSize={size}
      fontFamily="IBM Plex Mono, ui-monospace, monospace"
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {text}
    </text>
  );
}

function Ticks({
  radius,
  from,
  to,
  color,
  len,
}: {
  radius: number;
  from: number;
  to: number;
  color: string;
  len: number;
}) {
  const n = 9;
  const lines = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    const [x0, y0] = polar(a, radius);
    const [x1, y1] = polar(a, radius + (i % 3 === 0 ? len : len * 0.55));
    lines.push(
      <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeWidth={i % 3 === 0 ? 1.6 : 1} />,
    );
  }
  return <>{lines}</>;
}

export function HeaderSMeter({ reading }: { reading: number | null }) {
  const angle = needleAngle(reading);
  const [tipX, tipY] = polar(angle, 468);
  const a0 = S_ANGLES[0]!;
  const a9 = S_ANGLES[9]!;
  const aEnd = S_ANGLES[15]!;
  const live = reading != null && Number.isFinite(reading);

  return (
    <div
      className="h-full shrink-0 overflow-hidden rounded-[3px] bg-black"
      style={{ aspectRatio: "478 / 200" }}
      role="meter"
      aria-label={live ? "Medidor S" : "Medidor S em repouso"}
      aria-valuemin={0}
      aria-valuemax={12}
      aria-valuenow={live ? Math.round(reading * 10) / 10 : undefined}
      aria-valuetext={live ? undefined : "sem sinal"}
    >
      <svg viewBox="0 0 478 200" className="h-full w-full" aria-hidden="true">
        <path d={arcPath(449, a0, a9)} stroke={WHITE} strokeWidth={15} fill="none" />
        <path d={arcPath(449, a9, aEnd)} stroke={RED} strokeWidth={15} fill="none" />
        {S_ANGLES.map((a, i) => {
          const major = i === 1 || i === 5 || i === 9 || i === 11 || i === 13 || i === 15;
          const [x0, y0] = polar(a, major ? 436 : 441);
          const [x1, y1] = polar(a, 462);
          const over = i > 9;
          return (
            <line
              key={a}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={over ? RED : WHITE}
              strokeWidth={major ? 2.2 : 1.2}
            />
          );
        })}
        <Mark angle={S_ANGLES[1]!} text="1" radius={478} fill={WHITE} size={20} />
        <Mark angle={S_ANGLES[5]!} text="5" radius={478} fill={WHITE} size={20} />
        <Mark angle={S_ANGLES[9]!} text="9" radius={476} fill={WHITE} size={20} />
        <Mark angle={S_ANGLES[11]!} text="+20" radius={478} fill={RED} size={16} />
        <Mark angle={S_ANGLES[13]!} text="+40" radius={476} fill={RED} size={16} />
        <Mark angle={S_ANGLES[15]! - 1.2} text="+60dB" radius={470} fill={RED} size={15} />
        <text x={28} y={96} fill={WHITE} fontSize={22} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          S
        </text>

        <path d={arcPath(412, a0 + 1, aEnd - 0.4)} stroke={WHITE} strokeWidth={5} fill="none" />
        <Ticks radius={404} from={a0 + 2} to={aEnd - 1} color={WHITE} len={12} />
        <text x={22} y={118} fill={WHITE} fontSize={13} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          ID
        </text>
        <Mark angle={-18} text="0" radius={424} fill={WHITE} size={13} />
        <Mark angle={-8} text="10" radius={424} fill={WHITE} size={13} />
        <Mark angle={4} text="20" radius={424} fill={WHITE} size={13} />
        <Mark angle={16} text="30" radius={422} fill={WHITE} size={13} />
        <Mark angle={21.2} text="A" radius={418} fill={WHITE} size={13} />

        <path d={arcPath(378, a0 + 1.5, aEnd - 0.6)} stroke={WHITE} strokeWidth={11} fill="none" />
        <text x={18} y={140} fill={WHITE} fontSize={13} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          PO
        </text>
        <Mark angle={-16} text="0" radius={392} fill={WHITE} size={13} />
        <Mark angle={-8} text="10" radius={392} fill={WHITE} size={12} />
        <Mark angle={-1} text="20" radius={390} fill={WHITE} size={12} />
        <Mark angle={8} text="50" radius={390} fill={WHITE} size={12} />
        <Mark angle={15} text="100" radius={388} fill={WHITE} size={12} />

        <path d={arcPath(352, a0 + 2, aEnd - 1)} stroke={WHITE} strokeWidth={4} fill="none" />
        <text x={36} y={158} fill={WHITE} fontSize={12} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          SWR
        </text>
        <Mark angle={-14} text="1" radius={360} fill={WHITE} size={12} />
        <Mark angle={-6} text="1.5" radius={360} fill={WHITE} size={11} />
        <Mark angle={1} text="2" radius={358} fill={WHITE} size={12} />
        <Mark angle={8} text="3" radius={358} fill={WHITE} size={12} />
        <Mark angle={16.5} text="∞" radius={356} fill={WHITE} size={14} />

        <path d={arcPath(328, a0 + 3, aEnd - 1)} stroke={BLUE} strokeWidth={6} fill="none" />
        <path d={arcPath(316, -8, 8)} stroke={RED} strokeWidth={8} fill="none" strokeLinecap="butt" />
        <text x={34} y={176} fill={BLUE} fontSize={12} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          COMP
        </text>
        <Mark angle={-12} text="0" radius={334} fill={BLUE} size={12} />
        <Mark angle={-2} text="10" radius={332} fill={BLUE} size={11} />
        <Mark angle={8} text="20" radius={330} fill={BLUE} size={11} />
        <Mark angle={17} text="dB" radius={328} fill={BLUE} size={12} />
        <text x={214} y={192} fill={RED} fontSize={12} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700} textAnchor="middle">
          ALC
        </text>
        <text x={300} y={188} fill={WHITE} fontSize={11} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          10
        </text>
        <text x={332} y={186} fill={WHITE} fontSize={12} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          16V
        </text>
        <text x={372} y={188} fill={WHITE} fontSize={12} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontWeight={700}>
          VD
        </text>

        <line
          x1={CX}
          y1={CY}
          x2={tipX}
          y2={tipY}
          stroke="#f7f7f7"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
