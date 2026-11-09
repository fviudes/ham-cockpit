import type { SerialDev } from "./state";

const PI_CATALOG: SerialDev[] = [
  { path: "/dev/serial/by-id/usb-Icom_Inc._IC-705-if00", label: "IC-705 USB CAT", kind: "usb" },
  { path: "/dev/serial/by-id/usb-FTDI-SPE-if00", label: "FTDI SPE", kind: "usb" },
  { path: "/dev/serial/by-id/usb-FTDI-ACOM2000A-if00", label: "FTDI ACOM 2000A", kind: "usb" },
  { path: "/dev/serial/by-id/usb-FTDI-LDG-METER-if00", label: "FTDI LDG METER", kind: "usb" },
  { path: "/dev/ttyACM0", label: "ttyACM0", kind: "usb" },
  { path: "/dev/ttyACM1", label: "ttyACM1", kind: "usb" },
  { path: "/dev/ttyUSB0", label: "ttyUSB0", kind: "usb" },
  { path: "/dev/ttyUSB1", label: "ttyUSB1", kind: "usb" },
  { path: "/dev/ttyAMA2", label: "GPIO uart2", kind: "serial" },
  { path: "/dev/ttyAMA3", label: "GPIO uart3", kind: "serial" },
  { path: "/dev/ttyAMA4", label: "GPIO uart4", kind: "serial" },
  { path: "/dev/ttyAMA5", label: "GPIO uart5", kind: "serial" },
];

type SerialNav = Navigator & {
  serial?: {
    getPorts: () => Promise<{ getInfo: () => { usbVendorId?: number; usbProductId?: number } }[]>;
    requestPort: () => Promise<{ getInfo: () => { usbVendorId?: number; usbProductId?: number } }>;
  };
};

function webInfo(info: { usbVendorId?: number; usbProductId?: number }): SerialDev {
  const vid = info.usbVendorId?.toString(16).padStart(4, "0") ?? "----";
  const pid = info.usbProductId?.toString(16).padStart(4, "0") ?? "----";
  const path = `usb:${vid}:${pid}`;
  return { path, label: `USB ${vid}:${pid}`, kind: "usb" };
}

export async function scanSerials(): Promise<SerialDev[]> {
  const uniq = new Map<string, SerialDev>();
  const add = (d: SerialDev) => uniq.set(d.path, d);

  try {
    const res = await fetch("/api/serials");
    if (res.ok) {
      const body = (await res.json()) as { devices?: SerialDev[] };
      for (const d of body.devices ?? []) add(d);
    }
  } catch {
    /* host listing opcional */
  }

  const serial = (navigator as SerialNav).serial;
  if (serial) {
    try {
      for (const p of await serial.getPorts()) add(webInfo(p.getInfo()));
    } catch {
      /* ignore */
    }
  }

  if (uniq.size === 0) PI_CATALOG.forEach(add);
  return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function pickUsbSerial(): Promise<SerialDev | null> {
  const serial = (navigator as SerialNav).serial;
  if (!serial) return null;
  const port = await serial.requestPort();
  return webInfo(port.getInfo());
}
