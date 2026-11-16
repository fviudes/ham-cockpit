import { describe, expect, it } from "vitest";
import { allowedDockerContainer } from "../shared/docker-container";
import { parseContainerListJson } from "../server/containers";

describe("docker-container allowlist", () => {
  it("só aceita wavelog-db e wavelog-main", () => {
    expect(allowedDockerContainer("wavelog-db")).toBe(true);
    expect(allowedDockerContainer("wavelog-main")).toBe(true);
    expect(allowedDockerContainer("evil")).toBe(false);
    expect(allowedDockerContainer("../etc")).toBe(false);
  });
});

describe("containers", () => {
  it("parseia JSON do station-svc", () => {
    const raw = JSON.stringify([
      {
        name: "wavelog-db",
        image: "mariadb:11.8",
        state: "running",
        memLimitBytes: 402653184,
        cpusLimit: 1,
        memUsageBytes: 115343360,
        cpuPct: 1.2,
      },
    ]);
    const items = parseContainerListJson(raw);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "wavelog-db",
      memLimitBytes: 402653184,
      cpusLimit: 1,
      cpuPct: 1.2,
    });
  });

  it("ignora contêiner fora da allowlist", () => {
    const raw = JSON.stringify([{ name: "random", image: "x", state: "running" }]);
    expect(parseContainerListJson(raw)).toHaveLength(0);
  });
});