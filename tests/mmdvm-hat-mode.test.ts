import { describe, expect, it } from "vitest";
import { parseHatModeFromLog, resolveHatActiveMode } from "../server/mmdvm";

const modes = {
  dstar: true,
  dmr: true,
  ysf: true,
  p25: false,
  nxdn: false,
  m17: false,
  pocsag: false,
};
const paused = { dstar: false, dmr: false, ysf: false, p25: false, nxdn: false, m17: false, pocsag: false };

describe("parseHatModeFromLog", () => {
  it("lê o último Mode set do Host", () => {
    const log = [
      "M: 2026-03-28 10:00:00 Mode set to D-Star",
      "M: 2026-03-28 10:05:00 Mode set to DMR",
    ].join("\n");
    expect(parseHatModeFromLog(log)).toBe("dmr");
  });

  it("mapeia System Fusion para YSF", () => {
    const log = "M: 2026-03-28 11:00:00 Mode set to System Fusion";
    expect(parseHatModeFromLog(log)).toBe("ysf");
  });
});

describe("resolveHatActiveMode", () => {
  it("prioriza QSO ativo sobre Mode set", () => {
    const log = "M: 2026-03-28 10:00:00 Mode set to DMR";
    const heard = [
      {
        timeUtc: "2026-03-28 12:00:00",
        mode: "YSF",
        callsign: "PY2ABC",
        target: "BR",
        src: "Net" as const,
        duration: "",
        loss: "",
        ber: "",
      },
    ];
    const hat = resolveHatActiveMode(log, { modes, paused }, heard, true);
    expect(hat.id).toBe("ysf");
    expect(hat.via).toBe("qso");
    expect(hat.label).toBe("YSF");
  });

  it("usa Mode set quando não há QSO", () => {
    const log = "M: 2026-03-28 10:00:00 Mode set to D-Star";
    const hat = resolveHatActiveMode(log, { modes, paused }, [], true);
    expect(hat.id).toBe("dstar");
    expect(hat.via).toBe("modem");
  });
});