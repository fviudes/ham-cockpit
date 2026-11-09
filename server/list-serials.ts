import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SerialDev = {
  path: string;
  label: string;
  kind: "usb" | "serial";
};

export async function listSerialDevices(): Promise<SerialDev[]> {
  const found = process.platform === "win32" ? await listWindows() : await listUnix();
  const uniq = new Map<string, SerialDev>();
  for (const d of found) uniq.set(d.path, d);
  return Array.from(uniq.values()).sort((a, b) => a.path.localeCompare(b.path));
}

async function listUnix(): Promise<SerialDev[]> {
  const out: SerialDev[] = [];
  const byId = "/dev/serial/by-id";
  try {
    const names = await readdir(byId);
    for (const name of names) {
      out.push({ path: `${byId}/${name}`, label: name, kind: "usb" });
    }
  } catch {
    /* no by-id */
  }
  for (const dir of ["/dev"]) {
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/^(ttyUSB|ttyACM|ttyAMA|ttyS)\d+$/.test(name)) continue;
      const path = join(dir, name);
      if (out.some((d) => d.path === path)) continue;
      const kind = name.startsWith("ttyUSB") || name.startsWith("ttyACM") ? "usb" : "serial";
      out.push({ path, label: name, kind });
    }
  }
  return out;
}

async function listWindows(): Promise<SerialDev[]> {
  const script = [
    "$ports = @()",
    "try { [System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object { $ports += [pscustomobject]@{ path = $_; label = $_; kind = 'serial' } } } catch {}",
    "Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object { $ports += [pscustomobject]@{ path = $_.DeviceID; label = $_.Name; kind = 'serial' } }",
    "Get-PnpDevice -Class Ports -Status OK -ErrorAction SilentlyContinue | ForEach-Object { $name = $_.FriendlyName; if ($name) { $com = [regex]::Match($name,'COM\\d+').Value; $path = if ($com) { $com } else { $name }; $ports += [pscustomobject]@{ path = $path; label = $name; kind = 'usb' } } }",
    "$ports | ConvertTo-Json -Compress",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 8000 }
    );
    const raw = stdout.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SerialDev | SerialDev[];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .filter((r) => r?.path)
      .map((r) => ({
        path: String(r.path),
        label: String(r.label || r.path),
        kind: r.kind === "usb" ? "usb" : "serial",
      }));
  } catch {
    return [];
  }
}
