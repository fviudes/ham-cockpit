import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { useSiteLang } from "./site-lang";
import { ADM, LIC } from "./license-copy";

type Me = { ok?: boolean; csrf?: string; role?: string };
type Summary = { devices?: number; trialsActive?: number; definitive?: number; paid?: number };
type LicRow = { id: string; serial: string; type: string; status: string; issuedAt: number; expiresAt: number | null };
type PayRow = { id: string; provider: string; status: string; currency: string; amount_cents: number; created_at: number };
type Provider = {
  id: string;
  label: string;
  enabled: boolean;
  mode: string;
  currencyMode: string;
  missing: string[];
  secretNames: string[];
  webhookUrl: string;
  status: string;
};

async function api<T>(path: string, init?: RequestInit & { csrf?: string }): Promise<{ ok: boolean; status: number; body: T }> {
  const headers = new Headers(init?.headers);
  if (init?.csrf) headers.set("x-hc-csrf", init.csrf);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const r = await fetch(path, { ...init, headers, credentials: "include" });
  const body = (await r.json()) as T;
  return { ok: r.ok, status: r.status, body };
}

export default function AdminPortalPage() {
  const { t } = useSiteLang();
  const [tab, setTab] = useState<"lic" | "price" | "prov" | "pay">("lic");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [csrf, setCsrf] = useState("");
  const [err, setErr] = useState("");
  const [adminReady, setAdminReady] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [licenses, setLicenses] = useState<LicRow[]>([]);
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [usd, setUsd] = useState("29.00");
  const [spread, setSpread] = useState("3");
  const [priceInfo, setPriceInfo] = useState("");
  const [grantSerial, setGrantSerial] = useState("");
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});

  const authed = !!csrf;

  const refresh = useCallback(async () => {
    const me = await api<Me>("/api/admin/me");
    if (!me.ok || !me.body.csrf) {
      setCsrf("");
      return;
    }
    setCsrf(me.body.csrf);
    const [s, l, p, pr, pricing] = await Promise.all([
      api<Summary>("/api/admin/summary"),
      api<{ items: LicRow[] }>("/api/admin/licenses"),
      api<{ items: PayRow[] }>("/api/admin/payments"),
      api<{ providers: Provider[] }>("/api/admin/providers"),
      api<{ configured?: boolean; price?: { usdCents: number; fxSpreadBps: number }; preview?: { brlCents?: number } }>("/api/admin/pricing"),
    ]);
    if (s.ok) setSummary(s.body);
    if (l.ok) setLicenses(l.body.items || []);
    if (p.ok) setPayments(p.body.items || []);
    if (pr.ok) setProviders(pr.body.providers || []);
    if (pricing.ok && pricing.body.price) {
      setUsd((pricing.body.price.usdCents / 100).toFixed(2));
      setSpread(String(pricing.body.price.fxSpreadBps / 100));
      setPriceInfo(pricing.body.preview?.brlCents != null ? `≈ R$ ${(pricing.body.preview.brlCents / 100).toFixed(2)}` : "");
    }
  }, []);

  useEffect(() => {
    void refresh();
    void api<{ adminConfigured?: boolean }>("/api/health").then(h => {
      if (h.ok) setAdminReady(!!h.body.adminConfigured);
    });
  }, [refresh]);

  const login = async () => {
    setErr("");
    const r = await api<Me & { message?: string }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok || !r.body.csrf) {
      setErr((r.body as { message?: string }).message || "Falha no login");
      return;
    }
    setCsrf(r.body.csrf);
    setUsername("");
    setPassword("");
    setAdminReady(true);
    await refresh();
  };

  const logout = async () => {
    await api("/api/admin/logout", { method: "POST", csrf });
    setCsrf("");
  };

  const savePrice = async () => {
    const r = await api<{ message?: string }>("/api/admin/pricing", {
      method: "PUT",
      csrf,
      body: JSON.stringify({ usd, spreadBps: Math.round(Number(spread) * 100) }),
    });
    if (!r.ok) setErr(r.body.message || "erro");
    else await refresh();
  };

  const grant = async () => {
    const r = await api<{ message?: string }>("/api/admin/licenses/grant", {
      method: "POST",
      csrf,
      body: JSON.stringify({ serial: grantSerial, type: "definitive", reason: "cortesia" }),
    });
    if (!r.ok) setErr(r.body.message || "erro");
    else {
      setGrantSerial("");
      await refresh();
    }
  };

  const chip = (id: typeof tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-md px-3 py-1.5 text-sm ${tab === id ? "bg-[#4fc3f7] text-[#0d1b2a]" : "border border-[rgba(79,195,247,0.3)] text-[#4fc3f7]"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="container max-w-4xl flex-1 pt-24 pb-16">
        <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">{t(ADM.kicker)}</p>
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="font-['Space_Grotesk'] text-3xl font-bold text-white">{t(ADM.title)}</h1>
          {authed ? (
            <button type="button" onClick={() => void logout()} className="text-sm text-[#94a3b8] hover:text-white">
              {t(ADM.logout)}
            </button>
          ) : null}
        </div>

        {err ? <p className="mb-4 text-sm text-red-400">{err}</p> : null}

        {!authed ? (
          <div className="max-w-md rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
            <label className="mb-1 block text-sm text-[#94a3b8]">{t(ADM.username)}</label>
            <input
              className="mb-3 w-full rounded-md border border-[rgba(79,195,247,0.25)] bg-[#0d1b2a] px-3 py-2 text-sm text-white"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              autoComplete="username"
              name="username"
            />
            <label className="mb-1 block text-sm text-[#94a3b8]">{t(ADM.password)}</label>
            <input
              className="mb-4 w-full rounded-md border border-[rgba(79,195,247,0.25)] bg-[#0d1b2a] px-3 py-2 text-sm text-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              name="password"
              onKeyDown={(e) => {
                if (e.key === "Enter") void login();
              }}
            />
            <button type="button" onClick={() => void login()} className="rounded-md bg-[#4fc3f7] px-4 py-2 text-sm font-semibold text-[#0d1b2a]">
              {t(ADM.login)}
            </button>
            {adminReady === false ? <p className="mt-3 text-xs text-[#64748b]">{t(ADM.notConfigured)}</p> : null}
          </div>
        ) : (
          <>
            {summary ? (
              <p className="mb-4 text-sm text-[#94a3b8]">
                Dispositivos {summary.devices ?? 0} · Trials ativos {summary.trialsActive ?? 0} · Definitivas {summary.definitive ?? 0} · Pagos{" "}
                {summary.paid ?? 0}
              </p>
            ) : null}
            <div className="mb-5 flex flex-wrap gap-2">
              {chip("lic", t(ADM.tabLic))}
              {chip("price", t(ADM.tabPrice))}
              {chip("prov", t(ADM.tabProv))}
              {chip("pay", t(ADM.tabPay))}
              <button type="button" onClick={() => void refresh()} className="text-sm text-[#94a3b8]">
                {t(ADM.refresh)}
              </button>
            </div>

            {tab === "lic" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <input
                    className="rounded-md border border-[rgba(79,195,247,0.25)] bg-[#132033] px-3 py-2 font-mono text-sm text-white"
                    placeholder={t(LIC.serialPh)}
                    value={grantSerial}
                    onChange={(e) => setGrantSerial(e.target.value)}
                  />
                  <button type="button" onClick={() => void grant()} className="rounded-md bg-[#4fc3f7] px-3 py-2 text-sm font-semibold text-[#0d1b2a]">
                    {t(ADM.grant)}
                  </button>
                </div>
                <div className="overflow-x-auto rounded-md border border-[rgba(79,195,247,0.15)]">
                  <table className="min-w-full text-left text-sm text-[#e2e8f0]">
                    <thead className="bg-[#132033] text-[#94a3b8]">
                      <tr>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Serial</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {licenses.map((l) => (
                        <tr key={l.id} className="border-t border-[rgba(79,195,247,0.08)]">
                          <td className="px-3 py-2 font-mono text-xs">{l.id}</td>
                          <td className="px-3 py-2 font-mono text-xs">{l.serial}</td>
                          <td className="px-3 py-2">{l.type}</td>
                          <td className="px-3 py-2">{l.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === "price" ? (
              <div className="max-w-md space-y-3 rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
                <label className="block text-sm text-[#94a3b8]">{t(ADM.usd)}</label>
                <input className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-white" value={usd} onChange={(e) => setUsd(e.target.value)} />
                <label className="block text-sm text-[#94a3b8]">{t(ADM.spread)}</label>
                <input className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-white" value={spread} onChange={(e) => setSpread(e.target.value)} />
                {priceInfo ? <p className="text-sm text-[#4fc3f7]">{priceInfo}</p> : null}
                <button type="button" onClick={() => void savePrice()} className="rounded-md bg-[#4fc3f7] px-4 py-2 text-sm font-semibold text-[#0d1b2a]">
                  {t(ADM.save)}
                </button>
              </div>
            ) : null}

            {tab === "prov" ? (
              <div className="space-y-4">
                {providers.map((p) => (
                  <div key={p.id} className="rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold text-white">
                        {p.label} · {p.status}
                      </h2>
                      <label className="flex items-center gap-2 text-sm text-[#94a3b8]">
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          onChange={(e) =>
                            void api(`/api/admin/providers/${p.id}`, {
                              method: "PUT",
                              csrf,
                              body: JSON.stringify({ enabled: e.target.checked }),
                            }).then(() => refresh())
                          }
                        />
                        {t(ADM.enable)}
                      </label>
                    </div>
                    <p className="mb-2 text-xs text-[#64748b]">
                      {t(ADM.mode)}: {p.mode} · {p.currencyMode}
                    </p>
                    <p className="mb-2 break-all font-mono text-xs text-[#94a3b8]">
                      {t(ADM.webhook)}: {p.webhookUrl}
                    </p>
                    <p className="mb-2 text-sm text-[#94a3b8]">{t(ADM.secrets)}</p>
                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      {p.secretNames.map((name) => (
                        <input
                          key={name}
                          type="password"
                          placeholder={name}
                          className="rounded-md bg-[#0d1b2a] px-3 py-2 font-mono text-xs text-white"
                          value={secretDraft[`${p.id}:${name}`] || ""}
                          onChange={(e) => setSecretDraft((d) => ({ ...d, [`${p.id}:${name}`]: e.target.value }))}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-[#4fc3f7] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a]"
                        onClick={() => {
                          const values: Record<string, string> = {};
                          for (const name of p.secretNames) {
                            const v = secretDraft[`${p.id}:${name}`];
                            if (v) values[name] = v;
                          }
                          void api(`/api/admin/providers/${p.id}/secrets`, {
                            method: "PUT",
                            csrf,
                            body: JSON.stringify({ mode: p.mode, values }),
                          }).then(() => refresh());
                        }}
                      >
                        {t(ADM.save)}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-[rgba(79,195,247,0.35)] px-3 py-1.5 text-sm text-[#4fc3f7]"
                        onClick={() => void api(`/api/admin/providers/${p.id}/test`, { method: "POST", csrf, body: "{}" }).then(() => refresh())}
                      >
                        {t(ADM.test)}
                      </button>
                    </div>
                    {p.missing.length ? <p className="mt-2 text-xs text-amber-400">Faltam: {p.missing.join(", ")}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "pay" ? (
              <div className="overflow-x-auto rounded-md border border-[rgba(79,195,247,0.15)]">
                <table className="min-w-full text-left text-sm text-[#e2e8f0]">
                  <thead className="bg-[#132033] text-[#94a3b8]">
                    <tr>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Provedor</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-[rgba(79,195,247,0.08)]">
                        <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                        <td className="px-3 py-2">{p.provider}</td>
                        <td className="px-3 py-2">{p.status}</td>
                        <td className="px-3 py-2">
                          {p.currency} {(p.amount_cents / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
