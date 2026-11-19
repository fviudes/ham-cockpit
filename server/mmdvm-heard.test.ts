import { describe, expect, it } from "vitest";
import { parseLastHeard } from "./mmdvm";

describe("parseLastHeard (WPSD)", () => {
  it("interpreta cabeçalho DMR na rede e fim de transmissão", () => {
    const log = [
      "M: 2026-03-28 14:00:01.123 DMR Slot 2, received network end of voice transmission from PY2ABC to TG 922, 12.3 seconds, 0% packet loss, BER: 0.0%",
      "M: 2026-03-28 14:00:00.456 DMR Slot 2, received network voice header from PY2ABC to TG 922",
    ].join("\n");
    const rows = parseLastHeard(log, 5);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.callsign).toBe("PY2ABC");
    expect(rows[0]!.src).toBe("Net");
    expect(rows[0]!.mode).toContain("DMR");
    expect(rows[0]!.duration).toBe("12.3");
  });

  it("interpreta RF voice header DMR", () => {
    const log =
      "M: 2026-03-28 15:01:00.000 DMR Slot 2, received RF voice header from PY3ZZZ to 5000";
    const rows = parseLastHeard(log, 5);
    expect(rows[0]?.callsign).toBe("PY3ZZZ");
    expect(rows[0]?.src).toBe("RF");
  });

  it("mantém as 20 recepções mais novas no topo", () => {
    const lines = Array.from({ length: 21 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return `M: 2026-03-28 15:${n}:00.000 DMR Slot 2, received RF voice header from PY${n}AAA to TG 1`;
    });
    const rows = parseLastHeard(lines.join("\n"));
    expect(rows).toHaveLength(20);
    expect(rows[0]!.callsign).toBe("PY21AAA");
    expect(rows[19]!.callsign).toBe("PY02AAA");
  });
});