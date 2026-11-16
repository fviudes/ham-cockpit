import { describe, expect, it, vi } from "vitest";
import type { ScopeSweep } from "../shared/icom-scope";
import {
  SCOPE_BROADCAST_MIN_MS,
  broadcastScopeSweeps,
  deliverScopeSweep,
  flushScopePending,
  scopeSweepWire,
} from "./scope-broadcast";

type FakeWs = {
  readyState: number;
  OPEN: number;
  bufferedAmount: number;
  sent: string[];
  send: (data: string) => void;
};

function fakeWs(): FakeWs {
  return {
    readyState: 1,
    OPEN: 1,
    bufferedAmount: 0,
    sent: [],
    send(data) {
      this.sent.push(data);
    },
  };
}

function sweep(n: number): ScopeSweep {
  const bins = new Uint8Array(4);
  bins[0] = n;
  return { startHz: 1, endHz: 2, mode: 0, bins, oor: false };
}

describe("scope-broadcast", () => {
  it("serializa bins em base64", () => {
    const wire = scopeSweepWire(sweep(7));
    expect(wire.binsB64).toBe(Buffer.from(sweep(7).bins).toString("base64"));
  });

  it("coalesce no grupo respeita intervalo mínimo", () => {
    vi.useFakeTimers();
    const group = new Set<FakeWs>();
    const a = fakeWs();
    const b = fakeWs();
    group.add(a as never);
    group.add(b as never);

    broadcastScopeSweeps(group as never, sweep(1));
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);

    broadcastScopeSweeps(group as never, sweep(2));
    expect(a.sent).toHaveLength(1);
    vi.advanceTimersByTime(SCOPE_BROADCAST_MIN_MS);
    expect(a.sent).toHaveLength(2);
    const last = JSON.parse(a.sent[1]!) as { binsB64: string };
    expect(Buffer.from(last.binsB64, "base64")[0]).toBe(2);
    vi.useRealTimers();
  });

  it("latest-only quando o buffer está cheio", () => {
    const ws = fakeWs();
    Object.defineProperty(ws, "bufferedAmount", { get: () => 999_999 });
    deliverScopeSweep(ws as never, sweep(1));
    expect(ws.sent).toHaveLength(0);
    deliverScopeSweep(ws as never, sweep(9));
    Object.defineProperty(ws, "bufferedAmount", { get: () => 0 });
    flushScopePending(ws as never);
    expect(ws.sent).toHaveLength(1);
    const body = JSON.parse(ws.sent[0]!) as { binsB64: string };
    expect(Buffer.from(body.binsB64, "base64")[0]).toBe(9);
  });
});