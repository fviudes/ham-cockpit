import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { bleAvailable, bleErrorMessage, ic705Ble, isBleCancel, looksLikeBleId } from "./ic705-ble";
import { useConsole } from "./state";
import { Chip, ConsoleInput, Field, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

type NetApi = ReturnType<typeof emptyNet>;

function emptyNet() {
  return {
    ok: true,
    hostname: "",
    liveHostname: "",
    link: "wifi" as const,
    dhcp: true,
    ip: "",
    mask: "",
    gw: "",
    dns1: "",
    dns2: "",
    staSsid: "",
    staConnected: false,
    staPassSet: false,
    apSsid: "",
    apPassSet: false,
    ethConnected: false,
    ethName: "",
    wlanName: "",
    liveIp: "",
    liveMask: "",
    liveGw: "",
    scan: [] as { ssid: string; rssi: number; open: boolean }[],
    managed: [] as { ssid: string }[],
    error: "",
    note: "",
  };
}

export function WifiPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const w = s.wifi;
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staPass, setStaPass] = useState("");
  const [apPass, setApPass] = useState("");
  const [host, setHost] = useState(w.hostname);

  useEffect(() => {
    setHost(w.hostname);
  }, [w.hostname]);

  const apply = (j: Record<string, unknown>) => {
    setS((p) => ({
      ...p,
      wifi: {
        ...p.wifi,
        hostname: typeof j.hostname === "string" && j.hostname ? j.hostname : p.wifi.hostname,
        liveHostname: typeof j.liveHostname === "string" ? j.liveHostname : p.wifi.liveHostname,
        link: j.link === "ethernet" ? "ethernet" : j.link === "wifi" ? "wifi" : p.wifi.link,
        apSsid: typeof j.apSsid === "string" && j.apSsid ? j.apSsid : p.wifi.apSsid,
        staSsid: typeof j.staSsid === "string" ? j.staSsid : p.wifi.staSsid,
        dhcp: typeof j.dhcp === "boolean" ? j.dhcp : p.wifi.dhcp,
        ip: typeof j.ip === "string" ? j.ip : p.wifi.ip,
        gw: typeof j.gw === "string" ? j.gw : p.wifi.gw,
        mask: typeof j.mask === "string" && j.mask ? j.mask : p.wifi.mask,
        dns1: typeof j.dns1 === "string" ? j.dns1 : p.wifi.dns1,
        dns2: typeof j.dns2 === "string" ? j.dns2 : p.wifi.dns2,
        staConnected: Boolean(j.staConnected),
        staPassSet: Boolean(j.staPassSet),
        apPassSet: Boolean(j.apPassSet),
        ethConnected: Boolean(j.ethConnected),
        ethName: typeof j.ethName === "string" ? j.ethName : p.wifi.ethName,
        wlanName: typeof j.wlanName === "string" ? j.wlanName : p.wifi.wlanName,
        liveIp: typeof j.liveIp === "string" ? j.liveIp : p.wifi.liveIp,
        liveMask: typeof j.liveMask === "string" ? j.liveMask : p.wifi.liveMask,
        liveGw: typeof j.liveGw === "string" ? j.liveGw : p.wifi.liveGw,
        managed: Array.isArray(j.managed) ? (j.managed as { ssid: string }[]).filter((n) => n && n.ssid) : p.wifi.managed,
        scan: Array.isArray(j.scan) ? (j.scan as { ssid: string; rssi: number; open: boolean }[]).filter((n) => n && n.ssid) : p.wifi.scan,
        error: typeof j.error === "string" ? j.error : p.wifi.error,
        note: typeof j.note === "string" ? j.note : p.wifi.note,
      },
    }));
    if (typeof j.hostname === "string" && j.hostname) setHost(j.hostname);
    return j as NetApi;
  };

  const post = async (url: string, body?: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
    });
    const j = (await r.json()) as Record<string, unknown>;
    apply(j);
    return j;
  };

  const scan = async (quiet = false) => {
    setScanning(true);
    try {
      const j = await post("/api/net/scan");
      if (j.error) toast.error(String(j.error));
      else if (!quiet) toast.success(`${tx("scanDone")} · ${Array.isArray(j.scan) ? j.scan.length : 0}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("scanFail"));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void scan(true);
  }, []);

  const connectSta = async () => {
    if (!w.staSsid.trim()) {
      toast.error(tx("netPickSsid"));
      return;
    }
    setBusy(true);
    try {
      const j = await post("/api/net/connect", { ssid: w.staSsid.trim(), pass: staPass });
      if (j.error) toast.error(String(j.error));
      else {
        setStaPass("");
        pushLog("WiFi", `STA ${w.staSsid}`);
        toast.success(tx("connectingHome"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("radioConnFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead kicker={tx("wifi")} title={tx("wifiTitle")} />

      <Panel className="mb-4">
        <PanelTitle>{tx("netHostname")}</PanelTitle>
        <p className="mb-3 text-sm text-[#8ea0b3]">{tx("netHostnameHint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Field label={tx("netHostname")}>
              <ConsoleInput
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="ham-cockpit"
                autoComplete="off"
              />
            </Field>
          </div>
          <PrimaryBtn
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void post("/api/net/hostname", { hostname: host })
                .then((j) => {
                  if (j.error) toast.error(String(j.error));
                  else toast.success(tx("netHostnameSaved"));
                })
                .finally(() => setBusy(false));
            }}
          >
            {tx("netSaveHost")}
          </PrimaryBtn>
        </div>
        <p className="mt-2 font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">
          {host || w.hostname || "ham-cockpit"}.local
          {w.liveHostname ? ` · ${w.liveHostname}` : ""}
        </p>
      </Panel>

      <Panel className="mb-4">
        <PanelTitle>{tx("netLink")}</PanelTitle>
        <p className="mb-3 text-sm text-[#8ea0b3]">{tx("netLinkHint")}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip
            active={w.link === "ethernet"}
            onClick={() => {
              setBusy(true);
              void post("/api/net/link", { link: "ethernet" }).finally(() => setBusy(false));
            }}
          >
            {tx("netLinkEth")}
          </Chip>
          <Chip
            active={w.link === "wifi"}
            onClick={() => {
              setBusy(true);
              void post("/api/net/link", { link: "wifi" }).finally(() => setBusy(false));
            }}
          >
            {tx("netLinkWifi")}
          </Chip>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-[#101c28] px-3 py-2">
            <p className="text-[10px] text-[#8ea0b3] uppercase">{tx("netLiveIp")}</p>
            <p className="font-['IBM_Plex_Mono'] text-sm text-[#4fc3f7]">{w.liveIp || "—"}</p>
          </div>
          <div className="rounded-lg bg-[#101c28] px-3 py-2">
            <p className="text-[10px] text-[#8ea0b3] uppercase">{tx("netLinkEth")}</p>
            <p className={w.ethConnected ? "text-[#34d399]" : "text-[#8ea0b3]"}>
              {w.ethConnected ? tx("netEthUp") : tx("netEthDown")}
              {w.ethName ? ` · ${w.ethName}` : ""}
            </p>
          </div>
          <div className="rounded-lg bg-[#101c28] px-3 py-2">
            <p className="text-[10px] text-[#8ea0b3] uppercase">{tx("netLinkWifi")}</p>
            <p className={w.staConnected ? "text-[#34d399]" : "text-[#8ea0b3]"}>
              {w.staConnected ? `${tx("netWifiUp")} · ${w.staSsid || "—"}` : tx("disconnected")}
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>{tx("sta")}</PanelTitle>
          <p className="mb-3 text-sm text-[#8ea0b3]">{tx("netPickSsid")}</p>
          <Field label="SSID">
            <ConsoleInput value={w.staSsid} onChange={(e) => setS((p) => ({ ...p, wifi: { ...p.wifi, staSsid: e.target.value } }))} />
          </Field>
          <div className="mt-3">
            <Field label={tx("pass")}>
              <ConsoleInput
                type="password"
                placeholder={w.staPassSet ? tx("staPassKeep") : tx("psk")}
                value={staPass}
                onChange={(e) => setStaPass(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-4">
            <PrimaryBtn disabled={busy || scanning} onClick={() => void connectSta()}>
              {tx("connect")}
            </PrimaryBtn>
          </div>
        </Panel>
        <Panel>
          <PanelTitle>{tx("ap")}</PanelTitle>
          <div className="space-y-3">
            <Field label="SSID">
              <ConsoleInput value={w.apSsid} onChange={(e) => setS((p) => ({ ...p, wifi: { ...p.wifi, apSsid: e.target.value } }))} />
            </Field>
            <Field label={tx("pass")}>
              <ConsoleInput
                type="password"
                placeholder={w.apPassSet ? tx("apPassKeep") : tx("newApPass")}
                value={apPass}
                onChange={(e) => setApPass(e.target.value)}
              />
            </Field>
            <p className="font-['IBM_Plex_Mono'] text-xs text-[#8ea0b3]">192.168.4.1 · DHCP 192.168.4.50–150</p>
            <PrimaryBtn
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void post("/api/net/ap", { ssid: w.apSsid, pass: apPass || undefined })
                  .then((j) => {
                    if (j.error) toast.error(String(j.error));
                    else {
                      setApPass("");
                      pushLog("WiFi", `AP ${w.apSsid}`);
                      toast.success(tx("apSaved"));
                    }
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {tx("save")}
            </PrimaryBtn>
          </div>
        </Panel>
      </div>

      <Panel className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <PanelTitle>{tx("visibleNets")}</PanelTitle>
          <GhostBtn disabled={scanning} onClick={() => void scan()}>
            {scanning ? tx("scanningNets") : tx("scan")}
          </GhostBtn>
        </div>
        {w.scan.length === 0 ? (
          <p className="text-sm text-[#8ea0b3]">{scanning ? tx("scanningNets") : tx("noNets")}</p>
        ) : (
          <div className="space-y-2">
            {w.scan.map((n) => (
              <button
                key={n.ssid}
                type="button"
                onClick={() => setS((p) => ({ ...p, wifi: { ...p.wifi, staSsid: n.ssid } }))}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left hover:border-[#4fc3f7]/40 ${
                  w.staSsid === n.ssid ? "border-[#4fc3f7]/50 bg-[#4fc3f7]/10" : "border-[rgba(79,195,247,0.1)] bg-[#101c28]"
                }`}
              >
                <div>
                  <p className="text-sm text-white">{n.ssid}</p>
                  <p className="font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">
                    {n.open ? tx("openNet") : "WPA2"} · {n.rssi} dBm
                  </p>
                </div>
                <Bars rssi={n.rssi} />
              </button>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>{tx("managedNets")}</PanelTitle>
          {w.managed.length === 0 ? (
            <p className="text-sm text-[#8ea0b3]">—</p>
          ) : (
            <div className="space-y-2">
              {w.managed.map((n, i) => (
                <div key={n.ssid} className="flex items-center justify-between rounded-lg bg-[#101c28] px-3 py-2 text-sm">
                  <button
                    type="button"
                    className="text-left text-[#4fc3f7]"
                    onClick={() => setS((p) => ({ ...p, wifi: { ...p.wifi, staSsid: n.ssid } }))}
                  >
                    {i + 1}. {n.ssid}
                  </button>
                  <GhostBtn
                    danger
                    onClick={() => {
                      void post("/api/net/forget", { ssid: n.ssid });
                    }}
                  >
                    {tx("remove")}
                  </GhostBtn>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel>
          <PanelTitle>{tx("staIp")}</PanelTitle>
          <div className="mb-3 flex flex-wrap gap-2">
            <Chip active={w.dhcp} onClick={() => setS((p) => ({ ...p, wifi: { ...p.wifi, dhcp: true } }))}>
              {tx("netDhcp")}
            </Chip>
            <Chip active={!w.dhcp} onClick={() => setS((p) => ({ ...p, wifi: { ...p.wifi, dhcp: false } }))}>
              {tx("netStatic")}
            </Chip>
          </div>
          {!w.dhcp ? (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Field label="IP">
                <ConsoleInput value={w.ip} onChange={(e) => setS((p) => ({ ...p, wifi: { ...p.wifi, ip: e.target.value } }))} />
              </Field>
              <Field label={tx("mask")}>
                <ConsoleInput value={w.mask} onChange={(e) => setS((p) => ({ ...p, wifi: { ...p.wifi, mask: e.target.value } }))} />
              </Field>
              <Field label={tx("netGw")}>
                <ConsoleInput value={w.gw} onChange={(e) => setS((p) => ({ ...p, wifi: { ...p.wifi, gw: e.target.value } }))} />
              </Field>
              <Field label={tx("netDns1")}>
                <ConsoleInput value={w.dns1} onChange={(e) => setS((p) => ({ ...p, wifi: { ...p.wifi, dns1: e.target.value } }))} />
              </Field>
              <Field label={tx("netDns2")}>
                <ConsoleInput value={w.dns2} onChange={(e) => setS((p) => ({ ...p, wifi: { ...p.wifi, dns2: e.target.value } }))} />
              </Field>
            </div>
          ) : null}
          <PrimaryBtn
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void post("/api/net/ip", {
                dhcp: w.dhcp,
                ip: w.ip,
                mask: w.mask,
                gw: w.gw,
                dns1: w.dns1,
                dns2: w.dns2,
              })
                .then((j) => {
                  if (j.error) toast.error(String(j.error));
                  else toast.success(tx("ipSaved"));
                })
                .finally(() => setBusy(false));
            }}
          >
            {tx("netApplyIp")}
          </PrimaryBtn>
        </Panel>
      </div>
      {w.error || w.note ? (
        <p className={`mt-3 text-sm ${w.error ? "text-[#f87171]" : "text-[#8ea0b3]"}`}>{w.error || w.note}</p>
      ) : null}
    </div>
  );
}

export function BluetoothPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const [, navigate] = useLocation();
  const d = s.ic705;
  const webBt = bleAvailable();
  const [found, setFound] = useState<{ name: string; addr: string }[]>([]);

  const connectRadio = async (acceptAll = false) => {
    if (!webBt) {
      toast.error(tx("bleUnavailable"));
      return;
    }
    const primary = s.radios.items.find((r) => r.primary && r.link === "bluetooth") || s.radios.items.find((r) => r.link === "bluetooth");
    try {
      await ic705Ble.connect({
        chooser: acceptAll,
        acceptAll,
        reconnect: !acceptAll && Boolean(primary?.device || primary?.hsUuid || primary?.paired || ic705Ble.deviceId),
        hsUuid: primary?.hsUuid,
        civAddr: d.addr || primary?.civAddr,
        deviceId: looksLikeBleId(primary?.device || "") ? primary?.device : undefined,
        deviceName: primary?.deviceName || primary?.name,
      });
    } catch (err) {
      let failed: unknown = err;
      if (!acceptAll && bleErrorMessage(err) === "BLE_SILENT") {
        try {
          await ic705Ble.connect({
            chooser: true,
            acceptAll: false,
            reconnect: true,
            hsUuid: primary?.hsUuid,
            civAddr: d.addr || primary?.civAddr,
            deviceId: looksLikeBleId(primary?.device || "") ? primary?.device : undefined,
            deviceName: primary?.deviceName || primary?.name,
          });
          return;
        } catch (retry) {
          failed = retry;
        }
      }
      const msg = bleErrorMessage(failed);
      const cancelled = isBleCancel(failed);
      setS((p) => ({
        ...p,
        ic705: { ...p.ic705, phase: "idle", error: cancelled ? "" : msg, ble: false },
      }));
      if (cancelled) toast.message(acceptAll ? tx("bleCancelled") : tx("bleSilentFail"));
      else toast.error(msg);
    }
  };

  return (
    <div>
      <PageHead kicker={tx("bluetooth")} title={tx("bleTitle")} />
      <Panel className="mb-4">
        <PanelTitle>{tx("ic705")}</PanelTitle>
        <p className="mb-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("bleScanHint")}</p>
        {!webBt ? <p className="mb-3 text-sm text-[#f87171]">{tx("bleUnavailable")}</p> : null}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className={`font-['IBM_Plex_Mono'] text-xs font-semibold ${d.phase === "ready" ? "text-[#34d399]" : "text-[#8ea0b3]"}`}>
            {d.bleName || tx("ic705")} · {d.phase === "ready" ? tx("connected") : tx("disconnected")}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrimaryBtn onClick={() => void connectRadio(false)}>{tx("scanIc705")}</PrimaryBtn>
          <GhostBtn onClick={() => void connectRadio(true)}>{tx("scanAllBle")}</GhostBtn>
          <GhostBtn danger onClick={() => void ic705Ble.disconnect()}>
            {tx("disconnect")}
          </GhostBtn>
          <GhostBtn onClick={() => navigate("/console/ic705")}>{tx("goIc705")}</GhostBtn>
        </div>
      </Panel>
      <Panel className="mb-4">
        <PanelTitle>{tx("lextel")}</PanelTitle>
        <p className="mb-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("lextelHint")}</p>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className={`font-['IBM_Plex_Mono'] text-xs font-semibold ${s.lextel.connected ? "text-[#34d399]" : "text-[#8ea0b3]"}`}>
            {s.lextel.name || "MS-2000"} · {s.lextel.connected ? tx("connected") : tx("disconnected")}
          </span>
        </div>
        <GhostBtn onClick={() => navigate("/console/lextel")}>{tx("lextelGo")}</GhostBtn>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>{tx("config")}</PanelTitle>
          <div className="space-y-3">
            <Field label={tx("name")}>
              <ConsoleInput value={s.ble.name} onChange={(e) => setS((p) => ({ ...p, ble: { ...p.ble, name: e.target.value } }))} />
            </Field>
            <Field label="PIN">
              <ConsoleInput value={s.ble.pin} maxLength={6} onChange={(e) => setS((p) => ({ ...p, ble: { ...p.ble, pin: e.target.value } }))} />
            </Field>
            <PrimaryBtn
              onClick={() => {
                pushLog("BLE", `Nome ${s.ble.name}`);
                toast.success(tx("bleSaved"));
              }}
            >
              {tx("save")}
            </PrimaryBtn>
          </div>
        </Panel>
        <Panel>
          <PanelTitle>{tx("state")}</PanelTitle>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#101c28] p-3">
              <p className="text-[10px] text-[#8ea0b3] uppercase">{tx("device")}</p>
              <p className="font-['IBM_Plex_Mono'] text-[#4fc3f7]">{s.ble.name}</p>
            </div>
            <div className="rounded-lg bg-[#101c28] p-3">
              <p className="text-[10px] text-[#8ea0b3] uppercase">{tx("connection")}</p>
              <p className={s.ble.connected ? "text-[#34d399]" : "text-[#8ea0b3]"}>{s.ble.connected ? "GATT / NUS" : "—"}</p>
            </div>
          </div>
        </Panel>
      </div>
      <Panel className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <PanelTitle>{tx("scan")}</PanelTitle>
          <GhostBtn
            onClick={() => {
              setFound(d.bleName ? [{ name: d.bleName, addr: "GATT" }] : []);
              void connectRadio(true);
            }}
          >
            {tx("scan")}
          </GhostBtn>
        </div>
        {found.map((row) => (
          <div key={row.addr} className="mb-2 flex items-center justify-between rounded-lg bg-[#101c28] px-3 py-2 text-sm">
            <span>
              {row.name}
              <span className="ml-2 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">{row.addr}</span>
            </span>
            <Chip onClick={() => toast.success(`${tx("saved")} ${row.name}`)}>{tx("save")}</Chip>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Bars({ rssi }: { rssi: number }) {
  const n = rssi > -50 ? 4 : rssi > -65 ? 3 : rssi > -80 ? 2 : 1;
  return (
    <div className="flex items-end gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= n ? "bg-[#4fc3f7]" : "bg-[#243240]"}`} style={{ height: 4 + i * 3 }} />
      ))}
    </div>
  );
}
