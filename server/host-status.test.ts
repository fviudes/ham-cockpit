import { describe, expect, it } from "vitest";
import {
  decodePiRevision,
  diskDeviceNamesForSource,
  diskSectorCountersFromCols,
  diskSectorTotalsFromText,
  netIfaceKind,
  normalizeMacAddress,
  pickPreferredNetIface,
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

  it("normaliza endereço MAC", () => {
    expect(normalizeMacAddress("d8:3a:dd:a4:f2:11")).toBe("D8:3A:DD:A4:F2:11");
    expect(normalizeMacAddress("  D8-3A-DD-A4-F2-11  ")).toBe(null);
    expect(normalizeMacAddress("not-a-mac")).toBe(null);
  });

  it("classifica interfaces eth/wlan do Pi", () => {
    expect(netIfaceKind("eth0")).toBe("ethernet");
    expect(netIfaceKind("end0")).toBe("ethernet");
    expect(netIfaceKind("enp1s0")).toBe("ethernet");
    expect(netIfaceKind("wlan0")).toBe("wifi");
    expect(netIfaceKind("wlP2p33s0")).toBe("wifi");
    expect(netIfaceKind("lo")).toBe("other");
    expect(netIfaceKind("docker0")).toBe("other");
  });

  it("prioriza eth0/wlan0 entre várias interfaces", () => {
    const names = ["docker0", "wlan0", "eth0", "veth123"];
    expect(pickPreferredNetIface(names, "ethernet")).toBe("eth0");
    expect(pickPreferredNetIface(names, "wifi")).toBe("wlan0");
    expect(pickPreferredNetIface(["end0", "wlan1"], "ethernet")).toBe("end0");
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