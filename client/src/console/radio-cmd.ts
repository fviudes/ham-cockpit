/**
 * Roteia comandos do Painel/VFO para o rádio marcado como Principal:
 * BLE CI-V (navegador), Icom LAN UDP (POST /api/radios/civ) ou Hamlib NET.
 */
import { hamlibStrengthToUiSMeter } from "@shared/smeter";
import { ic705Ble } from "./ic705-ble";
import type { StationRadio } from "./state";

export type RadioTransport = "ble" | "lan" | "hamlib" | "none";

export type PrimaryRoute = {
  transport: RadioTransport;
  radio?: StationRadio;
  live: boolean;
};

function isIcomLan(row: StationRadio) {
  if (row.link !== "network" || row.maker !== "icom") return false;
  if (row.proto === "cat") return false;
  if (row.netProfile?.startsWith("icom-lan-udp")) return true;
  return !row.netProfile || row.netProfile.includes("icom");
}

function isIcomBle(row: StationRadio) {
  return row.link === "bluetooth" && row.maker === "icom" && row.proto !== "cat";
}

/** Resolve o rádio Principal e o transporte ativo (não prioriza BLE “órfão”). */
export function resolvePrimaryRoute(
  items: StationRadio[],
  opts?: { bleReady?: boolean },
): PrimaryRoute {
  const primary = items.find((r) => r.primary) || (items.length === 1 ? items[0] : undefined);
  const bleReady = Boolean(opts?.bleReady ?? ic705Ble.connected);

  if (!primary) {
    if (bleReady) return { transport: "ble", live: true };
    return { transport: "none", live: false };
  }

  if (isIcomBle(primary)) {
    return { transport: "ble", radio: primary, live: bleReady };
  }

  if (isIcomLan(primary)) {
    return { transport: "lan", radio: primary, live: Boolean(primary.connected) };
  }

  if (primary.connected && (primary.link === "usb" || primary.link === "network")) {
    return { transport: "hamlib", radio: primary, live: true };
  }

  return { transport: "none", radio: primary, live: false };
}

async function postCiv(cmd: string, body: Record<string, unknown> = {}) {
  const r = await fetch("/api/radios/civ", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd, ...body }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; reply?: unknown };
  if (!r.ok || j.ok === false) throw new Error(j.error || `CI-V LAN HTTP ${r.status}`);
  return j;
}

