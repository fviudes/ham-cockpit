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

  it("aceita CPU zero e números em string (locale ps)", () => {
    const raw = JSON.stringify([
      {
        unit: "ser2net.service",
        active: "active",
        sub: "running",
        description: "Serial",
        cpuPct: 0,
        memPct: "0,4",
        memBytes: "4096",
      },
    ]);
    const items = parseProcessUnitsJson(raw);
    expect(items[0]?.cpuPct).toBe(0);
    expect(items[0]?.memPct).toBe(0.4);
    expect(items[0]?.memBytes).toBe(4096);
  });
});