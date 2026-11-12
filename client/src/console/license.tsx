import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { isValidCallsign, normalizeCallsign } from "@shared/license";
import { useConsole } from "./state";
import { ConsoleInput, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

type LicenseBody = {
  serial?: string | null;
  serialDisplay?: string | null;
  callsign?: string | null;
  state?: string;
  type?: string | null;
  licenseId?: string | null;
  daysLeft?: number | null;
  expiresAt?: number | null;
  provisionalEndsAt?: number | null;
  locked?: boolean;
  observationOnly?: boolean;
  lastSync?: number | null;
  online?: boolean | null;
  buyUrl?: string | null;
  portalUrl?: string;
  reason?: string | null;
  clock?: { suspect?: boolean };
};

const STATE_KEY: Record<string, string> = {
  provisional: "licStProvisional",
  trial: "licStTrial",
  ativa: "licStActive",
  expirada: "licStExpired",
  sem_licenca: "licStNone",
  revogada: "licStRevoked",
  invalida: "licStNone",
  sem_serial: "licStNoSerial",
};

export function LicensePage({ embedded = false }: { embedded?: boolean }) {
  const { tx, pushLog, refreshLicense } = useConsole();
  const [info, setInfo] = useState<LicenseBody | null>(null);
  const [prefix, setPrefix] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/license");
      const j = (await r.json()) as LicenseBody;
      setInfo(j);
      if (typeof j.callsign === "string" && j.callsign) setPrefix(j.callsign);
      void refreshLicense();
    } catch {
      toast.error(tx("licErrPortal"));
    }
  }, [tx, refreshLicense]);

  useEffect(() => {
    void load();
  }, [load]);

  const prefixOk = isValidCallsign(prefix);
  const serialShown = info?.serialDisplay || info?.serial || "";

  const activate = async () => {
    const callsign = normalizeCallsign(prefix);
    if (!isValidCallsign(callsign)) {
      toast.error(tx("licErrPrefix"));
      return;
    }
    if (!info?.serial && !info?.serialDisplay) {
      toast.error(tx("licStNoSerial"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callsign, prefix: callsign }),
      });
      const j = (await r.json()) as { ok?: boolean; body?: LicenseBody; error?: string };
      if (!r.ok || !j.ok) {
        const map: Record<string, string> = {
          portal_unreachable: "licErrPortal",
          callsign_required: "licErrPrefix",
          serial_unavailable: "licStNoSerial",
        };
        toast.error(tx((map[j.error || ""] || "licErrPortal") as "licErrPortal"));
        if (j.body) setInfo(j.body);
        return;
      }
      if (j.body) {
        setInfo(j.body);
        if (j.body.callsign) setPrefix(j.body.callsign);
      }
      toast.success(tx("licOk"));
      pushLog("SYS", "licença ativada/sincronizada");
      void refreshLicense();
    } catch {
      toast.error(tx("licErrPortal"));
    } finally {
      setBusy(false);
    }
  };

  const importKey = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/license/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = (await r.json()) as { ok?: boolean; body?: LicenseBody; error?: string };
      if (!r.ok || !j.ok) {
        const map: Record<string, string> = {
          invalid_format: "licErrFormat",
          bad_signature: "licErrSig",
          serial_mismatch: "licErrSerial",
          expired: "licErrExpired",
          older_than_current: "licErrOlder",
        };
        toast.error(tx((map[j.error || ""] || "licErrFormat") as "licErrFormat"));
        if (j.body) setInfo(j.body);
        return;
      }
      if (j.body) setInfo(j.body);
      setToken("");
      toast.success(tx("licOk"));
      pushLog("SYS", "chave de licença importada");
      void refreshLicense();
    } catch {
      toast.error(tx("licErrPortal"));
    } finally {
      setBusy(false);
    }
  };

  const stateLabel = () => {
    const st = info?.state || "sem_licenca";
    const key = STATE_KEY[st] || "licStNone";
    let text = tx(key as "licStNone");
    if (st === "provisional" && info?.provisionalEndsAt) {
      const n = Math.max(0, Math.ceil((info.provisionalEndsAt - Date.now() / 1000) / 86400));
      text = text.replace("{n}", String(n));
    }
    return text;
  };

  return (
    <div>
      {!embedded ? <PageHead kicker={tx("admin")} title={tx("licTab")} /> : null}
      {info?.observationOnly ? (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{tx("licObserve")}</p>
      ) : null}
      {info?.clock?.suspect ? (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{tx("licClockSuspect")}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>{tx("licSerial")}</PanelTitle>
          {serialShown ? (
            <p className="mb-3 break-all font-mono text-lg font-semibold tracking-wide text-[#7ee0ff]">{serialShown}</p>
          ) : (
            <p className="mb-3 text-sm text-amber-200">{tx("licSerialMissing")}</p>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            <GhostBtn
              disabled={!serialShown}
              onClick={() => {
                if (serialShown) void navigator.clipboard.writeText(serialShown);
              }}
            >
              {tx("licCopy")}
            </GhostBtn>
          </div>

          <label className="mb-1 block text-sm text-[#8ea0b3]">{tx("licPrefix")}</label>
          <ConsoleInput
            className="mb-1 font-mono uppercase"
            value={prefix}
            placeholder={tx("licPrefixPh")}
            maxLength={12}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          />
          <p className="mb-4 text-xs text-[#64748b]">{tx("licPrefixHint")}</p>

          <p className="mb-1 text-sm text-[#8ea0b3]">{tx("licState")}</p>
          <p className="mb-2 text-base text-white">{stateLabel()}</p>
          {info?.daysLeft != null ? (
            <p className="mb-2 text-sm text-[#8ea0b3]">
              {tx("licValidUntil")
                .replace("{n}", String(info.daysLeft))
                .replace("{date}", info.expiresAt ? new Date(info.expiresAt * 1000).toLocaleDateString() : "—")}
            </p>
          ) : info?.state === "ativa" ? (
            <p className="mb-2 text-sm text-[#8ea0b3]">{tx("licNoExpiry")}</p>
          ) : null}
          <p className="mb-4 text-xs text-[#64748b]">
            {tx("licLastSync")}: {info?.lastSync ? new Date(info.lastSync * 1000).toLocaleString() : "—"} ·{" "}
            {info?.online === false ? tx("licOffline") : tx("licOnline")}
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryBtn disabled={busy || !prefixOk || !serialShown} onClick={() => void activate()}>
              {tx("licActivate")}
            </PrimaryBtn>
            {info?.buyUrl ? (
              <GhostBtn onClick={() => window.open(info.buyUrl!, "_blank", "noopener")}>{tx("licBuy")}</GhostBtn>
            ) : null}
          </div>
          {!prefixOk && prefix.trim() ? (
            <p className="mt-2 text-xs text-amber-200">{tx("licErrPrefix")}</p>
          ) : null}
        </Panel>

        <Panel>
          <PanelTitle>{tx("licImportTitle")}</PanelTitle>
          <p className="mb-3 text-sm text-[#8ea0b3]">{tx("licImportHint")}</p>
          <p className="mb-2 break-all font-mono text-xs text-[#64748b]">{info?.portalUrl || "https://ham-cockpit.pages.dev"}/licenca</p>
          <textarea
            className="mb-3 h-28 w-full rounded-md border border-[rgba(79,195,247,0.25)] bg-[#0d1b2a] p-2 font-mono text-xs text-white"
            placeholder={tx("licImportPlaceholder")}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <PrimaryBtn disabled={busy || !token.trim()} onClick={() => void importKey()}>
              {tx("licImportBtn")}
            </PrimaryBtn>
            <label className="cursor-pointer rounded-md border border-[rgba(79,195,247,0.35)] px-3 py-2 text-sm text-[#4fc3f7]">
              {tx("licImportFile")}
              <input
                type="file"
                accept=".lic,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void f.text().then((txt) => setToken(txt.trim()));
                }}
              />
            </label>
          </div>
        </Panel>
      </div>
    </div>
  );
}
