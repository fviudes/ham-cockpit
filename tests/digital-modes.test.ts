import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  bandChipLabel,
  candidates,
  createDigState,
  defaultFreqs,
  dialForBand,
  dialsForMode,
  digReducer,
  formatDialMhz,
  afterTxSent,
  applyLiveContact,
  fromPrefs,
  isCqMessage,
  rememberContact,
  shouldHaltTx,
  leftRows,
  periodAt,
  pickCandidate,
  plannedText,
  rightRows,
  standardMessages,
  withRows,
  type DecodeRow,
} from "../client/src/console/digital-modes-model";
import { periodAt12k, periodSamples, rowsFromDecode, type PcmChunk } from "../client/src/console/digital-pcm";
import { peakColumnHz, spectrumColumns } from "../client/src/console/digital-spectrum";
import { parseDecodeLines, wavPcm16 } from "../server/digital-decode";
import { DIGITAL_DATA_MODE, enableRigCommands, parseRigFreq, parseRigMode, restoreRigCommands, tuneRigCommand } from "../server/digital-rx-plan";
import { nextTxSlot, playbackBytes, playbackPlan } from "../shared/digital-slot";

function row(partial: Partial<DecodeRow> & Pick<DecodeRow, "id" | "message">): DecodeRow {
  return {
    utc: "000000",
    db: -10,
    dt: 0.1,
    hz: 1200,
    even: true,
    ...partial,
  };
}

