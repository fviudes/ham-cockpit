import { describe, expect, it } from "vitest";
import { wifiFailoverSsidOrder } from "./net";

describe("wifiFailoverSsidOrder", () => {
  it("mantém a ordem de managed", () => {
    const managed = [{ ssid: "Casa-A" }, { ssid: "Casa-B" }, { ssid: "Shack-Fiber" }];
    expect(wifiFailoverSsidOrder(managed, "")).toEqual(["Casa-A", "Casa-B", "Shack-Fiber"]);
  });

  it("coloca staSsid no início se não estiver na lista", () => {
    expect(wifiFailoverSsidOrder([{ ssid: "B" }, { ssid: "A" }], "Preferida")).toEqual(["Preferida", "B", "A"]);
  });

  it("não duplica ssid", () => {
    expect(wifiFailoverSsidOrder([{ ssid: "A" }, { ssid: "A" }, { ssid: "B" }], "A")).toEqual(["A", "B"]);
  });
});