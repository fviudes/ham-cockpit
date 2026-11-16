import { describe, expect, it } from "vitest";
import { WS_SEND_HIGH_WATER, tryWsSendBinary, tryWsSendText, wsSendWouldBlock } from "./ws-backpressure";

type FakeWs = {
  readyState: number;
  OPEN: number;
  bufferedAmount: number;
  sent: (string | Buffer)[];
  send: (data: string | Buffer) => void;
};

function fakeWs(buffered = 0): FakeWs {
  const ws: FakeWs = {
    readyState: 1,
    OPEN: 1,
    bufferedAmount: buffered,
    sent: [],
    send(data) {
      this.sent.push(data);
    },
  };
  return ws;
}

describe("ws-backpressure", () => {
  it("bloqueia acima do high-water", () => {
    const ws = fakeWs(WS_SEND_HIGH_WATER);
    expect(wsSendWouldBlock(ws as never)).toBe(true);
    expect(tryWsSendText(ws as never, "x")).toBe(false);
    expect(ws.sent).toHaveLength(0);
  });

  it("envia abaixo do high-water", () => {
    const ws = fakeWs(0);
    expect(tryWsSendText(ws as never, "ok")).toBe(true);
    expect(tryWsSendBinary(ws as never, Buffer.from([1, 2]))).toBe(true);
    expect(ws.sent).toEqual(["ok", Buffer.from([1, 2])]);
  });
});