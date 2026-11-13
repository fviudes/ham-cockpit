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

/** Chip do menu Serviços. `running` já é o estado da unit no Linux, não a sessão do aparelho. */
export function serviceLive(_id: ServiceId, _s: Station, running: boolean) {
  return running;
}

export { SERVICE_IDS };
export type { ServiceId };