async function postHamlibReply(command: string, port = 4532, host = "127.0.0.1") {
  const r = await fetch("/api/hamlib/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, port, host }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; reply?: string; error?: string };
  if (!r.ok || j.ok === false) throw new Error(j.error || `Hamlib HTTP ${r.status}`);
  return String(j.reply || "").trim();
}

/** Poll telemetria do Principal (LAN CI-V ou Hamlib). BLE tem poll próprio. */
export async function pollPrimaryTelemetry(
  items: StationRadio[],
  opts?: { bleReady?: boolean; hamlibPort?: number; tick?: number },
): Promise<import("./ic705-ble").CivPatch | null> {
  const route = resolvePrimaryRoute(items, opts);
  if (!route.live || route.transport === "ble" || route.transport === "none") return null;

  if (route.transport === "lan") {
    const j = await postCiv("poll", { tick: opts?.tick ?? 0 });
    const reply = (j.reply && typeof j.reply === "object" ? j.reply : null) as import("./ic705-ble").CivPatch | null;
    return reply;
  }

  if (route.transport === "hamlib") {
    const port = opts?.hamlibPort ?? 4532;
    const patch: import("./ic705-ble").CivPatch = {};
    const tick = opts?.tick ?? 0;
    try {
      const f = await postHamlibReply("f", port);
      const hz = Number.parseFloat(f);
      if (Number.isFinite(hz) && hz >= 100_000) patch.freq = Math.round(hz);
    } catch {
      /* */
    }
    if (tick % 3 === 1) {
      try {
        const m = await postHamlibReply("m", port);
        const mode = m.split(/\s+/)[0]?.toUpperCase();
        if (mode) patch.mode = mode;
      } catch {
        /* */
      }
    }
    if (tick % 5 === 2) {
      try {
        const p = await postHamlibReply("\\get_powerstat", port);
        if (p === "1" || /on/i.test(p)) patch.power = true;
        else if (p === "0" || /off|standby/i.test(p)) patch.power = false;
      } catch {
        /* */
      }
    }
    try {
      const t = await postHamlibReply("t", port);
      if (t === "1" || t === "0") patch.ptt = t === "1";
    } catch {
      /* */
    }
    if (!patch.ptt && tick % 2 === 0) {
      try {
        const s = await postHamlibReply("\\get_level STRENGTH", port);
        const raw = Number.parseFloat(s);
        if (Number.isFinite(raw)) {
          // Hamlib STRENGTH = dB relativo a S9 (−54…+60), não 0..100%.
          patch.smeter = hamlibStrengthToUiSMeter(raw);
        }
      } catch {
        /* */
      }
    }
    return Object.keys(patch).length ? patch : null;
  }

  return null;
}

async function postHamlib(command: string, port = 4532, host = "127.0.0.1") {
  const r = await fetch("/api/hamlib/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, port, host }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!r.ok || j.ok === false) throw new Error(j.error || `Hamlib HTTP ${r.status}`);
}

function hamlibMode(mode: string) {
  const m = mode.trim().toUpperCase();
  if (m === "LSB-D") return "LSB";
  if (m === "USB-D") return "USB";
  return m || "USB";
}

/** Envia ação do painel ao Principal; falhas são engolidas (UI já atualizou). */
export async function sendPrimaryCmd(
  items: StationRadio[],
  action:
    | { type: "setFreq"; hz: number }
    | { type: "setMode"; mode: string }
    | { type: "setPtt"; on: boolean }
    | { type: "setVfo"; vfo: "A" | "B" }
    | { type: "setNr"; on: boolean }
    | { type: "setNb"; on: boolean }
    | { type: "setPre"; pre: "OFF" | "ON1" | "ON2" }
    | { type: "setAtt"; on: boolean }
    | { type: "setAgc"; agc: "OFF" | "FAST" | "MID" | "SLOW" }
    | { type: "setPower"; on: boolean },
  opts?: { bleReady?: boolean; hamlibPort?: number },
): Promise<void> {
  const route = resolvePrimaryRoute(items, opts);
  if (!route.live) {
    // Standby: CAT some; ainda tenta 0x18 / powerstat pelo transporte conhecido.
    if (action.type !== "setPower") return;
    try {
      if (route.transport === "ble" || ic705Ble.connected) {
        await ic705Ble.setPower(action.on);
      } else if (route.transport === "lan" || (route.radio && isIcomLan(route.radio))) {
        await postCiv("setPower", { on: action.on });
      } else if (route.transport === "hamlib" || route.radio) {
        await postHamlib(`\\set_powerstat ${action.on ? 1 : 0}`, opts?.hamlibPort ?? 4532);
      }
    } catch {
      /* */
    }
    return;
  }

  try {
    if (route.transport === "ble") {
      switch (action.type) {
        case "setFreq":
          await ic705Ble.setFreq(action.hz);
          break;
        case "setMode":
          await ic705Ble.setMode(action.mode);
          break;
        case "setPtt":
          await ic705Ble.setPtt(action.on);
          break;
        case "setVfo":
          await ic705Ble.selectVfo(action.vfo);
          break;
        case "setNr":
          await ic705Ble.setNr(action.on);
          break;
        case "setNb":
          await ic705Ble.setNb(action.on);
          break;
        case "setPre":
          await ic705Ble.setPre(action.pre);
          break;
        case "setAtt":
          await ic705Ble.setAtt(action.on);
          break;
        case "setAgc":
          await ic705Ble.setAgc(action.agc);
          break;
        case "setPower":
          await ic705Ble.setPower(action.on);
          break;
      }
      return;
    }

    if (route.transport === "lan") {
      switch (action.type) {
        case "setFreq":
          await postCiv("setFreq", { hz: action.hz });
          break;
        case "setMode":
          await postCiv("setMode", { mode: action.mode });
          break;
        case "setPtt":
          await postCiv("setPtt", { on: action.on });
          break;
        case "setVfo":
          await postCiv("setVfo", { vfo: action.vfo });
          break;
        case "setNr":
          await postCiv("setNr", { on: action.on });
          break;
        case "setNb":
          await postCiv("setNb", { on: action.on });
          break;
        case "setPre":
          await postCiv("setPre", { pre: action.pre });
          break;
        case "setAtt":
          await postCiv("setAtt", { on: action.on });
          break;
        case "setAgc":
          await postCiv("setAgc", { agc: action.agc });
          break;
        case "setPower":
          await postCiv("setPower", { on: action.on });
          break;
      }
      return;
    }

    if (route.transport === "hamlib") {
      const port = opts?.hamlibPort ?? 4532;
      switch (action.type) {
        case "setFreq":
          await postHamlib(`F ${Math.round(action.hz)}`, port);
          break;
        case "setMode":
          await postHamlib(`M ${hamlibMode(action.mode)} 0`, port);
          break;
        case "setPtt":
          await postHamlib(`T ${action.on ? 1 : 0}`, port);
          break;
        case "setVfo":
          await postHamlib(`V VFO${action.vfo}`, port);
          break;
        case "setPower":
          await postHamlib(`\\set_powerstat ${action.on ? 1 : 0}`, port);
          break;
        default:
          break;
      }
    }
  } catch {
    /* transporte offline / timeout — estado local já refletiu o clique */
  }
}
