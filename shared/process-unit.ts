/** Nome de unit systemd do tipo service, sem path e sem metacaractere. */
const UNIT_RE = /^[A-Za-z0-9][A-Za-z0-9:_.@+-]{0,127}\.service$/;

const DENY = new Set([
  "systemd-poweroff.service",
  "systemd-reboot.service",
  "systemd-halt.service",
  "systemd-kexec.service",
  "systemd-soft-reboot.service",
  "poweroff.service",
  "reboot.service",
  "halt.service",
]);

export function validServiceUnit(name: string): boolean {
  if (typeof name !== "string" || !UNIT_RE.test(name)) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return !DENY.has(name);
}

/** Units cujo stop/restart derruba este console. */
export function isConsoleUnit(name: string): boolean {
  return name === "ham-cockpit.service" || name === "nginx.service";
}
