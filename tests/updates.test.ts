import { describe, expect, it } from "vitest";
import { lastJsonObject } from "../server/updates";
import { otaPackageFilenameOk, otaSha256Ok, otaVersionFromFilename } from "../server/updates-upload";

describe("updates", () => {
  it("extrai o último JSON do stdout do station-upd", () => {
    const mixed = [
      "HC_PROGRESS {\"id\":\"app\",\"pct\":97,\"stage\":\"hooks\"}",
      '{"ok":true,"os":"Ubuntu","items":[]}',
      '{"ok":true,"os":"Ubuntu","items":[{"id":"app"}]}',
    ].join("\n");
    expect(JSON.parse(lastJsonObject(mixed)).items).toHaveLength(1);
  });

  it("valida nome e versão do pacote OTA manual", () => {
    expect(otaPackageFilenameOk("ham-cockpit-0.1.14.01.tgz")).toBe(true);
    expect(otaPackageFilenameOk("backup.tgz")).toBe(false);
    expect(otaVersionFromFilename("ham-cockpit-0.1.14.01.tgz")).toBe("0.1.14.01");
    expect(otaSha256Ok("")).toBe(true);
    expect(otaSha256Ok("abc")).toBe(false);
    expect(otaSha256Ok("e".repeat(64))).toBe(true);
  });
});