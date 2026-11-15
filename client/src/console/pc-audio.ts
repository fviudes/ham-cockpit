import { pcVolumeGain, pickAudioOutput } from "@shared/pc-audio";

export type PcAudioStart =
  | { ok: true; via: "station" }
  | { ok: false; reason: "auth" | "busy" | "no-device" | "cancelled" | "stopped" };

type SinkAudioContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
type OutputPicker = MediaDevices & { selectAudioOutput?: () => Promise<{ deviceId: string }> };

type FormatMsg = { type: "format"; sampleRate?: number; channels?: number; via?: string };
type ErrorMsg = { type: "error"; reason?: string };

/** Toca o áudio de recepção na saída padrão deste computador. */
export class PcAudioPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private ws: WebSocket | null = null;
  private nextAt = 0;
  private generation = 0;
  private sampleRate = 48000;
  private muted = false;

  constructor(private volume = 6) {}

  setVolume(value: number) {
    this.volume = value;
    this.applyGain();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyGain();
  }

  private applyGain() {
    if (this.gain) this.gain.gain.value = this.muted ? 0 : pcVolumeGain(this.volume);
  }

  stop() {
    this.generation += 1;
    this.ws?.close();
    this.ws = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.gain = null;
    this.nextAt = 0;
    void ctx?.close();
  }

  async start(): Promise<PcAudioStart> {
    this.stop();
    const gen = this.generation;
    this.arm();
    const sink = await this.chooseOutput();
    if (gen !== this.generation) return { ok: false, reason: "stopped" };
    if (sink == null) {
      this.stop();
      return { ok: false, reason: "cancelled" };
    }
    await this.attachSink(sink);
    const station = await this.openStation(gen);
    if (gen !== this.generation) return { ok: false, reason: "stopped" };
    if (station === "ok") return { ok: true, via: "station" };
    this.stop();
    if (station === "auth") return { ok: false, reason: "auth" };
    if (station === "busy") return { ok: false, reason: "busy" };
    return { ok: false, reason: "no-device" };
  }

  /**
   * Seletor de saída do navegador. Sem isso, usa a placa padrão. Nunca abre microfone.
   * No HTTP do console o seletor é recusado (NotAllowedError). Isso não cancela o áudio:
   * o rádio toca na saída padrão. Só o usuário fechar o seletor (AbortError) cancela.
   */
  private async chooseOutput(): Promise<string | null> {
    const devices = navigator.mediaDevices as OutputPicker | undefined;
    if (window.isSecureContext && devices && typeof devices.selectAudioOutput === "function") {
      try {
        const chosen = await devices.selectAudioOutput();
        return chosen.deviceId || "";
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "AbortError") return null;
      }
    }
    try {
      const list = (await devices?.enumerateDevices?.()) ?? [];
      return pickAudioOutput(list) ?? "";
    } catch {
      return "";
    }
  }

  private async attachSink(sinkId: string) {
    const ctx = this.ctx as SinkAudioContext | null;
    if (!ctx?.setSinkId || !sinkId) return;
    try {
      await ctx.setSinkId(sinkId);
    } catch {
      /* a saída padrão do computador continua */
    }
  }

  private arm() {
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : pcVolumeGain(this.volume);
    gain.connect(ctx.destination);
    this.ctx = ctx;
    this.gain = gain;
    this.nextAt = 0;
    void ctx.resume();
  }

  private playPcm(chunk: ArrayBuffer) {
    const ctx = this.ctx;
    const gain = this.gain;
    if (!ctx || !gain || chunk.byteLength < 2) return;
    const bytes = chunk.byteLength - (chunk.byteLength % 2);
    const view = new Int16Array(chunk, 0, bytes / 2);
    const samples = new Float32Array(view.length);
    for (let i = 0; i < view.length; i++) samples[i] = (view[i] ?? 0) / 32768;
    const buffer = ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(gain);
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.08;
    node.start(this.nextAt);
    this.nextAt += buffer.duration;
  }

  private openStation(gen: number): Promise<"ok" | "auth" | "busy" | "no-device"> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: "ok" | "auth" | "busy" | "no-device") => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      };
      const timer = window.setTimeout(() => {
        this.ws?.close();
        finish("no-device");
      }, 2500);
      let socket: WebSocket;
      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(`${proto}//${window.location.host}/ws/radio-audio`);
      } catch {
        finish("no-device");
        return;
      }
      socket.binaryType = "arraybuffer";
      this.ws = socket;
      socket.onmessage = (ev) => {
        if (gen !== this.generation) return;
        if (typeof ev.data === "string") {
          let msg: FormatMsg | ErrorMsg;
          try {
            msg = JSON.parse(ev.data) as FormatMsg | ErrorMsg;
          } catch {
            return;
          }
          if (msg.type === "error") {
            const reason = msg.reason === "auth" || msg.reason === "busy" ? msg.reason : "no-device";
            finish(reason);
            socket.close();
            return;
          }
          if (msg.type === "format") {
            if (typeof msg.sampleRate === "number" && msg.sampleRate >= 8000) this.sampleRate = msg.sampleRate;
            finish("ok");
          }
          return;
        }
        if (ev.data instanceof ArrayBuffer) this.playPcm(ev.data);
      };
      socket.onerror = () => finish("no-device");
      socket.onclose = () => {
        if (!settled) finish("no-device");
      };
    });
  }

}
