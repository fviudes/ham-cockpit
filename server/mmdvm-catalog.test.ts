import { describe, expect, it } from "vitest";
import { parseDmrHosts, parseTalkgroups } from "./mmdvm-catalog";

describe("parseDmrHosts", () => {
  it("separa BM, DMR+, TGIF e XLX", () => {
    const text = `BM_3101 x 3101.repeater.net passw0rd 62031
DMR+_EU x 94.198.196.128 passw0rd 8880
TGIF_Network x tgif.network passw0rd 62031
XLX_950 x 62.210.152.36 passw0rd 62030`;
    const { bm, dmrplus, tgif, xlx } = parseDmrHosts(text);
    expect(bm).toHaveLength(1);
    expect(dmrplus).toHaveLength(1);
    expect(tgif).toHaveLength(1);
    expect(xlx).toHaveLength(1);
    expect(bm[0]?.value).toBe("3101.repeater.net,passw0rd,62031,BM_3101");
  });
});

describe("parseTalkgroups", () => {
  it("lê groups.txt em JSON", () => {
    const rows = parseTalkgroups('{"91":"World-wide","9":"Local"}');
    expect(rows.find((r) => r.id === "91")?.label).toContain("World-wide");
  });
});