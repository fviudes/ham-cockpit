import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import NavBar from "@/components/NavBar";
import { useSiteLang } from "./site-lang";
import { BUY, LIC } from "./license-copy";

type Provider = { id: string; label: string; currency: string };
type Config = {
  serial?: { valid?: boolean; display?: string; error?: string };
  alreadyLicensed?: boolean;
  priceConfigured?: boolean;
  providers?: Provider[];
  noRefund?: boolean;
};
type Quote = {
  quoteId?: string;
  usdCents?: number;
  brlCents?: number | null;
  expiresAt?: number;
  rate?: number;
  source?: string;
  serialDisplay?: string;
  message?: string;
  error?: string;
};

function money(cents: number | null | undefined, cur: string) {
  if (cents == null) return "—";
  return `${cur} ${(cents / 100).toFixed(2)}`;
}

export default function BuyPage() {
  const { t, lang } = useSiteLang();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  /** Fonte de verdade: query `?serial=` (e `chk` opcional, links antigos). */
  const serialParam = useMemo(() => (params.get("serial") ?? "").trim(), [params]);
  const chkParam = useMemo(() => {
    const c = (params.get("chk") ?? "").trim().toUpperCase();
    return c || undefined;
  }, [params]);
  const fromDevice = Boolean(serialParam);

  /** Digitação manual só quando a URL não trouxe serial. */
  const [manualSerial, setManualSerial] = useState("");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [provider, setProvider] = useState("");
  const [email, setEmail] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const serialForApi = fromDevice ? serialParam : manualSerial.trim();
  /** Campo e card usam o mesmo display canônico do portal. */
  const serialShown =
    quote?.serialDisplay || cfg?.serial?.display || (fromDevice ? serialParam : manualSerial);

  useEffect(() => {
    setCfg(null);
    setQuote(null);
    setErr("");
    if (!fromDevice) setManualSerial("");
  }, [serialParam, fromDevice]);

  useEffect(() => {
    if (!serialForApi) {
      setCfg(null);
      setQuote(null);
      return;
    }
    const qs = new URLSearchParams({ serial: serialForApi, lang });
    if (chkParam) qs.set("chk", chkParam);
    let cancelled = false;
    void fetch(`/api/checkout/config?${qs}`)
      .then((r) => r.json())
      .then((j: Config) => {
        if (cancelled) return;
        setCfg(j);
        setProvider(j.providers?.[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setErr(t(LIC.errPortal));
      });
    return () => {
      cancelled = true;
    };
  }, [serialForApi, chkParam, lang, t]);

  useEffect(() => {
    if (!cfg?.serial?.valid || !cfg.priceConfigured || cfg.alreadyLicensed || !serialForApi) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void fetch("/api/checkout/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serial: serialForApi, chk: chkParam }),
    })
      .then(async (r) => {
        const j = (await r.json()) as Quote;
        if (!r.ok) throw new Error(j.message || j.error || "quote");
        if (!cancelled) {
          setQuote(j);
          setErr("");
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message || t(LIC.errPortal));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg, serialForApi, chkParam, t]);

  const start = async () => {
    if (!quote?.quoteId || !provider || !accept) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          provider,
          email: email.trim() || undefined,
          lang,
          acceptNoRefund: true,
        }),
      });
      const j = (await r.json()) as { redirectUrl?: string; paymentId?: string; message?: string; error?: string };
      if (!r.ok) {
        setErr(j.message || j.error || t(LIC.errPortal));
        return;
      }
      if (j.redirectUrl) {
        window.location.href = j.redirectUrl;
        return;
      }
      if (j.paymentId) navigate(`/comprar/retorno?pid=${encodeURIComponent(j.paymentId)}`);
    } catch {
      setErr(t(LIC.errPortal));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="container max-w-2xl flex-1 pt-24 pb-16">
        <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">{t(BUY.kicker)}</p>
        <h1 className="mb-3 font-['Space_Grotesk'] text-3xl font-bold text-white">{t(BUY.title)}</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#94a3b8]">{t(BUY.lead)}</p>

        <label className="mb-1 block text-sm text-[#94a3b8]">{t(LIC.serial)}</label>
        <input
          className="mb-4 w-full rounded-md border border-[rgba(79,195,247,0.25)] bg-[#132033] px-3 py-2 font-mono text-sm text-white"
          value={serialShown}
          readOnly={fromDevice}
          placeholder={fromDevice ? undefined : t(LIC.serialPh)}
          onChange={(e) => {
            if (fromDevice) return;
            setManualSerial(e.target.value);
          }}
          spellCheck={false}
          autoComplete="off"
        />

        {!serialForApi ? <p className="text-sm text-[#94a3b8]">{t(BUY.needSerial)}</p> : null}
        {cfg && cfg.serial && !cfg.serial.valid ? <p className="text-sm text-red-400">{t(LIC.errSerial)}</p> : null}
        {cfg?.alreadyLicensed ? <p className="text-sm text-emerald-400">{t(BUY.already)}</p> : null}
        {cfg?.serial?.valid && !cfg.priceConfigured ? <p className="text-sm text-amber-400">{t(BUY.noPrice)}</p> : null}
        {cfg?.serial?.valid && cfg.priceConfigured && !(cfg.providers?.length) ? (
          <p className="text-sm text-amber-400">{t(BUY.noProviders)}</p>
        ) : null}

        {quote?.quoteId ? (
          <div className="mb-6 rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
            <p className="mb-1 font-mono text-sm text-white">{serialShown}</p>
            <p className="text-lg text-[#4fc3f7]">
              {t(BUY.priceUsd)}: {money(quote.usdCents, "US$")}
            </p>
            <p className="text-sm text-[#94a3b8]">
              {t(BUY.priceBrl)}: {money(quote.brlCents, "R$")}
              {quote.source ? ` · ${quote.source}` : ""}
            </p>
            {quote.expiresAt ? (
              <p className="mt-1 text-xs text-[#64748b]">
                {t(BUY.quoteUntil)} {new Date(quote.expiresAt * 1000).toLocaleTimeString()}
              </p>
            ) : null}
          </div>
        ) : busy ? (
          <p className="mb-4 text-sm text-[#94a3b8]">{t(BUY.quoting)}</p>
        ) : null}

        {cfg?.providers?.length ? (
          <div className="mb-4">
            <p className="mb-2 text-sm text-[#94a3b8]">{t(BUY.provider)}</p>
            <div className="flex flex-wrap gap-3">
              {cfg.providers.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-white">
                  <input type="radio" name="prov" checked={provider === p.id} onChange={() => setProvider(p.id)} />
                  {p.label} ({p.currency})
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <label className="mb-1 block text-sm text-[#94a3b8]">{t(BUY.email)}</label>
        <input
          className="mb-4 w-full rounded-md border border-[rgba(79,195,247,0.25)] bg-[#132033] px-3 py-2 text-sm text-white"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
        />

        <label className="mb-6 flex items-start gap-2 text-sm text-[#94a3b8]">
          <input className="mt-1" type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>{t(BUY.acceptNoRefund)}</span>
        </label>

        {err ? <p className="mb-4 text-sm text-red-400">{err}</p> : null}

        <button
          type="button"
          disabled={busy || !quote?.quoteId || !provider || !accept}
          onClick={() => void start()}
          className="rounded-md bg-[#4fc3f7] px-4 py-2 text-sm font-semibold text-[#0d1b2a] disabled:opacity-40"
        >
          {t(BUY.pay)}
        </button>
      </main>
    </div>
  );
}
