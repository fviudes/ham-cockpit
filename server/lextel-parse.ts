export type LextelAlarms = {
  vHigh: boolean;
  vLow: boolean;
  swrHigh: boolean;
  antFault: boolean;
  pwrHigh: boolean;
};

export type LextelReading = {
  pep: number;
  avg: number;
  ref: number;
  swr: number;
  vdc: number;
  z: number;
  mod: number;
  alarms: LextelAlarms;
  labels: string[];
};

export type LextelFieldMap = {
  off: number;
  size: 1 | 2;
  scale: number;
};

export type LextelLayout = {
  kind: "ascii" | "csv" | "json" | "bin16" | "aa55" | "stx" | "learned";
  period?: number;
  endian?: "le" | "be";
  map?: Partial<Record<"pep" | "avg" | "ref" | "swr" | "vdc" | "z" | "mod" | "flags", LextelFieldMap>>;
};

const MAX_BUF = 2048;

function round(n: number, d: number) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function alarmsOf(r: Omit<LextelReading, "alarms" | "labels">, flags = 0): Pick<LextelReading, "alarms" | "labels"> {
  const alarms: LextelAlarms = {
    vLow: r.vdc > 0 && r.vdc < 10.5,
    vHigh: r.vdc > 28,
    swrHigh: r.swr >= 2,
    antFault: r.swr >= 3 || Boolean(flags & 0x08),
    pwrHigh: r.pep > 2000 || Boolean(flags & 0x10),
  };
  if (flags & 0x01) alarms.vHigh = true;
  if (flags & 0x02) alarms.vLow = true;
  if (flags & 0x04) alarms.swrHigh = true;
  const labels: string[] = [];
  if (alarms.vHigh) labels.push("vHigh");
  if (alarms.vLow) labels.push("vLow");
  if (alarms.swrHigh) labels.push("swrHigh");
  if (alarms.antFault) labels.push("antFault");
  if (alarms.pwrHigh) labels.push("pwrHigh");
  return { alarms, labels };
}

function finish(partial: Partial<LextelReading> & { pep?: number }, flags = 0): LextelReading {
  const base = {
    pep: round(Math.max(0, partial.pep ?? 0), 3),
    avg: round(Math.max(0, partial.avg ?? 0), 3),
    ref: round(Math.max(0, partial.ref ?? 0), 3),
    swr: round(Math.min(9.9, Math.max(1, partial.swr ?? 1)), 2),
    vdc: round(Math.max(0, partial.vdc ?? 0), 2),
    z: round(Math.max(0, partial.z ?? 0), 1),
    mod: round(Math.min(150, Math.max(0, partial.mod ?? 0)), 1),
  };
  return { ...base, ...alarmsOf(base, flags) };
}

function plausible(r: LextelReading, idleOk = true): number {
  let s = 0;
  if (r.vdc >= 10 && r.vdc <= 30) s += 3;
  else if (r.vdc === 0 && idleOk) s += 0;
  if (r.z >= 5 && r.z <= 500) s += 2;
  if (r.swr >= 1 && r.swr <= 9.9) s += 2;
  if (r.pep >= 0 && r.pep <= 2400) s += 1;
  if (r.avg >= 0 && r.avg <= 2400 && r.avg <= r.pep + 80) s += 1;
  if (r.ref >= 0 && r.ref <= 2400 && r.ref <= r.pep + 80) s += 1;
  if (r.mod >= 0 && r.mod <= 150) s += 1;
  return s;
}

