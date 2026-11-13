import { describe, expect, it } from "vitest";
import { SERVICE_IDS } from "../shared/const";
import { serviceLive } from "../client/src/console/services-ui";
import { apDhcpIsUp, serviceLinuxRunning, tcpListenPorts, type ServiceLinuxFacts } from "./services";

/** Foto do lab 192.168.20.165: units, portas ser2net e DHCP do AP. */
function labFacts(over: Partial<ServiceLinuxFacts> = {}): ServiceLinuxFacts {
  const base: ServiceLinuxFacts = {
    states: {
      ser2net: "active",
      wavelog: "active",
      db: "active",
      wlg: "active",
      mmdvm: "failed",
      hamlib: "inactive",
      spe: "inactive",
      wifi: "activating",
      bluetooth: "active",
      web: "active",
    },
    ports: {
      radio: 4002,
      palstar: 4003,
      spe: 4001,
      hamplus: 4004,
      acom: 4005,
      lp100a: 4006,
    },
    listen: new Set([4001, 4002, 4003, 4004, 4005, 4006]),
    nginx: "active",
    apDhcpUp: true,
  };
  return {
    ...base,
    ...over,
    states: { ...base.states, ...over.states },
    ports: over.ports ?? base.ports,
    listen: over.listen === undefined ? base.listen : over.listen,
  };
}

const LAB_RUNNING: Record<(typeof SERVICE_IDS)[number], boolean> = {
  ser2net: true,
  wavelog: true,
  db: true,
  wlg: true,
  mmdvm: false,
  radio: true,
  hamlib: false,
  spe: true,
  hamplus: true,
  palstar: true,
  ldg: false,
  lp100a: true,
  acom: true,
  lextel: false,
  wifi: false,
  bluetooth: true,
  dhcp: true,
  web: true,
};

describe("serviceLinuxRunning", () => {
  it("reproduz o lab: active liga, failed/inactive para, porta ser2net no lugar da sessão", () => {
    const facts = labFacts();
    for (const id of SERVICE_IDS) {
      expect(serviceLinuxRunning(id, facts), id).toBe(LAB_RUNNING[id]);
    }
  });

  it("ser2net inactive derruba rádio e acessórios mesmo com a porta na lista", () => {
    const facts = labFacts({ states: { ser2net: "inactive" } });
    expect(serviceLinuxRunning("spe", facts)).toBe(false);
    expect(serviceLinuxRunning("radio", facts)).toBe(false);
    expect(serviceLinuxRunning("hamplus", facts)).toBe(false);
    expect(serviceLinuxRunning("ser2net", facts)).toBe(false);
  });

  it("não inventa ligado sem porta configurada ou sem a porta escutando", () => {
    const noListen = labFacts({ listen: new Set([4001]) });
    expect(serviceLinuxRunning("lp100a", noListen)).toBe(false);
    expect(serviceLinuxRunning("spe", noListen)).toBe(true);
    const withLdg = labFacts({
      ports: { ...labFacts().ports, ldg: 4010 },
      listen: new Set([4001, 4002, 4003, 4004, 4005, 4006, 4010]),
    });
    expect(serviceLinuxRunning("ldg", withLdg)).toBe(true);
  });

  it("hamlib e mmdvm seguem a unit, não a porta 4532", () => {
    expect(serviceLinuxRunning("hamlib", labFacts())).toBe(false);
    expect(serviceLinuxRunning("hamlib", labFacts({ states: { hamlib: "active" } }))).toBe(true);
    expect(serviceLinuxRunning("mmdvm", labFacts())).toBe(false);
    expect(serviceLinuxRunning("mmdvm", labFacts({ states: { mmdvm: "active" } }))).toBe(true);
    expect(serviceLinuxRunning("mmdvm", labFacts({ states: { mmdvm: "inactive" } }))).toBe(false);
  });

  it("web exige ham-cockpit e nginx; bluetooth é a unit, não o pareamento", () => {
    expect(serviceLinuxRunning("web", labFacts({ nginx: "inactive" }))).toBe(false);
    expect(serviceLinuxRunning("web", labFacts({ states: { web: "inactive" } }))).toBe(false);
    expect(serviceLinuxRunning("web", labFacts({ states: { web: "failed" }, nginx: "active" }))).toBe(false);
    expect(serviceLinuxRunning("bluetooth", labFacts({ states: { bluetooth: "inactive" } }))).toBe(false);
    expect(serviceLinuxRunning("lextel", labFacts())).toBe(false);
  });

  it("dhcp do AP não usa dnsmasq.service mascarado", () => {
    expect(serviceLinuxRunning("dhcp", labFacts())).toBe(true);
    expect(serviceLinuxRunning("dhcp", labFacts({ states: { wifi: "active" }, apDhcpUp: false }))).toBe(true);
    expect(serviceLinuxRunning("dhcp", labFacts({ states: { wifi: "inactive" }, apDhcpUp: true }))).toBe(false);
    expect(serviceLinuxRunning("dhcp", labFacts({ states: { wifi: "failed" }, apDhcpUp: true }))).toBe(false);
    expect(serviceLinuxRunning("dhcp", labFacts({ states: { wifi: "activating" }, apDhcpUp: false }))).toBe(false);
    expect(serviceLinuxRunning("wifi", labFacts())).toBe(false);
    expect(serviceLinuxRunning("wifi", labFacts({ states: { wifi: "active" } }))).toBe(true);
  });

  it("db segue o container (estado db=active) e wavelog/wlg a unit", () => {
    expect(serviceLinuxRunning("db", labFacts({ states: { db: "inactive" } }))).toBe(false);
    expect(serviceLinuxRunning("wavelog", labFacts({ states: { wavelog: "failed" } }))).toBe(false);
    expect(serviceLinuxRunning("wlg", labFacts({ states: { wlg: "inactive" } }))).toBe(false);
  });
});

describe("parsers /proc", () => {
  it("lê TCP_LISTEN e ignora conexão estabelecida", () => {
    const text = [
      "  sl  local_address rem_address   st",
      "   0: 0100007F:0FA1 00000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 1 1 0 100 0 0 10 0",
      "   1: 0100007F:0050 00000000:0000 01 00000000:00000000 00:00000000 00000000 0 0 2 1 0 100 0 0 10 0",
    ].join("\n");
    const ports = tcpListenPorts(text);
    expect(ports.has(4001)).toBe(true);
    expect(ports.has(80)).toBe(false);
  });

  it("reconhece o DHCP do AP e ignora o resolved", () => {
    expect(apDhcpIsUp("   0: 00000000:0043 00000000:0000 07")).toBe(true);
    expect(apDhcpIsUp("   1: 0104A8C0:0035 00000000:0000 07")).toBe(true);
    expect(apDhcpIsUp("   2: 3500007F:0035 00000000:0000 07")).toBe(false);
  });
});

describe("serviceLive", () => {
  it("não substitui o flag da unit por cabo, GATT ou sessão", () => {
    const station = {
      wifi: { staConnected: true, ethConnected: true },
      lextel: { connected: true },
      ic705: { phase: "ready", civ: true },
      ble: { connected: true },
    } as never;
    expect(serviceLive("wifi", station, false)).toBe(false);
    expect(serviceLive("web", station, false)).toBe(false);
    expect(serviceLive("bluetooth", station, true)).toBe(true);
    expect(serviceLive("lextel", station, false)).toBe(false);
    expect(serviceLive("radio", station, true)).toBe(true);
  });
});
