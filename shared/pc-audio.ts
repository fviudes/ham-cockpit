/** Escolha do dispositivo de áudio de recepção. O CI-V e o Bluetooth LE não carregam esse som. */

export type AlsaCapture = { card: number; device: number };

const ONBOARD = /bcm2835|vc4|hdmi|headphone/i;
/** Codec USB do rádio na estação (ALSA). No computador o som sai por uma saída, não por microfone. */
const RADIO_USB = /icom|usb audio|usb codec/i;

export const PC_VOLUME_MAX = 9;

export function stepPcVolume(current: number, deltaY: number): number {
  if (!deltaY) return clampVolume(current);
  const dir = deltaY < 0 ? 1 : -1;
  return clampVolume(current + dir);
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(PC_VOLUME_MAX, Math.max(0, Math.round(value)));
}

/** Ganho linear: 0 mudo, 9 no máximo. */
export function pcVolumeGain(level: number): number {
  return clampVolume(level) / PC_VOLUME_MAX;
}

/** A escala antiga ia até 100. Acima de 9, converte para 0–9. */
export function readPcVolume(raw: string | null): number {
  const n = Number(raw ?? "6");
  if (!Number.isFinite(n)) return 6;
  if (n > PC_VOLUME_MAX) return clampVolume(Math.round((n / 100) * PC_VOLUME_MAX));
  return clampVolume(n);
}

const MIC = /microphone|microfone|mixagem|stereo mix/i;

/** Saída de reprodução (alto-falante, fone, placa). Microfone não entra. */
export function pickAudioOutput(devices: { kind: string; deviceId: string; label: string }[]): string | null {
  const outputs = devices.filter((d) => d.kind === "audiooutput" && d.deviceId && !MIC.test(d.label));
  const speakers = outputs.find((d) => /speaker|alto-falante|headphone|fone|realtek|default/i.test(d.label));
  if (speakers) return speakers.deviceId;
  const named = outputs.find((d) => d.label.trim());
  return named?.deviceId ?? outputs[0]?.deviceId ?? null;
}

/**
 * `arecord -l`. Ignora o fone da placa do Pi. Prefere o codec USB (IC-705, 7300, 7100 e afins).
 * Áudio de rede Icom (UDP 50003) não aparece aqui.
 */
export function pickAlsaCapture(listing: string): AlsaCapture | null {
  const found: { card: number; device: number; id: string; name: string }[] = [];
  const re = /^card (\d+):\s*(\S+)\s*\[([^\]]+)\],\s*device (\d+):/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(listing))) {
    found.push({
      card: Number(match[1]),
      id: match[2] ?? "",
      name: match[3] ?? "",
      device: Number(match[4]),
    });
  }
  const usable = found.filter((d) => !ONBOARD.test(d.id) && !ONBOARD.test(d.name));
  const usb = usable.find((d) => RADIO_USB.test(`${d.id} ${d.name}`) || /usb/i.test(`${d.id} ${d.name}`));
  const hit = usb ?? (usable.length === 1 ? usable[0] : null);
  return hit ? { card: hit.card, device: hit.device } : null;
}

/** Playback no codec USB do rádio — mesmo card/dispositivo da captura (duplex). */
export function pickAlsaPlayback(listing: string, capture: AlsaCapture | null = pickAlsaCapture(listing)): AlsaCapture | null {
  return capture;
}

const MMDVM_PCM = /loopback|mmdvm|dv3000|thumb|ambe|monitor/i;

/**
 * Captura PCM decodificado do hotspot (não o codec USB do rádio).
 * Prefere loopback AMBE/Analog_Bridge; senão um segundo USB de áudio.
 */
export function pickAlsaMmdvmMonitor(listing: string): AlsaCapture | null {
  const found: { card: number; device: number; id: string; name: string }[] = [];
  const re = /^card (\d+):\s*(\S+)\s*\[([^\]]+)\],\s*device (\d+):/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(listing))) {
    found.push({
      card: Number(match[1]),
      id: match[2] ?? "",
      name: match[3] ?? "",
      device: Number(match[4]),
    });
  }
  const radio = pickAlsaCapture(listing);
  const usable = found.filter((d) => !ONBOARD.test(d.id) && !ONBOARD.test(d.name));
  const loop = usable.find((d) => MMDVM_PCM.test(`${d.id} ${d.name}`));
  if (loop) return { card: loop.card, device: loop.device };
  for (const d of usable) {
    if (RADIO_USB.test(`${d.id} ${d.name}`) || /usb/i.test(`${d.id} ${d.name}`)) {
      if (radio && d.card === radio.card && d.device === radio.device) continue;
      return { card: d.card, device: d.device };
    }
  }
  return null;
}
