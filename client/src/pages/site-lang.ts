import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/console/i18n";
import { applyHtmlLang, LANG_EVENT, readLang, writeLang } from "@/console/lang-store";

export type Pair = { pt: string; en: string };

export function useSiteLang() {
  const [lang, setLangState] = useState<Lang>(readLang);

  useEffect(() => {
    applyHtmlLang(lang);
    const onChange = () => setLangState(readLang());
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    writeLang(next);
    setLangState(next);
  }, []);

  const t = useCallback((p: Pair) => (lang === "en" ? p.en : p.pt), [lang]);

  return { lang, setLang, t };
}
