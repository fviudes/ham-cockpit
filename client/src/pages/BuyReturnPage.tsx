import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import NavBar from "@/components/NavBar";
import type { PixCheckoutInfo } from "@shared/pix-checkout";
import { useSiteLang } from "./site-lang";
import { BUY_RET, LIC } from "./license-copy";

type Status = {
  status?: string;
  provider?: string;
  license?: { token?: string };
  serialDisplay?: string;
  pix?: PixCheckoutInfo;
  message?: string;
  error?: string;
};

function brl(cents: number) {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

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
        const delay = j.pix ? 5000 : 2000;
        window.setTimeout(() => void tick(), delay);
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
  const pix = st?.pix;
  const pixPending = Boolean(pix && !paid && !failed);

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="container max-w-2xl flex-1 pt-24 pb-16">
        <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">{t(BUY_RET.kicker)}</p>
        {!pid ? <p className="text-sm text-red-400">pid ausente</p> : null}
        {err ? <p className="text-sm text-red-400">{err}</p> : null}

        {pixPending ? (
          <>
            <h1 className="mb-3 font-['Space_Grotesk'] text-3xl font-bold text-white">{t(BUY_RET.pixTitle)}</h1>
            <p className="mb-6 whitespace-pre-line text-sm leading-relaxed text-[#94a3b8]">{t(BUY_RET.pixSteps)}</p>
            <div className="mb-6 space-y-3 rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
              <p className="text-sm text-[#94a3b8]">{t(BUY_RET.pixAmount)}</p>
              <p className="font-['Space_Grotesk'] text-2xl font-bold text-[#4fc3f7]">{brl(pix!.amountCents)}</p>
              <button
                type="button"
                className="rounded-md border border-[rgba(79,195,247,0.35)] px-3 py-1.5 text-xs text-[#4fc3f7]"
                onClick={() => void navigator.clipboard.writeText(brl(pix!.amountCents))}
              >
                {t(BUY_RET.copyAmount)}
              </button>
              <hr className="border-[rgba(79,195,247,0.12)]" />
              <p className="text-sm text-[#94a3b8]">{t(BUY_RET.pixKeyLabel)}</p>
              <p className="font-mono text-lg text-white">{pix!.phoneDisplay}</p>
              <button
                type="button"
                className="rounded-md border border-[rgba(79,195,247,0.35)] px-3 py-1.5 text-xs text-[#4fc3f7]"
                onClick={() => void navigator.clipboard.writeText(pix!.phoneKey)}
              >
                {t(BUY_RET.copyKey)}
              </button>
              <p className="text-sm text-[#94a3b8]">{t(BUY_RET.pixPayee)}</p>
              <p className="text-white">{pix!.payeeName}</p>
              <p className="text-sm text-[#94a3b8]">{t(BUY_RET.pixSerial)}</p>
              <p className="font-mono text-sm text-white">{pix!.serialDisplay}</p>
              {pix!.callsign ? (
                <>
                  <p className="text-sm text-[#94a3b8]">{t(BUY_RET.pixCallsign)}</p>
                  <p className="font-mono text-sm text-white">{pix!.callsign}</p>
                </>
              ) : null}
            </div>
            <p className="text-sm text-[#94a3b8]">{t(BUY_RET.pixWaiting)}</p>
          </>
        ) : null}

        {!err && !paid && !failed && !pixPending ? <p className="text-sm text-[#94a3b8]">{t(BUY_RET.waiting)}</p> : null}
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