function num(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function wattsField(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return n / 1000;
}

function readingFromLetters(L: Record<string, number>): LextelReading | null {
  if (L.A == null && L.E == null) return null;
  if (L.D == null && L.E == null && L.A == null) return null;
  const f = L.F;
  return finish({
    pep: wattsField(L.A),
    avg: wattsField(L.B),
    ref: wattsField(L.C),
    swr: L.D ?? 1,
    vdc: L.E ?? 0,
    // F on the MS-2000 is band in MHz (7 = 40 m), not Z and not AM %.
    z: f != null && f > 150 && f <= 500 ? f : 0,
    mod: 0,
  });
}

function parseLetterBlock(text: string): LextelReading | null {
  const L: Record<string, number> = {};
  const re = /(?:^|\r?\n)([A-F]):\s*([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  let last: LextelReading | null = null;
  while ((m = re.exec(text))) {
    L[m[1].toUpperCase()] = Number(m[2].replace(",", "."));
    if (L.A != null && L.D != null && L.E != null && L.F != null) {
      last = readingFromLetters(L);
    }
  }
  return last ?? readingFromLetters(L);
}

function parseAsciiLine(line: string): LextelReading | null {
    const t = line.trim();
    if (!t) return null;
    const letter = t.match(/^([A-F]):\s*([\d.,]+)$/i);
    if (letter) {
      const one: Record<string, number> = { [letter[1].toUpperCase()]: Number(letter[2].replace(",", ".")) };
      const fromOne = readingFromLetters(one);
      if (fromOne && letter[1].toUpperCase() === "E") return fromOne;
    }
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const v = j[k];
          if (typeof v === "number" && Number.isFinite(v)) return v;
          if (typeof v === "string") {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
          }
        }
        return undefined;
      };
      const pep = pick("pep", "PEP", "p", "fwd", "peak");
      if (pep == null && pick("v", "vdc", "volt", "voltage") == null) return null;
      return finish({
        pep,
        avg: pick("avg", "average", "rms", "pavg", "media"),
        ref: pick("ref", "refl", "pr", "reflected"),
        swr: pick("swr", "roe", "vswr"),
        vdc: pick("vdc", "volt", "voltage", "v", "psu"),
        z: pick("z", "ohm", "r", "zant"),
        mod: pick("mod", "am", "modulation"),
      });
    } catch {
      /* not json */
    }
  }

  const kv: Record<string, number> = {};
  const re = /(PEP|PEAK|AVG|MEDIA|MÉDIA|SWR|ROE|VSWR|VDC|VOLT|V|REF|REFL|MOD|AM|Z|OHM|RANT)\s*[:=]\s*([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    kv[m[1].toUpperCase()] = Number(m[2].replace(",", "."));
  }
  if (kv.PEP != null || kv.PEAK != null || kv.SWR != null || kv.ROE != null || kv.VDC != null) {
    return finish({
      pep: kv.PEP ?? kv.PEAK,
      avg: kv.AVG ?? kv.MEDIA ?? kv.MÉDIA,
      ref: kv.REF ?? kv.REFL,
      swr: kv.SWR ?? kv.ROE ?? kv.VSWR,
      vdc: kv.VDC ?? kv.VOLT ?? kv.V,
      z: kv.Z ?? kv.OHM ?? kv.RANT,
      mod: kv.MOD ?? kv.AM,
    });
  }

  const parts = t.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
  const nums = parts.map((p) => num(p)).filter((n): n is number => n != null);
  if (nums.length >= 5 && nums.length <= 10) {
    const cand = finish({
      pep: nums[0],
      avg: nums[1],
      ref: nums[2],
      swr: nums[3] < 20 ? nums[3] : nums[3] / 10,
      vdc: nums[4] > 30 ? nums[4] / 10 : nums[4],
      z: nums[5],
      mod: nums[6],
    });
    if (plausible(cand) >= 6) return cand;
  }
  return null;
}

function uInt(buf: Buffer, off: number, size: 1 | 2, le: boolean): number {
  if (size === 1) return buf[off] ?? 0;
  if (off + 1 >= buf.length) return 0;
  return le ? buf.readUInt16LE(off) : buf.readUInt16BE(off);
}

function applyMap(frame: Buffer, layout: LextelLayout): LextelReading | null {
  if (!layout.map) return null;
  const le = layout.endian !== "be";
  const get = (key: keyof NonNullable<LextelLayout["map"]>, fallback = 0) => {
    const f = layout.map?.[key];
    if (!f) return fallback;
    return uInt(frame, f.off, f.size, le) * f.scale;
  };
  const flags = layout.map.flags ? uInt(frame, layout.map.flags.off, layout.map.flags.size, le) : 0;
  const pep = get("pep");
  const swrRaw = get("swr", 1);
  const vdcRaw = get("vdc");
  return finish(
    {
      pep,
      avg: get("avg"),
      ref: get("ref"),
      swr: swrRaw < 1 ? 1 : swrRaw > 20 ? swrRaw / (swrRaw > 200 ? 100 : 10) : swrRaw,
      vdc: vdcRaw > 40 ? vdcRaw / (vdcRaw > 400 ? 100 : 10) : vdcRaw,
      z: get("z"),
      mod: get("mod"),
    },
    flags,
  );
}

function tryBin16(frame: Buffer, le: boolean): LextelReading | null {
  if (frame.length < 14) return null;
  const g = (off: number) => (le ? frame.readUInt16LE(off) : frame.readUInt16BE(off));
  const pep = g(0);
  const avg = g(2);
  const ref = g(4);
  let swr = g(6);
  let vdc = g(8);
  const z = g(10);
  const mod = frame[12] ?? 0;
  const flags = frame[13] ?? 0;
  if (swr > 20) swr = swr / (swr > 200 ? 100 : 10);
  if (vdc > 40) vdc = vdc / (vdc > 400 ? 100 : 10);
  const pepW = pep > 2400 ? pep / 10 : pep;
  const avgW = avg > 2400 ? avg / 10 : avg;
  const refW = ref > 2400 ? ref / 10 : ref;
  const cand = finish({ pep: pepW, avg: avgW, ref: refW, swr, vdc, z, mod }, flags);
  return plausible(cand) >= 7 ? cand : null;
}

