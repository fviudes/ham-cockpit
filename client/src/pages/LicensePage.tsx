import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import NavBar from "@/components/NavBar";
import { useSiteLang } from "./site-lang";
import { LIC } from "./license-copy";

type ActivateRes = {
  status?: string;
  license?: { token?: string; type?: string; exp?: number | null; lid?: string } | null;
  error?: string;
  message?: string;
};

export default function LicensePage() {
  const { t, lang } = useSiteLang();
  const [, navigate] = useLocation();
  const search = useSearch();
  const initial = useMemo(() => new URLSearchParams(search).get("serial") ?? "", [search]);
  const [serial, setSerial] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [info, setInfo] = useState("");
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true);
    setErr("");
    setInfo("");
    setToken("");
    try {
      const r = await fetch("/api/lic/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serial: serial.trim(), appVersion: "0.1.07", nonce: crypto.randomUUID() }),
      });
      const j = (await r.json()) as ActivateRes;
      if (!r.ok) {
        setErr(j.message || j.error || t(LIC.errPortal));
        return;
      }
      if (j.license?.token) {
        setToken(j.license.token);
        setInfo(t(LIC.ok));
      } else {
        setInfo(j.status || "ok");
      }
    } catch {
      setErr(t(LIC.errPortal));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
  };

  const download = () => {
    if (!token) return;
    const blob = new Blob([token + "\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ham-cockpit-${serial.replace(/[^0-9a-fA-F]/g, "").slice(0, 16) || "license"}.lic`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="container max-w-2xl flex-1 pt-24 pb-16">
        <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">{t(LIC.kicker)}</p>
        <h1 className="mb-3 font-['Space_Grotesk'] text-3xl font-bold text-white">{t(LIC.title)}</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#94a3b8]">{t(LIC.lead)}</p>
        <p className="mb-6 text-xs text-[#64748b]">{t(LIC.noRefund)}</p>

        <label className="mb-1 block text-sm text-[#94a3b8]">{t(LIC.serial)}</label>
        <input
          className="mb-4 w-full rounded-md border border-[rgba(79,195,247,0.25)] bg-[#132033] px-3 py-2 font-mono text-sm text-white"
          value={serial}
          placeholder={t(LIC.serialPh)}
          onChange={(e) => setSerial(e.target.value)}
        />

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || !serial.trim()}
            onClick={() => void run()}
            className="rounded-md bg-[#4fc3f7] px-4 py-2 text-sm font-semibold text-[#0d1b2a] disabled:opacity-40"
          >
            {busy ? t(LIC.working) : t(LIC.activate)}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/comprar?serial=${encodeURIComponent(serial.trim())}&lang=${lang}`)}
            className="rounded-md border border-[rgba(79,195,247,0.35)] px-4 py-2 text-sm text-[#4fc3f7]"
          >
            {t(LIC.buy)}
          </button>
        </div>

        {err ? <p className="mb-4 text-sm text-red-400">{err}</p> : null}
        {info ? <p className="mb-4 text-sm text-emerald-400">{info}</p> : null}

        {token ? (
          <div className="rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
            <p className="mb-2 text-sm text-[#94a3b8]">{t(LIC.token)}</p>
            <textarea readOnly className="mb-3 h-28 w-full resize-none rounded bg-[#0d1b2a] p-2 font-mono text-xs text-[#e2e8f0]" value={token} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copy()} className="rounded-md bg-[#4fc3f7] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a]">
                {t(LIC.copy)}
              </button>
              <button type="button" onClick={download} className="rounded-md border border-[rgba(79,195,247,0.35)] px-3 py-1.5 text-sm text-[#4fc3f7]">
                {t(LIC.download)}
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
