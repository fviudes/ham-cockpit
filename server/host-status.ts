import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statfsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type HostStatus = {
  ok: boolean;
  cpuTempC: number | null;
  diskTotalBytes: number;
  diskFreeBytes: number;
  diskUsedBytes: number;
  diskPath: string;
  error: string;
};

function readThermalZoneC(): number | null {
  const root = "/sys/class/thermal";
  if (!existsSync(root)) return null;
  try {
    const zones = readdirSync(root).filter((n) => n.startsWith("thermal_zone"));
    let best: number | null = null;
    for (const z of zones) {
      const typePath = `${root}/${z}/type`;
      const tempPath = `${root}/${z}/temp`;
      if (!existsSync(tempPath)) continue;
      let prefer = false;
      try {
        const type = readFileSync(typePath, "utf8").trim().toLowerCase();
        prefer = type.includes("cpu") || type.includes("soc") || type === "x86_pkg_temp" || type === "cpu-thermal";
      } catch {
        /* ignore */
      }
      const raw = Number(readFileSync(tempPath, "utf8").trim());
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const c = raw > 1000 ? raw / 1000 : raw;
      if (prefer) return Math.round(c * 10) / 10;
      if (best == null || c > best) best = c;
    }
    return best == null ? null : Math.round(best * 10) / 10;
  } catch {
    return null;
  }
}

async function readVcgencmdTempC(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("vcgencmd", ["measure_temp"], { timeout: 2000 });
    const m = stdout.match(/temp=([\d.]+)/i);
    if (!m) return null;
    const c = Number(m[1]);
    return Number.isFinite(c) ? Math.round(c * 10) / 10 : null;
  } catch {
    return null;
  }
}

async function readWindowsTempC(): Promise<number | null> {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Temperature)",
      ],
      { timeout: 4000, windowsHide: true }
    );
    const kelvin = Number(String(stdout).trim());
    if (!Number.isFinite(kelvin) || kelvin < 200) return null;
    return Math.round((kelvin - 273.15) * 10) / 10;
  } catch {
    return null;
  }
}

function diskRoots(): string[] {
  if (process.platform === "win32") {
    const home = process.env.SystemDrive || "C:";
    return [`${home}\\`];
  }
  return ["/", "/data", "/opt"];
}

function readDisk(): { total: number; free: number; path: string } {
  for (const p of diskRoots()) {
    try {
      if (!existsSync(p)) continue;
      const s = statfsSync(p);
      const total = Number(s.bsize) * Number(s.blocks);
      const free = Number(s.bsize) * Number(s.bavail ?? s.bfree);
      if (total > 0) return { total, free, path: p };
    } catch {
      /* try next */
    }
  }
  return { total: 0, free: 0, path: process.platform === "win32" ? "C:\\" : "/" };
}

export async function hostStatus(): Promise<HostStatus> {
  try {
    let cpuTempC = readThermalZoneC();
    if (cpuTempC == null) cpuTempC = await readVcgencmdTempC();
    if (cpuTempC == null) cpuTempC = await readWindowsTempC();

    const disk = readDisk();
    const used = Math.max(0, disk.total - disk.free);
    return {
      ok: true,
      cpuTempC,
      diskTotalBytes: disk.total,
      diskFreeBytes: disk.free,
      diskUsedBytes: used,
      diskPath: disk.path,
      error: "",
    };
  } catch (err) {
    return {
      ok: false,
      cpuTempC: null,
      diskTotalBytes: 0,
      diskFreeBytes: 0,
      diskUsedBytes: 0,
      diskPath: "/",
      error: String(err),
    };
  }
}