function scaleFits(raw: number, min: number, max: number): number | null {
  for (const s of [1, 0.1, 0.01]) {
    const v = raw * s;
    if (v >= min && v <= max) return s;
  }
  return null;
}

function learnLayout(buf: Buffer): { layout: LextelLayout; reading: LextelReading } | null {
  if (buf.length < 64) return null;
  let best: { score: number; layout: LextelLayout; reading: LextelReading } | null = null;
  for (let period = 8; period <= 32; period++) {
    const frames: Buffer[] = [];
    for (let i = 0; i + period <= buf.length && frames.length < 12; i += period) {
      frames.push(buf.subarray(i, i + period));
    }
    if (frames.length < 5) continue;
    for (const endian of ["le", "be"] as const) {
      const le = endian === "le";
      const map: NonNullable<LextelLayout["map"]> = {};
      const assign = (key: keyof NonNullable<LextelLayout["map"]>, min: number, max: number, prefer2 = true) => {
        let hit: LextelFieldMap | null = null;
        let hitScore = 0;
        const maxOff = period - 1;
        for (let off = 0; off <= maxOff; off++) {
          for (const size of prefer2 ? ([2, 1] as const) : ([1, 2] as const)) {
            if (off + size > period) continue;
            const used = Object.values(map).some((f) => f && !(off + size <= f.off || f.off + f.size <= off));
            if (used) continue;
            const vals = frames.map((f) => uInt(f, off, size, le));
            const median = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)] ?? 0;
            const scale = scaleFits(median, min, max);
            if (scale == null) continue;
            const stable = vals.filter((v) => {
              const x = v * scale;
              return x >= min * 0.5 && x <= max * 1.2;
            }).length;
            if (stable < frames.length - 1) continue;
            if (stable > hitScore) {
              hitScore = stable;
              hit = { off, size, scale };
            }
          }
        }
        if (hit) map[key] = hit;
      };
      assign("vdc", 10, 30);
      assign("z", 5, 500);
      assign("swr", 1, 9.9);
      assign("pep", 0, 2400);
      assign("avg", 0, 2400);
      assign("ref", 0, 2400);
      assign("mod", 0, 150, false);
      if (!map.vdc && !map.pep) continue;
      const layout: LextelLayout = { kind: "learned", period, endian, map };
      const reading = applyMap(frames[frames.length - 1]!, layout);
      if (!reading) continue;
      const score = plausible(reading) + Object.keys(map).length;
      if (!best || score > best.score) best = { score, layout, reading };
    }
  }
  if (best && best.score >= 8) return { layout: best.layout, reading: best.reading };
  return null;
}

