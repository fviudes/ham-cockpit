import type { WebSocket } from "ws";

/** Acima disso o socket é considerado lento; descartamos/coalesce em vez de encher o Recv-Q do kernel. */
export const WS_SEND_HIGH_WATER = 512 * 1024;

export function wsSendBuffered(ws: WebSocket): number {
  return typeof ws.bufferedAmount === "number" ? ws.bufferedAmount : 0;
}

export function wsSendWouldBlock(ws: WebSocket, highWater = WS_SEND_HIGH_WATER): boolean {
  return ws.readyState !== ws.OPEN || wsSendBuffered(ws) >= highWater;
}

/** Envia texto se o buffer do peer ainda aceita; devolve false se cheio ou fechado. */
export function tryWsSendText(ws: WebSocket, data: string, highWater = WS_SEND_HIGH_WATER): boolean {
  if (wsSendWouldBlock(ws, highWater)) return false;
  try {
    ws.send(data);
    return true;
  } catch {
    return false;
  }
}

/** Envia binário com o mesmo limite de buffer. */
export function tryWsSendBinary(ws: WebSocket, data: Buffer, highWater = WS_SEND_HIGH_WATER): boolean {
  if (wsSendWouldBlock(ws, highWater)) return false;
  try {
    ws.send(data);
    return true;
  } catch {
    return false;
  }
}