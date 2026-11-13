import { SERVICE_IDS, type ServiceId } from "@shared/const";
import type { I18nKey } from "./i18n";
import type { Station } from "./state";

export const SVC_LABEL: Record<ServiceId, I18nKey> = {
  ser2net: "svcSer2net",
  wavelog: "svcWavelog",
  db: "svcDb",
  wlg: "svcWlg",
  mmdvm: "svcMmdvm",
  radio: "svcRadio",
  hamlib: "svcHamlib",
  spe: "svcSpe",
  hamplus: "svcHamplus",
  palstar: "svcPalstar",
  ldg: "svcLdg",
  lp100a: "svcLp100a",
  acom: "svcAcom",
  lextel: "svcLextel",
  wifi: "svcWifi",
  bluetooth: "svcBluetooth",
  dhcp: "svcDhcp",
  web: "svcWeb",
};

export const SVC_HINT: Record<ServiceId, I18nKey> = {
  ser2net: "svcSer2netHint",
  wavelog: "svcWavelogHint",
  db: "svcDbHint",
  wlg: "svcWlgHint",
  mmdvm: "svcMmdvmHint",
  radio: "svcRadioHint",
  hamlib: "svcHamlibHint",
  spe: "svcSpeHint",
  hamplus: "svcHamplusHint",
  palstar: "svcPalstarHint",
  ldg: "svcLdgHint",
  lp100a: "svcLp100aHint",
  acom: "svcAcomHint",
  lextel: "svcLextelHint",
  wifi: "svcWifiHint",
  bluetooth: "svcBluetoothHint",
  dhcp: "svcDhcpHint",
  web: "svcWebHint",
};

/** Serviços com botão Ligar/Desligar (espelha POWER_IDS em server/services.ts). */
export const SVC_POWER = new Set<ServiceId>([
  "ser2net",
  "wavelog",
  "db",
  "wlg",
  "mmdvm",
  "hamlib",
  "spe",
  "bluetooth",
  "radio",
  "lextel",
  "ldg",
  "lp100a",
]);

export function serviceLive(id: ServiceId, s: Station, running: boolean) {
  if (id === "web") return true;
  if (id === "radio") return s.ic705.phase === "ready" || s.ic705.civ || s.radios.items.some((r) => r.connected);
  if (id === "lextel") return s.lextel.connected;
  if (id === "ldg") return s.ldg.connected;
  if (id === "lp100a") return s.lp100a.connected;
  if (id === "wifi") return s.wifi.staConnected || s.wifi.ethConnected;
  if (id === "wavelog") return s.wavelog.running;
  if (id === "db") return running;
  if (id === "wlg") return s.wlg.running;
  if (id === "mmdvm") return s.mmdvm.running || running;
  if (id === "bluetooth") return s.ic705.phase === "ready" || s.ble.connected;
  if (id === "ser2net") return s.ser2net.running || running;
  if (id === "hamlib") return s.ser2net.hamlibRunning || running;
  return running;
}

export { SERVICE_IDS };
export type { ServiceId };
