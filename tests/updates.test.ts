import { describe, expect, it } from "vitest";
import { lastJsonObject } from "../server/updates";

describe("updates", () => {
  it("extrai o último JSON do stdout do station-upd", () => {
    const mixed = [
      "HC_PROGRESS {\"id\":\"app\",\"pct\":97,\"stage\":\"hooks\"}",
      '{"ok":true,"os":"Ubuntu","items":[]}',
      '{"ok":true,"os":"Ubuntu","items":[{"id":"app"}]}',
    ].join("\n");
    expect(JSON.parse(lastJsonObject(mixed)).items).toHaveLength(1);
  });
});