import type { Lang } from "./i18n";

export const LANG_KEY = "hamcockpit.lang";
export const LANG_EVENT = "hamcockpit-lang";

export function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "pt";
  } catch {
    return "pt";
  }
}

export function htmlLang(lang: Lang): "pt-BR" | "en-US" {
  return lang === "en" ? "en-US" : "pt-BR";
}

export function applyHtmlLang(lang: Lang) {
  document.documentElement.lang = htmlLang(lang);
}

export function writeLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore quota / private mode */
  }
  applyHtmlLang(lang);
  window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: lang }));
}
