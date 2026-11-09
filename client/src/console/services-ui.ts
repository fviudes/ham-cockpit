import { SERVICE_IDS, type ServiceId } from "@shared/const";
import type { I18nKey } from "./i18n";
import type { Station } from "./state";

export const SVC_LABEL: Record<ServiceId, I18nKey> = {
  ser2net: "svcSer2net",
  wavelog: "svcWavelog",
  wlg: "svcWlg",
  radio: "svcRadio",
  spe: "svcSpe",
  hamplus: "svcHamplus",
  palstar: "svcPalstar",
  ldg: "svcLdg",
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
  wlg: "svcWlgHint",
  radio: "svcRadioHint",
  spe: "svcSpeHint",
  hamplus: "svcHamplusHint",
  palstar: "svcPalstarHint",
  ldg: "svcLdgHint",
  acom: "svcAcomHint",
  lextel: "svcLextelHint",
  wifi: "svcWifiHint",
  bluetooth: "svcBluetoothHint",
  dhcp: "svcDhcpHint",
  web: "svcWebHint",
};

export function serviceLive(id: ServiceId, s: Station, running: boolean) {
  if (id === "web") return true;
  if (id === "radio") return s.ic705.phase === "ready" || s.ic705.civ || s.radios.items.some((r) => r.connected);
  if (id === "lextel") return s.lextel.connected;
  if (id === "ldg") return s.ldg.connected;
  if (id === "wifi") return s.wifi.staConnected || s.wifi.ethConnected;
  if (id === "wavelog") return s.wavelog.running;
  if (id === "wlg") return s.wlg.running;
  if (id === "bluetooth") return s.ic705.phase === "ready" || s.ble.connected;
  if (id === "ser2net") return s.ser2net.running || running;
  return running;
}

export { SERVICE_IDS };
export type { ServiceId };
