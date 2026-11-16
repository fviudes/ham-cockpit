import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addTile, defaultTiles } from "../client/src/console/panel-layout";
import { audioSweep } from "../client/src/console/waterfall-view";
import {
  centeredSpan,
  panelView,
  panelizeRfSweep,
  PANEL_SPAN_HZ,
  SCOPE_BIN_FULL,
  sweepDisplayFull,
  FRAME_MS,
  freqTicks,
  clickedTuneHz,
  hzAtClick,
  mhzLabel,
  sampleAt,
  scopeMissesView,
  scrollPxPerFrame,
  sweepIntervalMs,
  timeMarks,
  waterfallBands,
} from "../client/src/console/waterfall-view";

describe("tap CI-V do painel", () => {
  it("liga o espectro na serial com 27 10/11 ao abrir o card", () => {
    const src = readFileSync(resolve("server/civ-scope-tap.ts"), "utf8");
    expect(src).toContain("function applyScopeOutput");
    expect(src).toMatch(/const frames = scopeTx\(tap, on\)/);
    expect(src).toContain("sendFrames(tap, frames)");
    expect(src).toContain("if (outputWanted) applyScopeOutput(true, true)");
    expect(src).toContain("connectUp(state)");
    expect(src).toContain("ensureRigctldOnTap");
  });
});

describe("shell do waterfall no painel", () => {
  it("mantém altura fixa no card RF (escala no FitTile)", () => {
    const src = readFileSync(resolve("client/src/console/waterfall-panel.tsx"), "utf8");
    expect(src).toMatch(/relative h-64 overflow-hidden/);
    expect(src).toContain("panel-waterfall-feed");
    expect(src).toContain('aria-label="Tempo"');
    expect(src).toContain("#10b981");
    const board = readFileSync(resolve("client/src/console/panel-board.tsx"), "utf8");
    expect(board).toContain('className={fill ? "flex h-full min-h-0 w-full flex-col" : "w-full"}');
    expect(board).toContain("fillFitTile");
  });
});

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

describe("fallback de áudio no waterfall", () => {
  it("usa a largura da vista e não um único bin central", () => {
    const tune = 7_100_000;
    const pcm = new Int16Array(2048);
    for (let i = 0; i < pcm.length; i++) pcm[i] = (((i * 17_893) % 40_000) - 20_000) as number;
    const sweep = audioSweep(pcm, tune, 200_000);
    expect(sweep.endHz - sweep.startHz).toBe(200_000);
    expect(sweep.bins.length).toBeGreaterThan(100);
    let lit = 0;
    for (let c = 0; c < sweep.bins.length; c++) if ((sweep.bins[c] ?? 0) > 0) lit++;
    expect(lit).toBeGreaterThan(12);
    expect(lit).toBeLessThan(sweep.bins.length / 2);
  });
});

describe("espectro CI-V no painel", () => {
  it("reamostra o quadro do rádio na vista do VFO", () => {
    const tune = 7_140_000;
    const bins = new Uint8Array(475);
    bins[0] = 10;
    bins[237] = 120;
    bins[474] = 20;
    const raw = { startHz: 7_040_000, endHz: 7_240_000, mode: 0, bins, oor: false };
    const out = panelizeRfSweep(raw, tune, 200_000);
    expect(out.startHz).toBe(7_040_000);
    expect(out.endHz).toBe(7_240_000);
    expect(out.bins.length).toBe(475);
    expect(out.bins[237]).toBe(120);
    expect(sweepDisplayFull(out.bins, true)).toBe(SCOPE_BIN_FULL);
  });
});

describe("largura selecionada no painel", () => {
  it("usa o span do painel, não a janela fixa de ±150 kHz nem 0–3000 Hz", () => {
    const tune = 7_100_000;
    const wide = panelView(tune, PANEL_SPAN_HZ);
    expect(wide.endHz - wide.startHz).toBe(200_000);
    expect((wide.startHz + wide.endHz) / 2).toBe(tune);
    const narrow = panelView(tune, 100_000);
    expect(narrow.startHz).toBe(7_050_000);
    expect(narrow.endHz).toBe(7_150_000);
    expect(narrow.endHz - narrow.startHz).not.toBe(300_000);
    expect(narrow.endHz - narrow.startHz).not.toBe(3_000);
  });
});

