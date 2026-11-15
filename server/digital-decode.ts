/**
 * Decodifica um período já em 12 kHz com o binário do ft8_lib (MIT).
 * Sem o binário, não inventa linha.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type ParsedDecode = { db: number; dt: number; hz: number; message: string };

const LINE = /^(\d{6})\s+([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s+(\d+)\s+~\s+(.+)$/;

export function decodeBin(): string {
  return process.env.FT8_DECODE || "/opt/ham-cockpit/bin/decode_ft8";
}

export function parseDecodeLines(text: string): ParsedDecode[] {
  const out: ParsedDecode[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const message = m[5]!.trim();
    if (!message || message.startsWith("Error [")) continue;
    const db = Number(m[2]);
    const dt = Number(m[3]);
    const hz = Number(m[4]);
    if (!Number.isFinite(db) || !Number.isFinite(dt) || !Number.isFinite(hz)) continue;
    out.push({ db, dt, hz, message });
  }
  return out;
}

export function wavPcm16(pcm: Buffer, rate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function runBin(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString("utf8") });
    });
  });
}

export async function decodeSlot(mode: "FT8" | "FT4", pcm: Buffer): Promise<{ ran: boolean; lines: ParsedDecode[] }> {
  const bin = decodeBin();
  if (!existsSync(bin)) return { ran: false, lines: [] };
  const dir = await mkdtemp(path.join(tmpdir(), "hc-ft8-"));
  const wav = path.join(dir, "slot.wav");
  try {
    await writeFile(wav, wavPcm16(pcm, 12_000));
    const args = mode === "FT4" ? ["-ft4", wav] : [wav];
    const result = await runBin(bin, args, 25_000);
    return { ran: true, lines: parseDecodeLines(result.stdout) };
  } catch {
    return { ran: false, lines: [] };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
