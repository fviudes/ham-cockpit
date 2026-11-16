import { describe, expect, it } from "vitest";
import {
  decodePiRevision,
  diskDeviceNamesForSource,
  diskSectorCountersFromCols,
  diskSectorTotalsFromText,
} from "./host-status";

describe("host-status", () => {
  it("decodifica revisão Raspberry Pi", () => {
    const hit = decodePiRevision("c03112");
    expect(hit?.model).toMatch(/Pi 4/i);
    expect(hit?.soc).toBe("BCM2711");
  });

  it("prioriza partição e disco inteiro em mmcblk", () => {
    expect(diskDeviceNamesForSource("/dev/mmcblk0p2")).toEqual(["mmcblk0p2", "mmcblk0"]);
    expect(diskDeviceNamesForSource("/dev/nvme0n1p2")).toEqual(["nvme0n1p2", "nvme0n1"]);
    expect(diskDeviceNamesForSource("/dev/sda1")).toEqual(["sda1", "sda"]);
  });

  it("lê setores em linha completa de diskstats", () => {
    const cols =
      "259 2 nvme0n1p2 255401 1 12343477 47799 996004 0 36014736 425784 0 344336 473584".split(/\s+/);
    expect(diskSectorCountersFromCols(cols)).toEqual({ read: 12343477, write: 36014736 });
  });

  it("lê setores em linha legada de partição (7 campos)", () => {
    const cols = "179 33 mmcblk0p2 58214 813270 46364 370858".split(/\s+/);
    expect(diskSectorCountersFromCols(cols)).toEqual({ read: 813270, write: 370858 });
  });

  it("não confunde setor gravado com merges na partição legada", () => {
    const diskstats = [
      "179 0 mmcblk0 87047 34549 2851200 3081695 483009 484000 7736450 30472168",
      "179 33 mmcblk0p2 58214 813270 46364 370858",
    ].join("\n");
    const whole = diskSectorTotalsFromText(diskstats, ["mmcblk0"]);
    expect(whole).toMatchObject({ read: 2851200, write: 7736450, dev: "mmcblk0" });
    const part = diskSectorTotalsFromText(diskstats, ["mmcblk0p2", "mmcblk0"]);
    expect(part).toMatchObject({ read: 813270, write: 370858, dev: "mmcblk0p2" });
  });
});