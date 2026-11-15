import { describe, expect, it } from "vitest";
import { peelCivScope } from "./civ-peel";

describe("peel do CI-V", () => {
  it("tira o 27 00 e deixa a resposta de frequência", () => {
    const freq = Uint8Array.from([0xfe, 0xfe, 0xe0, 0xa4, 0x03, 0x00, 0x00, 0x14, 0x07, 0x00, 0xfd]);
    const scope = Uint8Array.from([0xfe, 0xfe, 0xe0, 0xa4, 0x27, 0x00, 0x00, 0x01, 0x0b, 0xfd]);
    const partial = Uint8Array.from([0xfe, 0xfe, 0xe0]);
    const buf = Uint8Array.from([...freq, ...scope, 0x11, ...partial]);
    const peeled = peelCivScope(buf);
    expect(Array.from(peeled.forward)).toEqual([...freq, 0x11]);
    expect(peeled.scopes).toHaveLength(1);
    expect(Array.from(peeled.scopes[0]!)).toEqual(Array.from(scope));
    expect(Array.from(peeled.rest)).toEqual(Array.from(partial));
  });
});
