import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDigState, fromPrefs, periodAt } from "../client/src/console/digital-modes-model";
import { spectrumPeak } from "../client/src/console/digital-spectrum";
import {
  WF_AVG_DEFAULT,
  WF_COLS,
  WF_END_HZ,
  WF_FFT,
  WF_HOP,
  WF_MAX_STRIPES,
  WF_NSPS,
  WF_SPEC_MS,
  WF_SPEC_RATE,
  WF_SPEC_STEP,
  WF_ROW_PX,
  WF_SAMPLE_RATE,
  WF_START_HZ,
  WF_WINDOW_MS,
  compactStepMs,
  compactStripes,
  createFallLog,
  WF_COMPACT,
  decodeCols,
  dequantDb,
  encodeCols,
  fallLayout,
  quantizeDb,
  rxPeriodIndex,
  sampleDb,
  stickToBottom,
  stickToNewest,
  viewNorm,
} from "../shared/digital-waterfall";

const peaks = (() => {
  const buf = new Float32Array(8);
  buf[2] = 80;
  return buf;
})();

describe("cascata no estilo do wide graph", () => {
  it("N Avg soma espectros e só então solta uma faixa", () => {
    const log = createFallLog();
    expect(log.avg()).toBe(WF_AVG_DEFAULT);
    expect(WF_AVG_DEFAULT).toBe(5);
    log.setAvg(5);
    for (let i = 0; i < 4; i++) expect(log.push(peaks, 1_000 + i, 0)).toBeNull();
    const stripe = log.push(peaks, 1_400, 0);
    expect(stripe).not.toBeNull();
    expect(stripe!.cycle).toBe(false);
    expect(log.since(0)).toHaveLength(1);
    expect(log.payload(0).stripes).toHaveLength(1);
    expect(log.payload(stripe!.seq).stripes).toHaveLength(0);
  });

  it("a média linear de dois picos fica no meio", () => {
    const log = createFallLog();
    log.setAvg(2);
    const low = new Float32Array([0]);
    const high = new Float32Array([100]);
    log.push(low, 1, 0);
    const stripe = log.push(high, 2, 0)!;
    const mid = dequantDb(stripe.cols[0]!);
    const expectDb = 20 * Math.log10(50 / (WF_FFT / 2) + 1e-12);
    expect(Math.abs(mid - expectDb)).toBeLessThan(1);
  });

  it("a divisória marca a virada do período de 15 s e de 7,5 s", () => {
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(periodAt(t0, "FT8").period).toBe(15);
    expect(periodAt(t0, "FT4").period).toBe(7.5);
    const ft8 = rxPeriodIndex(t0, "FT8");
    const ft8Next = rxPeriodIndex(t0 + 15_000, "FT8");
    expect(ft8Next).toBe(ft8 + 1);
    const ft4 = rxPeriodIndex(t0, "FT4");
    const ft4Next = rxPeriodIndex(t0 + 7_500, "FT4");
    expect(ft4Next).toBe(ft4 + 1);

    const log = createFallLog();
    log.setAvg(2);
    log.push(peaks, t0, ft8);
    expect(log.push(peaks, t0 + 80, ft8)!.cycle).toBe(false);
    log.push(peaks, t0 + 15_000, ft8Next);
    const boundary = log.push(peaks, t0 + 15_080, ft8Next)!;
    expect(boundary.cycle).toBe(true);
    const bands = fallLayout([false, true], WF_ROW_PX);
    expect(bands[0]!.dividerY).toBeNull();
    expect(bands[1]!.dividerY).toBe(WF_ROW_PX * 2);
  });

  it("o histórico continua depois que o cliente para de ler", () => {
    const log = createFallLog();
    log.setAvg(1);
    log.push(peaks, 1_000, 0);
    const seen = log.since(0);
    const gen = log.gen();
    log.push(peaks, 2_000, 0);
    log.push(peaks, 3_000, 0);
    expect(log.gen()).toBe(gen);
    expect(log.since(0).map((row) => row.seq)).toEqual([1, 2, 3]);
    expect(log.since(seen[0]!.seq).map((row) => row.seq)).toEqual([2, 3]);
    log.clear();
    expect(log.gen()).toBe(gen + 1);
    expect(log.since(0)).toHaveLength(0);
    log.push(peaks, 4_000, 0);
    expect(log.since(0)).toHaveLength(1);
    expect(log.since(0)[0]!.cycle).toBe(false);
  });

  it("vinte faixas viram uma e a divisória fica dentro do ciclo curto", () => {
    const raw = Array.from({ length: 40 }, (_, i) => ({
      seq: i + 1,
      t: i * 1440,
      cycle: i % 10 === 0,
      cols: new Uint8Array([10, 20]),
    }));
    expect(WF_COMPACT).toBe(20);
    const rows = compactStripes(raw);
    expect(rows).toHaveLength(2);
    expect(compactStepMs(raw)).toBe(20 * 1440);
    expect(rows[0]!.cuts).toEqual([1, 0.5]);
    expect(rows[1]!.cuts).toEqual([1, 0.5]);
  });

  it("o espectro sai a cada 288 ms, no passo do Detector do WSJT-Z", () => {
    expect(WF_NSPS).toBe(6912);
    expect(WF_SPEC_STEP).toBe(3456);
    expect(WF_SPEC_RATE).toBe(12_000);
    expect(WF_SPEC_MS).toBe(288);
    expect(WF_HOP).toBe(13_824);
    expect((WF_HOP / WF_SAMPLE_RATE) * 1000).toBe(WF_SPEC_MS);
    expect(WF_FFT).toBeGreaterThanOrEqual(WF_HOP);
    expect(WF_FFT & (WF_FFT - 1)).toBe(0);
    expect(WF_SPEC_MS * WF_AVG_DEFAULT).toBe(1440);
  });

  it("a janela fica em vários minutos e não cresce para sempre", () => {
    expect(WF_WINDOW_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(WF_MAX_STRIPES * WF_SPEC_MS).toBeGreaterThanOrEqual(WF_WINDOW_MS);
    const log = createFallLog({ windowMs: 1_000, max: 3 });
    log.setAvg(1);
    log.push(peaks, 0, 0);
    log.push(peaks, 400, 0);
    log.push(peaks, 2_000, 0);
    expect(log.since(0).every((row) => row.t >= 1_000)).toBe(true);
    for (let i = 0; i < 5; i++) log.push(peaks, 3_000 + i, 0);
    expect(log.since(0)).toHaveLength(3);
  });

  it("a coluna de 1500 Hz continua quente depois de agrupar", () => {
    const n = WF_FFT;
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 1500 * i) / WF_SAMPLE_RATE) * 16000);
    const cols = spectrumPeak(pcm, WF_SAMPLE_RATE, WF_START_HZ, WF_END_HZ, WF_COLS);
    const log = createFallLog();
    log.setAvg(1);
    const stripe = log.push(cols, 1_000, 0)!;
    const back = decodeCols(encodeCols(stripe.cols));
    expect(Array.from(back)).toEqual(Array.from(stripe.cols));
    expect(sampleDb(back, 1500)).toBeGreaterThan(sampleDb(back, 400) + 6);
    const norm = viewNorm(back, { startHz: 100, endHz: 3300, gain: 0, zero: 0, flatten: false, spec: 30 }, 64);
    expect(Math.max(...norm)).toBeGreaterThan(0.4);
  });

  it("o scroll segue o fim e para se o usuário subiu", () => {
    expect(stickToBottom(0, 500, 120)).toBe(false);
    expect(stickToBottom(370, 500, 120)).toBe(true);
    expect(stickToBottom(0, 80, 120)).toBe(true);
    expect(stickToNewest(0)).toBe(true);
    expect(stickToNewest(8)).toBe(true);
    expect(stickToNewest(40)).toBe(false);
    expect(createDigState().graphAvg).toBe(5);
    expect(fromPrefs(null).graphAvg).toBe(5);
    expect(Math.abs(dequantDb(quantizeDb(-40)) + 40)).toBeLessThan(1);
  });

  it("sair da rota não apaga o log nem pede para desligar", () => {
    const page = readFileSync(new URL("../client/src/console/digital-modes.tsx", import.meta.url), "utf8");
    const rx = readFileSync(new URL("../server/digital-rx.ts", import.meta.url), "utf8");
    const index = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
    expect(page.match(/op: "disable"/g)).toHaveLength(1);
    expect(page).toContain('if (rxOn)');
    expect(page).toContain("/api/digital/waterfall?after=");
    expect(page).toContain("stickToBottom");
    expect(page).toContain("follow");
    expect(page).not.toContain('type: "setPtt"');
    expect(index).toContain('app.get("/api/digital/waterfall"');
    expect(rx).not.toContain("T 1");
    expect(rx).not.toContain("setPtt");
    const onPcm = rx.slice(rx.indexOf("function onPcm"), rx.indexOf("async function pump"));
    expect(onPcm).toContain("feedHop");
    expect(rx).toContain("new Int16Array(WF_HOP)");
    expect(rx).toContain("frame.set(hop)");
    expect(onPcm).not.toContain("fall.clear");
    const tune = rx.slice(rx.indexOf("async function tuneNow"), rx.indexOf("async function enable"));
    expect(tune).not.toContain("fall.clear");
    const enable = rx.slice(rx.indexOf("async function enableNow"), rx.indexOf("async function disable"));
    expect(enable).toContain("fall.clear()");
    const disable = rx.slice(rx.indexOf("async function disableNow"), rx.indexOf("function clearRows"));
    expect(disable).toContain("fall.clear()");
  });
});
