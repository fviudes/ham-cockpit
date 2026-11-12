import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import NavBar from "@/components/NavBar";
import { useSiteLang } from "./site-lang";
import { BUY_RET, LIC } from "./license-copy";

type Status = {
  status?: string;
  license?: { token?: string };
  message?: string;
  error?: string;
};

export default function BuyReturnPage() {
  const { t } = useSiteLang();
  const search = useSearch();
  const pid = useMemo(() => new URLSearchParams(search).get("pid") ?? "", [search]);
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!pid) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/checkout/status?pid=${encodeURIComponent(pid)}`);
        const j = (await r.json()) as Status;
        if (stop) return;
        if (!r.ok) {
          setErr(j.message || j.error || t(LIC.errPortal));
          return;
        }
        setSt(j);
        if (j.status === "paid" || j.status === "failed" || j.status === "cancelled" || j.status === "expired") return;
        window.setTimeout(() => void tick(), 2000);
      } catch {
        if (!stop) setErr(t(LIC.errPortal));
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [pid, t]);

  const token = st?.license?.token ?? "";
  const paid = st?.status === "paid";
  const failed = st && ["failed", "cancelled", "expired"].includes(st.status || "");

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="container max-w-2xl flex-1 pt-24 pb-16">
        <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">{t(BUY_RET.kicker)}</p>
        {!pid ? <p className="text-sm text-red-400">pid ausente</p> : null}
        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        {!err && !paid && !failed ? <p className="text-sm text-[#94a3b8]">{t(BUY_RET.waiting)}</p> : null}
        {paid ? (
          <>
            <h1 className="mb-3 font-['Space_Grotesk'] text-3xl font-bold text-emerald-400">{t(BUY_RET.paid)}</h1>
            <p className="mb-4 text-sm text-[#94a3b8]">{t(BUY_RET.backConsole)}</p>
            {token ? (
              <div className="rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
                <p className="mb-2 text-sm text-[#94a3b8]">{t(LIC.token)}</p>
                <textarea readOnly className="mb-3 h-28 w-full resize-none rounded bg-[#0d1b2a] p-2 font-mono text-xs text-[#e2e8f0]" value={token} />
                <button
                  type="button"
                  className="rounded-md bg-[#4fc3f7] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a]"
                  onClick={() => void navigator.clipboard.writeText(token)}
                >
                  {t(LIC.copy)}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
        {failed ? <h1 className="font-['Space_Grotesk'] text-3xl font-bold text-red-400">{t(BUY_RET.failed)}</h1> : null}
      </main>
    </div>
  );
}
