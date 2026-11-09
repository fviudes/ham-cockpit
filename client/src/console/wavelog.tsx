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

async function callWavelog(path: "/api/wavelog/status" | "/api/wavelog/up" | "/api/wavelog/down", method: "GET" | "POST" = "GET") {
  const res = await fetch(path, { method });
  return (await res.json()) as WlStatus;
}

type WlgApi = { ok: boolean; udpPort?: number; qsyPort?: number; error?: string };

async function callWlg(path: "/api/wlg/status" | "/api/wlg/up" | "/api/wlg/down", method: "GET" | "POST" = "GET") {
  const res = await fetch(path, { method });
  return (await res.json()) as WlgApi;
}

export function WavelogPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const w = s.wavelog;
  const g = s.wlg;
  const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  const book = `http://${host}:${w.port}`;
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState("");

  const applyStatus = (st: WlStatus) => {
    setS((p) => ({ ...p, wavelog: { ...p.wavelog, running: st.ok } }));
    if (st.ok) {
      setDetail("");
      return;
    }
    if (st.reason === "no-docker") setDetail(tx("wavelogNoDocker"));
    else setDetail(st.error ? `${tx("apiFail")} (${st.error})` : tx("apiFail"));
  };

  useEffect(() => {
    void callWavelog("/api/wavelog/status")
      .then(applyStatus)
      .catch((err: unknown) => setDetail(err instanceof Error ? err.message : String(err)));
    void callWlg("/api/wlg/status")
      .then((st) => setS((p) => ({ ...p, wlg: { ...p.wlg, running: st.ok } })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once on open
  }, []);

  const rows = [
    ["Ham Cockpit", "/opt/ham-cockpit", "80"],
    ["Wavelog", w.folder, String(w.port)],
    ["MariaDB", "volume wavelog-dbdata", "—"],
    ["WaveLogGate", g.folder, `UDP ${g.udpPort}`],
    ["ser2net", s.ser2net.folder, s.ser2net.services.map((x) => String(x.tcpPort)).join(",") || "—"],
    ["rigctld IC-705", "hamlib-utils", String(g.hamlibPort)],
  ];

  return (
    <div>
      <PageHead kicker={tx("wavelog")} title={tx("wavelogTitle")} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("isolationHelp")}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Wavelog" value={w.running ? tx("connected") : tx("disconnected")} on={w.running} />
        <Tile label={tx("wlg")} value={g.running ? tx("connected") : tx("disconnected")} on={g.running} />
        <Tile label={tx("udpListen")} value={`:${g.udpPort}`} on={g.running} />
        <Tile label="Hamlib" value={`:${g.hamlibPort}`} on={g.running} />
      </div>

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
                } else {
                  const msg = st.reason === "no-docker" ? tx("wavelogNoDocker") : tx("apiFail");
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
                  const msg = st.reason === "no-docker" ? tx("wavelogNoDocker") : tx("apiFail");
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
