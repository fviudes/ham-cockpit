import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useConsole } from "./state";
import { ConsoleInput, Field, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

type WlStatus = {
  ok: boolean;
  url: string;
  port: number;
  docker: boolean;
  reason: string;
  error?: string;
  httpStatus?: number;
};

type WlDatabase = {
  ok: boolean;
  running: boolean;
  connected: boolean;
  health: string;
  deploy: string;
  compose: string;
  envFile: string;
  passwordSource: "env" | "missing";
  queryVia?: "user" | "root-socket" | "none";
  host: string;
  port: number;
  published: boolean;
  name: string;
  user: string;
  password: string;
  version: string;
  charset: string;
  collation: string;
  engine: string;
  tables: number;
  sizeBytes: number;
  url: string;
  network: string;
  volume: string;
  image?: string;
  error?: string;
  updated?: boolean;
};

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) {
    throw new Error(
      res.status === 404 ? "API ausente — reinicie o console Ham Cockpit" : `resposta não JSON (${res.status})`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`resposta não JSON (${res.status})`);
  }
}

async function callWavelog(path: "/api/wavelog/status" | "/api/wavelog/up" | "/api/wavelog/down", method: "GET" | "POST" = "GET") {
  const res = await fetch(path, { method });
  return readJson<WlStatus>(res);
}

async function callWavelogDb(path: "/api/wavelog/database" | "/api/wavelog/db-update", method: "GET" | "POST" = "GET") {
  const res = await fetch(path, { method });
  return readJson<WlDatabase>(res);
}

type WlgApi = { ok: boolean; udpPort?: number; qsyPort?: number; error?: string };

async function callWlg(path: "/api/wlg/status" | "/api/wlg/up" | "/api/wlg/down", method: "GET" | "POST" = "GET") {
  const res = await fetch(path, { method });
  return (await res.json()) as WlgApi;
}

