import { describe, expect, it } from "vitest";
import { pickAlsaCapture, pickAudioOutput, readPcVolume, stepPcVolume } from "./pc-audio";

describe("áudio do rádio no PC", () => {
  it("sobe e desce o volume no scroll", () => {
    expect(stepPcVolume(5, -1)).toBe(6);
    expect(stepPcVolume(5, 1)).toBe(4);
    expect(stepPcVolume(9, -1)).toBe(9);
    expect(stepPcVolume(0, 1)).toBe(0);
    expect(stepPcVolume(4, 0)).toBe(4);
  });

  it("converte a escala antiga de 0 a 100", () => {
    expect(readPcVolume(null)).toBe(6);
    expect(readPcVolume("7")).toBe(7);
    expect(readPcVolume("70")).toBe(6);
    expect(readPcVolume("100")).toBe(9);
  });

  it("escolhe a saída de áudio e ignora microfone", () => {
    const id = pickAudioOutput([
      { kind: "audioinput", deviceId: "mic", label: "Microphone (Realtek)" },
      { kind: "audioinput", deviceId: "codec-in", label: "Microphone (USB Audio CODEC)" },
      { kind: "audiooutput", deviceId: "spk", label: "Speakers (Realtek High Definition Audio)" },
      { kind: "audiooutput", deviceId: "cable", label: "CABLE Input (VB-Audio Virtual Cable)" },
    ]);
    expect(id).toBe("spk");
    expect(pickAudioOutput([{ kind: "audioinput", deviceId: "mic", label: "Microphone (Realtek)" }])).toBeNull();
  });

  it("no Pi, ignora o fone interno e fica com o USB", () => {
    const listing = `
**** List of CAPTURE Hardware Devices ****
card 0: Headphones [bcm2835 Headphones], device 0: bcm2835 Headphones [bcm2835 Headphones]
card 1: CODEC [USB Audio CODEC], device 0: USB Audio [USB Audio]
`;
    expect(pickAlsaCapture(listing)).toEqual({ card: 1, device: 0 });
    expect(pickAlsaCapture("card 0: Headphones [bcm2835 Headphones], device 0: bcm2835 Headphones [bcm2835 Headphones]")).toBeNull();
  });
});