describe("waterfall centrado no VFO", () => {
  it("mantém a frequência do rádio no meio e a vista em ±150 kHz", () => {
    const edge = { startHz: 7_030_000, endHz: 7_230_000 };
    const view = centeredSpan(edge, 7_140_000);
    expect(view.endHz - view.startHz).toBe(300_000);
    expect((view.startHz + view.endHz) / 2).toBe(7_140_000);
    expect(view.startHz).toBe(6_990_000);
    expect(view.endHz).toBe(7_290_000);
  });

  it("não desenha bin fora do scope", () => {
    const bins = Uint8Array.from([10, 20, 30]);
    const data = { startHz: 7_000_000, endHz: 7_200_000 };
    expect(sampleAt(bins, data, 7_000_000)).toBe(10);
    expect(sampleAt(bins, data, 7_200_000)).toBe(30);
    expect(sampleAt(bins, data, 6_900_000)).toBeNull();
  });

  it("marca o tempo de 5 em 5 segundos e LIVE no topo", () => {
    const marks = timeMarks(20, 200);
    expect(marks[0]?.label).toBe("LIVE");
    expect(marks.map((mark) => mark.label)).toEqual(["LIVE", "-5s", "-10s", "-15s"]);
  });

  it("coloca marcas de frequência dentro da barra", () => {
    const ticks = freqTicks({ startHz: 7_040_000, endHz: 7_240_000 }, 480);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks[0]).toBeGreaterThan(7_040_000);
    expect(ticks[ticks.length - 1]).toBeLessThan(7_240_000);
    expect(mhzLabel(7_140_000)).toBe("7.140");
  });

  it("linha antiga fica no Hz original e a vista nova inclui o quadro seguinte", () => {
    const oldLine = { bins: Uint8Array.from([1, 2, 3, 4, 5]), startHz: 7_030_000, endHz: 7_230_000 };
    const tuneHz = 7_180_000;
    const newLine = { bins: Uint8Array.from([6, 7, 8, 9, 10]), startHz: 7_080_000, endHz: 7_280_000 };
    const view = centeredSpan(newLine, tuneHz);
    expect((view.startHz + view.endHz) / 2).toBe(tuneHz);
    expect(view.endHz - view.startHz).toBe(300_000);
    expect(view.startHz).toBe(7_030_000);
    expect(view.endHz).toBe(7_330_000);
    expect(sampleAt(oldLine.bins, oldLine, 7_130_000)).toBe(3);
    expect(sampleAt(oldLine.bins, newLine, 7_130_000)).not.toBe(3);
    const brought = 7_250_000;
    expect(brought).toBeGreaterThan(oldLine.endHz);
    expect(brought).toBeGreaterThanOrEqual(view.startHz);
    expect(brought).toBeLessThanOrEqual(view.endHz);
    expect(sampleAt(oldLine.bins, oldLine, brought)).toBeNull();
    expect(sampleAt(newLine.bins, newLine, brought)).not.toBeNull();
  });

  it("a janela de ±150 kHz usa os bins do passo de ±250 kHz", () => {
    const tune = 7_145_000;
    const radio = { startHz: tune - 250_000, endHz: tune + 250_000 };
    const view = centeredSpan(radio, tune);
    const bins = new Uint8Array(475);
    bins.fill(40);
    expect(view.startHz).toBe(tune - 150_000);
    expect(view.endHz).toBe(tune + 150_000);
    expect(scopeMissesView(radio, tune)).toBe(false);
    expect(sampleAt(bins, radio, view.startHz)).not.toBeNull();
    expect(sampleAt(bins, radio, tune)).not.toBeNull();
    expect(sampleAt(bins, radio, view.endHz)).not.toBeNull();
    const narrow = { startHz: tune - 2_500, endHz: tune + 2_500 };
    expect(scopeMissesView(narrow, tune)).toBe(true);
    expect(sampleAt(bins, narrow, view.startHz)).toBeNull();
    expect(sampleAt(bins, narrow, view.endHz)).toBeNull();
  });
});