function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function WavelogPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const w = s.wavelog;
  const g = s.wlg;
  const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  const book = `http://${host}:${w.port}`;
  const [busy, setBusy] = useState(false);
  const [dbBusy, setDbBusy] = useState(false);
  const [detail, setDetail] = useState("");
  const [db, setDb] = useState<WlDatabase | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [passBusy, setPassBusy] = useState(false);
  const [dbPower, setDbPower] = useState(false);

  const applyStatus = (st: WlStatus) => {
    setS((p) => ({ ...p, wavelog: { ...p.wavelog, running: st.ok } }));
    if (st.ok) {
      setDetail("");
      return;
    }
    if (st.reason === "no-docker") setDetail(tx("wavelogNoDocker"));
    else if (st.reason === "docker-down") setDetail(tx("wavelogDockerDown"));
    else setDetail(st.error ? `${tx("apiFail")} (${st.error})` : tx("apiFail"));
  };

  useEffect(() => {
    void callWavelog("/api/wavelog/status")
      .then(applyStatus)
      .catch((err: unknown) => setDetail(err instanceof Error ? err.message : String(err)));
    void callWlg("/api/wlg/status")
      .then((st) => setS((p) => ({ ...p, wlg: { ...p.wlg, running: st.ok } })))
      .catch(() => undefined);
    void callWavelogDb("/api/wavelog/database")
      .then(setDb)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once on open
  }, []);

  const rows = [
    ["Ham Cockpit", "/opt/ham-cockpit", "80"],
    ["Wavelog", w.folder, String(w.port)],
    ["MariaDB", db?.volume || "volume wavelog-dbdata", db?.running ? tx("wlDbUp") : tx("wlDbDown")],
    ["WaveLogGate", g.folder, `UDP ${g.udpPort}`],
    ["ser2net", s.ser2net.folder, s.ser2net.services.map((x) => String(x.tcpPort)).join(",") || "—"],
    ["rigctld IC-705", "hamlib-utils", String(g.hamlibPort)],
  ];

  const dbOn = Boolean(db?.running);
  const publicUrl = db ? `http://${host}:${w.port}/` : book;

  return (
    <div>
      <PageHead kicker={tx("wavelog")} title={tx("wavelogTitle")} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("isolationHelp")}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Wavelog" value={w.running ? tx("connected") : tx("disconnected")} on={w.running} />
        <Tile label={tx("wlDbTitle")} value={dbOn ? tx("wlDbUp") : tx("wlDbDown")} on={dbOn} />
        <Tile label={tx("wlg")} value={g.running ? tx("connected") : tx("disconnected")} on={g.running} />
        <Tile label={tx("udpListen")} value={`:${g.udpPort}`} on={g.running} />
      </div>

      <Panel className="mt-4">
        <PanelTitle>{tx("wlDbTitle")}</PanelTitle>
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-[#8ea0b3]">{tx("wlDbHelp")}</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label={tx("wlDbName")}>
            <ConsoleInput readOnly value={db?.name || "wavelog"} />
          </Field>
          <Field label={tx("wlDbUser")}>
            <ConsoleInput readOnly value={db?.user || "wavelog"} />
          </Field>
          <Field label={tx("wlDbPass")}>
            <div className="flex gap-2">
              <ConsoleInput
                readOnly
                type={showPass ? "text" : "password"}
                autoComplete="off"
                value={db?.password || ""}
                placeholder={db?.passwordSource === "missing" ? tx("wlDbPassMissing") : "••••"}
              />
              <GhostBtn
                disabled={passBusy}
                onClick={async () => {
                  if (showPass) {
                    setShowPass(false);
                    return;
                  }
                  if (db?.password) {
                    setShowPass(true);
                    return;
                  }
                  // Senha vem de endpoint próprio (lê só o .env) — não depende das consultas SQL.
                  setPassBusy(true);
                  try {
                    const r = await fetch("/api/wavelog/database/password");
                    const j = (await r.json()) as { password?: string; error?: string };
                    if (!j.password) {
                      toast.error(j.error || tx("wlDbPassMissing"));
                      return;
                    }
                    setDb((prev) => ({ ...(prev ?? ({} as WlDatabase)), password: j.password!, passwordSource: "env" }));
                    setShowPass(true);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  } finally {
                    setPassBusy(false);
                  }
                }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                <span className="ml-1">{showPass ? tx("wlDbHide") : tx("wlDbShow")}</span>
              </GhostBtn>
            </div>
          </Field>
          <Field label={tx("wlDbHost")}>
            <ConsoleInput readOnly value={db?.host || "wavelog-db"} />
          </Field>
          <Field label={tx("wlDbPort")}>
            <ConsoleInput readOnly value={String(db?.port || 3306)} />
          </Field>
          <Field label={tx("wlDbStatus")}>
            <ConsoleInput
              readOnly
              value={
                dbOn
                  ? `${tx("wlDbUp")} · ${tx("wlDbConnected")}${db?.health ? ` · ${db.health}` : ""}`
                  : `${tx("wlDbDown")}${db?.health ? ` · ${db.health}` : ""}`
              }
            />
          </Field>
          <Field label={tx("wlDbSize")}>
            <ConsoleInput readOnly value={db ? fmtBytes(db.sizeBytes) : "—"} />
          </Field>
          <Field label={tx("wlDbVersion")}>
            <ConsoleInput readOnly value={db?.version || "—"} />
          </Field>
          <Field label={tx("wlDbCharset")}>
            <ConsoleInput readOnly value={[db?.charset, db?.collation].filter(Boolean).join(" / ") || "—"} />
          </Field>
          <Field label={tx("wlDbEngine")}>
            <ConsoleInput readOnly value={db?.engine || "—"} />
          </Field>
          <Field label={tx("wlDbTables")}>
            <ConsoleInput readOnly value={db ? String(db.tables) : "—"} />
          </Field>
          <Field label={tx("wlDbDeploy")}>
            <ConsoleInput readOnly value={db && db.deploy !== "docker" ? tx("wlDbNative") : tx("wlDbDocker")} />
          </Field>
          <Field label={tx("wavelogUrl")}>
            <ConsoleInput readOnly value={publicUrl} />
          </Field>
          <Field label={tx("wlDbNetwork")}>
            <ConsoleInput readOnly value={db?.network || "wavelog"} />
          </Field>
          <Field label={tx("wlDbVolume")}>
            <ConsoleInput readOnly value={db?.volume || "wavelog-dbdata"} />
          </Field>
          <Field label={tx("wlDbImage")}>
            <ConsoleInput readOnly value={db?.image || "mariadb:11.8"} />
          </Field>
        </div>
        <p className="mt-3 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">
          {tx("wlDbNotPublished")} · {db?.envFile || "/opt/wavelog/.env"}
          {db?.queryVia === "root-socket" ? ` · ${tx("wlDbViaRoot")}` : ""}
        </p>
        {db?.error ? <p className="mt-2 text-sm text-[#f87171]">{db.error}</p> : null}
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8ea0b3]">{tx("wlDbUpdateHint")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn
            disabled={dbBusy}
            onClick={async () => {
              setDbBusy(true);
              try {
                const st = await callWavelogDb("/api/wavelog/db-update", "POST");
                setDb(st);
                if (st.updated) {
                  pushLog("WLOG", "atualização oficial Docker do Wavelog (compose pull + up; migrate no boot da imagem)");
                  toast.success(tx("wlDbUpdated"));
                } else toast.error(st.error || tx("wlDbUpdateFail"));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              } finally {
                setDbBusy(false);
              }
            }}
          >
            {dbBusy ? tx("wlDbUpdating") : tx("wlDbUpdate")}
          </PrimaryBtn>
          <GhostBtn
            disabled={dbBusy || dbPower}
            onClick={async () => {
              setDbPower(true);
              try {
                const res = await fetch(dbOn ? "/api/wavelog/db/down" : "/api/wavelog/db/up", { method: "POST" });
                const next = await readJson<WlDatabase>(res);
                setDb((prev) => ({ ...next, password: next.password || prev?.password || "" }));
                toast.success(dbOn ? tx("svcPowerOffOk") : tx("svcPowerOnOk"));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : tx("svcPowerFail"));
              } finally {
                setDbPower(false);
              }
            }}
          >
            {dbPower ? "…" : dbOn ? tx("wlDbStop") : tx("wlDbStart")}
          </GhostBtn>
          <GhostBtn
            disabled={dbBusy}
            onClick={async () => {
              try {
                setDb(await callWavelogDb("/api/wavelog/database"));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            {tx("testApi")}
          </GhostBtn>
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>Wavelog</PanelTitle>
        <p className="mb-2 max-w-2xl text-sm leading-relaxed text-[#8ea0b3]">{tx("wavelogHelp")}</p>
        <p className="mb-4 font-['IBM_Plex_Mono'] text-[12px] text-[#4fc3f7]">{tx("wavelogOpenHint")} {book}</p>
        {detail ? <p className="mb-4 text-sm text-[#f87171]">{detail}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={tx("folder")}>
            <ConsoleInput
              value={w.folder}
              onChange={(e) => setS((p) => ({ ...p, wavelog: { ...p.wavelog, folder: e.target.value } }))}
            />
          </Field>
          <Field label={tx("listenPort")}>
            <ConsoleInput
              type="number"
              value={w.port}
              onChange={(e) => {
                const port = Number(e.target.value) || 8086;
                setS((prev) => ({
                  ...prev,
                  wavelog: {
                    ...prev.wavelog,
                    port,
                    url: `http://127.0.0.1:${port}/index.php`,
                  },
                }));
              }}
            />
          </Field>
          <Field label={tx("wavelogUrl")}>
            <ConsoleInput
              value={w.url}
              onChange={(e) => setS((p) => ({ ...p, wavelog: { ...p.wavelog, url: e.target.value } }))}
            />
          </Field>
          <Field label={tx("apiKey")}>
            <ConsoleInput
              type="password"
              value={w.apiKey}
              onChange={(e) => setS((p) => ({ ...p, wavelog: { ...p.wavelog, apiKey: e.target.value } }))}
            />
          </Field>
          <Field label={tx("stationId")}>
            <ConsoleInput
              value={w.stationId}
              onChange={(e) => setS((p) => ({ ...p, wavelog: { ...p.wavelog, stationId: e.target.value } }))}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const st = await callWavelog("/api/wavelog/up", "POST");
                applyStatus(st);
                if (st.ok) {
                  pushLog("WLOG", `wavelog.service · ${w.folder} :${w.port} (boot)`);
                  toast.success(tx("wavelogRunning"));
                  setDb(await callWavelogDb("/api/wavelog/database"));
                } else {
                  const msg =
                    st.reason === "no-docker"
                      ? tx("wavelogNoDocker")
                      : st.reason === "docker-down"
                        ? tx("wavelogDockerDown")
                        : tx("apiFail");
                  pushLog("ERRO", msg);
                  toast.error(msg);
                }
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? tx("probing") : tx("startService")}
          </PrimaryBtn>
          <GhostBtn
            danger
            onClick={async () => {
              setBusy(true);
              try {
                applyStatus(await callWavelog("/api/wavelog/down", "POST"));
                pushLog("WLOG", "Wavelog parado");
                setDb(await callWavelogDb("/api/wavelog/database"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("stopService")}
          </GhostBtn>
          <GhostBtn onClick={() => window.open(`${book}/install`, "_blank", "noopener")}>{tx("openInstall")}</GhostBtn>
          <GhostBtn onClick={() => window.open(book, "_blank", "noopener")}>{tx("openLogbook")}</GhostBtn>
          <GhostBtn
            onClick={async () => {
              try {
                const st = await callWavelog("/api/wavelog/status");
                applyStatus(st);
                if (st.ok) {
                  toast.success(tx("apiOk"));
                  pushLog("WLOG", `GET ${book} ${st.httpStatus ?? ""}`.trim());
                } else {
                  const msg =
                    st.reason === "no-docker"
                      ? tx("wavelogNoDocker")
                      : st.reason === "docker-down"
                        ? tx("wavelogDockerDown")
                        : tx("apiFail");
                  toast.error(msg);
                  pushLog("ERRO", `${msg}${st.error ? ` · ${st.error}` : ""}`);
                }
              } catch {
                toast.error(tx("apiFail"));
              }
            }}
          >
            {tx("testApi")}
          </GhostBtn>
          <PrimaryBtn
            onClick={() => {
              pushLog("WLOG", `Config ${w.folder} :${w.port}`);
              toast.success(tx("wavelogSaved"));
            }}
          >
            {tx("save")}
          </PrimaryBtn>
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("wlg")}</PanelTitle>
        <p className="mb-3 max-w-2xl text-sm leading-relaxed text-[#8ea0b3]">{tx("wlgHelp")}</p>
        <p className="mb-4 font-['IBM_Plex_Mono'] text-[12px] tracking-wide text-[#4fc3f7]">{tx("wlgChain")}</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label={tx("folder")}>
            <ConsoleInput
              value={g.folder}
              onChange={(e) => setS((p) => ({ ...p, wlg: { ...p.wlg, folder: e.target.value } }))}
            />
          </Field>
          <Field label={tx("radioName")}>
            <ConsoleInput
              value={g.radioName}
              onChange={(e) => setS((p) => ({ ...p, wlg: { ...p.wlg, radioName: e.target.value } }))}
            />
          </Field>
          <Field label={tx("hamlibHost")}>
            <ConsoleInput
              value={g.hamlibHost}
              onChange={(e) => setS((p) => ({ ...p, wlg: { ...p.wlg, hamlibHost: e.target.value } }))}
            />
          </Field>
          <Field label={tx("hamlibPort")}>
            <ConsoleInput
              type="number"
              value={g.hamlibPort}
              onChange={(e) => setS((p) => ({ ...p, wlg: { ...p.wlg, hamlibPort: Number(e.target.value) || 4532 } }))}
            />
          </Field>
          <Field label={tx("udpPort")}>
            <ConsoleInput
              type="number"
              min={1024}
              max={65535}
              value={g.udpPort}
              onChange={(e) => setS((p) => ({ ...p, wlg: { ...p.wlg, udpPort: Number(e.target.value) || 2333 } }))}
            />
          </Field>
          <Field label={tx("qsyPort")}>
            <ConsoleInput
              type="number"
              value={g.qsyPort}
              onChange={(e) => setS((p) => ({ ...p, wlg: { ...p.wlg, qsyPort: Number(e.target.value) || 54321 } }))}
            />
          </Field>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("wlgUdpHint")}</p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={g.publishCat}
            onChange={(e) => setS((p) => ({ ...p, wlg: { ...p.wlg, publishCat: e.target.checked } }))}
          />
          <span>
            <span className="block text-[#e8eef4]">{tx("publishCat")}</span>
            <span className="text-[#8ea0b3]">{tx("publishCatHelp")}</span>
          </span>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const st = await callWlg("/api/wlg/up", "POST");
                setS((p) => ({ ...p, wlg: { ...p.wlg, running: st.ok } }));
                if (st.ok) {
                  pushLog("WLOG", `Gate escuta UDP :${g.udpPort} → QSO no Wavelog ${w.url}`);
                  toast.success(tx("wlgRunning"));
                } else toast.error(st.error || tx("disconnected"));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("startService")}
          </PrimaryBtn>
          <GhostBtn
            danger
            onClick={async () => {
              try {
                await callWlg("/api/wlg/down", "POST");
              } catch {
                /* still mark stopped */
              }
              setS((p) => ({ ...p, wlg: { ...p.wlg, running: false } }));
              pushLog("WLOG", "WaveLogGate parado");
            }}
          >
            {tx("stopService")}
          </GhostBtn>
          <PrimaryBtn
            onClick={() => {
              pushLog("WLOG", `Gate UDP :${g.udpPort} (QSO) · QSY ${g.qsyPort}`);
              toast.success(tx("wlgSaved"));
            }}
          >
            {tx("save")}
          </PrimaryBtn>
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("servicesMap")}</PanelTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
              <tr>
                <th className="py-2">{tx("colDevice")}</th>
                <th>{tx("colFolder")}</th>
                <th>{tx("colPort")}</th>
              </tr>
            </thead>
            <tbody className="font-['IBM_Plex_Mono'] text-[#c5d4e0]">
              {rows.map((r) => (
                <tr key={r[0]} className="border-t border-[rgba(79,195,247,0.08)]">
                  {r.map((c) => (
                    <td key={c} className="py-2">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">
          {book} · {tx("wlg")} UDP {host}:{g.udpPort}
        </p>
      </Panel>
    </div>
  );
}

function Tile({ label, value, on }: { label: string; value: string; on?: boolean }) {
  return (
    <Panel>
      <p className="text-[11px] tracking-wide text-[#8ea0b3] uppercase">{label}</p>
      <p className={`mt-1 font-['IBM_Plex_Mono'] text-lg font-semibold ${on ? "text-[#34d399]" : "text-[#f87171]"}`}>
        {value}
      </p>
    </Panel>
  );
}
