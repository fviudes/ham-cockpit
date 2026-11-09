/** Icom IC-705 CI-V over BLE — GATT 14cf8001 / char 14cf8002, handshake 0x61–0x64. */

export const IC705_SVC = "14cf8001-1ec2-d408-1b04-2eb270f14203";
export const IC705_CHAR = "14cf8002-1ec2-d408-1b04-2eb270f14203";
const IC705_CHAR_DATA = "14cf8003-1ec2-d408-1b04-2eb270f14203";
const CIV_CTRL = 0xe0;
const CIV_PRE = 0xfe;
const CIV_END = 0xfd;

export type BlePhase =
  | "idle"
  | "scanning"
  | "connecting"
  | "handshake"
  | "ready"
  | "error";

export type BleListener = {
  onPhase: (phase: BlePhase, detail?: string) => void;
  onPaired: (fresh: boolean) => void;
  onCivGrant: () => void;
  onFreq: (hz: number) => void;
  onDisconnect: () => void;
  onFrame?: (hex: string) => void;
};

type BtNav = Navigator & {
  bluetooth?: {
    requestDevice: (opts: unknown) => Promise<BtDevice>;
    getDevices?: () => Promise<BtDevice[]>;
  };
};

type BtDevice = {
  id: string;
  name?: string;
  gatt?: BtGatt;
  watchAdvertisements?: () => Promise<void>;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

type BtGatt = {
  connected: boolean;
  connect: () => Promise<BtGatt>;
  getPrimaryService: (uuid: string) => Promise<BtService>;
  disconnect: () => void;
};

type BtService = {
  getCharacteristic: (uuid: string) => Promise<BtChar>;
  getCharacteristics?: () => Promise<BtChar[]>;
};

type BtChar = {
  uuid?: string;
  properties?: { write?: boolean; writeWithoutResponse?: boolean; notify?: boolean };
  startNotifications: () => Promise<BtChar>;
  stopNotifications?: () => Promise<unknown>;
  readValue?: () => Promise<DataView>;
  writeValue: (data: BufferSource) => Promise<void>;
  writeValueWithResponse?: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
  addEventListener: (type: string, fn: (ev: Event) => void) => void;
  removeEventListener: (type: string, fn: (ev: Event) => void) => void;
};

const HS_TOKEN = hexBytes("FE F1 00 63 EE 39 09 10 FD");
const HS_UUID_SPP = hexBytes(
  "FE F1 00 61 30 30 30 30 31 31 30 31 2D 30 30 30 30 2D 31 30 30 30 2D 38 30 30 30 2D 30 30 38 30 35 46 39 42 33 34 46 42 FD"
);
const HS_NAME_WEB = "Ham-Cockpit-Web01";
const UUID_STORE = "hamcockpit.ic705.hsUuid";
const DEVICE_ID_STORE = "hamcockpit.ic705.deviceId";
const ATT_CHUNK = 20;

export const ICOM_MODE: Record<string, number> = {
  LSB: 0,
  "LSB-D": 0,
  USB: 1,
  "USB-D": 1,
  AM: 2,
  CW: 3,
  FM: 5,
  DV: 9,
};

function hexBytes(s: string) {
  return Uint8Array.from(s.trim().split(/\s+/).map((b) => parseInt(b, 16)));
}

function pickGrantedDevice(known: BtDevice[], deviceId?: string, deviceName?: string): BtDevice | null {
  if (!known.length) return null;
  if (deviceId) {
    const byId = known.find((d) => d.id === deviceId);
    if (byId) return byId;
  }
  if (deviceName) {
    const want = deviceName.trim().toLowerCase();
    const byName = known.find((d) => (d.name || "").trim().toLowerCase() === want);
    if (byName) return byName;
    const byPart = known.find((d) => {
      const n = (d.name || "").toLowerCase();
      return n && (want.includes(n) || n.includes(want) || n.includes("ic-705") || n.includes("ic705"));
    });
    if (byPart) return byPart;
  }
  const icom = known.filter((d) => /icom|ic-?705/i.test(d.name || ""));
  if (icom.length === 1) return icom[0]!;
  if (icom.length > 1) return icom.find((d) => /705/i.test(d.name || "")) || icom[0]!;
  return known.length === 1 ? known[0]! : null;
}

export function bleAvailable() {
  return typeof navigator !== "undefined" && Boolean((navigator as BtNav).bluetooth);
}

export function isBleCancel(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /cancel|choos|BLE_SILENT/i.test(msg);
}

export function bleErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

class Ic705BleLink {
  private device: BtDevice | null = null;
  private gatt: BtGatt | null = null;
  private char: BtChar | null = null;
  private dataChar: BtChar | null = null;
  private listener: BleListener | null = null;
  private onDisc = () => this.handleDisconnect();
  private onNotify = (ev: Event) => this.handleNotify(ev);
  private civAddr = 0xa4;
  private rx = new Uint8Array(0);
  private waiters = new Map<number, (ok: boolean) => void>();
  private sawHs = new Set<number>();
  private hsBusy = false;
  private quietDrop = false;
  private attaching = false;
  private lastTxErr = "";

  get connected() {
    return Boolean(this.gatt?.connected && this.char);
  }

  get busy() {
    return this.attaching || this.hsBusy || this.connected;
  }

  get deviceName() {
    return this.device?.name || "";
  }

  get deviceId() {
    return this.device?.id || "";
  }

  setListener(l: BleListener | null) {
    this.listener = l;
  }

  setCivAddr(hex: string) {
    this.civAddr = Number.parseInt(hex, 16) || 0xa4;
  }

  async connect(opts?: { acceptAll?: boolean; civAddr?: string; deviceId?: string; deviceName?: string; silent?: boolean }) {
    const bt = (navigator as BtNav).bluetooth;
    if (!bt) throw new Error("Web Bluetooth indisponível");
    if (opts?.civAddr) this.setCivAddr(opts.civAddr);

    this.listener?.onPhase("scanning");
    const hadLink = Boolean(this.gatt || this.device);
    await this.dropLink(false);
    if (hadLink) await delay(400);
    let device: BtDevice | null = null;
    if (opts?.silent || opts?.deviceId || opts?.deviceName) {
      try {
        const known = (await bt.getDevices?.()) ?? [];
        let storedId = "";
        try {
          storedId = localStorage.getItem(DEVICE_ID_STORE) || "";
        } catch {
          storedId = "";
        }
        device = pickGrantedDevice(known, opts.deviceId || storedId, opts.deviceName);
        if (device?.watchAdvertisements) {
          try {
            await Promise.race([device.watchAdvertisements(), delay(800)]);
          } catch {
            /* Chrome: optional for silent reconnect */
          }
        }
      } catch {
        device = null;
      }
    }
    if (!device) {
      if (opts?.silent) {
        this.listener?.onPhase("idle");
        throw new Error("BLE_SILENT");
      }
      device = await bt.requestDevice(
        opts?.acceptAll
          ? { acceptAllDevices: true, optionalServices: [IC705_SVC] }
          : {
              filters: [
                { namePrefix: "ICOM" },
                { namePrefix: "Icom" },
                { namePrefix: "icom" },
                { namePrefix: "IC-705" },
                { namePrefix: "IC705" },
              ],
              optionalServices: [IC705_SVC],
            }
      );
    }
    try {
      await this.attach(device);
    } catch (err) {
      this.clearWaiters(false);
      if (opts?.silent) this.listener?.onPhase("idle");
      else if (!isBleCancel(err) && bleErrorMessage(err) !== "BLE_SILENT") this.listener?.onPhase("error", bleErrorMessage(err));
      await this.dropLink(false);
      throw err;
    }
  }

  async disconnect() {
    await this.dropLink(true);
  }

  private async dropLink(notify: boolean) {
    this.quietDrop = true;
    try {
      this.char?.removeEventListener("characteristicvaluechanged", this.onNotify);
      await this.char?.stopNotifications?.();
    } catch {
      /* ignore */
    }
    try {
      this.dataChar?.removeEventListener("characteristicvaluechanged", this.onNotify);
      await this.dataChar?.stopNotifications?.();
    } catch {
      /* ignore */
    }
    this.device?.removeEventListener("gattserverdisconnected", this.onDisc);
    try {
      this.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    this.clearWaiters(false);
    this.char = null;
    this.dataChar = null;
    this.gatt = null;
    this.device = null;
    this.rx = new Uint8Array(0);
    this.hsBusy = false;
    await delay(0);
    this.quietDrop = false;
    if (notify) {
      this.listener?.onPhase("idle");
      this.listener?.onDisconnect();
    }
  }

  async sendCiv(payload: Uint8Array) {
    const ch = this.char;
    if (!ch || !this.gatt?.connected) return;
    const data = Uint8Array.from(payload);
    if (this.hsBusy) this.listener?.onFrame?.(`TX ${toHex(data)}`);
    try {
      if (data.length > ATT_CHUNK) await this.writeChunked(ch, data);
      else await this.writeRaw(ch, data);
    } catch (err) {
      this.lastTxErr = bleErrorMessage(err);
      this.listener?.onFrame?.(`TX fail ${this.lastTxErr}`);
    }
  }

  private async writeRaw(ch: BtChar, data: Uint8Array) {
    const buf = toBuffer(data);
    const wwob = ch.writeValueWithoutResponse;
    if (typeof wwob === "function") {
      await wwob.call(ch, buf);
      return;
    }
    await ch.writeValue(buf);
  }

  private async writeChunked(ch: BtChar, data: Uint8Array) {
    for (let i = 0; i < data.length; i += ATT_CHUNK) {
      await this.writeRaw(ch, Uint8Array.from(data.subarray(i, i + ATT_CHUNK)));
      if (i + ATT_CHUNK < data.length) await delay(15);
    }
  }

  async selectVfo(which: "A" | "B") {
    await this.sendCiv(
      Uint8Array.from([CIV_PRE, CIV_PRE, this.civAddr, CIV_CTRL, 0x07, which === "B" ? 0xd1 : 0xd0, CIV_END])
    );
  }

  async setFreq(hz: number) {
    const body = new Uint8Array(13);
    body[0] = CIV_PRE;
    body[1] = CIV_PRE;
    body[2] = this.civAddr;
    body[3] = CIV_CTRL;
    body[4] = 0x00;
    freqBcdLsb(hz, body, 5);
    body[10] = CIV_END;
    await this.sendCiv(body.subarray(0, 11));
  }

  async setPtt(on: boolean) {
    await this.sendCiv(Uint8Array.from([CIV_PRE, CIV_PRE, this.civAddr, CIV_CTRL, 0x1c, on ? 0x01 : 0x00, CIV_END]));
  }

  async setMode(mode: string | number) {
    const key = typeof mode === "string" ? mode : "";
    const icomMode = typeof mode === "number" ? mode : (ICOM_MODE[key] ?? 1);
    const data = typeof mode === "string" && mode.endsWith("-D");
    if (data || icomMode === 0 || icomMode === 1) {
      await this.sendCiv(
        Uint8Array.from([CIV_PRE, CIV_PRE, this.civAddr, CIV_CTRL, 0x26, icomMode, data ? 0x01 : 0x00, 0x01, CIV_END])
      );
      return;
    }
    await this.sendCiv(Uint8Array.from([CIV_PRE, CIV_PRE, this.civAddr, CIV_CTRL, 0x06, icomMode, 0x01, CIV_END]));
  }

  private async attach(device: BtDevice) {
    this.attaching = true;
    this.device = device;
    this.rx = new Uint8Array(0);
    this.lastTxErr = "";
    device.addEventListener("gattserverdisconnected", this.onDisc);
    this.listener?.onPhase("connecting", device.name);
    try {
      const { svc, char } = await this.openGatt(device);
      this.char = char;
      this.listener?.onPhase("handshake");
      const granted = await this.handshake();
      if (!granted) throw new Error(this.hsTimeoutMessage());
      try {
        const extra = await svc.getCharacteristic(IC705_CHAR_DATA);
        this.dataChar = extra;
        extra.addEventListener("characteristicvaluechanged", this.onNotify);
        await extra.startNotifications();
      } catch {
        this.dataChar = null;
      }
      this.listener?.onCivGrant();
      await this.afterGrant();
      try {
        localStorage.setItem(DEVICE_ID_STORE, device.id);
      } catch {
        /* */
      }
      this.listener?.onPhase("ready", device.name);
    } finally {
      this.attaching = false;
    }
  }

  private async openGatt(device: BtDevice) {
    let last: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        const server = device.gatt;
        if (!server) throw new Error("GATT recusado");
        if (i > 0) {
          try {
            if (server.connected) server.disconnect();
          } catch {
            /* ignore */
          }
          await delay(350 + i * 200);
        }
        if (!server.connected) this.gatt = await server.connect();
        else this.gatt = server;
        if (!this.gatt?.connected) throw new Error("GATT caiu após connect");
        const svc = await this.gatt.getPrimaryService(IC705_SVC);
        const char = await svc.getCharacteristic(IC705_CHAR);
        char.addEventListener("characteristicvaluechanged", this.onNotify);
        await char.startNotifications();
        return { gatt: this.gatt, svc, char };
      } catch (err) {
        last = err;
        try {
          device.gatt?.disconnect();
        } catch {
          /* ignore */
        }
        this.gatt = null;
        this.char = null;
        if (i === 3) break;
        await delay(300);
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  private async handshake() {
    this.hsBusy = true;
    this.sawHs.clear();
    const web61 = pkt61(appUuid());
    const web62 = pkt62(HS_NAME_WEB);
    try {
      if (await this.burst(web61, web62, true, 12_000)) return true;
      if (await this.burst(web61, web62, false, 8_000)) return true;
      return this.burst(HS_UUID_SPP, web62, true, 8_000);
    } finally {
      this.hsBusy = false;
    }
  }

  private async burst(id: Uint8Array, name: Uint8Array, includeName: boolean, waitMs: number) {
    this.clearWaiters(false);
    const grant = this.waitCmd(0x64, waitMs, false);
    await this.sendCiv(id);
    await delay(20);
    if (includeName) {
      await this.sendCiv(name);
      await delay(20);
    }
    await this.sendCiv(HS_TOKEN);
    return grant;
  }

  private hsTimeoutMessage() {
    const rx = Array.from(this.sawHs, (c) => `0x${c.toString(16)}`).join(",") || "nenhum";
    const hint = "No IC-705: Set → Bluetooth Set → Pairing Reception e aceite Ham-Cockpit-Web01.";
    if (this.sawHs.size) return `IC-705 respondeu (${rx}) mas não deu 0x64. ${hint}`;
    const tx = this.lastTxErr ? ` TX:${this.lastTxErr}` : "";
    return `CI-V grant timeout (sem RX${tx}). ${hint}`;
  }

  private waitCmd(cmd: number, ms: number, required: boolean) {
    return new Promise<boolean>((resolve, reject) => {
      const prev = this.waiters.get(cmd);
      if (prev) prev(false);
      const timer = setTimeout(() => {
        if (this.waiters.get(cmd) !== finish) return;
        this.waiters.delete(cmd);
        if (required) {
          reject(
            new Error(
              "CI-V grant timeout. No IC-705: Menu → Set → Bluetooth Set → Pairing Reception, aceite o pareamento e tente de novo."
            )
          );
        } else resolve(false);
      }, ms);
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        this.waiters.delete(cmd);
        if (ok) resolve(true);
        else if (required) reject(new Error("CI-V grant timeout"));
        else resolve(false);
      };
      this.waiters.set(cmd, finish);
    });
  }

  private async afterGrant() {
    await delay(300);
    await this.sendCiv(Uint8Array.from([CIV_PRE, CIV_PRE, this.civAddr, CIV_CTRL, 0x1a, 0x01, 0x01, CIV_END]));
    await delay(80);
    await this.sendCiv(Uint8Array.from([CIV_PRE, CIV_PRE, this.civAddr, CIV_CTRL, 0x03, CIV_END]));
  }

  private handleNotify(ev: Event) {
    const target = ev.target as { value?: DataView } | null;
    const view = target?.value;
    if (!view || !view.byteLength) return;
    const chunk = new Uint8Array(view.byteLength);
    chunk.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    const next = new Uint8Array(this.rx.length + chunk.length);
    next.set(this.rx);
    next.set(chunk, this.rx.length);
    this.rx = next;
    this.drainRx();
  }

  private drainRx() {
    let guard = 0;
    while (this.rx.length >= 4 && guard++ < 32) {
      let start = -1;
      for (let i = 0; i < this.rx.length - 1; i++) {
        if (this.rx[i] === 0xfe && (this.rx[i + 1] === 0xf1 || this.rx[i + 1] === 0xfe)) {
          start = i;
          break;
        }
      }
      if (start < 0) {
        this.rx = new Uint8Array(0);
        return;
      }
      if (start > 0) this.rx = this.rx.subarray(start);
      let end = -1;
      for (let i = 3; i < this.rx.length; i++) {
        if (this.rx[i] === CIV_END) {
          end = i;
          break;
        }
      }
      if (end < 0) {
        if (this.rx.length > 256) this.rx = this.rx.subarray(-64);
        return;
      }
      const frame = this.rx.subarray(0, end + 1);
      this.rx = this.rx.subarray(end + 1);
      this.handleFrame(frame);
    }
  }

  private handleFrame(d: Uint8Array) {
    const hex = toHex(d);
    const cmd = hsCmd(d);
    if (this.hsBusy || cmd != null) this.listener?.onFrame?.(hex);
    if (cmd != null) {
      this.sawHs.add(cmd);
      this.waiters.get(cmd)?.(true);
      if (cmd === 0x63) this.listener?.onPaired(d[hsCmdOffset(d) + 4] === 0x01);
      return;
    }
    if (d.length >= 11 && d[0] === CIV_PRE && d[1] === CIV_PRE && d[4] === 0x03 && d[d.length - 1] === CIV_END) {
      this.listener?.onFreq(bcdFreq(d, 5, 5));
    }
    if (d.length >= 11 && d[0] === CIV_PRE && d[1] === CIV_PRE && d[4] === 0x00 && d[d.length - 1] === CIV_END) {
      this.listener?.onFreq(bcdFreq(d, 5, 5));
    }
  }

  private handleDisconnect() {
    this.clearWaiters(false);
    this.char = null;
    this.dataChar = null;
    this.gatt = null;
    this.rx = new Uint8Array(0);
    this.hsBusy = false;
    if (this.quietDrop || this.attaching) return;
    this.listener?.onPhase("idle");
    this.listener?.onDisconnect();
  }

  private clearWaiters(ok: boolean) {
    for (const fn of Array.from(this.waiters.values())) fn(ok);
    this.waiters.clear();
  }
}

function freqBcdLsb(hz: number, out: Uint8Array, off: number) {
  let f = Math.max(0, Math.floor(hz));
  for (let i = 0; i < 5; i++) {
    out[off + i] = (Math.floor((f % 100) / 10) << 4) | (f % 10);
    f = Math.floor(f / 100);
  }
}

function bcdFreq(d: Uint8Array, off: number, n: number) {
  const mul = [1_000_000_000, 100_000_000, 10_000_000, 1_000_000, 100_000, 10_000, 1_000, 100, 10, 1];
  let f = 0;
  for (let i = 0; i < n; i++) {
    const idx = off + n - 1 - i;
    f += ((d[idx] >> 4) & 0x0f) * mul[i * 2];
    f += (d[idx] & 0x0f) * mul[i * 2 + 1];
  }
  return f;
}

function appUuid() {
  const fallback = "C47B21D6-9E80-4A11-BE05-CA7B21D6E001";
  try {
    let u = localStorage.getItem(UUID_STORE);
    if (!u || !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(u)) {
      u = (crypto.randomUUID?.() || fallback).toUpperCase();
      localStorage.setItem(UUID_STORE, u);
    }
    return u.toUpperCase();
  } catch {
    return fallback;
  }
}

function pkt61(uuid36: string) {
  const out = new Uint8Array(41);
  out[0] = 0xfe;
  out[1] = 0xf1;
  out[2] = 0x00;
  out[3] = 0x61;
  for (let i = 0; i < 36; i++) out[4 + i] = uuid36.charCodeAt(i) & 0xff;
  out[40] = 0xfd;
  return out;
}

function pkt62(name: string) {
  const n = (name + "\0".repeat(16)).slice(0, 16);
  const out = new Uint8Array(21);
  out[0] = 0xfe;
  out[1] = 0xf1;
  out[2] = 0x00;
  out[3] = 0x62;
  for (let i = 0; i < 16; i++) out[4 + i] = n.charCodeAt(i) & 0xff;
  out[20] = 0xfd;
  return out;
}

function toBuffer(data: Uint8Array) {
  const buf = new ArrayBuffer(data.length);
  new Uint8Array(buf).set(data);
  return buf;
}

function toHex(d: Uint8Array) {
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

function hsCmdOffset(d: Uint8Array) {
  for (let i = 0; i + 3 < d.length; i++) {
    if (d[i] === 0xfe && d[i + 1] === 0xf1 && d[i + 2] === 0x00) return i;
  }
  return 0;
}

function hsCmd(d: Uint8Array): number | null {
  const i = hsCmdOffset(d);
  if (i + 3 >= d.length) return null;
  if (!(d[i] === 0xfe && d[i + 1] === 0xf1 && d[i + 2] === 0x00)) return null;
  const cmd = d[i + 3];
  return cmd >= 0x61 && cmd <= 0x64 ? cmd : null;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const ic705Ble = new Ic705BleLink();
