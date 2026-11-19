import { describe, expect, it } from "vitest";
import { applyConfig, formatDstarReflector, parseDstarReflector } from "./mmdvm";

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

  it("em simplex grava TX=RX no Host e no DMRGateway", () => {
    const host: Record<string, Record<string, string>> = { General: {}, Info: {}, Modem: {}, DMR: {}, "D-Star": {}, "DMR Network": {} };
    const gw: Record<string, Record<string, string>> = {};
    const ysf: Record<string, Record<string, string>> = {};
    const dstar: Record<string, string> = {};
    applyConfig(host, gw, ysf, dstar, {
      duplex: false,
      callsign: "PY2TST",
      dmrId: "1234567",
      rxHz: 433_800_000,
      txHz: 438_800_000,
    });
    expect(host.General?.Duplex).toBe("0");
    expect(host.Info?.TXFrequency).toBe("433800000");
    expect(gw.Info?.TXFrequency).toBe("433800000");
    expect(gw.Info?.RXFrequency).toBe("433800000");
  });

  it("grava REF D-Star no formato g4klx e portas sem colidir com o Host", () => {
    const host: Record<string, Record<string, string>> = { General: {}, Info: {}, Modem: {}, DMR: {}, "D-Star": {}, "DMR Network": {} };
    const gw: Record<string, Record<string, string>> = {};
    const ysf: Record<string, Record<string, string>> = {};
    const dstar: Record<string, string> = {};
    applyConfig(host, gw, ysf, dstar, {
      duplex: false,
      callsign: "PR2PT",
      dmrId: "7242679",
      dstarReflector: "REF018 C",
      dstarModule: "B",
    });
    expect(formatDstarReflector("REF018", "B")).toBe("REF018 C");
    expect(formatDstarReflector("REF018 C", "B")).toBe("REF018 C");
    expect(parseDstarReflector("REF018 C")).toBe("REF018");
    expect(dstar.reflector1).toBe("REF018 C");
    expect(dstar.hbPort).toBe("20010");
    expect(dstar.gatewayPort).toBe("40000");
    expect(dstar.localPort).toBe("40001");
    expect(dstar.remotePort).toBe("7462");
    expect(dstar.ircDDBEnabled).toBe("0");
    expect(dstar.repeaterBand1).toBe("B");
    expect(dstar.repeaterPort1).toBe("20011");
    expect(dstar.dextraEnabled).toBe("0");
  });
});