describe("clique no waterfall", () => {
  const tune = 7_140_000;
  const view = centeredSpan({ startHz: 7_040_000, endHz: 7_240_000 }, tune);
  const canvasW = 400;
  const gutter = 36;
  const plotW = canvasW - gutter;

  it("clique no centro devolve a frequência do VFO", () => {
    expect(hzAtClick(plotW / 2, canvasW, view, gutter)).toBe(tune);
  });

  it("clique à esquerda devolve frequência menor", () => {
    const left = hzAtClick(plotW / 4, canvasW, view, gutter);
    expect(left).not.toBeNull();
    expect(left as number).toBeLessThan(tune);
  });

  it("clique na área da escala de tempo não sintoniza", () => {
    expect(hzAtClick(plotW, canvasW, view, gutter)).toBeNull();
    expect(hzAtClick(canvasW - 8, canvasW, view, gutter)).toBeNull();
  });

  it("arredonda o clique para o kHz inteiro mais próximo", () => {
    expect(clickedTuneHz(7_145_370)).toBe(7_145_000);
    expect(clickedTuneHz(7_145_500)).toBe(7_146_000);
    expect(clickedTuneHz(7_145_000)).toBe(7_145_000);
  });
});

describe("deslocamento contínuo da cachoeira", () => {
  it("anda alguns pixels por quadro e uma linha inteira por varredura", () => {
    const intervalMs = 250;
    const rowPx = 32;
    const step = scrollPxPerFrame(intervalMs, rowPx);
    expect(FRAME_MS).toBeCloseTo(1000 / 30, 5);
    expect(step).toBeCloseTo((rowPx * FRAME_MS) / intervalMs, 5);
    expect(step).toBeGreaterThan(1);
    expect(step).toBeLessThan(rowPx);
    expect(step * (intervalMs / FRAME_MS)).toBeCloseTo(rowPx, 5);
  });

  it("não desloca sem intervalo ou sem altura de linha", () => {
    expect(scrollPxPerFrame(0, 32)).toBe(0);
    expect(scrollPxPerFrame(250, 0)).toBe(0);
    expect(scrollPxPerFrame(-10, 32)).toBe(0);
  });

  it("usa cerca de 4 varreduras por segundo quando ainda não há intervalo", () => {
    expect(sweepIntervalMs([])).toBe(250);
    expect(sweepIntervalMs([1_000, 750, 500])).toBe(250);
  });

  it("a linha nova entra no topo e o histórico desce sem pular", () => {
    const intervalMs = 250;
    const rowPx = 40;
    const t0 = 8_000;
    const previous = t0 - intervalMs;
    const times = [t0, previous];
    const atArrival = waterfallBands(times, intervalMs, rowPx, t0, 200);
    expect(atArrival).toEqual([{ index: 1, y0: 0, y1: rowPx }]);

    const mid = waterfallBands(times, intervalMs, rowPx, t0 + intervalMs / 2, 200);
    expect(mid[0]).toEqual({ index: 0, y0: 0, y1: rowPx / 2 });
    expect(mid[1]?.index).toBe(1);
    expect(mid[1]?.y0).toBe(rowPx / 2);
    expect((mid[1]?.y1 ?? 0) - (mid[1]?.y0 ?? 0)).toBeCloseTo(rowPx, 5);

    const afterFrame = waterfallBands(times, intervalMs, rowPx, t0 + FRAME_MS, 200);
    expect(afterFrame[0]?.index).toBe(0);
    expect(afterFrame[0]?.y1).toBeCloseTo(scrollPxPerFrame(intervalMs, rowPx, FRAME_MS), 5);
    expect(afterFrame[1]?.y0).toBeCloseTo(afterFrame[0]?.y1 ?? 0, 5);
  });
});
