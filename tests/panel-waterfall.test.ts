import { describe, expect, it } from "vitest";
import { addTile, defaultTiles } from "../client/src/console/panel-layout";

describe("card do waterfall no painel", () => {
  it("não entra no layout padrão e aparece ao adicionar", () => {
    const base = defaultTiles();
    expect(base.some((tile) => tile.id === "waterfall")).toBe(false);
    const next = addTile(base, "waterfall");
    const tile = next.find((item) => item.id === "waterfall");
    expect(tile?.w).toBe(12);
    expect(next).toHaveLength(base.length + 1);
  });
});