describe("modos digitais", () => {
  it("nasce com as duas automáticas desligadas e sem linhas", () => {
    const s = createDigState();
    expect(s.autoCq).toBe(false);
    expect(s.autoCall).toBe(false);
    expect(s.enable).toBe(false);
    expect(s.rows).toEqual([]);
    expect(candidates(s, "20 m")).toEqual([]);
    expect(s.acceptUdp).toBe(false);
    expect(s.audioRx).toBe(0);
  });

  it("não deixa Auto CQ e Auto Call ligados juntos", () => {
    let s = digReducer(createDigState(), { type: "autoCq" });
    expect(s.autoCq).toBe(true);
    expect(s.autoCall).toBe(false);
    expect(s.next).toBe(6);
    expect(s.txEven).toBe(true);
    expect(plannedText({ ...s, tx: { ...s.tx, 1: "CQ PU2ABC GG68" } })).toBe("CQ PU2ABC GG68");
    s = digReducer(s, { type: "autoCall" });
    expect(s.autoCall).toBe(true);
    expect(s.autoCq).toBe(false);
    expect(s.cqOnly).toBe(true);
    expect(s.filterOn).toBe(true);
    s = digReducer(s, { type: "autoCq" });
    expect(s.autoCq).toBe(true);
    expect(s.autoCall).toBe(false);
  });

  it("Halt Tx corta o estado local na hora", () => {
    let s = digReducer(createDigState(), { type: "autoCq" });
    s = digReducer(s, { type: "tune" });
    s = digReducer(s, { type: "pounce" });
    s = digReducer(s, { type: "toggleEnable", periodIndex: 3 });
    s = digReducer(s, { type: "halt" });
    expect(s.autoCq).toBe(false);
    expect(s.autoCall).toBe(false);
    expect(s.enable).toBe(false);
    expect(s.tune).toBe(false);
    expect(s.pounce).toBe(false);
    expect(s.finishPeriod).toBeNull();
  });

  it("Stop segura até o fim do período e o período seguinte solta", () => {
    let s = digReducer(createDigState(), { type: "period", index: 4, even: true, band: "20 m" });
    s = digReducer(s, { type: "toggleEnable", periodIndex: 4 });
    s = digReducer(s, { type: "stop", periodIndex: 4 });
    expect(s.enable).toBe(false);
    expect(s.finishPeriod).toBe(4);
    s = digReducer(s, { type: "period", index: 5, even: false, band: "20 m" });
    expect(s.finishPeriod).toBeNull();
  });

  it("duplo clique preenche Call, grid e Tx e não mexe no tom de TX com Hold", () => {
    let s = { ...createDigState(), myCall: "PU2ABC", myGrid: "GG68", holdTx: true, txHz: 1500, txEvenLocked: false };
    s = digReducer(s, {
      type: "double",
      row: row({ id: "a", message: "CQ K1ABC FN42", db: -9, hz: 800, even: true }),
    });
    expect(s.dxCall).toBe("K1ABC");
    expect(s.dxGrid).toBe("FN42");
    expect(s.txHz).toBe(1500);
    expect(s.rxHz).toBe(800);
    expect(s.txEven).toBe(false);
    expect(s.tx[1]).toBe("CQ PU2ABC GG68");
    expect(s.tx[2]).toBe("K1ABC PU2ABC GG68");
    expect(s.tx[3]).toContain("-9");
    expect(s.next).toBe(2);
    expect(s.enable).toBe(true);
    expect(plannedText(s)).toBe("K1ABC PU2ABC GG68");
    s = digReducer({ ...s, holdTx: false, txEvenLocked: true, txEven: true }, {
      type: "double",
      row: row({ id: "b", message: "CQ K1ABC FN42", hz: 900, even: true }),
    });
    expect(s.txHz).toBe(900);
    expect(s.txEven).toBe(true);
  });

  it("o contato permanece até o 73 e o halt de limpeza não corta o áudio", () => {
    let s = { ...createDigState(), myCall: "PU2ABC", myGrid: "GG68" };
    s = digReducer(s, {
      type: "double",
      row: row({ id: "a", message: "CQ K1ABC FN42", db: -9, hz: 800, even: true }),
    });
    expect(s.enable).toBe(true);
    expect(s.next).toBe(2);
    expect(plannedText(s)).toBe("K1ABC PU2ABC GG68");

    s = digReducer(s, { type: "txSent" });
    expect(s.enable).toBe(true);
    expect(s.next).toBe(2);

    s = digReducer(s, { type: "syncRows", rows: [row({ id: "rpt", message: "PU2ABC K1ABC -10" })] });
    expect(s.enable).toBe(true);
    expect(s.next).toBe(3);
    expect(plannedText(s)).toContain("-9");

    s = digReducer(s, { type: "txSent" });
    expect(s.enable).toBe(true);
    expect(s.next).toBe(3);

    s = digReducer(s, { type: "heard", rows: [row({ id: "rog", message: "PU2ABC K1ABC R-12" })] });
    expect(s.enable).toBe(true);
    expect(s.next).toBe(5);
    expect(plannedText(s)).toBe("K1ABC PU2ABC RRR");

    s = digReducer(s, { type: "txSent" });
    expect(s.enable).toBe(true);
    expect(plannedText(s)).toContain("RRR");

    s = digReducer(s, { type: "syncRows", rows: [row({ id: "rr", message: "PU2ABC K1ABC RR73" })] });
    expect(s.enable).toBe(true);
    expect(s.next).toBe(6);
    expect(plannedText(s)).toBe("K1ABC PU2ABC 73");

    s = digReducer(s, { type: "txSent" });
    expect(s.enable).toBe(false);
    expect(s.tune).toBe(false);

    expect(shouldHaltTx("cleanup", "audio")).toBe(false);
    expect(shouldHaltTx("cleanup", "ptt")).toBe(false);
    expect(shouldHaltTx("cleanup", "wait")).toBe(false);
    expect(shouldHaltTx("cycle6", "audio")).toBe(false);
    expect(shouldHaltTx("cycle6", "ptt")).toBe(false);
    expect(shouldHaltTx("cycle6", "done")).toBe(true);
    expect(shouldHaltTx("user", "audio")).toBe(true);
    expect(shouldHaltTx("user", "wait")).toBe(true);

    rememberContact(s);
    expect(applyLiveContact(fromPrefs({ enable: true, next: 1 })).enable).toBe(false);
    const open = digReducer(createDigState(), {
      type: "double",
      row: row({ id: "b", message: "CQ K1ABC FN42", db: -9, hz: 800, even: true }),
    });
    const mid = { ...digReducer(open, { type: "txSent" }), next: 4 as const };
    rememberContact(mid);
    const back = applyLiveContact(fromPrefs({ enable: true, next: 1 }));
    expect(back.enable).toBe(true);
    expect(back.next).toBe(4);
    rememberContact({ ...createDigState(), enable: false });
  });

  it("CQ only e Treat 73 filtram a lista da esquerda", () => {
    const rows = [
      row({ id: "cq", message: "CQ K1ABC FN42" }),
      row({ id: "qso", message: "PU2ABC K1ABC -12", even: false }),
      row({ id: "bye", message: "PU2ABC K1ABC 73", even: false }),
      row({ id: "rr", message: "PU2ABC K1ABC RR73", even: false }),
    ];
    let s = withRows({ ...createDigState(), cqOnly: true, myCall: "PU2ABC" }, rows);
    expect(leftRows(s, "20 m").map((r) => r.id)).toEqual(["cq"]);
    s = { ...s, treat73: true };
    expect(leftRows(s, "20 m").map((r) => r.id)).toEqual(["cq", "bye", "rr"]);
    expect(isCqMessage("PU2ABC K1ABC RRR", true)).toBe(false);
  });

  it("ignore, sinal mínimo e prioridade escolhem o candidato sem criar estação", () => {
    const rows = [
      row({ id: "weak", message: "CQ W1AW FN42", db: -18 }),
      row({ id: "loud", message: "CQ K1ABC FN42", db: -6 }),
      row({ id: "mid", message: "CQ G0XYZ IO91", db: -12 }),
    ];
    let s = withRows({ ...createDigState(), filterOn: true, minSignal: -10, myCall: "PU2ABC" }, rows);
    expect(candidates(s, "20 m").map((r) => r.id)).toEqual(["loud"]);
    s = { ...s, minSignal: -30, ignore: "K1ABC" };
    expect(candidates(s, "20 m").map((r) => r.id)).toEqual(["weak", "mid"]);
    expect(pickCandidate(candidates(s, "20 m"), "signal")?.id).toBe("mid");
    expect(pickCandidate(candidates(s, "20 m"), "last")?.id).toBe("mid");
    const ordered = leftRows({ ...s, priority: "signal", cqOnly: true }, "20 m").map((r) => r.id);
    expect(ordered[0]).toBe("mid");
    expect(createDigState().rows).toHaveLength(0);
  });

  it("rejeita indicativo curto e sufixo /R como candidato", () => {
    const rows = [
      row({ id: "short", message: "CQ A1" }),
      row({ id: "rover", message: "CQ K1ABC/R FN42" }),
      row({ id: "ok", message: "CQ K1ABC FN42" }),
    ];
    const s = withRows({ ...createDigState(), myCall: "PU2ABC" }, rows);
    expect(candidates(s, "20 m").map((r) => r.id)).toEqual(["ok"]);
  });

  it("o relógio do período é 15 s no FT8 e 7,5 s no FT4", () => {
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 8);
    const ft8 = periodAt(t0, "FT8");
    const ft4 = periodAt(t0, "FT4");
    expect(ft8.period).toBe(15);
    expect(ft8.even).toBe(true);
    expect(ft8.label.endsWith("/15")).toBe(true);
    expect(ft4.period).toBe(7.5);
    expect(ft4.even).toBe(false);
    expect(ft4.label.endsWith("/7.5")).toBe(true);
  });

  it("a lista de frequências marca provisório só onde a lista padrão marca", () => {
    const freqs = defaultFreqs();
    expect(freqs.filter((f) => f.mode === "FT8").map((f) => formatDialMhz(f.hz))).toEqual([
      "1.840",
      "3.573",
      "7.074",
      "10.136",
      "14.074",
      "18.100",
      "21.074",
      "24.915",
      "28.074",
      "50.313",
      "50.323",
      "70.154",
      "144.174",
    ]);
    expect(freqs.filter((f) => f.mode === "FT4").map((f) => formatDialMhz(f.hz))).toEqual([
      "3.575",
      "7.0475",
      "10.140",
      "14.080",
      "18.104",
      "21.140",
      "24.919",
      "28.180",
      "50.318",
      "144.170",
    ]);
    expect(freqs.filter((f) => f.provisional).map((f) => formatDialMhz(f.hz))).toEqual([
      "3.575",
      "7.0475",
      "10.140",
      "14.080",
      "18.104",
      "24.919",
      "50.318",
    ]);
    expect(freqs.find((f) => f.band === "4 m")?.region1).toBe(true);
    expect(freqs.find((f) => f.band === "4 m")?.provisional).toBe(false);
    expect(freqs.some((f) => f.band === "60 m" || f.band === "70 cm")).toBe(false);
  });

  it("a preferência local não religa a transmissão nem aceita UDP", () => {
    const s = fromPrefs({
      autoCq: true,
      autoCall: true,
      enable: true,
      tune: true,
      pounce: true,
      acceptUdp: true,
      rows: [row({ id: "x", message: "CQ K1ABC FN42" })],
      myCall: "PU2ABC",
    });
    expect(s.autoCq).toBe(false);
    expect(s.autoCall).toBe(false);
    expect(s.enable).toBe(false);
    expect(s.tune).toBe(false);
    expect(s.pounce).toBe(false);
    expect(s.acceptUdp).toBe(false);
    expect(s.rows).toEqual([]);
    expect(s.myCall).toBe("PU2ABC");
  });

  it("Pounce só arma quando a linha do Call aparece e não inventa a linha", () => {
    let s = withRows({ ...createDigState(), pounce: true, dxCall: "K1ABC", myCall: "PU2ABC", myGrid: "GG68" }, [
      row({ id: "cq", message: "CQ K1ABC FN42", hz: 1400, even: true, db: -8 }),
    ]);
    s = digReducer(s, { type: "period", index: 1, even: true, band: "20 m" });
    expect(s.pounce).toBe(true);
    s = digReducer(s, { type: "period", index: 2, even: false, band: "20 m" });
    expect(s.pounce).toBe(false);
    expect(s.enable).toBe(true);
    expect(s.next).toBe(2);
    expect(s.tx[2]).toContain("K1ABC");
    const idle = digReducer({ ...createDigState(), pounce: true, dxCall: "K1ABC" }, { type: "period", index: 1, even: true, band: "20 m" });
    const still = digReducer(idle, { type: "period", index: 2, even: false, band: "20 m" });
    expect(still.pounce).toBe(true);
    expect(still.rows).toEqual([]);
    expect(standardMessages("", "", "", "", "")[1]).toBe("CQ");
  });

  it("o botão de 40 m usa o dial do modo que está na tela", () => {
    const freqs = defaultFreqs();
    const ft8 = dialsForMode(freqs, "FT8");
    const ft4 = dialsForMode(freqs, "FT4");
    expect(ft8.find((d) => d.band === "40 m")?.hz).toBe(7_074_000);
    expect(ft4.find((d) => d.band === "40 m")?.hz).toBe(7_047_500);
    expect(dialForBand(freqs, "FT8", "40 m", 7_076_000)?.hz).toBe(7_074_000);
    expect(dialForBand(freqs, "FT4", "40 m", 7_076_000)?.hz).toBe(7_047_500);
    expect(createDigState().rxWidth).toBe(10);
    expect(ft8.filter((d) => d.band === "6 m")).toHaveLength(2);
    expect(bandChipLabel(ft8.find((d) => d.band === "40 m")!, ft8)).toBe("40 m");
    expect(ft8.filter((d) => d.band === "6 m").map((d) => bandChipLabel(d, ft8))).toEqual(["6 m 50,313", "6 m 50,323"]);
    expect(ft8.some((d) => d.band === "60 m" || d.band === "70 cm")).toBe(false);
  });

  it("a cascata fica acima das duas listas e habilitar não chaveia PTT", () => {
    const src = readFileSync(new URL("../client/src/console/digital-modes.tsx", import.meta.url), "utf8");
    const waterfall = src.indexOf("<Waterfall");
    const band = src.indexOf('t("bandActivity")');
    const rx = src.indexOf('t("rxFreq")');
    const select = src.indexOf('aria-label={t("band")}');
    const ft8 = src.indexOf('t("modeFt8")');
    const button = src.indexOf('t("ft8On")');
    const settings = src.indexOf('t("settings")');
    expect(waterfall).toBeGreaterThan(0);
    expect(waterfall).toBeLessThan(band);
    expect(band).toBeLessThan(rx);
    expect(select).toBeGreaterThan(0);
    expect(select).toBeLessThan(ft8);
    expect(button).toBeGreaterThan(0);
    expect(button).toBeLessThan(settings);
    expect(src).toContain('t("ft8Off")');
    expect(src).not.toContain('t("air")}');
    expect(src).not.toContain('t("bandHint")');
    expect(src).not.toContain('type: "setPtt"');
    expect(src).not.toContain('mode: "USB"');
    expect(src).toContain("expireConsoleSession()");
    const denied = src.indexOf("res.status === 401");
    expect(denied).toBeGreaterThan(0);
    expect(src.slice(denied, denied + 80)).not.toContain("ft8Fail");
  });

  it("o modo DATA medido no rigctld é PKTUSB e desabilitar restaura", () => {
    expect(DIGITAL_DATA_MODE).toBe("PKTUSB");
    expect(enableRigCommands(14_074_000)).toEqual(["M PKTUSB 0", "F 14074000"]);
    expect(tuneRigCommand(7_074_000)).toBe("F 7074000");
    expect(restoreRigCommands({ hz: 28_074_000, mode: "USB", width: 3000 })).toEqual(["F 28074000", "M USB 3000"]);
    expect(parseRigFreq("28074000\nRPRT 0")).toBe(28_074_000);
    expect(parseRigMode("PKTUSB\n3000\nRPRT 0")).toEqual({ mode: "PKTUSB", width: 3000 });
    expect(parseRigMode("USB\n3000\nRPRT 0")).toEqual({ mode: "USB", width: 3000 });
    const rx = readFileSync(new URL("../server/digital-rx.ts", import.meta.url), "utf8");
    expect(rx).toContain("DIGITAL_DATA_MODE");
    expect(rx).not.toContain("T 1");
    expect(rx).not.toContain("setPtt");
  });

  it("uma linha ouvida entra na banda e só na frequência de Rx se o tom estiver perto", () => {
    const heard = rowsFromDecode([{ db: -12.4, dt: 0.2, hz: 1510, message: "CQ K1ABC FN42" }], Date.UTC(2026, 0, 1, 12, 0, 0), true);
    let s = digReducer(createDigState(), { type: "heard", rows: heard });
    expect(leftRows(s, "40 m")).toHaveLength(1);
    expect(rightRows({ ...s, rxHz: 1500, rxWidth: 50 })).toHaveLength(1);
    expect(rightRows({ ...s, rxHz: 800, rxWidth: 20 })).toHaveLength(0);
    s = digReducer(s, {
      type: "heard",
      rows: rowsFromDecode([{ db: -8, dt: 0.1, hz: 400, message: "PU2ABC K1ABC -08" }], Date.UTC(2026, 0, 1, 12, 0, 15), false),
    });
    expect(rightRows({ ...s, myCall: "PU2ABC", rxHz: 1500, rxWidth: 20 }).some((r) => r.message.startsWith("PU2ABC"))).toBe(true);
    expect(digReducer(s, { type: "heard", rows: [] }).rows).toHaveLength(2);
  });

  it("o período de 15 s vira 180000 amostras a 12 kHz", () => {
    expect(periodSamples("FT8")).toBe(180_000);
    expect(periodSamples("FT4")).toBe(90_000);
    const start = 1_000_000;
    const chunks: PcmChunk[] = [];
    const rate = 48_000;
    for (let t = 0; t < 15; t += 0.25) {
      const pcm = new Int16Array(rate / 4);
      pcm.fill(1000);
      chunks.push({ t0: start + t * 1000, pcm });
    }
    const slot = periodAt12k(chunks, start, "FT8");
    expect(slot).not.toBeNull();
    expect(slot!.length).toBe(180_000);
    expect(slot![0]).toBe(1000);
    expect(periodAt12k(chunks.slice(0, 2), start, "FT8")).toBeNull();
  });

  it("o espectro de um tom de 1500 Hz cai nessa coluna", () => {
    const n = 4096;
    const buf = new Int16Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.round(Math.sin((2 * Math.PI * 1500 * i) / 48000) * 20000);
    const cols = spectrumColumns(buf, 48000, 100, 3300, 64);
    const hz = peakColumnHz(cols, 100, 3300);
    expect(Math.abs(hz - 1500)).toBeLessThan(80);
    expect(spectrumColumns(new Int16Array(n), 48000, 100, 3300, 64).every((v) => v === 0)).toBe(true);
  });

  it("lê a linha do decode e ignora texto que não é mensagem", () => {
    const lines = parseDecodeLines("000000 -15.0 +0.50 1500 ~  CQ K1ABC FN42\nDecoded 1 messages\n000000 -8.0 +0.20  800 ~  Error [2] while unpacking!\n");
    expect(lines).toEqual([{ db: -15, dt: 0.5, hz: 1500, message: "CQ K1ABC FN42" }]);
    const wav = wavPcm16(Buffer.from([0, 0, 1, 0]), 12000);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(12000);
  });

  it("o plano de TX usa o silêncio e a queda de PTT medidos", () => {
    const ft8 = playbackPlan("FT8");
    expect(ft8.leadSilence).toBeCloseTo(0.5, 5);
    expect(ft8.tone).toBeCloseTo(12.64, 5);
    expect(ft8.trailSilence).toBeCloseTo(0.5, 5);
    expect(ft8.pttDrop).toBeCloseTo(13.84, 5);
    expect(ft8.toneSamples).toBe(151_680);
    expect(playbackBytes("FT8")).toEqual({ lead: 48_000, tone: 1_213_440, trail: 48_000, total: 1_309_440 });
    const ft4 = playbackPlan("FT4");
    expect(ft4.leadSilence).toBeCloseTo(0.3, 5);
    expect(ft4.tone).toBeCloseTo(5.04, 5);
    expect(ft4.trailSilence).toBeCloseTo(0.7, 5);
    expect(ft4.pttDrop).toBeCloseTo(6.24, 5);
    expect(ft4.toneSamples).toBe(60_480);
    const start = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(nextTxSlot(start, "FT8", true)).toBe(start);
    expect(nextTxSlot(start + 1000, "FT8", true)).toBe(start + 30_000);
    expect(nextTxSlot(start, "FT8", false)).toBe(start + 15_000);
  });

  it("os textos removidos não existem mais nem na cópia nem na tela", () => {
    const copy = readFileSync(new URL("../client/src/console/digital-modes-copy.ts", import.meta.url), "utf8");
    const src = readFileSync(new URL("../client/src/console/digital-modes.tsx", import.meta.url), "utf8");
    expect(copy).not.toContain("Enable Tx fica ligado");
    expect(copy).not.toContain("Habilitar FT8 guarda");
    expect(copy).not.toContain("Cascata de áudio");
    expect(copy).not.toContain("Audio waterfall");
    expect(src).not.toContain('PanelTitle>{t("waterfall")');
    expect(src).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]");
    expect(src).toContain("xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]");
    expect(src).not.toContain("decodeRan");
    expect(src).not.toContain("decodeWord");
    expect(src).toContain("h-64 overflow-hidden rounded-md");
  });

  it("o TX congela a mensagem do clique e o PTT passa na frente da fila do Hamlib", () => {
    const client = readFileSync(new URL("../client/src/console/digital-tx.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("../server/digital-tx.ts", import.meta.url), "utf8");
    const hub = readFileSync(new URL("../server/hamlib-hub.ts", import.meta.url), "utf8");
    expect(client).toContain("armId");
    expect(client).toContain('fail(stopUser ? "halt" : "rearm")');
    expect(client).toContain('if (result.error === "rearm") continue;');
    expect(server).toContain("hubRigctl(port, command, \"127.0.0.1\", PTT_TIMEOUT_MS, true)");
    expect(server).not.toMatch(/hubRigctl\(port, "t"\)/);
    expect(server).not.toContain('hubRigctl(port, "T 0")');
    expect(server).toContain("ensurePktUsb");
    expect(server).toContain("await raisePtt(current.port)");
    expect(hub).toContain("preempt && isPttCommand(cmd)");
    expect(shouldHaltTx("cleanup", "audio")).toBe(false);
    expect(shouldHaltTx("user", "audio")).toBe(true);
  });
});
