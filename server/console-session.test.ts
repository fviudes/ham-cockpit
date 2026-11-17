import { describe, expect, it } from "vitest";
import {
  consoleSessionAdmin,
  consoleSessionClearCookie,
  consoleSessionCookie,
  consoleSessionOk,
  consoleSessionToken,
  consoleSessionUser,
} from "./console-session";

function cookieOf(token: string): string {
  const set = consoleSessionCookie(token);
  return set.split(";")[0] ?? "";
}

describe("login do console", () => {
  it("aceita admin e suporte e recusa senha errada", () => {
    const admin = consoleSessionToken("admin", "1234");
    const suporte = consoleSessionToken(" Suporte ", "doidona1");
    expect(admin).toBeTruthy();
    expect(suporte).toBeTruthy();
    expect(consoleSessionToken("suporte", "1234")).toBeNull();
    expect(consoleSessionToken("admin", "doidona1")).toBeNull();
    expect(consoleSessionOk(cookieOf(admin!))).toBe(true);
    expect(consoleSessionOk(cookieOf(suporte!))).toBe(true);
    expect(consoleSessionOk(consoleSessionClearCookie().split(";")[0])).toBe(false);
    expect(consoleSessionUser(cookieOf(admin!))).toBe("admin");
    expect(consoleSessionAdmin(cookieOf(admin!))).toBe(true);
    expect(consoleSessionAdmin(cookieOf(suporte!))).toBe(false);
  });
});
