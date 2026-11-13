export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

export const SERVICE_IDS = [
  "ser2net",
  "wavelog",
  "db",
  "wlg",
  "mmdvm",
  "radio",
  "hamlib",
  "spe",
  "hamplus",
  "palstar",
  "ldg",
  "lp100a",
  "acom",
  "lextel",
  "wifi",
  "bluetooth",
  "dhcp",
  "web",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export const UPDATE_IDS = ["app", "os", "ser2net", "hamlib", "wavelog", "wlg"] as const;
export type UpdateId = (typeof UPDATE_IDS)[number];

/** Accessory devices that talk IP; ser2net owns the TTY. Radio CAT/USB also uses a ser2net row. */
export const SER2NET_ACC_IDS = ["spe", "hamplus", "palstar", "ldg", "lp100a", "acom"] as const;
export const SER2NET_RADIO_ID = "radio" as const;
export type Ser2netAccId = (typeof SER2NET_ACC_IDS)[number];
export type Ser2netDevice = Ser2netAccId | typeof SER2NET_RADIO_ID | "";

export const SER2NET_ACC_BAUD: Record<Ser2netAccId, number> = {
  spe: 115200,
  hamplus: 9600,
  palstar: 9600,
  ldg: 38400,
  lp100a: 115200,
  acom: 1200,
};

export const SER2NET_ACC_NAME: Record<Ser2netAccId, string> = {
  spe: "SPE",
  hamplus: "Hamplus",
  palstar: "Palstar",
  ldg: "LDG AT",
  lp100a: "LP-100A",
  acom: "ACOM",
};

export function asSer2netDevice(v: unknown): Ser2netDevice {
  if (v === SER2NET_RADIO_ID) return SER2NET_RADIO_ID;
  return SER2NET_ACC_IDS.includes(v as Ser2netAccId) ? (v as Ser2netAccId) : "";
}