function toHex(buf: Buffer, max = 64): string {
  const slice = buf.subarray(Math.max(0, buf.length - max));
  return Array.from(slice, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

export type LextelInspect = {
  ascii: string;
  printable: number;
  period: number | null;
  hexHead: string;
  note: string;
  layout: LextelLayout | null;
  reading: LextelReading | null;
};

function guessPeriod(buf: Buffer): number | null {
  if (buf.length < 48) return null;
  let bestLag = 0;
  let best = 0;
  const n = Math.min(buf.length, 512);
  for (let lag = 8; lag <= 32; lag++) {
    let hit = 0;
    let tot = 0;
    for (let i = 0; i + lag < n; i++) {
      tot += 1;
      if (buf[i] === buf[i + lag]) hit += 1;
    }
    const score = tot ? hit / tot : 0;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  return best >= 0.18 ? bestLag : null;
}

export function inspectCapture(buf: Buffer): LextelInspect {
  const printable = buf.reduce((n, b) => n + (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) ? 1 : 0), 0);
  const ratio = buf.length ? printable / buf.length : 0;
  let start = 0;
  while (start < buf.length && buf[start] === 0) start += 1;
  const slice = buf.subarray(start);
  const ascii = slice
    .toString("latin1")
    .replace(/[^\t\r\n\x20-\x7e]/g, ".")
    .slice(0, 480);
  const hexHead = toHex(buf.subarray(0, Math.min(buf.length, 96)), 96);
  const period = guessPeriod(buf);
  const dec = new LextelDecoder();
  const reading = buf.length ? dec.push(buf) : null;
  let note = "aguardando bytes";
  if (!buf.length) note = "sem captura";
  else if (ratio > 0.75 || dec.layout?.kind === "ascii") note = "ASCII A-F (PEP/AVG/REF mW /1000 = W, ROE, V, F)";
  else if (dec.layout) note = `quadro ${dec.layout.kind}${period ? ` · período ~${period} B` : ""}`;
  else if (period) note = `binário repetindo a cada ~${period} B — ainda mapeando campos`;
  else note = `${buf.length} B recebidos · ${Math.round(ratio * 100)}% imprimíveis`;
  return {
    ascii,
    printable: ratio,
    period,
    hexHead,
    note,
    layout: dec.layout,
    reading,
  };
}

export class LextelDecoder {
  private buf = Buffer.alloc(0);
  private ascii = "";
  private letters: Record<string, number> = {};
  layout: LextelLayout | null = null;
  lastHex = "";
  bytes = 0;

  constructor(saved?: LextelLayout | null) {
    this.layout = saved ?? null;
  }

  reset(saved?: LextelLayout | null) {
    this.buf = Buffer.alloc(0);
    this.ascii = "";
    this.letters = {};
    this.layout = saved ?? null;
    this.lastHex = "";
    this.bytes = 0;
  }

  push(chunk: Buffer): LextelReading | null {
    if (!chunk.length) return null;
    this.bytes += chunk.length;
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > MAX_BUF) this.buf = this.buf.subarray(this.buf.length - MAX_BUF);
    this.lastHex = toHex(this.buf);
    this.ascii += chunk.toString("latin1");
    if (this.ascii.length > MAX_BUF) this.ascii = this.ascii.slice(-MAX_BUF);

    const block = parseLetterBlock(this.ascii);
    if (block && (plausible(block) >= 4 || this.layout?.kind === "ascii" || block.vdc >= 10)) {
      this.layout = { kind: "ascii" };
      return block;
    }

    const nl = this.ascii.lastIndexOf("\n");
    const cr = this.ascii.lastIndexOf("\r");
    const cut = Math.max(nl, cr);
    if (cut > 0) {
      const lines = this.ascii.slice(0, cut).split(/\r\n|\n|\r/);
      this.ascii = this.ascii.slice(cut + 1);
      for (const line of lines) {
        const lettr = line.trim().match(/^([A-F]):\s*([\d.,]+)$/i);
        if (lettr) {
          this.letters[lettr[1].toUpperCase()] = Number(lettr[2].replace(",", "."));
          if (this.letters.A != null && this.letters.E != null) {
            const got = readingFromLetters(this.letters);
            if (got && (plausible(got) >= 4 || this.layout?.kind === "ascii" || got.vdc >= 10)) {
              this.layout = { kind: "ascii" };
              return got;
            }
          }
        }
      }
      for (let i = lines.length - 1; i >= 0; i--) {
        const got = parseAsciiLine(lines[i] ?? "");
        if (got && plausible(got) >= 5) {
          this.layout = { kind: lines[i]?.trim().startsWith("{") ? "json" : /[;,]/.test(lines[i] ?? "") ? "csv" : "ascii" };
          return got;
        }
      }
    }

    const aa = this.buf.lastIndexOf(0xaa);
    if (aa >= 0 && aa + 1 < this.buf.length && this.buf[aa + 1] === 0x55 && aa + 16 <= this.buf.length) {
      const frame = this.buf.subarray(aa, aa + 16);
      const le = tryBin16(frame.subarray(2), true);
      const be = tryBin16(frame.subarray(2), false);
      const hit = (le && plausible(le) >= 7 ? le : null) || (be && plausible(be) >= 7 ? be : null);
      if (hit) {
        this.layout = { kind: "aa55", period: 16, endian: le && plausible(le) >= 7 ? "le" : "be" };
        return hit;
      }
    }

    const stx = this.buf.lastIndexOf(0x02);
    const etx = this.buf.lastIndexOf(0x03);
    if (stx >= 0 && etx > stx + 8 && etx - stx <= 40) {
      const frame = this.buf.subarray(stx + 1, etx);
      const hit = tryBin16(frame, true) || tryBin16(frame, false);
      if (hit) {
        this.layout = { kind: "stx", period: etx - stx + 1 };
        return hit;
      }
    }

    if (this.layout?.kind === "learned" || this.layout?.kind === "bin16") {
      const period = this.layout.period ?? 16;
      if (this.buf.length >= period) {
        const frame = this.buf.subarray(this.buf.length - period);
        const hit = this.layout.map ? applyMap(frame, this.layout) : tryBin16(frame, this.layout.endian !== "be");
        if (hit && plausible(hit) >= 5) return hit;
      }
    }

    if (this.buf.length >= 16) {
      const tail = this.buf.subarray(this.buf.length - 16);
      const hit = tryBin16(tail, true) || tryBin16(tail, false);
      if (hit) {
        this.layout = { kind: "bin16", period: 16, endian: tryBin16(tail, true) ? "le" : "be" };
        return hit;
      }
    }

    if (!this.layout && this.buf.length >= 96) {
      const learned = learnLayout(this.buf);
      if (learned) {
        this.layout = learned.layout;
        return learned.reading;
      }
    }
    return null;
  }
}

