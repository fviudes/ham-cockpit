import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bytesPerSec,
  chooseOriginalIp,
  parsePingMs,
  parseTunAddr,
  parseVia,
  publicVpnError,
} from "./support-vpn";

describe("VPN de suporte", () => {
  const ifaces = [
    { name: "eth0", address: "192.168.20.165" },
    { name: "wlan0", address: "192.168.4.1" },
    { name: "tun0", address: "10.8.0.6" },
  ];

  it("guarda o IP da LAN e ignora o túnel", () => {
    expect(chooseOriginalIp("192.168.20.165", "10.8.0.6", ifaces)).toBe("192.168.20.165");
    expect(chooseOriginalIp("", "10.8.0.6", ifaces)).toBe("192.168.20.165");
    expect(chooseOriginalIp("192.168.4.1", "10.8.0.6", ifaces)).toBe("192.168.20.165");
    expect(chooseOriginalIp("", "", [{ name: "wlan0", address: "192.168.4.1" }])).toBe("192.168.4.1");
  });

  it("mede ping e peer sem inventar zero", () => {
    expect(parsePingMs("64 bytes from 10.8.0.1: icmp_seq=1 ttl=64 time=18.4 ms")).toBe(18.4);
    expect(parsePingMs("Request timeout")).toBeUndefined();
    expect(parseTunAddr("2: tun0 inet 10.8.0.6 peer 10.8.0.1/32 scope global tun0")).toEqual({
      local: "10.8.0.6",
      peer: "10.8.0.1",
    });
    expect(parseVia("10.8.0.0/24 dev tun0 proto kernel scope link")).toBeUndefined();
    const first = bytesPerSec(null, 1000, "tun0", 10, 20);
    expect(first.rxBps).toBeUndefined();
    const second = bytesPerSec(first.sample, 2000, "tun0", 110, 220);
    expect(second.rxBps).toBe(100);
    expect(second.txBps).toBe(200);
  });

  it("não devolve segredo no erro", () => {
    expect(publicVpnError("-----BEGIN CERTIFICATE-----")).toBe("Falha ao subir a VPN de suporte.");
    expect(publicVpnError("AUTH_FAILED")).toBe("AUTH_FAILED");
  });

  it("perfil instalado aponta a credencial e não troca o gateway", () => {
    const text = readFileSync(join(process.cwd(), "deploy", "station", "support", "client.ovpn"), "utf8");
    expect(text.split("\n").some((line) => line.trim() === "auth-user-pass")).toBe(false);
    expect(text.includes("auth-user-pass /opt/ham-cockpit/support/auth.txt")).toBe(true);
    expect(text.includes('pull-filter ignore "redirect-gateway"')).toBe(true);
    expect(/^redirect-gateway\b/m.test(text)).toBe(false);
    expect(/^dev tun$/m.test(text)).toBe(true);
    expect(/^remote /m.test(text)).toBe(true);
    expect(text.includes("<ca>")).toBe(true);
    expect(text.includes("<key>")).toBe(false);
    expect(text.includes("suporte@")).toBe(false);
  });
});
