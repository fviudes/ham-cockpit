import { describe, expect, it } from "vitest";
import {
  applyWlgPatch,
  envToPublic,
  formatEnv,
  httpPortFromUrl,
  maskApiKey,
  parseEnvFile,
  parseWlgEnvPatch,
} from "./wlg-env";

const SAMPLE = `# WaveLogGate
WAVELOG_URL=http://127.0.0.1:8086/index.php
WAVELOG_API_KEY=wlTESTKEY000001
WAVELOG_STATION_ID=1
RADIO_NAME=IC-705
HAMLIB_HOST=127.0.0.1
HAMLIB_PORT=4532
PUBLISH_CAT=1
UDP_PORT=2333
QSY_PORT=54321
`;

describe("wlg-env", () => {
  it("parseia valores e tira aspas", () => {
    const v = parseEnvFile('WAVELOG_URL="http://127.0.0.1:8086/index.php"\nUDP_PORT=2235\n');
    expect(v.WAVELOG_URL).toBe("http://127.0.0.1:8086/index.php");
    expect(v.UDP_PORT).toBe("2235");
  });

  it("não apaga a chave se o POST vier com apiKey vazio", () => {
    const cur = parseEnvFile(SAMPLE);
    const next = applyWlgPatch(cur, {
      apiKey: "   ",
      udpPort: 2235,
      wavelogUrl: "http://127.0.0.1:8086/index.php",
      stationId: "1",
      radioName: "IC-705",
    });
    expect(next.WAVELOG_API_KEY).toBe("wlTESTKEY000001");
    expect(next.UDP_PORT).toBe("2235");
    const pub = envToPublic(next, "/opt/wavelog-gate/wavelog-gate.env");
    expect(pub.hasApiKey).toBe(true);
    expect(pub.apiKeyHint).toBe(maskApiKey("wlTESTKEY000001"));
    expect(pub.udpPort).toBe(2235);
  });

  it("grava chave nova quando o POST traz valor", () => {
    const cur = parseEnvFile(SAMPLE.replace("wlTESTKEY000001", ""));
    const next = applyWlgPatch(cur, { apiKey: "wlTESTKEY000001" });
    expect(next.WAVELOG_API_KEY).toBe("wlTESTKEY000001");
  });

  it("persiste pasta, porta HTTP, hamlib e CAT no texto do env", () => {
    const cur = parseEnvFile(SAMPLE);
    const next = applyWlgPatch(cur, parseWlgEnvPatch({
      wavelogUrl: "http://127.0.0.1:9090/index.php",
      stationId: "2",
      radioName: "FT-891",
      hamlibHost: "10.0.0.8",
      hamlibPort: "4534",
      udpPort: "2235",
      qsyPort: "54321",
      publishCat: false,
      folder: "/opt/wavelog-gate",
      wavelogFolder: "/opt/wavelog",
      wavelogHttpPort: 9090,
    }));
    const text = formatEnv(next, SAMPLE);
    const round = parseEnvFile(text);
    expect(round.WAVELOG_URL).toBe("http://127.0.0.1:9090/index.php");
    expect(round.WAVELOG_STATION_ID).toBe("2");
    expect(round.RADIO_NAME).toBe("FT-891");
    expect(round.HAMLIB_HOST).toBe("10.0.0.8");
    expect(round.HAMLIB_PORT).toBe("4534");
    expect(round.UDP_PORT).toBe("2235");
    expect(round.PUBLISH_CAT).toBe("0");
    expect(round.WLG_FOLDER).toBe("/opt/wavelog-gate");
    expect(round.WAVELOG_FOLDER).toBe("/opt/wavelog");
    expect(round.WAVELOG_HTTP_PORT).toBe("9090");
    expect(round.WAVELOG_API_KEY).toBe("wlTESTKEY000001");
    expect(httpPortFromUrl(round.WAVELOG_URL)).toBe(9090);
  });
});
