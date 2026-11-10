import { getEquipment } from "./catalog";
import type {
  ConnectionKind,
  EquipmentBinding,
  EquipmentConnection,
  EquipmentRadio,
  HamlibBackend,
  HamlibPlan,
} from "./types";

/** Porta padrão do rigctld do rádio principal na estação. */
export const HAMLIB_DEFAULT_LISTEN = 4532;

/** Modelos Hamlib dos proxies SDR (quando o binding usa via=). */
export const HAMLIB_PROXY_MODELS: Record<string, number> = {
  thetis: 2054,
  pihpsdr: 2040,
  powersdr: 2048,
  "sdr-console": 2056,
};

function pickConnection(eq: EquipmentRadio, kind?: ConnectionKind): EquipmentConnection | undefined {
  if (kind) {
    const hit = eq.connections.find((c) => c.kind === kind);
    if (hit) return hit;
  }
  return eq.connections.find((c) => c.preferred) || eq.connections.find((c) => c.hamlibReady) || eq.connections[0];
}

function proxyModel(via: string | undefined, fallback: number | null): number | null {
  if (!via) return fallback;
  const key = via.split("|")[0]?.trim().toLowerCase() || "";
  if (key && HAMLIB_PROXY_MODELS[key] != null) return HAMLIB_PROXY_MODELS[key]!;
  return fallback;
}

function resolveBackend(eq: EquipmentRadio, conn: EquipmentConnection): HamlibBackend {
  if (conn.kind === "hamlib-net") return "hamlib-net";
  if (conn.kind === "sdr-cat-proxy") return "cat-proxy";
  if (conn.kind === "usb-serial" && eq.hamlibBackend === "ser2net") return "ser2net";
  if (eq.hamlibBackend !== "none" && conn.hamlibReady) return eq.hamlibBackend;
  return "none";
}

function buildRigDevice(
  backend: HamlibBackend,
  binding: EquipmentBinding,
  conn: EquipmentConnection,
): { rigDevice: string; ready: boolean; deferReason?: string } {
  const host = (binding.host || "127.0.0.1").trim() || "127.0.0.1";

  if (backend === "ser2net") {
    const port = binding.ser2netPort ?? binding.ports?.control;
    if (!port) {
      return {
        rigDevice: "",
        ready: false,
        deferReason: "Informe ser2netPort (TCP do ser2net, ex. 4001).",
      };
    }
    return { rigDevice: `127.0.0.1:${port}`, ready: true };
  }

  if (backend === "cat-proxy" || backend === "hamlib-net") {
    const cat =
      binding.ports?.cat ??
      binding.ports?.control ??
      conn.ports?.cat ??
      conn.ports?.control;
    if (!cat) {
      return {
        rigDevice: "",
        ready: false,
        deferReason: "Informe a porta CAT do proxy (Thetis 13013 / piHPSDR 19090).",
      };
    }
    return { rigDevice: `${host}:${cat}`, ready: true };
  }

  return {
    rigDevice: "",
    ready: false,
    deferReason:
      "Este transporte ainda não tem driver no hub Hamlib (GATT, Icom LAN UDP, Flex TCP, OpenHPSDR nativo, TCI).",
  };
}

/**
 * Monta o plano de `rigctld` a partir do catálogo + binding da estação.
 * Não inicia processo — só resolve argv / readiness.
 */
export function planHamlib(binding: EquipmentBinding): HamlibPlan | null {
  const eq = getEquipment(binding.equipmentId);
  if (!eq) return null;

  const conn = pickConnection(eq, binding.connectionKind);
  if (!conn) {
    return {
      equipmentId: eq.id,
      label: eq.label,
      maker: eq.maker,
      hamlibModel: 0,
      backend: "none",
      argv: [],
      rigDevice: "",
      listenPort: binding.hamlibListenPort ?? HAMLIB_DEFAULT_LISTEN,
      baud: eq.defaultBaud ?? 0,
      ready: false,
      deferReason: "Nenhuma conexão no catálogo para este modelo.",
      connectionKind: binding.connectionKind,
    };
  }

  const backend = resolveBackend(eq, conn);
  const model = proxyModel(conn.via, eq.hamlibModel);
  const listenPort =
    binding.hamlibListenPort ??
    binding.ports?.hamlibListen ??
    conn.ports?.hamlibListen ??
    HAMLIB_DEFAULT_LISTEN;
  const baud = binding.baud ?? conn.defaultBaud ?? eq.defaultBaud ?? 0;
  const civAddr = binding.civAddr ?? eq.civAddr;
  const { rigDevice, ready: pathReady, deferReason: pathDefer } = buildRigDevice(backend, binding, conn);

  if (model == null) {
    return {
      equipmentId: eq.id,
      label: eq.label,
      maker: eq.maker,
      hamlibModel: 0,
      backend,
      argv: [],
      rigDevice,
      listenPort,
      baud,
      civAddr,
      ready: false,
      deferReason: "Sem número de modelo Hamlib neste equipamento / via.",
      connectionKind: conn.kind,
    };
  }

  if (!pathReady || backend === "none") {
    return {
      equipmentId: eq.id,
      label: eq.label,
      maker: eq.maker,
      hamlibModel: model,
      backend,
      argv: [],
      rigDevice,
      listenPort,
      baud,
      civAddr,
      ready: false,
      deferReason: pathDefer || "Backend Hamlib = none para este transporte.",
      connectionKind: conn.kind,
    };
  }

  const argv = ["-m", String(model), "-r", rigDevice, "-t", String(listenPort)];
  if (baud > 0 && backend === "ser2net") argv.push("-s", String(baud));
  if (civAddr && eq.protocol === "civ" && backend === "ser2net") {
    const n = Number.parseInt(civAddr, 16);
    if (Number.isFinite(n)) argv.push("-c", `0x${n.toString(16).toUpperCase()}`);
  }

  return {
    equipmentId: eq.id,
    label: eq.label,
    maker: eq.maker,
    hamlibModel: model,
    backend,
    argv,
    rigDevice,
    listenPort,
    baud,
    civAddr,
    ready: true,
    connectionKind: conn.kind,
  };
}

/** Linha de comando completa (para systemd / docs). */
export function formatRigctldCommand(plan: HamlibPlan, binary = "/usr/bin/rigctld"): string {
  if (!plan.ready) return `# não pronto: ${plan.deferReason || "indefinido"}`;
  return [binary, ...plan.argv].join(" ");
}

/** Lista planos prontos a partir de bindings da estação. */
export function planAllHamlib(bindings: EquipmentBinding[]): HamlibPlan[] {
  return bindings.map((b) => planHamlib(b)).filter((p): p is HamlibPlan => p != null);
}
