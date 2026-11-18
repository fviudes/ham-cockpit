import { describe, expect, it } from "vitest";
import { applyConfig } from "./mmdvm";

describe("applyConfig duplex", () => {
  it("mantém Duplex do usuário mesmo com preset simplex", () => {
    const host: Record<string, Record<string, string>> = { General: {}, Info: {}, Modem: {}, DMR: {}, "D-Star": {}, "DMR Network": {} };
    const gw: Record<string, Record<string, string>> = {};
    const ysf: Record<string, Record<string, string>> = {};
    const dstar: Record<string, string> = {};
    applyConfig(host, gw, ysf, dstar, {
      duplex: true,
      modemBoard: "mmdvmhshat",
      callsign: "PY2TST",
      dmrId: "1234567",
      rxHz: 433_475_000,
      txHz: 434_475_000,
    });
    expect(host.General?.Duplex).toBe("1");
  });

  it("liga baliza de rede com Duplex=1 quando networkBeacon está ativo", () => {
    const host: Record<string, Record<string, string>> = {
      General: { Duplex: "1" },
      Info: {},
      Modem: {},
      DMR: { BeaconInterval: "60" },
      "D-Star": {},
      "DMR Network": { Type: "Gateway" },
    };
    const gw: Record<string, Record<string, string>> = {};
    const ysf: Record<string, Record<string, string>> = {};
    const dstar: Record<string, string> = {};
    applyConfig(host, gw, ysf, dstar, {
      duplex: true,
      networkBeacon: true,
      callsign: "PY2TST",
      dmrId: "1234567",
      rxHz: 433_475_000,
      txHz: 433_475_000,
    });
    expect(host.DMR?.Beacons).toBe("1");
    expect(host.DMR?.BeaconInterval).toBeUndefined();
  });
});