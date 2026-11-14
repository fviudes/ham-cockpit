import { imageBase } from "./version";

export const APP_NAME = "Ham Cockpit";
export const APP_SLUG = "ham-cockpit";
/** Emblema PNG transparente (menu, header, login). */
export const APP_LOGO = "/brand/ham-cockpit-logo-256.png";
/** Emblema em 512px para hero e destaques maiores. */
export const APP_LOGO_LG = "/brand/ham-cockpit-logo-512.png";
export const APP_USER = "hamcockpit";
/** Versão completa (3 ou 4 partes). Ver docs/versionamento.md. */
export const APP_VERSION = "0.1.10.01";
/** Base de imagem (sempre 3 partes) para nomes `.img.xz` / release de bake. */
export const APP_IMAGE_VERSION = imageBase(APP_VERSION);
export const APP_BLE_NAME = "Ham-Cockpit-Web01";
export const APP_SSID_PREFIX = "Ham-Cockpit";
export const APP_HOSTNAME = "ham-cockpit";
export const APP_AP_PASS = "hamcockpit";
export const UPDATE_REPO = "fviudes/ham-cockpit";
export const UPDATE_BRANCH = "main";
export const UPDATE_DIR = "update";

