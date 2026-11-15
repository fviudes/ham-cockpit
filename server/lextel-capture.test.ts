import { describe, expect, it } from "vitest";
import {
  CAPTURE_RING_MAX,
  LextelDecoder,
  RECONNECT_AFTER_DROP_MS,
  RECONNECT_CAP_MS,
  captureStreamStalled,
  nextReconnectDelay,
  pushCaptureRing,
} from "./lextel-parse";

describe("anel da captura do Lextel", () => {
  it("não passa do teto", () => {
    let ring = Buffer.alloc(0);
    const chunk = Buffer.alloc(1000, 0x41);
    for (let i = 0; i < 40; i++) ring = pushCaptureRing(ring, chunk);
    expect(ring.length).toBe(CAPTURE_RING_MAX);
    expect(ring.length).toBeLessThan(40_000);
  });

  it("esvazia a janela e conserva o mapa", () => {
    const dec = new LextelDecoder({ kind: "ascii" });
    dec.push(Buffer.from("A:12\n"));
    expect(dec.lastHex.length).toBeGreaterThan(0);
    dec.trimWindow();
    expect(dec.layout?.kind).toBe("ascii");
    expect(dec.lastHex).toBe("");
    expect(dec.bytes).toBe(5);
  });

  it("trata silêncio longo como captura parada", () => {
    const attached = 1_000;
    expect(captureStreamStalled(attached + 3_000, attached, attached)).toBe(false);
    expect(captureStreamStalled(attached + 9_000, attached + 8_000, attached)).toBe(false);
    expect(captureStreamStalled(attached + 20_000, attached + 1_000, attached)).toBe(true);
  });

  it("espera um minuto depois que o open não atende", () => {
    expect(nextReconnectDelay(8_000, "drop")).toBe(RECONNECT_AFTER_DROP_MS);
    expect(nextReconnectDelay(RECONNECT_AFTER_DROP_MS, "drop")).toBe(RECONNECT_AFTER_DROP_MS);
    expect(nextReconnectDelay(600, "grow")).toBe(900);
    expect(nextReconnectDelay(RECONNECT_CAP_MS, "grow")).toBe(RECONNECT_CAP_MS);
  });
});
