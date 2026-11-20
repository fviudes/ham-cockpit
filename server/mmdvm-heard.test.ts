import { describe, expect, it } from "vitest";
import { parseLastHeard, splitHeardIdentity } from "./mmdvm";

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
    expect(rows[0]!.radio).toBe("");
  });
});

describe("splitHeardIdentity", () => {
  it("separa indicativo e rádio colados ou com espaço", () => {
    expect(splitHeardIdentity("PU2ABC/ID51")).toEqual({ callsign: "PU2ABC", radio: "/ID51" });
    expect(splitHeardIdentity("PR2PT /7100")).toEqual({ callsign: "PR2PT", radio: "/7100" });
    expect(splitHeardIdentity("PU2ABC /ID51")).toEqual({ callsign: "PU2ABC", radio: "/ID51" });
    expect(splitHeardIdentity("PU2ABC//ID51")).toEqual({ callsign: "PU2ABC", radio: "/ID51" });
  });

  it("não inventa indicativo quando só existe o sufixo do rádio", () => {
    expect(splitHeardIdentity("/IC92")).toEqual({ callsign: "", radio: "/IC92" });
    expect(splitHeardIdentity("ID52")).toEqual({ callsign: "", radio: "/ID52" });
    expect(splitHeardIdentity(" /7100")).toEqual({ callsign: "", radio: "/7100" });
  });

  it("mantém indicativo limpo e sufixo operacional", () => {
    expect(splitHeardIdentity("PY2ABC")).toEqual({ callsign: "PY2ABC", radio: "" });
    expect(splitHeardIdentity("PU2ABC/P")).toEqual({ callsign: "PU2ABC/P", radio: "" });
    expect(splitHeardIdentity("7240001")).toEqual({ callsign: "7240001", radio: "" });
    expect(splitHeardIdentity("7240001/PU2ABC")).toEqual({ callsign: "PU2ABC", radio: "" });
  });

  it("tira o via do mesmo campo antes de separar o rádio", () => {
    expect(splitHeardIdentity("PU2ABC/ID52 via YSF00001")).toEqual({ callsign: "PU2ABC", radio: "/ID52" });
    expect(splitHeardIdentity("PR2PT via BM2621")).toEqual({ callsign: "PR2PT", radio: "" });
  });

  it("aceita o header D-Star com MyCall2 alinhado em espaços", () => {
    expect(splitHeardIdentity("PY3AQ   /IC92")).toEqual({ callsign: "PY3AQ", radio: "/IC92" });
    expect(splitHeardIdentity("PU2KBF  /2820")).toEqual({ callsign: "PU2KBF", radio: "/2820" });
    expect(splitHeardIdentity("PY4AW   /ID52")).toEqual({ callsign: "PY4AW", radio: "/ID52" });
    expect(splitHeardIdentity("PR2RAD  /7100")).toEqual({ callsign: "PR2RAD", radio: "/7100" });
    expect(splitHeardIdentity("PU2VYD  /ID51")).toEqual({ callsign: "PU2VYD", radio: "/ID51" });
    expect(splitHeardIdentity("PU2RWN  /880H")).toEqual({ callsign: "PU2RWN", radio: "/880H" });
    expect(splitHeardIdentity("PU2KWD  /5100")).toEqual({ callsign: "PU2KWD", radio: "/5100" });
    expect(splitHeardIdentity("PY3NP   /TH75")).toEqual({ callsign: "PY3NP", radio: "/TH75" });
    expect(splitHeardIdentity("PY2YM   /     ")).toEqual({ callsign: "PY2YM", radio: "" });
  });
});

describe("parseLastHeard — sufixo de rádio", () => {
  it("grava indicativo e equipamento a partir do header", () => {
    const log = [
      "M: 2026-03-28 16:00:00.000 D-Star, received RF header from PU2ABC/ID51 to CQCQCQ",
      "M: 2026-03-28 16:01:00.000 D-Star, received RF header from PR2PT /7100 to CQCQCQ",
      "M: 2026-03-28 16:02:00.000 D-Star, received RF header from /IC92 to CQCQCQ",
      "M: 2026-03-28 16:03:00.000 D-Star, received RF header from PY2ABC to CQCQCQ",
      "M: 2026-03-28 16:04:00.000 YSF, received RF header from PU2ABC/ID52 via YSF00001 to ALL",
    ].join("\n");
    const rows = parseLastHeard(log, 10);
    const byCall = Object.fromEntries(rows.map((r) => [r.callsign || r.radio, r]));
    expect(byCall["PU2ABC"]?.radio).toBe("/ID51");
    expect(byCall["PR2PT"]?.callsign).toBe("PR2PT");
    expect(byCall["PR2PT"]?.radio).toBe("/7100");
    expect(byCall["/IC92"]?.callsign).toBe("");
    expect(byCall["/IC92"]?.radio).toBe("/IC92");
    expect(byCall["PY2ABC"]?.callsign).toBe("PY2ABC");
    expect(byCall["PY2ABC"]?.radio).toBe("");
    const ysf = rows.find((r) => r.radio === "/ID52");
    expect(ysf?.callsign).toBe("PU2ABC");
    expect(ysf?.target).toBe("ALL");
  });

  it("lê o header de rede D-Star do Host, com via depois do destino", () => {
    const log = [
      "M: 2026-11-19 00:04:10.939 D-Star, received network header from PR2RAD  /7100 to CQCQCQ   via REF018 C",
      "M: 2026-11-19 22:15:31.164 D-Star, received network header from PU2KBF  /2820 to CQCQCQ   via REF018 C",
      "M: 2026-11-20 02:07:18.435 D-Star, received network header from PY3AQ   /IC92 to CQCQCQ   via REF018 C",
      "M: 2026-11-20 02:12:30.074 D-Star, received network header from PY4AW   /ID52 to CQCQCQ   via REF018 C",
    ].join("\n");
    const rows = parseLastHeard(log, 10);
    expect(rows.map((r) => [r.callsign, r.radio, r.target])).toEqual([
      ["PY4AW", "/ID52", "CQCQCQ"],
      ["PY3AQ", "/IC92", "CQCQCQ"],
      ["PU2KBF", "/2820", "CQCQCQ"],
      ["PR2RAD", "/7100", "CQCQCQ"],
    ]);
  });
});