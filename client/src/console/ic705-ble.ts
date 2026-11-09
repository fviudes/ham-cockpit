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

export type CivPatch = {
  freq?: number;
  mode?: string;
  ptt?: boolean;
  smeter?: number;
  po?: number;
  swr?: number;
  agc?: "OFF" | "FAST" | "MID" | "SLOW";
  pre?: "OFF" | "ON1" | "ON2";
  att?: boolean;
  nr?: boolean;
  nb?: boolean;
  split?: boolean;
  vfo?: "A" | "B";
};

export type BleListener = {
  onPhase: (phase: BlePhase, detail?: string) => void;
  onPaired: (fresh: boolean) => void;
  onCivGrant: () => void;
  onFreq: (hz: number) => void;
  onCiv?: (patch: CivPatch) => void;
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

/** IC-705 CI-V operating mode (cmd 06 / 26). DV is 0x17, not 0x09. */
export const ICOM_MODE: Record<string, number> = {
  LSB: 0x00,
  "LSB-D": 0x00,
  USB: 0x01,
  "USB-D": 0x01,
  AM: 0x02,
  CW: 0x03,
  FM: 0x05,
  DV: 0x17,
};

const AGC_BYTE = { OFF: 0x00, FAST: 0x01, MID: 0x02, SLOW: 0x03 } as const;
const PRE_BYTE = { OFF: 0x00, ON1: 0x01, ON2: 0x02 } as const;

function hexBytes(s: string) {
  return Uint8Array.from(s.trim().split(/\s+/).map((b) => parseInt(b, 16)));
}

function pickGrantedDevice(known: BtDevice[], deviceId?: string, deviceName?: string): BtDevice | null {
  if (!known.length) return null;
  const id = (deviceId || "").trim();
  if (id) {
    const byId = known.find((d) => d.id === id);
    if (byId) return byId;
  }
  const want = (deviceName || "").trim().toLowerCase();
  if (want) {
    const byName = known.find((d) => (d.name || "").trim().toLowerCase() === want);
    if (byName) return byName;
    const byPart = known.find((d) => {
      const n = (d.name || "").toLowerCase();
      return n && (want.includes(n) || n.includes(want));
    });
    if (byPart) return byPart;
  }
  const icom = known.filter((d) => /icom|ic-?705/i.test(d.name || ""));
  if (icom.length === 1) return icom[0]!;
  if (icom.length > 1) return icom.find((d) => /705/i.test(d.name || "")) || icom[0]!;
  if (id && known.length === 1) return known[0]!;
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
  private pollTimer = 0;
  private pollN = 0;
  private lastPtt = false;

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

  get hsUuid() {
    return appUuid();
  }

  async connect(opts?: {
    acceptAll?: boolean;
    civAddr?: string;
    deviceId?: string;
    deviceName?: string;
    silent?: boolean;
    reconnect?: boolean;
    chooser?: boolean;
    hsUuid?: string;
  }) {
    const bt = (navigator as BtNav).bluetooth;
    if (!bt) throw new Error("Web Bluetooth indisponível");
    if (opts?.civAddr) this.setCivAddr(opts.civAddr);
    if (opts?.hsUuid) appUuid(opts.hsUuid);

    this.listener?.onPhase("scanning");
    const hadLink = Boolean(this.gatt || this.device);
    await this.dropLink(false);
    if (hadLink) await delay(400);
    const reconnect = Boolean(opts?.reconnect || opts?.hsUuid || opts?.deviceId);
    const chooser = Boolean(opts?.chooser || opts?.acceptAll);
    let device: BtDevice | null = await this.findGrantedDevice(bt, opts?.deviceId, opts?.deviceName);
    if (!device && chooser) {
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
    if (!device) {
      this.listener?.onPhase("idle");
      throw new Error("BLE_SILENT");
    }
    try {
      await this.attach(device, reconnect && !chooser);
    } catch (err) {
      this.clearWaiters(false);
      if (!chooser) this.listener?.onPhase("idle");
      else if (!isBleCancel(err) && bleErrorMessage(err) !== "BLE_SILENT") this.listener?.onPhase("error", bleErrorMessage(err));
      await this.dropLink(false);
      throw err;
    }
  }

  private async findGrantedDevice(bt: NonNullable<BtNav["bluetooth"]>, deviceId?: string, deviceName?: string) {
    let storedId = "";
    try {
      storedId = localStorage.getItem(DEVICE_ID_STORE) || "";
    } catch {
      storedId = "";
    }
    let device: BtDevice | null = null;
    for (let i = 0; i < 4 && !device; i++) {
      try {
        const known = (await bt.getDevices?.()) ?? [];
        device = pickGrantedDevice(known, deviceId || storedId, deviceName);
      } catch {
        device = null;
      }
      if (!device && i < 3) await delay(200);
    }
    return device;
  }

  async disconnect() {
    await this.dropLink(true);
  }

  private async dropLink(notify: boolean) {
    this.stopPoll();
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
    this.lastPtt = false;
    this.pollN = 0;
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

  private frame(...body: number[]) {
    return Uint8Array.from([CIV_PRE, CIV_PRE, this.civAddr, CIV_CTRL, ...body, CIV_END]);
  }

  private async ask(...body: number[]) {
    await this.sendCiv(this.frame(...body));
  }

  /** 07 00 = VFO A, 07 01 = VFO B (IC-705 CI-V). */
  async selectVfo(which: "A" | "B") {
    await this.ask(0x07, which === "B" ? 0x01 : 0x00);
  }

  async setFreq(hz: number) {
    const body = this.frame(0x00, 0, 0, 0, 0, 0);
    freqBcdLsb(hz, body, 5);
    await this.sendCiv(body);
  }

  /** 1C 00 00 = RX, 1C 00 01 = TX. */
  async setPtt(on: boolean) {
    this.lastPtt = on;
    await this.ask(0x1c, 0x00, on ? 0x01 : 0x00);
  }

  /** 26 00 <mode> <data> <FIL1> — data mode needs cmd 26, DV is 0x17. */
  async setMode(mode: string | number) {
    const key = typeof mode === "string" ? mode : "";
    const icomMode = typeof mode === "number" ? mode : (ICOM_MODE[key] ?? 0x01);
    const data = typeof mode === "string" && mode.endsWith("-D") ? 0x01 : 0x00;
    await this.ask(0x26, 0x00, icomMode, data, 0x01);
    await delay(30);
    await this.ask(0x06, icomMode, 0x01);
  }

  async setPre(v: "OFF" | "ON1" | "ON2") {
    await this.ask(0x16, 0x02, PRE_BYTE[v]);
  }

  async setAgc(v: "OFF" | "FAST" | "MID" | "SLOW") {
    await this.ask(0x16, 0x12, v === "OFF" ? 0x01 : AGC_BYTE[v]);
  }

  async setAtt(on: boolean) {
    await this.ask(0x11, on ? 0x20 : 0x00);
  }

  async setNr(on: boolean) {
    await this.ask(0x16, 0x40, on ? 0x01 : 0x00);
  }

  async setNb(on: boolean) {
    await this.ask(0x16, 0x22, on ? 0x01 : 0x00);
  }

  async setSplit(on: boolean) {
    await this.ask(0x0f, on ? 0x01 : 0x00);
  }

  private async attach(device: BtDevice, reconnect = false) {
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
      if (reconnect) await delay(250);
      const granted = await this.handshake(reconnect);
      if (!granted) throw new Error(this.hsTimeoutMessage(reconnect));
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

  private async handshake(reconnect = false) {
    this.hsBusy = true;
    this.sawHs.clear();
    const web61 = pkt61(appUuid());
    const web62 = pkt62(HS_NAME_WEB);
    try {
      if (reconnect) {
        if (await this.burst(web61, web62, false, 8_000)) return true;
        if (await this.burst(web61, web62, false, 5_000)) return true;
        return this.burst(web61, web62, true, 10_000);
      }
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

  private hsTimeoutMessage(reconnect = false) {
    const rx = Array.from(this.sawHs, (c) => `0x${c.toString(16)}`).join(",") || "nenhum";
    const hint = reconnect
      ? "Rádio já pareado: ligue o Bluetooth do IC-705 e aproxime-o. Não abra Pairing Reception."
      : "No IC-705: Set → Bluetooth Set → Pairing Reception e aceite Ham-Cockpit-Web01.";
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
    await this.ask(0x03);
    await delay(40);
    await this.ask(0x26, 0x00);
    await delay(40);
    await this.ask(0x04);
    await delay(40);
    await this.ask(0x1c, 0x00);
    await delay(40);
    await this.ask(0x15, 0x02);
    await delay(40);
    await this.ask(0x16, 0x02);
    await delay(40);
    await this.ask(0x16, 0x12);
    await delay(40);
    await this.ask(0x11);
    this.startPoll();
  }

  private startPoll() {
    this.stopPoll();
    this.pollN = 0;
    this.pollTimer = window.setInterval(() => {
      void this.pollTick();
    }, 220);
  }

  private stopPoll() {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.pollTimer = 0;
  }

  private async pollTick() {
    if (!this.gatt?.connected || this.hsBusy || this.attaching) return;
    const n = this.pollN++;
    if (this.lastPtt) {
      const seq = n % 4;
      if (seq === 0) await this.ask(0x15, 0x11);
      else if (seq === 1) await this.ask(0x15, 0x12);
      else if (seq === 2) await this.ask(0x1c, 0x00);
      else await this.ask(0x15, 0x02);
      return;
    }
    const seq = n % 8;
    if (seq === 0 || seq === 3 || seq === 6) await this.ask(0x15, 0x02);
    else if (seq === 1) await this.ask(0x03);
    else if (seq === 2) await this.ask(0x26, 0x00);
    else if (seq === 4) await this.ask(0x1c, 0x00);
    else if (seq === 5) await this.ask(0x04);
    else await this.ask(0x16, 0x02);
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
    const hs = hsCmd(d);
    if (this.hsBusy || hs != null) this.listener?.onFrame?.(hex);
    if (hs != null) {
      this.sawHs.add(hs);
      this.waiters.get(hs)?.(true);
      if (hs === 0x63) this.listener?.onPaired(d[hsCmdOffset(d) + 4] === 0x01);
      return;
    }
    if (d.length < 6 || d[0] !== CIV_PRE || d[1] !== CIV_PRE || d[d.length - 1] !== CIV_END) return;
    const cmd = d[4];
    if (cmd === 0xfa || cmd === 0xfb) {
      if (cmd === 0xfa) this.listener?.onFrame?.(hex);
      return;
    }
    const data = d.subarray(5, d.length - 1);
    this.applyCiv(cmd, data);
  }

  private applyCiv(cmd: number, data: Uint8Array) {
    const patch: CivPatch = {};
    if ((cmd === 0x00 || cmd === 0x03 || cmd === 0x05) && data.length >= 5) {
      const hz = bcdFreq(data, 0, 5);
      if (hz >= 100_000) {
        this.listener?.onFreq(hz);
        patch.freq = hz;
      }
    } else if (cmd === 0x25 && data.length >= 6) {
      const hz = bcdFreq(data, 1, 5);
      if (hz >= 100_000) {
        this.listener?.onFreq(hz);
        patch.freq = hz;
      }
    } else if (cmd === 0x26 && data.length >= 4) {
      patch.mode = modeFromCiv(data[1]!, data[2] === 0x01);
    } else if (cmd === 0x26 && data.length >= 2) {
      patch.mode = modeFromCiv(data[0]!, data[1] === 0x01);
    } else if ((cmd === 0x04 || cmd === 0x01 || cmd === 0x06) && data.length >= 1) {
      const m = data[0]!;
      if (m !== 0x00 && m !== 0x01) patch.mode = modeFromCiv(m, false);
    } else if (cmd === 0x1c) {
      if (data[0] === 0x00 && data.length >= 2) {
        this.lastPtt = data[1] === 0x01;
        patch.ptt = this.lastPtt;
      } else if (data.length === 1 && (data[0] === 0x00 || data[0] === 0x01)) {
        this.lastPtt = data[0] === 0x01;
        patch.ptt = this.lastPtt;
      }
    } else if (cmd === 0x15 && data.length >= 3 && data[0] === 0x02) {
      patch.smeter = sFromLevel(bcd2(data[1]!, data[2]!));
    } else if (cmd === 0x15 && data.length >= 3 && data[0] === 0x11) {
      patch.po = poFromLevel(bcd2(data[1]!, data[2]!));
    } else if (cmd === 0x15 && data.length >= 3 && data[0] === 0x12) {
      patch.swr = swrFromLevel(bcd2(data[1]!, data[2]!));
    } else if (cmd === 0x16 && data.length >= 2 && data[0] === 0x02) {
      patch.pre = data[1] === 0x02 ? "ON2" : data[1] === 0x01 ? "ON1" : "OFF";
    } else if (cmd === 0x16 && data.length >= 2 && data[0] === 0x12) {
      patch.agc = data[1] === 0x03 ? "SLOW" : data[1] === 0x02 ? "MID" : data[1] === 0x01 ? "FAST" : "OFF";
    } else if (cmd === 0x16 && data.length >= 2 && data[0] === 0x22) {
      patch.nb = data[1] === 0x01;
    } else if (cmd === 0x16 && data.length >= 2 && data[0] === 0x40) {
      patch.nr = data[1] === 0x01;
    } else if (cmd === 0x11 && data.length >= 1) {
      patch.att = data[0] === 0x20;
    } else if (cmd === 0x0f && data.length >= 1) {
      patch.split = data[0] === 0x01;
    } else if (cmd === 0x07 && data.length >= 1) {
      if (data[0] === 0x00 || data[0] === 0xd0) patch.vfo = "A";
      if (data[0] === 0x01 || data[0] === 0xd1) patch.vfo = "B";
    }
    if (Object.keys(patch).length) this.listener?.onCiv?.(patch);
  }

  private handleDisconnect() {
    this.stopPoll();
    this.lastPtt = false;
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

function modeFromCiv(mode: number, dataOn: boolean) {
  if (mode === 0x17) return "DV";
  if (mode === 0x00) return dataOn ? "LSB-D" : "LSB";
  if (mode === 0x01) return dataOn ? "USB-D" : "USB";
  if (mode === 0x02) return "AM";
  if (mode === 0x03 || mode === 0x07) return "CW";
  if (mode === 0x05 || mode === 0x06) return "FM";
  return "USB";
}

function bcd2(hi: number, lo: number) {
  return ((hi >> 4) & 0x0f) * 1000 + (hi & 0x0f) * 100 + ((lo >> 4) & 0x0f) * 10 + (lo & 0x0f);
}

/** IC-705 15 02: 0000=S0, 0120=S9, 0241=S9+60 → UI S-units 0–12. */
function sFromLevel(n: number) {
  if (n <= 0) return 0;
  if (n <= 120) return (n / 120) * 9;
  return 9 + ((Math.min(241, n) - 120) / 121) * 3;
}

/** 15 11: 0000=0%, 0143=50%, 0213=100% — IC-705 10 W. */
function poFromLevel(n: number) {
  const pct = n <= 143 ? (n / 143) * 0.5 : 0.5 + ((Math.min(213, n) - 143) / 70) * 0.5;
  return Math.max(0, Math.min(10, pct * 10));
}

/** 15 12: 0000=1.0, 0048=1.5, 0080=2.0, 0120=3.0. */
function swrFromLevel(n: number) {
  if (n <= 0) return 1;
  if (n <= 48) return 1 + (n / 48) * 0.5;
  if (n <= 80) return 1.5 + ((n - 48) / 32) * 0.5;
  if (n <= 120) return 2 + ((n - 80) / 40);
  return Math.min(9.9, 3 + (n - 120) / 80);
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

function validHsUuid(u: string) {
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(u);
}

function appUuid(preferred?: string) {
  const fallback = "C47B21D6-9E80-4A11-BE05-CA7B21D6E001";
  try {
    if (preferred && validHsUuid(preferred)) {
      const u = preferred.toUpperCase();
      localStorage.setItem(UUID_STORE, u);
      return u;
    }
    let u = localStorage.getItem(UUID_STORE);
    if (!u || !validHsUuid(u)) {
      u = (crypto.randomUUID?.() || fallback).toUpperCase();
      localStorage.setItem(UUID_STORE, u);
    }
    return u.toUpperCase();
  } catch {
    return preferred && validHsUuid(preferred) ? preferred.toUpperCase() : fallback;
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
