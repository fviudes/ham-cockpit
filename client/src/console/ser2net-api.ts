import {
  SER2NET_ACC_BAUD,
  SER2NET_ACC_IDS,
  SER2NET_ACC_NAME,
  SER2NET_RADIO_ID,
  asSer2netDevice,
  type Ser2netAccId,
  type Ser2netDevice,
} from "@shared/const";
import type { Ser2netSvc } from "./state";

export {
  SER2NET_ACC_BAUD,
  SER2NET_ACC_IDS,
  SER2NET_ACC_NAME,
  SER2NET_RADIO_ID,
  asSer2netDevice,
  type Ser2netAccId,
  type Ser2netDevice,
};

export function assignedSvc(services: Ser2netSvc[], device: Ser2netAccId | typeof SER2NET_RADIO_ID): Ser2netSvc | undefined {
  return services.find((x) => x.device === device);
}

export function radioSer2netSvcs(services: Ser2netSvc[]): Ser2netSvc[] {
  return services.filter((x) => !x.device || x.device === SER2NET_RADIO_ID);
}

export function s2nDeviceLabelKey(device: Ser2netDevice): "s2nForNone" | "s2nForRadio" | Ser2netAccId {
  if (!device) return "s2nForNone";
  if (device === SER2NET_RADIO_ID) return "s2nForRadio";
  return device;
}

export function s2nAside(bind: string, services: { device?: string; tcpPort: number }[], acc: Ser2netAccId): string {
  const row = services.find((x) => x.device === acc);
  return row ? `${bind}:${row.tcpPort}` : "";
}

export function nextTcpPort(services: { tcpPort: number }[], from = 4001): number {
  const taken = new Set(services.map((x) => x.tcpPort));
  let p = from;
  while (taken.has(p)) p += 1;
  return p;
}

export function assignDevice(services: Ser2netSvc[], id: string, device: Ser2netDevice): Ser2netSvc[] {
  if (!device) {
    return services.map((x) => (x.id === id ? { ...x, device: "" } : x));
  }
  return services.map((x) => ({
    ...x,
    device: x.id === id ? device : x.device === device ? "" : x.device,
  }));
}

export async function persistSer2net(opts: {
  bind: string;
  folder: string;
  services: Ser2netSvc[];
}): Promise<{ bind: string; folder: string; services: Ser2netSvc[]; running: boolean; hamlibRunning: boolean }> {
  const res = await fetch("/api/ser2net", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    bind?: string;
    folder?: string;
    services?: Ser2netSvc[];
    running?: boolean;
    hamlibRunning?: boolean;
    error?: string;
  };
  const saved = body.services;
  if (!res.ok || !body.ok || !Array.isArray(saved)) {
    throw new Error(body.error || "ser2net");
  }
  return {
    bind: body.bind || opts.bind,
    folder: body.folder || opts.folder,
    services: saved.map((row) => ({
      ...row,
      device: asSer2netDevice(row.device),
    })),
    running: Boolean(body.running),
    hamlibRunning: Boolean(body.hamlibRunning),
  };
}

export async function ctlHamlib(action: "start" | "stop"): Promise<boolean> {
  const res = await fetch("/api/ser2net/hamlib", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body = (await res.json()) as { ok?: boolean; hamlibRunning?: boolean; error?: string };
  if (!res.ok || body.ok === false) throw new Error(body.error || "hamlib");
  return Boolean(body.hamlibRunning);
}
