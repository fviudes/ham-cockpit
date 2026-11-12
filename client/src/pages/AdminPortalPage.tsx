import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { useSiteLang } from "./site-lang";
import { ADM, LIC } from "./license-copy";

type Me = { ok?: boolean; id?: string; csrf?: string; role?: string; username?: string };
type Summary = { devices?: number; trialsActive?: number; definitive?: number; paid?: number };
type LicRow = {
  id: string;
  serial: string;
  token?: string;
  type: string;
  status: string;
  issuedAt: number;
  licensedAt?: number | null;
  callsign?: string | null;
  email?: string | null;
  expiresAt: number | null;
};

function formatLicensedAt(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  return new Date(sec * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
type PayRow = { id: string; provider: string; status: string; currency: string; amount_cents: number; created_at: number };
type UserRow = {
  id: string;
  username: string | null;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "viewer" | string;
  status: "active" | "disabled" | string;
  createdAt: number;
  lastLoginAt: number | null;
};
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

type Tab = "lic" | "price" | "prov" | "pay" | "users";

function parseDecimal(raw: string): number {
  return Number.parseFloat(String(raw ?? "").trim().replace(",", "."));
}

function formatUsdFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatSpreadPct(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : String(pct);
}

function truncateKey(token: string, head = 18, tail = 10): string {
  if (token.length <= head + tail + 1) return token;
  return `${token.slice(0, head)}…${token.slice(-tail)}`;
}

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
  const [tab, setTab] = useState<Tab>("lic");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [csrf, setCsrf] = useState("");
  const [meId, setMeId] = useState("");
  const [meRole, setMeRole] = useState("");
  const [err, setErr] = useState("");
  const [adminReady, setAdminReady] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [licenses, setLicenses] = useState<LicRow[]>([]);
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usd, setUsd] = useState("29.00");
  const [spread, setSpread] = useState("3");
  const [priceInfo, setPriceInfo] = useState("");
  const [grantSerial, setGrantSerial] = useState("");
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<"create" | "edit" | "password" | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<"owner" | "admin" | "viewer">("admin");
  const [formStatus, setFormStatus] = useState<"active" | "disabled">("active");
  const [formPassword, setFormPassword] = useState("");
  const [formPasswordConfirm, setFormPasswordConfirm] = useState("");
  const [editingLic, setEditingLic] = useState<LicRow | null>(null);
  const [licStatus, setLicStatus] = useState<"active" | "expired" | "revoked" | "superseded">("active");
  const [licType, setLicType] = useState<"trial" | "definitive">("trial");
  const [licEmail, setLicEmail] = useState("");
  const [licCallsign, setLicCallsign] = useState("");

  const authed = !!csrf;
  const canManageUsers = meRole === "owner";

  const applyPricing = (pricing: {
    configured?: boolean;
    price?: { usdCents?: number; usd_cents?: number; fxSpreadBps?: number; fx_spread_bps?: number } | null;
    preview?: { brlCents?: number | null };
  }) => {
    const pr = pricing.price;
    if (!pr) return;
    const usdCents = Number(pr.usdCents ?? pr.usd_cents);
    const spreadBps = Number(pr.fxSpreadBps ?? pr.fx_spread_bps ?? 300);
    if (Number.isFinite(usdCents)) setUsd(formatUsdFromCents(usdCents));
    if (Number.isFinite(spreadBps)) setSpread(formatSpreadPct(spreadBps));
    else setSpread("3");
    const brl = pricing.preview?.brlCents;
    setPriceInfo(brl != null && Number.isFinite(brl) ? `≈ R$ ${(brl / 100).toFixed(2)}` : "");
  };

  const refresh = useCallback(async () => {
    const me = await api<Me>("/api/admin/me");
    if (!me.ok || !me.body.csrf) {
      setCsrf("");
      setMeId("");
      setMeRole("");
      return;
    }
    setCsrf(me.body.csrf);
    setMeId(me.body.id || "");
    setMeRole(me.body.role || "");
    const tasks: Promise<unknown>[] = [
      api<Summary>("/api/admin/summary").then(s => {
        if (s.ok) setSummary(s.body);
      }),
      api<{ items: LicRow[] }>("/api/admin/licenses").then(l => {
        if (l.ok) setLicenses(l.body.items || []);
      }),
      api<{ items: PayRow[] }>("/api/admin/payments").then(p => {
        if (p.ok) setPayments(p.body.items || []);
      }),
      api<{ providers: Provider[] }>("/api/admin/providers").then(pr => {
        if (pr.ok) setProviders(pr.body.providers || []);
      }),
      api<{
        configured?: boolean;
        price?: { usdCents?: number; usd_cents?: number; fxSpreadBps?: number; fx_spread_bps?: number } | null;
        preview?: { brlCents?: number | null };
      }>("/api/admin/pricing").then(pricing => {
        if (pricing.ok) applyPricing(pricing.body);
      }),
    ];
    if (me.body.role === "owner") {
      tasks.push(
        api<{ users: UserRow[] }>("/api/admin/users").then(u => {
          if (u.ok) setUsers(u.body.users || []);
        }),
      );
    } else {
      setUsers([]);
    }
    await Promise.all(tasks);
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
    setMeRole(r.body.role || "");
    setUsername("");
    setPassword("");
    setAdminReady(true);
    await refresh();
  };

  const logout = async () => {
    await api("/api/admin/logout", { method: "POST", csrf });
    setCsrf("");
    setMeId("");
    setMeRole("");
  };

  const savePrice = async () => {
    setErr("");
    const usdNum = parseDecimal(usd);
    const spreadPct = parseDecimal(spread);
    if (!Number.isFinite(usdNum) || usdNum <= 0) {
      setErr("Informe um preço USD válido.");
      return;
    }
    if (!Number.isFinite(spreadPct) || spreadPct < 0) {
      setErr("Informe um spread válido (padrão 3).");
      return;
    }
    const r = await api<{ message?: string; price?: { usdCents?: number; fxSpreadBps?: number } }>(
      "/api/admin/pricing",
      {
        method: "PUT",
        csrf,
        body: JSON.stringify({ usd: usdNum.toFixed(2), spreadBps: Math.round(spreadPct * 100) }),
      },
    );
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

  const statusLabel = (status: string) => {
    if (status === "active") return t(ADM.stActive);
    if (status === "expired") return t(ADM.stExpired);
    if (status === "revoked") return t(ADM.stRevoked);
    if (status === "superseded") return t(ADM.stSuperseded);
    return status;
  };

  const typeLabel = (type: string) => {
    if (type === "trial") return t(ADM.typeTrial);
    if (type === "definitive") return t(ADM.typeDefinitive);
    return type;
  };

  const openEditLicense = (l: LicRow) => {
    setEditingLic(l);
    const st =
      l.status === "expired" || l.status === "revoked" || l.status === "superseded" || l.status === "active"
        ? l.status
        : "active";
    setLicStatus(st);
    setLicType(l.type === "definitive" ? "definitive" : "trial");
    setLicEmail(l.email || "");
    setLicCallsign(l.callsign || "");
    setErr("");
  };

  const submitLicenseEdit = async () => {
    if (!editingLic) return;
    setErr("");
    const r = await api<{ message?: string }>(`/api/admin/licenses/${editingLic.id}`, {
      method: "PATCH",
      csrf,
      body: JSON.stringify({
        status: licStatus,
        type: licType,
        email: licEmail.trim() ? licEmail.trim() : null,
        callsign: licCallsign.trim() ? licCallsign.trim() : null,
      }),
    });
    if (!r.ok) {
      setErr(r.body.message || "Não foi possível salvar a licença.");
      return;
    }
    setEditingLic(null);
    await refresh();
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setFormUsername("");
    setFormName("");
    setFormRole("admin");
    setFormStatus("active");
    setFormPassword("");
    setFormPasswordConfirm("");
    setUserForm("create");
    setErr("");
  };

  const openEditUser = (u: UserRow) => {
    setEditingUser(u);
    setFormUsername(u.username || "");
    setFormName(u.name || "");
    setFormRole((u.role as "owner" | "admin" | "viewer") || "admin");
    setFormStatus(u.status === "disabled" ? "disabled" : "active");
    setFormPassword("");
    setFormPasswordConfirm("");
    setUserForm("edit");
    setErr("");
  };

  const openPasswordUser = (u: UserRow) => {
    setEditingUser(u);
    setFormPassword("");
    setFormPasswordConfirm("");
    setUserForm("password");
    setErr("");
  };

  const passwordFieldsOk = () => {
    if (!formPassword) {
      setErr(t(ADM.passwordRequired));
      return false;
    }
    if (formPassword !== formPasswordConfirm) {
      setErr(t(ADM.passwordMismatch));
      return false;
    }
    return true;
  };

  const submitUserForm = async () => {
    setErr("");
    if (userForm === "create") {
      if (!passwordFieldsOk()) return;
      const r = await api<{ message?: string }>("/api/admin/users", {
        method: "POST",
        csrf,
        body: JSON.stringify({
          username: formUsername,
          password: formPassword,
          passwordConfirm: formPasswordConfirm,
          role: formRole,
          name: formName || undefined,
        }),
      });
      if (!r.ok) {
        setErr(r.body.message || "Não foi possível criar o usuário.");
        return;
      }
    } else if (userForm === "edit" && editingUser) {
      const r = await api<{ message?: string }>(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        csrf,
        body: JSON.stringify({
          username: formUsername,
          name: formName,
          role: formRole,
          status: formStatus,
        }),
      });
      if (!r.ok) {
        setErr(r.body.message || "Não foi possível alterar o usuário.");
        return;
      }
    } else if (userForm === "password" && editingUser) {
      if (!passwordFieldsOk()) return;
      const r = await api<{ message?: string }>(`/api/admin/users/${editingUser.id}/password`, {
        method: "POST",
        csrf,
        body: JSON.stringify({ password: formPassword, passwordConfirm: formPasswordConfirm }),
      });
      if (!r.ok) {
        setErr(r.body.message || "Não foi possível alterar a senha.");
        return;
      }
    }
    setUserForm(null);
    setEditingUser(null);
    await refresh();
  };

  const deleteUser = async (u: UserRow) => {
    if (!window.confirm(t(ADM.confirmDelete))) return;
    setErr("");
    const r = await api<{ message?: string }>(`/api/admin/users/${u.id}`, { method: "DELETE", csrf });
    if (!r.ok) {
      setErr(r.body.message || "Não foi possível excluir.");
      return;
    }
    if (u.id === meId) {
      setCsrf("");
      setMeId("");
      return;
    }
    await refresh();
  };

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      setErr("Não foi possível copiar a chave.");
    }
  };

  const chip = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-md px-3 py-1.5 text-sm ${tab === id ? "bg-[#4fc3f7] text-[#0d1b2a]" : "border border-[rgba(79,195,247,0.3)] text-[#4fc3f7]"}`}
    >
      {label}
    </button>
  );

  const inputCls = "w-full rounded-md border border-[rgba(79,195,247,0.25)] bg-[#0d1b2a] px-3 py-2 text-sm text-white";
  const btnPrimary = "rounded-md bg-[#4fc3f7] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a]";
  const btnGhost = "rounded-md border border-[rgba(79,195,247,0.35)] px-2 py-1 text-xs text-[#4fc3f7]";

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 pt-24 pb-16 sm:px-4 lg:px-5">
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
              {canManageUsers ? chip("users", t(ADM.tabUsers)) : null}
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

                {editingLic ? (
                  <div className="max-w-lg space-y-3 rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
                    <h2 className="font-semibold text-white">
                      {t(ADM.editLicense)} · <span className="font-mono text-sm text-[#94a3b8]">{editingLic.id}</span>
                    </h2>
                    <label className="block text-sm text-[#94a3b8]">{t(ADM.status)}</label>
                    <select
                      className={inputCls}
                      value={licStatus}
                      onChange={(e) => setLicStatus(e.target.value as "active" | "expired" | "revoked" | "superseded")}
                    >
                      <option value="active">{t(ADM.stActive)}</option>
                      <option value="expired">{t(ADM.stExpired)}</option>
                      <option value="revoked">{t(ADM.stRevoked)}</option>
                      <option value="superseded">{t(ADM.stSuperseded)}</option>
                    </select>
                    <label className="block text-sm text-[#94a3b8]">{t(ADM.type)}</label>
                    <select
                      className={inputCls}
                      value={licType}
                      onChange={(e) => setLicType(e.target.value as "trial" | "definitive")}
                    >
                      <option value="trial">{t(ADM.typeTrial)}</option>
                      <option value="definitive">{t(ADM.typeDefinitive)}</option>
                    </select>
                    <label className="block text-sm text-[#94a3b8]">{t(ADM.email)}</label>
                    <input
                      className={inputCls}
                      type="email"
                      value={licEmail}
                      onChange={(e) => setLicEmail(e.target.value)}
                      autoComplete="off"
                    />
                    <label className="block text-sm text-[#94a3b8]">{t(ADM.callsign)}</label>
                    <input
                      className={inputCls}
                      value={licCallsign}
                      onChange={(e) => setLicCallsign(e.target.value.toUpperCase())}
                      autoComplete="off"
                      placeholder="PY2ABC"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btnPrimary} onClick={() => void submitLicenseEdit()}>
                        {t(ADM.save)}
                      </button>
                      <button type="button" className={btnGhost} onClick={() => setEditingLic(null)}>
                        {t(ADM.cancel)}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="-mx-1 overflow-x-auto rounded-md border border-[rgba(79,195,247,0.15)] sm:mx-0">
                  <table className="w-full min-w-[1100px] table-fixed text-left text-sm text-[#e2e8f0]">
                    <thead className="bg-[#132033] text-[#94a3b8]">
                      <tr>
                        <th className="px-2 py-2 font-medium">ID</th>
                        <th className="px-2 py-2 font-medium">Serial</th>
                        <th className="px-2 py-2 font-medium">{t(ADM.callsign)}</th>
                        <th className="px-2 py-2 font-medium">{t(ADM.email)}</th>
                        <th className="px-2 py-2 font-medium">{t(ADM.licenseKey)}</th>
                        <th className="px-2 py-2 font-medium">{t(ADM.type)}</th>
                        <th className="px-2 py-2 font-medium">{t(ADM.status)}</th>
                        <th className="px-2 py-2 font-medium whitespace-nowrap">Licenciamento</th>
                        <th className="px-2 py-2 font-medium">{t(ADM.actions)}</th>
                      </tr>
                    </thead>
                    <colgroup>
                      <col className="w-[11%]" />
                      <col className="w-[12%]" />
                      <col className="w-[8%]" />
                      <col className="w-[14%]" />
                      <col className="w-[22%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      <col className="w-[11%]" />
                      <col className="w-[6%]" />
                    </colgroup>
                    <tbody>
                      {licenses.map((l) => {
                        const token = l.token || "";
                        const open = expandedToken === l.id;
                        return (
                          <tr key={l.id} className="border-t border-[rgba(79,195,247,0.08)] align-top">
                            <td className="px-2 py-2 font-mono text-xs break-all">{l.id}</td>
                            <td className="px-2 py-2 font-mono text-xs break-all">{l.serial}</td>
                            <td className="px-2 py-2">
                              {l.callsign ? (
                                <span className="rounded border border-[#ffb300]/35 bg-[#ffb300]/10 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-[#ffb300]">
                                  {l.callsign}
                                </span>
                              ) : (
                                <span className="text-xs text-[#64748b]">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-xs text-[#94a3b8] break-all">{l.email || "—"}</td>
                            <td className="px-2 py-2">
                              {token ? (
                                <div className="space-y-1">
                                  <p className={`font-mono text-xs text-[#94a3b8] ${open ? "break-all" : "truncate"}`}>
                                    {open ? token : truncateKey(token)}
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    <button type="button" className={btnGhost} onClick={() => void copyToken(token)}>
                                      {t(ADM.copy)}
                                    </button>
                                    <button
                                      type="button"
                                      className={btnGhost}
                                      onClick={() => setExpandedToken(open ? null : l.id)}
                                    >
                                      {open ? t(ADM.hideFull) : t(ADM.showFull)}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-[#64748b]">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{typeLabel(l.type)}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{statusLabel(l.status)}</td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-[#94a3b8]">
                              {formatLicensedAt(l.licensedAt ?? l.issuedAt)}
                            </td>
                            <td className="px-2 py-2">
                              <button type="button" className={btnGhost} onClick={() => openEditLicense(l)}>
                                {t(ADM.editLicense)}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === "price" ? (
              <div className="max-w-md space-y-3 rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
                <label className="block text-sm text-[#94a3b8]">{t(ADM.usd)}</label>
                <input className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-white" value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="decimal" />
                <label className="block text-sm text-[#94a3b8]">{t(ADM.spread)}</label>
                <input className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-white" value={spread} onChange={(e) => setSpread(e.target.value)} inputMode="decimal" />
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

            {tab === "users" && canManageUsers ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-[#94a3b8]">Contas com acesso ao portal admin.</p>
                  <button type="button" className={btnPrimary} onClick={openCreateUser}>
                    {t(ADM.addUser)}
                  </button>
                </div>

                {userForm ? (
                  <div className="max-w-md space-y-3 rounded-md border border-[rgba(79,195,247,0.2)] bg-[#132033] p-4">
                    <h2 className="font-semibold text-white">
                      {userForm === "create" ? t(ADM.addUser) : userForm === "password" ? t(ADM.changePassword) : t(ADM.editUser)}
                      {editingUser?.username ? ` · ${editingUser.username}` : ""}
                    </h2>
                    {userForm !== "password" ? (
                      <>
                        <label className="block text-sm text-[#94a3b8]">{t(ADM.username)}</label>
                        <input className={inputCls} value={formUsername} onChange={(e) => setFormUsername(e.target.value)} autoComplete="off" />
                        <label className="block text-sm text-[#94a3b8]">{t(ADM.name)}</label>
                        <input className={inputCls} value={formName} onChange={(e) => setFormName(e.target.value)} />
                        <label className="block text-sm text-[#94a3b8]">{t(ADM.role)}</label>
                        <select className={inputCls} value={formRole} onChange={(e) => setFormRole(e.target.value as "owner" | "admin" | "viewer")}>
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="viewer">viewer</option>
                        </select>
                      </>
                    ) : null}
                    {userForm === "edit" ? (
                      <>
                        <label className="block text-sm text-[#94a3b8]">{t(ADM.status)}</label>
                        <select className={inputCls} value={formStatus} onChange={(e) => setFormStatus(e.target.value as "active" | "disabled")}>
                          <option value="active">{t(ADM.active)}</option>
                          <option value="disabled">{t(ADM.disabled)}</option>
                        </select>
                      </>
                    ) : null}
                    {userForm === "create" || userForm === "password" ? (
                      <>
                        <label className="block text-sm text-[#94a3b8]">{t(ADM.password)}</label>
                        <input
                          className={inputCls}
                          type="password"
                          value={formPassword}
                          onChange={(e) => setFormPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                        <label className="block text-sm text-[#94a3b8]">{t(ADM.passwordConfirm)}</label>
                        <input
                          className={inputCls}
                          type="password"
                          value={formPasswordConfirm}
                          onChange={(e) => setFormPasswordConfirm(e.target.value)}
                          autoComplete="new-password"
                        />
                        {formPasswordConfirm && formPassword !== formPasswordConfirm ? (
                          <p className="text-sm text-[#f87171]">{t(ADM.passwordMismatch)}</p>
                        ) : null}
                      </>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={
                          (userForm === "create" || userForm === "password") &&
                          (!formPassword || formPassword !== formPasswordConfirm)
                        }
                        onClick={() => void submitUserForm()}
                      >
                        {t(ADM.save)}
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => {
                          setUserForm(null);
                          setEditingUser(null);
                        }}
                      >
                        {t(ADM.cancel)}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-md border border-[rgba(79,195,247,0.15)]">
                  <table className="min-w-full text-left text-sm text-[#e2e8f0]">
                    <thead className="bg-[#132033] text-[#94a3b8]">
                      <tr>
                        <th className="px-3 py-2">{t(ADM.username)}</th>
                        <th className="px-3 py-2">{t(ADM.name)}</th>
                        <th className="px-3 py-2">{t(ADM.role)}</th>
                        <th className="px-3 py-2">{t(ADM.status)}</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-t border-[rgba(79,195,247,0.08)]">
                          <td className="px-3 py-2 font-mono text-xs">
                            {u.username || "—"}
                            {u.id === meId ? <span className="ml-1 text-[#64748b]">(você)</span> : null}
                          </td>
                          <td className="px-3 py-2">{u.name || "—"}</td>
                          <td className="px-3 py-2">{u.role}</td>
                          <td className="px-3 py-2">{u.status === "active" ? t(ADM.active) : t(ADM.disabled)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <button type="button" className={btnGhost} onClick={() => openPasswordUser(u)}>
                                {t(ADM.changePassword)}
                              </button>
                              <button type="button" className={btnGhost} onClick={() => openEditUser(u)}>
                                {t(ADM.editUser)}
                              </button>
                              <button type="button" className={btnGhost} onClick={() => void deleteUser(u)}>
                                {t(ADM.deleteUser)}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
