import { describe, expect, it } from "vitest";
import { ser2netDialHost } from "./ser2net-bind";

describe("ser2netDialHost", () => {
  it("a escuta aberta continua discando na própria estação", () => {
    expect(ser2netDialHost("0.0.0.0")).toBe("127.0.0.1");
    expect(ser2netDialHost("")).toBe("127.0.0.1");
    expect(ser2netDialHost("localhost")).toBe("127.0.0.1");
  });

  it("um IP específico permanece o destino", () => {
    expect(ser2netDialHost("192.168.20.165")).toBe("192.168.20.165");
    expect(ser2netDialHost("127.0.0.1")).toBe("127.0.0.1");
  });
});
