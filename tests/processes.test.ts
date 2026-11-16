import { describe, expect, it } from "vitest";
import { parseProcessUnitsJson } from "../server/processes";

describe("processes", () => {
  it("lê CPU e memória enriquecidas pelo station-svc", () => {
    const raw = JSON.stringify([
      {
        unit: "ham-cockpit.service",
        active: "active",
        sub: "running",
        description: "Ham Cockpit web console",
        cpuPct: 4.2,
        memPct: 12.5,
        memBytes: 134217728,
      },
    ]);
    const items = parseProcessUnitsJson(raw);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      unit: "ham-cockpit.service",
      cpuPct: 4.2,
      memPct: 12.5,
      memBytes: 134217728,
    });
  });
});