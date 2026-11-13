/**
 * Cliente mínimo Telnet + RFC2217 (COM-PORT-OPTION) para ser2net
 * `accepter: telnet(rfc2217),tcp,…`.
 *
 * Usado pela SPE Expert para:
 *  - passar bytes do protocolo nativo (com escape IAC 0xFF)
 *  - SET-CONTROL DTR/RTS (power-on por linhas de modem)
 *
 * Ref.: RFC 2217; ser2net 4 / gensio — telnet(rfc2217),tcp,<bind>,<port>
 */
import net from "node:net";

const IAC = 255;
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;
const SB = 250;
const SE = 240;
const BINARY = 0;
const SGA = 3;
const COM_PORT_OPTION = 44;
const SET_CONTROL = 5;
/** RFC2217 SET-CONTROL values */
export const RFC2217_DTR_ON = 8;
export const RFC2217_DTR_OFF = 9;
export const RFC2217_RTS_ON = 10;
export const RFC2217_RTS_OFF = 11;

export type Rfc2217Socket = {
  sock: net.Socket;
  writeBinary: (buf: Buffer) => boolean;
  setControl: (value: number) => boolean;
  setDtr: (on: boolean) => boolean;
  setRts: (on: boolean) => boolean;
  /** Pulso low→high em RTS e depois DTR (Expert remote-on). */
  pulseWake: (holdMs?: number) => Promise<void>;
  destroy: () => void;
};

function escapeIac(data: Buffer): Buffer {
  let extra = 0;
  for (let i = 0; i < data.length; i++) if (data[i] === IAC) extra++;
  if (!extra) return data;
  const out = Buffer.alloc(data.length + extra);
  let j = 0;
  for (let i = 0; i < data.length; i++) {
    const b = data[i]!;
    out[j++] = b;
    if (b === IAC) out[j++] = IAC;
  }
  return out;
}

/**
 * Remove comandos Telnet e devolve só payload de aplicação.
 * Responde DO/WILL de forma cooperativa (aceita COM-PORT-OPTION).
 */
export function feedTelnet(sock: net.Socket, chunk: Buffer, state: { buf: Buffer }): Buffer {
  state.buf = Buffer.concat([state.buf, chunk]);
  const app: number[] = [];
  const b = state.buf;
  let i = 0;
  while (i < b.length) {
    const c = b[i]!;
    if (c !== IAC) {
      app.push(c);
      i++;
      continue;
    }
    if (i + 1 >= b.length) break; // IAC incompleto
    const cmd = b[i + 1]!;
    if (cmd === IAC) {
      // escaped 0xFF
      app.push(IAC);
      i += 2;
      continue;
    }
    if (cmd === SB) {
      // subnegociação até IAC SE
      let j = i + 2;
      let end = -1;
      while (j + 1 < b.length) {
        if (b[j] === IAC && b[j + 1] === SE) {
          end = j;
          break;
        }
        j++;
      }
      if (end < 0) break;
      i = end + 2;
      continue;
    }
    // WILL/WONT/DO/DONT + option
    if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
      if (i + 2 >= b.length) break;
      const opt = b[i + 2]!;
      // ser2net telnet(rfc2217) só entrega o UART depois de BINARY + COM-PORT-OPTION.
      // Recusar BINARY (WONT) deixa o socket mudo: o status 0x55 sai e o 0xAA não volta.
      const accept = opt === BINARY || opt === SGA || opt === COM_PORT_OPTION;
      if (cmd === WILL) {
        sock.write(Buffer.from([IAC, accept ? DO : DONT, opt]));
      } else if (cmd === DO) {
        sock.write(Buffer.from([IAC, accept ? WILL : WONT, opt]));
      }
      i += 3;
      continue;
    }
    // outros comandos de 2 bytes (NOP, etc.)
    i += 2;
  }
  state.buf = i > 0 ? b.subarray(i) : b;
  return Buffer.from(app);
}

export function attachRfc2217(
  sock: net.Socket,
  onAppData: (buf: Buffer) => void,
): Rfc2217Socket {
  const state = { buf: Buffer.alloc(0) };
  sock.setNoDelay(true);

  // Igual a um cliente que funciona no ser2net do 166: binário + COM-PORT-OPTION.
  sock.write(Buffer.from([IAC, WILL, BINARY, IAC, DO, BINARY]));
  sock.write(Buffer.from([IAC, WILL, SGA, IAC, DO, SGA]));
  sock.write(Buffer.from([IAC, WILL, COM_PORT_OPTION, IAC, DO, COM_PORT_OPTION]));

  sock.on("data", (chunk) => {
    const app = feedTelnet(sock, chunk, state);
    if (app.length) onAppData(app);
  });

  const setControl = (value: number) => {
    try {
      // IAC SB COM-PORT-OPTION SET-CONTROL <v> IAC SE
      sock.write(Buffer.from([IAC, SB, COM_PORT_OPTION, SET_CONTROL, value & 0xff, IAC, SE]));
      return true;
    } catch {
      return false;
    }
  };

  const writeBinary = (buf: Buffer) => {
    try {
      sock.write(escapeIac(buf));
      return true;
    } catch {
      return false;
    }
  };

  const setDtr = (on: boolean) => setControl(on ? RFC2217_DTR_ON : RFC2217_DTR_OFF);
  const setRts = (on: boolean) => setControl(on ? RFC2217_RTS_ON : RFC2217_RTS_OFF);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const pulseWake = async (holdMs = 1000) => {
    // Expert remote-on: transição low→high em RTS e DTR (OpsLog / prática do hobby).
    setRts(false);
    setDtr(false);
    await sleep(holdMs);
    setRts(true);
    await sleep(50);
    setDtr(true);
  };

  return {
    sock,
    writeBinary,
    setControl,
    setDtr,
    setRts,
    pulseWake,
    destroy: () => {
      try {
        sock.removeAllListeners();
        sock.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

export function connectRfc2217(
  host: string,
  port: number,
  timeoutMs = 2500,
): Promise<Rfc2217Socket> {
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      s.destroy();
      reject(new Error("timeout"));
    }, timeoutMs);
    s.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    s.connect(port, host, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // attachRfc2217 precisa do callback — caller reanexa; aqui só devolve socket cru tipado
      // Na prática spe.ts chama attachRfc2217 após connect.
      resolve({
        sock: s,
        writeBinary: () => false,
        setControl: () => false,
        setDtr: () => false,
        setRts: () => false,
        pulseWake: async () => undefined,
        destroy: () => s.destroy(),
      });
    });
  });
}
