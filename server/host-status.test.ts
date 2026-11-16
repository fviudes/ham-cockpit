import { describe, expect, it } from "vitest";
import { decodePiRevision } from "./host-status";

describe("host-status", () => {
  it("decodifica revisão Raspberry Pi", () => {
    const hit = decodePiRevision("c03112");
    expect(hit?.model).toMatch(/Pi 4/i);
    expect(hit?.soc).toBe("BCM2711");
  });
});