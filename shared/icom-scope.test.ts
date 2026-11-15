import { describe, expect, it } from "vitest";
import { ScopeAssembler, bcdHz, isScopeWaveform, scopePayload } from "./icom-scope";

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
    expect(sweep?.startHz).toBe(14_150_000);
    expect(sweep?.endHz).toBe(14_250_000);
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

  it("reconhece o quadro e não encaminha o miolo para o Hamlib", () => {
    const frame = Uint8Array.from([0xfe, 0xfe, 0xe0, 0xa4, 0x27, 0x00, 0x00, 0x01, 0x01, 0xfd]);
    expect(isScopeWaveform(frame)).toBe(true);
    expect(Array.from(scopePayload(frame) ?? [])).toEqual([0x00, 0x00, 0x01, 0x01]);
    expect(isScopeWaveform(Uint8Array.from([0xfe, 0xfe, 0xe0, 0xa4, 0x27, 0x10, 0x01, 0xfd]))).toBe(false);
  });
});
