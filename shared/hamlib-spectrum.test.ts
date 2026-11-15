import { describe, expect, it } from "vitest";
import { sweepFromHamlib } from "./hamlib-spectrum";

describe("espectro do Hamlib na serial", () => {
  it("lê o pacote JSON do rigctld", () => {
    const sweep = sweepFromHamlib(
      JSON.stringify({
        spectra: [
          {
            type: "CENTER",
            lowFreq: 14150000,
            highFreq: 14250000,
            centerFreq: 14200000,
            span: 100000,
            data: "1000A0",
          },
        ],
      }),
    );
    expect(sweep?.startHz).toBe(14_150_000);
    expect(sweep?.endHz).toBe(14_250_000);
    expect(Array.from(sweep?.bins ?? [])).toEqual([0x10, 0x00, 0xa0]);
  });

  it("ignora pacote sem espectro", () => {
    expect(sweepFromHamlib('{"vfos":[]}')).toBeNull();
  });
});
