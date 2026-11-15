import { describe, expect, it } from "vitest";
import {
  ScopeAssembler,
  bcdHz,
  civScopeOn,
  isCivFrequencyReply,
  isScopeWaveform,
  scopeCenterFrame,
  scopeEdgeHz,
  scopeSpanFrame,
  scopeOutputStale,
  scopePayload,
  scopeRadioWoke,
  scopeSwitchFrames,
} from "./icom-scope";

function hzBytes(hz: number): number[] {
  const out: number[] = [];
  let f = Math.max(0, Math.floor(hz));
  for (let i = 0; i < 5; i++) {
    out.push(((Math.floor((f % 100) / 10) << 4) | (f % 10)) & 0xff);
    f = Math.floor(f / 100);
  }
  return out;
}

describe("scope CI-V 0x27", () => {
  it("lê a frequência BCD do IC-705", () => {
    expect(bcdHz(Uint8Array.from(hzBytes(14_200_000)), 0)).toBe(14_200_000);
    expect(bcdHz(Uint8Array.from(hzBytes(100_000)), 0)).toBe(100_000);
  });

  it("no modo centro, a 1ª divisão guarda a faixa e a 2ª fecha o sweep", () => {
    const asm = new ScopeAssembler();
    const header = Uint8Array.from([
      0x00, 0x00, 0x01, 0x02, 0x00,
      ...hzBytes(14_200_000),
      ...hzBytes(100_000),
      0x00,
    ]);
    expect(asm.push(header)).toBeNull();
    const pixels = Uint8Array.from([0x00, 0x00, 0x02, 0x02, 0x10, 0xa0, 0x20]);
    const sweep = asm.push(pixels);
    expect(sweep?.startHz).toBe(14_100_000);
    expect(sweep?.endHz).toBe(14_300_000);
    expect(Array.from(sweep?.bins ?? [])).toEqual([0x10, 0xa0, 0x20]);
  });

  it("no modo fixo usa as duas bordas", () => {
    const asm = new ScopeAssembler();
    const header = Uint8Array.from([
      0x00, 0x00, 0x01, 0x01, 0x01,
      ...hzBytes(7_000_000),
      ...hzBytes(7_200_000),
      0x00,
      0x05, 0x06,
    ]);
    const sweep = asm.push(header);
    expect(sweep?.startHz).toBe(7_000_000);
    expect(sweep?.endHz).toBe(7_200_000);
    expect(Array.from(sweep?.bins ?? [])).toEqual([0x05, 0x06]);
  });

  it("fora da faixa não desenha linha vazia", () => {
    const asm = new ScopeAssembler();
    const header = Uint8Array.from([
      0x00, 0x00, 0x01, 0x02, 0x00,
      ...hzBytes(14_200_000),
      ...hzBytes(100_000),
      0x01,
    ]);
    expect(asm.push(header)).toBeNull();
  });

  it("ignora o scope Sub e lê o centro com o span de um lado", () => {
    const asm = new ScopeAssembler();
    const sub = Uint8Array.from([
      0x00, 0x01, 0x01, 0x01, 0x00,
      ...hzBytes(7_000_000),
      ...hzBytes(100_000),
      0x00,
      0x10,
    ]);
    expect(asm.push(sub)).toBeNull();
    const header = Uint8Array.from([
      0x00, 0x00, 0x01, 0x02, 0x00,
      ...hzBytes(14_200_000),
      ...hzBytes(25_000),
      0x00,
    ]);
    expect(asm.push(header)).toBeNull();
    const bins = new Array(50).fill(0x20);
    expect(asm.push(Uint8Array.from([0x00, 0x00, 0x02, 0x02, ...bins]))).toMatchObject({
      startHz: 14_175_000,
      endHz: 14_225_000,
    });
  });

  it("borda negativa usa o nibble F e o 27 10/11 sai no endereço do rádio", () => {
    const raw = Uint8Array.from([0x00, 0x10, 0x00, 0x00, 0xf0]);
    expect(scopeEdgeHz(raw, 0)).toBe(-1000);
    const on = scopeSwitchFrames(0xa4, true);
    expect(Array.from(on[0]!)).toEqual([0xfe, 0xfe, 0xa4, 0xe0, 0x27, 0x10, 0x01, 0xfd]);
    expect(Array.from(on[1]!)).toEqual([0xfe, 0xfe, 0xa4, 0xe0, 0x27, 0x11, 0x01, 0xfd]);
    expect(Array.from(scopeCenterFrame(0xa4))).toEqual([0xfe, 0xfe, 0xa4, 0xe0, 0x27, 0x14, 0x00, 0x00, 0xfd]);
    const span = scopeSpanFrame(0xa4);
    expect(Array.from(span)).toEqual([0xfe, 0xfe, 0xa4, 0xe0, 0x27, 0x15, 0x00, 0x00, 0x00, 0x25, 0x00, 0x00, 0xfd]);
    expect(bcdHz(span, 7)).toBe(250_000);
    expect(civScopeOn("icom-ic-705", "bluetooth")).toBe(true);
    expect(civScopeOn("icom-ic-7300", "lan")).toBe(false);
    expect(civScopeOn("icom-ic-7300", "serial")).toBe(true);
    expect(civScopeOn("icom-ic-7760", "lan")).toBe(true);
    const freq = Uint8Array.from([0xfe, 0xfe, 0xe0, 0xa4, 0x03, 0x00, 0x00, 0x14, 0x07, 0x00, 0xfd]);
    expect(isCivFrequencyReply(freq)).toBe(true);
    expect(isCivFrequencyReply(on[0]!)).toBe(false);
    expect(scopeRadioWoke(1_000, 1_000, 3_100)).toBe(true);
    expect(scopeRadioWoke(1_000, 1_000, 2_500)).toBe(false);
    expect(scopeRadioWoke(0, 1_000, 3_100)).toBe(true);
    expect(scopeOutputStale(0, 5_000, 7_100)).toBe(true);
    expect(scopeOutputStale(7_000, 5_000, 7_100)).toBe(false);
  });

  it("monta o USB do IC-705: cabeçalho de 22 bytes e 475 pontos", () => {
    const asm = new ScopeAssembler();
    const header = Uint8Array.from([
      0x00, 0x00, 0x01, 0x11, 0x03,
      0x00, 0x00, 0x03, 0x07, 0x00,
      0x00, 0x00, 0x23, 0x07, 0x00,
      0x00,
    ]);
    expect(asm.push(header)).toBeNull();
    for (let seq = 2; seq <= 10; seq++) {
      const seqByte = ((Math.floor(seq / 10) << 4) | (seq % 10)) & 0xff;
      const bins = new Array(50).fill(seq);
      expect(asm.push(Uint8Array.from([0x00, 0x00, seqByte, 0x11, ...bins]))).toBeNull();
    }
    const last = new Array(25).fill(0x2a);
    const sweep = asm.push(Uint8Array.from([0x00, 0x00, 0x11, 0x11, ...last]));
    expect(sweep?.startHz).toBe(7_030_000);
    expect(sweep?.endHz).toBe(7_230_000);
    expect(sweep?.mode).toBe(0x03);
    expect(sweep?.bins.length).toBe(475);
    expect(sweep?.bins[0]).toBe(2);
    expect(sweep?.bins[449]).toBe(10);
    expect(sweep?.bins[474]).toBe(0x2a);
  });

  it("reconhece o quadro e não encaminha o miolo para o Hamlib", () => {
    const frame = Uint8Array.from([0xfe, 0xfe, 0xe0, 0xa4, 0x27, 0x00, 0x00, 0x01, 0x01, 0xfd]);
    expect(isScopeWaveform(frame)).toBe(true);
    expect(Array.from(scopePayload(frame) ?? [])).toEqual([0x00, 0x00, 0x01, 0x01]);
    expect(isScopeWaveform(Uint8Array.from([0xfe, 0xfe, 0xe0, 0xa4, 0x27, 0x10, 0x01, 0xfd]))).toBe(false);
  });
});
