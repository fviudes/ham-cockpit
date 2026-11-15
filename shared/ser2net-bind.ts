/** Escuta em todas as interfaces. Quem roda na estação disca 127.0.0.1. */
export const SER2NET_LISTEN = "0.0.0.0";

export function ser2netDialHost(bind: string): string {
  const host = bind.trim();
  if (!host || host === "0.0.0.0" || host === "localhost") return "127.0.0.1";
  return host;
}
