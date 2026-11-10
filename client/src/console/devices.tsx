import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { bleAvailable, bleErrorMessage, ic705Ble, isBleCancel, looksLikeBleId, type BlePhase } from "./ic705-ble";
import type { I18nKey } from "./i18n";
import {
  BANDS,
  formatWatts,
  mergeLp100a,
  useConsole,
  type LdgModel,
  type RadioLink,
  type RadioMaker,
  type RadioPick,
  type RadioProto,
  type StationRadio,
} from "./state";
import {
  SER2NET_RADIO_ID,
  asSer2netDevice,
  assignDevice,
  assignedSvc,
  persistSer2net,
  radioSer2netSvcs,
  s2nAside,
} from "./ser2net-api";
import { Ser2netLink } from "./ser2net-link";
import { Chip, ConsoleInput, ConsoleSelect, Field, GhostBtn, Lcd, Led, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

const RADIO_BAUDS = [1200, 4800, 9600, 19200, 38400, 57600, 115200, 230400];
const MAKERS: RadioMaker[] = ["icom", "kenwood", "yaesu", "flex", "tentec"];
const MAKER_KEY: Record<RadioMaker, I18nKey> = {
  icom: "makerIcom",
  kenwood: "makerKenwood",
  yaesu: "makerYaesu",
  flex: "makerFlex",
  tentec: "makerTentec",
};

function defaultBaud(maker: RadioMaker, link: RadioLink) {
  if (link === "bluetooth" && maker !== "icom") return 9600;
  if (maker === "kenwood" || maker === "yaesu") return 38400;
  if (maker === "tentec") return 57600;
  return 115200;
}

type RadiosApi = {
  ok?: boolean;
  folder?: string;
  radios?: StationRadio[];
  usb?: RadioPick[];
  bluetooth?: RadioPick[];
  error?: string;
  needBle?: boolean;
  bleAddr?: string;
};

function applyRadios(
  setS: ReturnType<typeof useConsole>["setS"],
  j: RadiosApi,
) {
  if (!j || !Array.isArray(j.radios)) return;
  const items = j.radios;
  const usb = Array.isArray(j.usb) ? j.usb : null;
  const bluetooth = Array.isArray(j.bluetooth) ? j.bluetooth : null;
  setS((p) => ({
    ...p,
    radios: {
      folder: typeof j.folder === "string" && j.folder ? j.folder : p.radios.folder,
      items,
      usb: usb ?? p.radios.usb,
      bluetooth: bluetooth ?? p.radios.bluetooth,
    },
  }));
}

export function Ic705Page() {
  const { s, setS, pushLog, tx } = useConsole();
  const [, navigate] = useLocation();
  const webBt = bleAvailable();
  const [maker, setMaker] = useState<RadioMaker>("icom");
  const [link, setLink] = useState<RadioLink>("usb");
  const [device, setDevice] = useState("");
  const [proto, setProto] = useState<RadioProto>("civ");
  const [port, setPort] = useState("");
  const [baud, setBaud] = useState(115200);
  const [civAddr, setCivAddr] = useState("0xA4");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webBle, setWebBle] = useState<RadioPick[]>([]);

  const icom = maker === "icom";
  const useCiv = icom && proto === "civ";
  const useGatt = link === "bluetooth" && useCiv;
  const catUsb = link === "usb";
  const radioSvcs = useMemo(() => radioSer2netSvcs(s.ser2net.services), [s.ser2net.services]);
  const s2nRow = useMemo(() => radioSvcs.find((x) => x.id === device), [radioSvcs, device]);
  const s2nEndpoint = s2nRow ? `${s.ser2net.bind}:${s2nRow.tcpPort}` : "";
  const picks = catUsb ? [] : [...webBle, ...s.radios.bluetooth];
  const live = s.radios.items.find((r) => r.connected);
  const gattUp = s.ic705.phase === "ready" || s.ic705.civ;
  const bleOn = gattUp || s.ic705.phase === "handshake" || s.ic705.phase === "connecting" || s.ic705.phase === "scanning";
  const wiredLive = Boolean(live && !(live.link === "bluetooth" && live.proto === "civ"));
  const linked = gattUp || wiredLive;
  const selected = useMemo(() => picks.find((d) => d.path === device), [picks, device]);
  const phaseLabel: Record<BlePhase, string> = {
    idle: tx("blePhaseIdle"),
    scanning: tx("blePhaseScan"),
    connecting: tx("blePhaseConn"),
    handshake: tx("blePhaseHs"),
    ready: tx("blePhaseReady"),
    error: tx("blePhaseErr"),
  };

  const refresh = async () => {
    try {
      const j = (await (await fetch("/api/radios")).json()) as RadiosApi;
      applyRadios(setS, j);
      if (catUsb) {
        const s2n = (await (await fetch("/api/ser2net")).json()) as {
          ok?: boolean;
          bind?: string;
          folder?: string;
          services?: { id: string; name: string; serial: string; tcpPort: number; baud: number; device?: string }[];
          running?: boolean;
        };
        const services = s2n.services;
        if (s2n?.ok !== false && Array.isArray(services)) {
          setS((p) => ({
            ...p,
            ser2net: {
              ...p.ser2net,
              bind: typeof s2n.bind === "string" && s2n.bind ? s2n.bind : p.ser2net.bind,
              folder: typeof s2n.folder === "string" && s2n.folder ? s2n.folder : p.ser2net.folder,
              services: services.map((row) => ({ ...row, device: asSer2netDevice(row.device) })),
              running: Boolean(s2n.running),
            },
          }));
        }
      }
      if (link === "bluetooth" && webBt) {
        const nav = navigator as Navigator & { bluetooth?: { getDevices?: () => Promise<{ id: string; name?: string }[]> } };
        const list = await nav.bluetooth?.getDevices?.();
        if (list) setWebBle(list.map((d) => ({ id: d.id, path: d.id, label: d.name || d.id, kind: "bluetooth" })));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scan on open and when link changes
  }, [link]);

  useEffect(() => {
    if (!icom) setProto("cat");
  }, [icom]);

  useEffect(() => {
    if (!catUsb) return;
    const assigned = s.ser2net.services.find((x) => x.device === SER2NET_RADIO_ID);
    const pool = radioSer2netSvcs(s.ser2net.services);
    setDevice((cur) => {
      if (cur && pool.some((x) => x.id === cur)) return cur;
      return assigned?.id || pool[0]?.id || "";
    });
  }, [catUsb, s.ser2net.services]);

  useEffect(() => {
    if (!catUsb || !s2nRow) return;
    setPort(`${s.ser2net.bind}:${s2nRow.tcpPort}`);
    setBaud(s2nRow.baud);
  }, [catUsb, s.ser2net.bind, s2nRow]);

  useEffect(() => {
    if (!ic705Ble.connected) return;
    if (s.ic705.phase === "ready" && s.ic705.civ) return;
    setS((p) => ({
      ...p,
      ic705: {
        ...p.ic705,
        ble: true,
        civ: true,
        phase: "ready",
        bleName: ic705Ble.deviceName || p.ic705.bleName,
        error: "",
      },
    }));
  }, [s.ic705.phase, s.ic705.civ, setS]);

  const fillFrom = (row: StationRadio) => {
    setEditingId(row.id);
    setMaker(row.maker);
    setLink(row.link);
    setDevice(row.device);
    setProto(row.proto);
    setPort(row.port);
    setBaud(row.baud);
    setCivAddr(row.civAddr);
  };

  const resetForm = () => {
    setEditingId(null);
    setDevice("");
    setPort("");
    setBaud(defaultBaud(maker, link));
    setProto(maker === "icom" ? "civ" : "cat");
  };

  const payload = (): Partial<StationRadio> => {
    if (catUsb && s2nRow) {
      const endpoint = `${s.ser2net.bind}:${s2nRow.tcpPort}`;
      return {
        id: editingId || undefined,
        maker,
        link,
        proto: icom ? proto : "cat",
        device: s2nRow.id,
        deviceName: s2nRow.name,
        port: endpoint,
        baud: s2nRow.baud,
        civAddr,
        name: `${tx(MAKER_KEY[maker])} · ${s2nRow.name} · ${endpoint}`,
      };
    }
    return {
      id: editingId || undefined,
      maker,
      link,
      proto: icom ? proto : "cat",
      device,
      deviceName: selected?.label || device,
      port: port || device,
      baud,
      civAddr,
      name: `${tx(MAKER_KEY[maker])}${port || device ? ` · ${port || device}` : ""}`,
    };
  };

  const isIcomBle = (row?: Partial<StationRadio>) =>
    (row?.link ?? link) === "bluetooth" && (row?.maker ?? maker) === "icom" && (row?.proto ?? proto) !== "cat";

  const rowOn = (row: StationRadio) =>
    row.link === "bluetooth" && row.proto === "civ" ? gattUp : row.connected;

  const persistAfterBle = async (body: Partial<StationRadio>) => {
    const { primary: wantPrimary, ...rest } = body;
    const saved = (await (
      await fetch("/api/radios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          connected: true,
          paired: true,
          hsUuid: ic705Ble.hsUuid || body.hsUuid,
          device: looksLikeBleId(ic705Ble.deviceId) ? ic705Ble.deviceId : looksLikeBleId(body.device || "") ? body.device : "",
          deviceName: ic705Ble.deviceName || body.deviceName,
          name: ic705Ble.deviceName ? `Icom · ${ic705Ble.deviceName}` : body.name,
          port: "GATT",
          baud: 0,
          error: "",
          ...(wantPrimary ? { primary: true } : {}),
        }),
      })
    ).json()) as RadiosApi;
    applyRadios(setS, saved);
  };

  const connectRadio = async (row?: Partial<StationRadio>, acceptAll = false) => {
    const body = row ?? payload();
    const gatt = isIcomBle(row);
    const viaS2n = (body.link ?? link) === "usb";
    if (viaS2n && !body.device) {
      toast.error(tx("radioNeedS2n"));
      return;
    }
    if (!body.device && !body.port && !gatt) {
      toast.error(tx("radioNeedDevice"));
      return;
    }
    setBusy(true);
    try {
      if (gatt) {
        if (!webBt) {
          toast.error(tx("bleUnavailable"));
          return;
        }
        ic705Ble.setCivAddr(body.civAddr || civAddr);
        try {
          await ic705Ble.connect({
            chooser: acceptAll,
            acceptAll,
            reconnect: !acceptAll && Boolean(body.paired || body.hsUuid || body.device || ic705Ble.deviceId),
            hsUuid: body.hsUuid,
            civAddr: body.civAddr || civAddr,
            deviceId: looksLikeBleId(body.device || "") ? body.device : undefined,
            deviceName: body.deviceName || body.name,
          });
        } catch (err) {
          if (!acceptAll && bleErrorMessage(err) === "BLE_SILENT") {
            try {
              await ic705Ble.connect({
                chooser: true,
                acceptAll: false,
                reconnect: true,
                hsUuid: body.hsUuid,
                civAddr: body.civAddr || civAddr,
                deviceId: looksLikeBleId(body.device || "") ? body.device : undefined,
                deviceName: body.deviceName || body.name,
              });
            } catch (retry) {
              if (isBleCancel(retry)) {
                toast.message(tx("bleSilentFail"));
                return;
              }
              throw retry;
            }
          } else if (!acceptAll && isBleCancel(err)) {
            toast.message(tx("bleSilentFail"));
            return;
          } else {
            throw err;
          }
        }
        await persistAfterBle(body);
        void fetch("/api/lextel/keepalive", { method: "POST" }).catch(() => undefined);
        setS((p) => ({
          ...p,
          ic705: {
            ...p.ic705,
            cat: true,
            civ: true,
            ble: true,
            phase: "ready",
            bleName: ic705Ble.deviceName || p.ic705.bleName,
            addr: body.civAddr || civAddr,
            error: "",
          },
        }));
        pushLog("RADIO", `${ic705Ble.deviceName || "Icom"} BLE CI-V`);
        toast.success(tx("radioConnectedOk"));
        resetForm();
        return;
      }
      if (viaS2n && body.device) {
        const next = assignDevice(s.ser2net.services, body.device, SER2NET_RADIO_ID);
        const saved = await persistSer2net({ bind: s.ser2net.bind, folder: s.ser2net.folder, services: next });
        setS((p) => ({
          ...p,
          ser2net: {
            ...p.ser2net,
            bind: saved.bind,
            folder: saved.folder,
            services: saved.services,
            running: saved.running,
          },
        }));
      }
      const res = await fetch("/api/radios/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as RadiosApi;
      applyRadios(setS, j);
      const list = j.radios || [];
      const saved = list.find((r) => r.id === body.id) || list[list.length - 1];
      if (!res.ok || j.ok === false) {
        toast.error(j.error || tx("radioConnFail"));
        return;
      }
      pushLog("RADIO", `${saved?.name || body.name} ${body.link} ${body.proto}`);
      toast.success(tx("radioConnectedOk"));
      resetForm();
    } catch (err) {
      const msg = bleErrorMessage(err);
      if (isBleCancel(err)) toast.message(tx("bleCancelled"));
      else if (!gatt) toast.error(msg || tx("radioConnFail"));
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (row: StationRadio) => {
    if (row.primary) {
      if (!rowOn(row)) await connectRadio({ ...row, primary: true });
      return;
    }
    setBusy(true);
    try {
      const j = (await (
        await fetch("/api/radios/primary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id }),
        })
      ).json()) as RadiosApi;
      applyRadios(setS, j);
      if (!rowOn(row)) await connectRadio({ ...row, primary: true });
    } catch (err) {
      const msg = bleErrorMessage(err);
      if (isBleCancel(err)) toast.message(tx("bleCancelled"));
      else toast.error(msg || tx("radioConnFail"));
    } finally {
      setBusy(false);
    }
  };

  const disconnectRadio = async (id: string) => {
    const row = s.radios.items.find((r) => r.id === id);
    if (row?.link === "bluetooth" && row.proto === "civ") void ic705Ble.disconnect();
    const j = (await (
      await fetch("/api/radios/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    ).json()) as RadiosApi;
    applyRadios(setS, j);
    pushLog("RADIO", tx("disconnect"));
  };

  const removeRadio = async (id: string) => {
    await disconnectRadio(id);
    const j = (await (await fetch(`/api/radios/${encodeURIComponent(id)}`, { method: "DELETE" })).json()) as RadiosApi;
    applyRadios(setS, j);
  };

  return (
    <div>
      <PageHead kicker={tx("ic705")} title={tx("ic705Title")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile
          label={tx("connection")}
          value={linked ? tx("connected") : s.ic705.phase === "error" ? tx("blePhaseErr") : bleOn ? phaseLabel[s.ic705.phase] : tx("disconnected")}
          on={linked}
        />
        <StatusTile label={tx("device")} value={s.ic705.bleName || live?.name || "—"} on={linked} />
        <StatusTile
          label={tx("radioLink")}
          value={gattUp || live?.link === "bluetooth" ? tx("radioLinkBt") : live?.link === "usb" ? tx("radioLinkUsb") : bleOn ? tx("radioLinkBt") : "—"}
          on={linked || bleOn}
        />
        <StatusTile
          label="CI-V"
          value={
            gattUp
              ? tx("blePhaseReady")
              : bleOn
                ? phaseLabel[s.ic705.phase]
                : live?.proto === "cat"
                  ? tx("radioProtoCat")
                  : live?.proto === "civ"
                    ? tx("radioProtoCiv")
                    : "—"
          }
          on={gattUp}
        />
      </div>

      <Panel className="mt-4">
        <PanelTitle>{tx("radioAdd")}</PanelTitle>
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-[#8ea0b3]">{tx("ic705Help")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={tx("radioMaker")}>
            <ConsoleSelect
              value={maker}
              onChange={(e) => {
                const next = e.target.value as RadioMaker;
                setMaker(next);
                setProto(next === "icom" ? "civ" : "cat");
                setBaud(defaultBaud(next, link));
              }}
            >
              {MAKERS.map((m) => (
                <option key={m} value={m}>
                  {tx(MAKER_KEY[m])}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <Field label={tx("radioLink")}>
            <ConsoleSelect
              value={link}
              onChange={(e) => {
                const next = e.target.value as RadioLink;
                setLink(next);
                setDevice("");
                setPort("");
                setBaud(defaultBaud(maker, next));
              }}
            >
              <option value="usb">{tx("radioLinkUsb")}</option>
              <option value="bluetooth">{tx("radioLinkBt")}</option>
            </ConsoleSelect>
          </Field>
          {catUsb ? (
            <Field label={tx("s2nPick")}>
              <ConsoleSelect
                value={device}
                onChange={(e) => {
                  const id = e.target.value;
                  setDevice(id);
                  const row = radioSvcs.find((x) => x.id === id);
                  if (row) {
                    setPort(`${s.ser2net.bind}:${row.tcpPort}`);
                    setBaud(row.baud);
                  } else {
                    setPort("");
                  }
                }}
              >
                <option value="">{tx("s2nPick")}</option>
                {radioSvcs.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {s.ser2net.bind}:{row.tcpPort} · {row.serial} · {row.baud}
                  </option>
                ))}
              </ConsoleSelect>
            </Field>
          ) : (
            <Field label={tx("device")}>
              <ConsoleSelect
                value={device}
                onChange={(e) => {
                  const path = e.target.value;
                  setDevice(path);
                  setPort(path);
                }}
              >
                <option value="">{tx("pickSerial")}</option>
                {picks.map((d) => (
                  <option key={d.path} value={d.path}>
                    {d.label}
                  </option>
                ))}
              </ConsoleSelect>
            </Field>
          )}
          {icom ? (
            <Field label={tx("protocol")}>
              <ConsoleSelect value={proto} onChange={(e) => setProto(e.target.value as RadioProto)}>
                <option value="civ">{tx("radioProtoCiv")}</option>
                <option value="cat">{tx("radioProtoCat")}</option>
              </ConsoleSelect>
            </Field>
          ) : (
            <Field label={tx("protocol")}>
              <ConsoleInput value={tx("radioProtoCat")} readOnly />
            </Field>
          )}
          {useGatt ? null : (
            <Field label={catUsb ? tx("s2nEndpoint") : tx("radioPort")}>
              <ConsoleInput
                value={catUsb ? s2nEndpoint || "—" : port}
                onChange={(e) => setPort(e.target.value)}
                readOnly={catUsb}
                placeholder={catUsb ? "127.0.0.1:4001" : "COM6 · /dev/rfcomm0"}
              />
            </Field>
          )}
          {useGatt ? null : (
            <Field label={tx("radioSpeed")}>
              <ConsoleSelect value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={catUsb}>
                {RADIO_BAUDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </ConsoleSelect>
            </Field>
          )}
          {useCiv ? (
            <Field label={tx("civAddr")}>
              <ConsoleSelect
                value={civAddr}
                onChange={(e) => {
                  const addr = e.target.value;
                  setCivAddr(addr);
                  ic705Ble.setCivAddr(addr);
                  setS((p) => ({ ...p, ic705: { ...p.ic705, addr } }));
                }}
              >
                <option value="0xA4">IC-705 (0xA4)</option>
                <option value="0x94">IC-7300 (0x94)</option>
                <option value="0x18">IC-7100 (0x18)</option>
                <option value="0x76">IC-7610 (0x76)</option>
                <option value="0x98">IC-705 alt (0x98)</option>
                <option value="0x88">IC-9700 (0x88)</option>
                <option value="0x70">IC-7000 (0x70)</option>
                <option value="0x48">IC-706 (0x48)</option>
              </ConsoleSelect>
            </Field>
          ) : null}
        </div>
        {catUsb ? <p className="mt-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("radioUsbS2nHelp")}</p> : null}
        {catUsb && radioSvcs.length === 0 ? <p className="mt-3 text-sm text-[#ffb300]">{tx("s2nNone")}</p> : null}
        {useGatt && !(s.radios.items.some((r) => isIcomBle(r) && (r.paired || r.hsUuid || r.device))) ? (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#8ea0b3]">{tx("bleNeedPairing")}</p>
        ) : null}
        {useGatt && s.radios.items.some((r) => isIcomBle(r) && (r.paired || r.hsUuid || r.device)) ? (
          <p className="mt-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("bleReconnectHint")}</p>
        ) : null}
        {useGatt && !webBt ? <p className="mt-3 text-sm text-[#f87171]">{tx("bleUnavailable")}</p> : null}
        {s.ic705.phase === "handshake" ? (
          <p className="mt-3 font-mono text-sm leading-relaxed text-[#fbbf24]">
            {tx("bleHsWait")}
            {s.ic705.lastHex ? <span className="mt-1 block text-[#8ea0b3]">{s.ic705.lastHex}</span> : null}
          </p>
        ) : null}
        {s.ic705.phase === "error" && s.ic705.error ? <p className="mt-3 text-sm text-[#f87171]">{s.ic705.error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn disabled={busy || (catUsb && !device)} onClick={() => void connectRadio()}>
            {tx("connect")}
          </PrimaryBtn>
          {useGatt ? <GhostBtn onClick={() => void connectRadio(undefined, true)}>{tx("scanAllBle")}</GhostBtn> : null}
          {catUsb ? (
            <GhostBtn onClick={() => navigate("/console/ser2net")}>{tx("s2nOpen")}</GhostBtn>
          ) : (
            <GhostBtn onClick={() => void refresh()}>{tx("radioScanDev")}</GhostBtn>
          )}
          {editingId ? <GhostBtn onClick={resetForm}>{tx("cancelEdit")}</GhostBtn> : null}
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("radioRegistered")}</PanelTitle>
        {s.radios.items.length === 0 ? (
          <p className="text-sm text-[#8ea0b3]">{tx("radioNone")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
                <tr>
                  <th className="w-10 py-2 pr-2">{tx("radioPrimary")}</th>
                  <th className="py-2 whitespace-nowrap">{tx("name")}</th>
                  <th className="whitespace-nowrap">{tx("radioMaker")}</th>
                  <th className="whitespace-nowrap">{tx("radioLink")}</th>
                  <th className="whitespace-nowrap">{tx("protocol")}</th>
                  <th className="whitespace-nowrap">{tx("radioPort")}</th>
                  <th className="whitespace-nowrap">{tx("radioSpeed")}</th>
                  <th className="whitespace-nowrap">{tx("state")}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {s.radios.items.map((row) => (
                  <tr key={row.id} className="border-t border-[rgba(79,195,247,0.08)]">
                    <td className="py-2 pr-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[#c5d4e0]">
                        <input
                          type="checkbox"
                          checked={Boolean(row.primary)}
                          disabled={busy}
                          onChange={() => void setPrimary(row)}
                          aria-label={tx("radioPrimary")}
                        />
                      </label>
                    </td>
                    <td className="py-2 font-semibold text-[#4fc3f7]">{row.name}</td>
                    <td className="py-2">{tx(MAKER_KEY[row.maker])}</td>
                    <td className="py-2">{row.link === "usb" ? tx("radioLinkUsb") : tx("radioLinkBt")}</td>
                    <td className="py-2">{row.proto === "civ" ? tx("radioProtoCiv") : tx("radioProtoCat")}</td>
                    <td className="py-2 font-['IBM_Plex_Mono'] text-[11px]">
                      {row.link === "bluetooth" && row.proto === "civ"
                        ? `GATT ${row.civAddr || "0xA4"}`
                        : row.port || row.device}
                    </td>
                    <td className="py-2 font-['IBM_Plex_Mono']">
                      {row.link === "bluetooth" && row.proto === "civ" ? "—" : row.baud || "—"}
                    </td>
                    <td className={`py-2 ${rowOn(row) ? "text-[#34d399]" : "text-[#8ea0b3]"}`}>
                      {rowOn(row) ? tx("connected") : tx("disconnected")}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        {rowOn(row) ? (
                          <GhostBtn danger onClick={() => void disconnectRadio(row.id)}>
                            {tx("disconnect")}
                          </GhostBtn>
                        ) : (
                          <GhostBtn onClick={() => void connectRadio(row)}>{tx("connect")}</GhostBtn>
                        )}
                        <GhostBtn onClick={() => fillFrom(row)}>{tx("edit")}</GhostBtn>
                        <GhostBtn danger onClick={() => void removeRadio(row.id)}>
                          {tx("remove")}
                        </GhostBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function SpePage() {
  const { s, setS, tx } = useConsole();
  const a = s.spe;
  const ip = s2nAside(s.ser2net.bind, s.ser2net.services, "spe") || tx("s2nPick");
  const cmd = (k: string) => {
    if (k === "op1") setS((p) => ({ ...p, spe: { ...p.spe, operate: true } }));
    if (k === "op0") setS((p) => ({ ...p, spe: { ...p.spe, operate: false } }));
    if (k === "pwr") setS((p) => ({ ...p, spe: { ...p.spe, pwr: p.spe.pwr === "L" ? "M" : p.spe.pwr === "M" ? "H" : "L" } }));
    if (k === "ant") setS((p) => ({ ...p, spe: { ...p.spe, ant: (p.spe.ant % 4) + 1 } }));
    if (k === "input") setS((p) => ({ ...p, spe: { ...p.spe, input: p.spe.input === 1 ? 2 : 1 } }));
    toast.message(`SPE · ${k}`);
  };
  return (
    <div>
      <PageHead kicker={tx("spe")} title="Expert 1.3K-FA" aside={<span className="text-xs text-[#8ea0b3]">{ip}</span>} />
      <Ser2netLink acc="spe" />
      <Lcd>
        <div className="mb-3 flex items-center justify-between border-b border-[#0c2236] pb-3">
          <span className="text-xs font-semibold tracking-[0.2em] text-[#4fc3f7]">13K</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${a.operate ? "bg-[#10b981]/20 text-[#34d399]" : "text-[#8ea0b3]"}`}>
            {a.operate ? "OPERATE" : "STBY"}
          </span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${a.tx ? "bg-[#ef4444]/20 text-[#f87171]" : "text-[#8ea0b3]"}`}>
            {a.tx ? "TX" : "RX"}
          </span>
          <span className="text-[11px] text-[#8ea0b3]">BNK {a.bank}</span>
        </div>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] text-[#5d7184]">RF OUT</p>
            <p className="text-5xl font-semibold tracking-wide text-[#ffb300]">
              {a.pout}
              <span className="ml-1 text-lg">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#5d7184]">PWR</p>
            <p className="text-3xl font-semibold text-[#4fc3f7]">{a.pwr}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 border-y border-[#0c2236] py-3">
          <LcdCell k="SWR ATU" v={a.swrAtu.toFixed(2)} />
          <LcdCell k="SWR ANT" v={a.swrAnt.toFixed(2)} />
          <LcdCell k="V PA" v={a.vpa.toFixed(1)} tone="green" />
          <LcdCell k="I PA" v={a.ipa.toFixed(1)} tone="green" />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <LcdCell k="BAND" v={a.band} ink />
          <LcdCell k="ANT" v={String(a.ant)} ink />
          <LcdCell k="INPUT" v={String(a.input)} ink />
          <LcdCell k="TEMP" v={`${a.temp}°`} tone="red" />
        </div>
      </Lcd>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel>
          <div className="grid grid-cols-3 gap-2">
            {["Input", "← L", "L →", "Antena", "← C", "C →", "Band−", "Band+", "Tuner"].map((b) => (
              <Chip key={b} onClick={() => cmd(b.toLowerCase())}>
                {b}
              </Chip>
            ))}
          </div>
          <div className="mt-4 flex justify-around">
            <Led on={a.ledAl} tone="red" label="AL" />
            <Led on={a.ledTune} tone="amber" label="Tune" />
            <Led on={!a.ledOn} tone="red" label="Off" />
          </div>
        </Panel>
        <Panel>
          <div className="grid grid-cols-3 gap-2">
            <Chip onClick={() => cmd("nav")}>← ↑</Chip>
            <Chip onClick={() => cmd("nav")}>↓ →</Chip>
            <Chip active={a.operate} tone="ok" onClick={() => cmd("op1")}>
              On
            </Chip>
            <Chip onClick={() => cmd("cat")}>Cat</Chip>
            <Chip onClick={() => cmd("disp")}>Disp</Chip>
            <Chip active={!a.operate} onClick={() => cmd("op0")}>
              Off
            </Chip>
            <Chip onClick={() => cmd("set")}>Set</Chip>
            <Chip onClick={() => cmd("pwr")}>PWR</Chip>
            <Chip active={a.operate} onClick={() => cmd("op1")}>
              OP
            </Chip>
          </div>
          <div className="mt-4 flex justify-around">
            <Led on={a.ledOn} tone="green" label="ON" />
            <Led on={a.operate} tone="amber" label="OP" />
            <Led on={a.tx} tone="red" label="TX" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

const ACOM_HF = BANDS.filter((b) => !["2m", "70cm"].includes(b.id));

export function AcomPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const a = s.acom;
  const ready = a.on && a.warmup === 0;
  const ip = s2nAside(s.ser2net.bind, s.ser2net.services, "acom") || tx("s2nPick");

  const cmd = (k: string) => {
    if (k !== "on" && k !== "off" && a.warmup > 0) {
      toast.message(tx("acomWaitWarm"));
      return;
    }
    if (k === "on") {
      if (!a.rpon) {
        toast.error(tx("acomRponNeed"));
        return;
      }
      setS((p) => ({
        ...p,
        acom: { ...p.acom, on: true, comm: false, operate: false, warmup: 150, fault: "", hv: 0, fwd: 0, ref: 0 },
      }));
      pushLog("ACOM", `${tx("acomRpon")} · ${tx("acomWarmup")} 150 s`);
      toast.success(tx("acomPowerOn"));
      return;
    }
    if (k === "off") {
      setS((p) => ({
        ...p,
        acom: { ...p.acom, on: false, comm: false, operate: false, warmup: 0, tx: false, fwd: 0, ref: 0, hv: 0 },
      }));
      pushLog("ACOM", "off");
      return;
    }
    if (!ready && (k === "opr" || k === "stby" || k === "tune")) {
      toast.error(tx("acomNoOp"));
      return;
    }
    if (k === "opr") setS((p) => ({ ...p, acom: { ...p.acom, operate: true } }));
    if (k === "stby") setS((p) => ({ ...p, acom: { ...p.acom, operate: false } }));
    if (k === "tune") {
      setS((p) => ({ ...p, acom: { ...p.acom, operate: false } }));
      toast.success(tx("acomAutoTune"));
    }
    if (k === "hv") {
      setS((p) => ({ ...p, acom: { ...p.acom, hv: p.acom.on ? 2520 : 0 } }));
      toast.message(`${tx("acomMeasure")} · ${a.on ? "2520 V" : "0"}`);
    }
    pushLog("ACOM", k);
  };

  return (
    <div>
      <PageHead kicker={tx("acom")} title={tx("acomTitle")} aside={<span className="text-xs text-[#8ea0b3]">{ip}</span>} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("acomHelp")}</p>
      <Ser2netLink acc="acom" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile label="ON" value={a.on ? (ready ? tx("acomReady") : `${tx("acomWarmup")} ${a.warmup}s`) : tx("acomOff")} on={a.on} />
        <StatusTile label={tx("acomComm")} value={a.comm ? tx("connected") : tx("disconnected")} on={a.comm} />
        <StatusTile label={tx("acomOperate")} value={a.operate ? tx("acomOperate") : tx("acomStby")} on={a.operate} />
        <StatusTile label="TX" value={a.tx ? "TX" : "RX"} on={a.tx} />
      </div>

      <Lcd>
        <div className="mb-3 flex items-center justify-between border-b border-[#0c2236] pb-3">
          <span className="text-xs font-semibold tracking-[0.2em] text-[#4fc3f7]">ACOM 2000A</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${a.operate ? "bg-[#10b981]/20 text-[#34d399]" : "text-[#8ea0b3]"}`}>
            {a.operate ? tx("acomOperate") : tx("acomStby")}
          </span>
          <span className="text-[11px] text-[#8ea0b3]">
            {a.band} · ANT {a.ant} · SEG {a.segment}
          </span>
        </div>
        <div className="mb-3">
          <p className="mb-1 text-[10px] tracking-wide text-[#5d7184]">FWD W</p>
          <LedBar value={a.fwd} max={1500} tone="red" />
          <p className="mt-1 font-semibold text-[#f87171]">{a.fwd} W</p>
        </div>
        <div className="mb-3">
          <p className="mb-1 text-[10px] tracking-wide text-[#5d7184]">RFL W</p>
          <LedBar value={a.ref} max={150} tone="amber" />
          <p className="mt-1 font-semibold text-[#ffb300]">{a.ref} W</p>
        </div>
        <div className="grid grid-cols-4 gap-3 border-t border-[#0c2236] pt-3">
          <LcdCell k="HV" v={a.hv ? `${a.hv}` : "—"} tone="green" />
          <LcdCell k="TEMP" v={`${a.temp}°`} tone="red" />
          <LcdCell k="BAND" v={a.band} ink />
          <LcdCell k="ANT" v={String(a.ant)} ink />
        </div>
      </Lcd>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel>
          <PanelTitle>{tx("control")}</PanelTitle>
          <label className="mb-3 flex items-center gap-2 text-sm text-[#c5d4e0]">
            <input
              type="checkbox"
              checked={a.rpon}
              onChange={(e) => setS((p) => ({ ...p, acom: { ...p.acom, rpon: e.target.checked } }))}
            />
            {tx("acomRpon")}
          </label>
          <div className="flex flex-wrap gap-2">
            <PrimaryBtn onClick={() => cmd("on")}>{tx("acomPowerOn")}</PrimaryBtn>
            <GhostBtn danger onClick={() => cmd("off")}>
              {tx("acomPowerOff")}
            </GhostBtn>
            <Chip active={a.operate} tone="ok" onClick={() => cmd("opr")}>
              {tx("acomOperate")}
            </Chip>
            <Chip active={a.on && !a.operate} onClick={() => cmd("stby")}>
              {tx("acomStby")}
            </Chip>
            <Chip tone="amber" onClick={() => cmd("tune")}>
              {tx("acomAutoTune")}
            </Chip>
            <Chip onClick={() => cmd("hv")}>{tx("acomMeasure")}</Chip>
          </div>
          <div className="mt-4 flex justify-around">
            <Led on={a.on} tone="green" label="ON" />
            <Led on={a.comm} tone="cyan" label="Comm" />
            <Led on={a.operate} tone="amber" label="OPR" />
            <Led on={a.tx} tone="red" label="TX" />
          </div>
        </Panel>
        <Panel>
          <PanelTitle>{tx("band")}</PanelTitle>
          <div className="mb-4 flex flex-wrap gap-2">
            {ACOM_HF.map((b) => (
              <Chip
                key={b.id}
                active={a.band === b.id}
                onClick={() => setS((p) => ({ ...p, acom: { ...p.acom, band: b.id, segment: 1 } }))}
              >
                {b.id}
              </Chip>
            ))}
          </div>
          <PanelTitle>{tx("acomAnt")}</PanelTitle>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Chip key={n} active={a.ant === n} onClick={() => setS((p) => ({ ...p, acom: { ...p.acom, ant: n } }))}>
                {n}
              </Chip>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const ALARM_KEY: Record<string, I18nKey> = {
  vHigh: "lextelAlarmVHigh",
  vLow: "lextelAlarmVLow",
  swrHigh: "lextelAlarmSwr",
  antFault: "lextelAlarmAnt",
  pwrHigh: "lextelAlarmPwr",
};

export function LextelPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const d = s.lextel;
  const busy = d.phase === "scanning" || d.phase === "pairing" || d.phase === "connecting";

  const applySnap = (j: typeof d) => {
    setS((p) => ({ ...p, lextel: { ...p.lextel, ...j } }));
  };

  const post = async (url: string, body?: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
    });
    const j = (await r.json()) as typeof d & { error?: string };
    applySnap(j);
    return j;
  };

  const scan = async () => {
    pushLog("LEXTEL", tx("lextelScanning"));
    try {
      const j = await post("/api/lextel/scan", { seconds: 12 });
      toast.message(`${tx("lextelFound")}: ${j.devices?.length ?? 0}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const connect = async (addr?: string, name?: string) => {
    const target = addr || d.addr;
    if (!target) {
      toast.error(tx("lextelNone"));
      return;
    }
    try {
      const j = await post("/api/lextel/connect", { addr: target, name: name || d.name, pin: d.pin, channel: d.channel });
      if (j.phase === "error") toast.error(j.error || tx("lextelConnFail"));
      else {
        pushLog("LEXTEL", `SPP ${target}`);
        toast.success(tx("connected"));
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const disconnect = async () => {
    try {
      await post("/api/lextel/disconnect");
      pushLog("LEXTEL", tx("disconnect"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const learn = async () => {
    try {
      const j = await post("/api/lextel/learn");
      if (j.decoded) toast.success(tx("lextelDecoded"));
      else toast.message(j.note || tx("lextelLearn"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const openBt = async () => {
    try {
      await post("/api/lextel/bluetooth");
      toast.message(tx("lextelWinBt"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const save = async () => {
    try {
      const r = await fetch("/api/lextel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addr: d.addr, name: d.name, pin: d.pin, channel: d.channel, autoConnect: d.autoConnect }),
      });
      applySnap((await r.json()) as typeof d);
      toast.success(tx("lextelSaved"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const phaseLabel: Record<typeof d.phase, string> = {
    idle: tx("lextelIdle"),
    scanning: tx("lextelScanning"),
    pairing: tx("lextelPairing"),
    connecting: tx("lextelConnecting"),
    streaming: tx("lextelStreaming"),
    error: tx("blePhaseErr"),
  };

  return (
    <div>
      <PageHead kicker={tx("lextel")} title={tx("lextelTitle")} aside={<span className="text-xs text-[#8ea0b3]">{tx("lextelPort")}</span>} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("lextelHelp")}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile label="SPP" value={d.connected ? tx("connected") : tx("disconnected")} on={d.connected} />
        <StatusTile
          label={tx("lextelLayout")}
          value={
            d.layout === "ascii"
              ? tx("lextelAscii")
              : d.decoded
                ? d.layout || tx("lextelDecoded")
                : tx("lextelLearn")
          }
          on={d.decoded || d.layout === "ascii"}
        />
        <StatusTile label={tx("device")} value={d.name || d.addr || "—"} on={Boolean(d.addr)} />
        <StatusTile
          label={tx("lextelAlarms")}
          value={d.alarms.length ? d.alarms.map((a) => tx(ALARM_KEY[a] ?? "lextelAlarms")).join(" · ") : tx("lextelNoAlarm")}
          on={d.alarms.length === 0 && d.connected}
        />
      </div>

      <Lcd>
        <div className="mb-3 flex items-center justify-between border-b border-[#0c2236] pb-3">
          <span className="text-xs font-semibold tracking-[0.2em] text-[#4fc3f7]">LEXTEL MS-2000</span>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-bold ${
              d.phase === "streaming" ? "bg-[#10b981]/20 text-[#34d399]" : d.phase === "error" ? "bg-[#ef4444]/20 text-[#f87171]" : "text-[#8ea0b3]"
            }`}
          >
            {phaseLabel[d.phase]}
          </span>
          <span className="text-[11px] text-[#8ea0b3]">{d.path || "RFCOMM"}</span>
        </div>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] text-[#5d7184]">{tx("lextelPep")}</p>
            <p className="text-5xl font-semibold tracking-wide text-[#ffb300]">
              {formatWatts(d.pep)}
              <span className="ml-1 text-lg">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#5d7184]">{tx("lextelAvg")}</p>
            <p className="text-3xl font-semibold text-[#4fc3f7]">
              {formatWatts(d.avg)}
              <span className="ml-1 text-base">W</span>
            </p>
          </div>
        </div>
        <div className="mb-3">
          <p className="mb-1 text-[10px] tracking-wide text-[#5d7184]">{tx("lextelPep")}</p>
          <LedBar value={d.pep} max={2000} tone="red" />
        </div>
        <div className="mb-3">
          <p className="mb-1 text-[10px] tracking-wide text-[#5d7184]">{tx("lextelRef")}</p>
          <LedBar value={d.ref} max={200} tone="amber" />
        </div>
        <div className="grid grid-cols-4 gap-3 border-t border-[#0c2236] pt-3">
          <LcdCell k={tx("lextelSwr")} v={d.swr.toFixed(2)} tone={d.swr >= 2 ? "red" : "amber"} />
          <LcdCell k={tx("lextelVdc")} v={d.vdc ? `${d.vdc.toFixed(1)} V` : "—"} tone="green" />
          <LcdCell k={tx("lextelZ")} v={d.z ? `${d.z.toFixed(0)} Ω` : "—"} ink />
          <LcdCell k={tx("lextelMod")} v={`${d.mod.toFixed(0)}%`} />
        </div>
      </Lcd>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel>
          <PanelTitle>{tx("bleTransport")}</PanelTitle>
          <p className="mb-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("lextelHint")}</p>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-md px-2 py-1 font-['IBM_Plex_Mono'] text-[11px] font-semibold ${
                d.phase === "streaming" ? "bg-[#10b981]/15 text-[#34d399]" : d.phase === "error" ? "bg-[#ef4444]/15 text-[#f87171]" : "bg-[#4fc3f7]/10 text-[#4fc3f7]"
              }`}
            >
              {phaseLabel[d.phase]}
            </span>
            {d.addr ? <span className="font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7]">{d.addr}</span> : null}
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label={tx("lextelMac")}>
              <ConsoleInput value={d.addr} onChange={(e) => setS((p) => ({ ...p, lextel: { ...p.lextel, addr: e.target.value } }))} placeholder="AA:BB:CC:DD:EE:FF" />
            </Field>
            <Field label={tx("lextelPin")}>
              <ConsoleInput value={d.pin} maxLength={6} onChange={(e) => setS((p) => ({ ...p, lextel: { ...p.lextel, pin: e.target.value } }))} />
            </Field>
            <Field label={tx("name")}>
              <ConsoleInput value={d.name} onChange={(e) => setS((p) => ({ ...p, lextel: { ...p.lextel, name: e.target.value } }))} placeholder="MS-2000" />
            </Field>
            <Field label={tx("lextelChannel")}>
              <ConsoleInput
                value={String(d.channel)}
                onChange={(e) => setS((p) => ({ ...p, lextel: { ...p.lextel, channel: Math.max(1, Number(e.target.value) || 1) } }))}
              />
            </Field>
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm text-[#c5d4e0]">
            <input
              type="checkbox"
              checked={d.autoConnect}
              onChange={(e) => setS((p) => ({ ...p, lextel: { ...p.lextel, autoConnect: e.target.checked } }))}
            />
            {tx("lextelAuto")}
          </label>
          <div className="flex flex-wrap gap-2">
            <PrimaryBtn disabled={busy} onClick={() => void scan()}>
              {busy && d.phase === "scanning" ? tx("scanning") : tx("lextelScanBt")}
            </PrimaryBtn>
            <PrimaryBtn disabled={busy} onClick={() => void connect()}>
              {tx("lextelConnect")}
            </PrimaryBtn>
            <GhostBtn danger onClick={() => void disconnect()}>
              {tx("disconnect")}
            </GhostBtn>
            <GhostBtn onClick={() => void save()}>{tx("save")}</GhostBtn>
            <GhostBtn onClick={() => void learn()}>{tx("lextelLearnBtn")}</GhostBtn>
            <GhostBtn onClick={() => void openBt()}>{tx("lextelWinBt")}</GhostBtn>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("lextelLearnHelp")}</p>
          {d.note ? <p className="mt-2 font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">{d.note}</p> : null}
          {d.error ? <p className="mt-3 text-sm text-[#f87171]">{d.error}</p> : null}
        </Panel>
        <Panel>
          <PanelTitle>{tx("lextelNearby")}</PanelTitle>
          {d.devices.length === 0 ? <p className="text-sm text-[#8ea0b3]">{tx("lextelNone")}</p> : null}
          {d.devices.map((row) => (
            <div key={`${row.kind}-${row.addr}`} className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-[#101c28] px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className={`truncate font-['IBM_Plex_Mono'] ${row.likely ? "text-[#4fc3f7]" : "text-[#c5d4e0]"}`}>{row.name}</p>
                <p className="truncate font-['IBM_Plex_Mono'] text-[11px] text-[#5d7184]">
                  {row.addr}
                  {row.paired ? ` · ${tx("lextelPaired")}` : ""}
                  {row.kind === "serial" ? " · COM" : " · SPP"}
                </p>
              </div>
              <Chip active={d.addr === row.addr} onClick={() => void connect(row.addr, row.name)}>
                {tx("connect")}
              </Chip>
            </div>
          ))}
          <div className="mt-4">
            <PanelTitle>{tx("lextelDump")}</PanelTitle>
          </div>
          <p className="mb-2 font-['IBM_Plex_Mono'] text-[11px] text-[#4fc3f7]">
            {d.captureBytes} {tx("lextelBytes")}
            {d.period ? ` · ${tx("lextelPeriod")} ${d.period} B` : ""}
            {d.layout ? ` · ${d.layout}` : ""}
          </p>
          <p className="mb-2 break-all font-['IBM_Plex_Mono'] text-[11px] leading-relaxed text-[#8ea0b3]">{d.hex || "—"}</p>
          {d.ascii ? (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[#03080d] p-2 font-['IBM_Plex_Mono'] text-[11px] text-[#c5d4e0]">
              {d.ascii}
            </pre>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function LedBar({ value, max, tone }: { value: number; max: number; tone: "red" | "amber" }) {
  const n = 24;
  const lit = Math.max(0, Math.min(n, Math.round((value / max) * n)));
  const on = tone === "red" ? "bg-[#f87171]" : "bg-[#ffb300]";
  return (
    <div className="flex h-4 gap-0.5">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`flex-1 rounded-sm ${i < lit ? on : "bg-[#1c2a32]"}`} />
      ))}
    </div>
  );
}

export function HamplusPage() {
  const { s, setS, tx } = useConsole();
  const h = s.hamplus;
  const ip = s2nAside(s.ser2net.bind, s.ser2net.services, "hamplus") || tx("s2nPick");
  return (
    <div>
      <PageHead kicker={tx("hamplus")} title="AS-603WL" aside={<span className="text-xs text-[#8ea0b3]">{ip}</span>} />
      <Ser2netLink acc="hamplus" />
      <div className="mb-4 grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <Panel className="flex items-center justify-around py-6">
          <Led on={h.pwr} tone="green" label="Power" />
          <Led on={h.send} tone="red" label="Send" />
          <Led on={h.split} tone="amber" label="Split" />
        </Panel>
        <Panel className="flex items-center gap-4">
          <div className="flex-1 rounded-lg border border-[#0c2236] bg-[#041018] px-4 py-3 text-center font-['IBM_Plex_Mono']">
            <p className="text-[10px] text-[#5d7184]">GRAUS</p>
            <p className="text-4xl font-semibold text-[#ffb300]">
              {String(h.deg).padStart(3, "0")}
              <span className="text-sm text-[#5d7184]">°</span>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Chip active={h.rotor === 1} onClick={() => setS((p) => ({ ...p, hamplus: { ...p.hamplus, rotor: 1 } }))}>
              Rotor 1
            </Chip>
            <Chip active={h.rotor === 2} onClick={() => setS((p) => ({ ...p, hamplus: { ...p.hamplus, rotor: 2 } }))}>
              Rotor 2
            </Chip>
          </div>
          <div className="flex flex-col gap-2">
            <Chip onClick={() => setS((p) => ({ ...p, hamplus: { ...p.hamplus, deg: (p.hamplus.deg + 5) % 360 } }))}>↑</Chip>
            <Chip onClick={() => setS((p) => ({ ...p, hamplus: { ...p.hamplus, deg: (p.hamplus.deg + 355) % 360 } }))}>↓</Chip>
          </div>
        </Panel>
      </div>
      <Panel className="mb-4">
        <PanelTitle>{tx("antennaSwitch")}</PanelTitle>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <span key={n} className={n > 6 ? "opacity-40" : undefined}>
              <Chip active={h.ant === n} onClick={() => n <= 6 && setS((p) => ({ ...p, hamplus: { ...p.hamplus, ant: n } }))}>
                ANT {n}
              </Chip>
            </span>
          ))}
        </div>
      </Panel>
      <Panel>
        <PanelTitle>{tx("radioSwitch")}</PanelTitle>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
            <Chip key={n} active={h.radio === n && n <= 3} onClick={() => n <= 3 && setS((p) => ({ ...p, hamplus: { ...p.hamplus, radio: n } }))}>
              Rádio {n}
            </Chip>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function PalstarPage() {
  const { s, setS, tx } = useConsole();
  const p = s.palstar;
  const ip = s2nAside(s.ser2net.bind, s.ser2net.services, "palstar") || tx("s2nPick");
  return (
    <div>
      <PageHead kicker={tx("palstar")} title="AT-AUTO" aside={<span className="text-xs text-[#8ea0b3]">{ip}</span>} />
      <Ser2netLink acc="palstar" />
      <Lcd>
        <div className="mb-3 flex items-center justify-between border-b border-[#0c2236] pb-3">
          <span className="text-xs font-semibold tracking-[0.2em] text-[#4fc3f7]">AT-AUTO</span>
          <span className="text-[11px] text-[#8ea0b3]">{p.mode}</span>
          <span className="rounded bg-[#4fc3f7]/10 px-2 py-0.5 text-[11px] font-bold text-[#4fc3f7]">{p.ant}</span>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-4">
          <LcdCell k="FWD W" v={String(p.fwd)} />
          <LcdCell k="REF W" v={String(p.ref)} tone="red" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <LcdCell k="SWR" v={p.swr.toFixed(1)} tone="amber" />
          <LcdCell k="L" v={String(p.l)} ink />
          <LcdCell k="C" v={String(p.c)} ink />
        </div>
      </Lcd>
      <Panel className="mt-4 flex justify-around py-4">
        <Led on={p.tune} tone="amber" label="Tune" />
        <Led on={p.match} tone="green" label="Match" />
        <Led on={p.mode === "BYPASS"} tone="cyan" label="Bypass" />
      </Panel>
      <Panel className="mt-4">
        <div className="flex flex-wrap gap-2">
          <Chip active={p.mode === "AUTO"} onClick={() => setS((st) => ({ ...st, palstar: { ...st.palstar, mode: "AUTO" } }))}>
            Auto
          </Chip>
          <Chip active={p.mode === "MANUAL"} onClick={() => setS((st) => ({ ...st, palstar: { ...st.palstar, mode: "MANUAL" } }))}>
            Manual
          </Chip>
          <Chip active={p.mode === "BYPASS"} onClick={() => setS((st) => ({ ...st, palstar: { ...st.palstar, mode: "BYPASS" } }))}>
            Bypass
          </Chip>
          <Chip active={p.ant === "COAX"} onClick={() => setS((st) => ({ ...st, palstar: { ...st.palstar, ant: "COAX" } }))}>
            Coax
          </Chip>
          <Chip active={p.ant === "BAL"} onClick={() => setS((st) => ({ ...st, palstar: { ...st.palstar, ant: "BAL" } }))}>
            Balanced
          </Chip>
          <Chip onClick={() => toast.message("Home L&C")}>Home L&C</Chip>
          <Chip
            tone="amber"
            onClick={() => {
              setS((st) => ({ ...st, palstar: { ...st.palstar, tune: true, match: true } }));
              toast.success("Tune");
            }}
          >
            Tune
          </Chip>
        </div>
      </Panel>
    </div>
  );
}

const LDG_MODELS: { id: LdgModel; key: I18nKey }[] = [
  { id: "at1000pro2", key: "ldgAt1000" },
  { id: "at600pro2", key: "ldgAt600" },
  { id: "at100pro2", key: "ldgAt100" },
];

function applyLdg(setS: ReturnType<typeof useConsole>["setS"], j: Record<string, unknown>) {
  if (!j || typeof j !== "object") return;
  setS((p) => ({
    ...p,
    ldg: {
      ...p.ldg,
      model: j.model === "at100pro2" || j.model === "at600pro2" || j.model === "at1000pro2" ? j.model : p.ldg.model,
      port: typeof j.port === "string" ? j.port : p.ldg.port,
      autoConnect: typeof j.autoConnect === "boolean" ? j.autoConnect : p.ldg.autoConnect,
      connected: Boolean(j.connected),
      hardware: Boolean(j.hardware),
      serialOk: typeof j.serialOk === "boolean" ? j.serialOk : p.ldg.serialOk,
      maxW: Number.isFinite(Number(j.maxW)) ? Number(j.maxW) : p.ldg.maxW,
      label: typeof j.label === "string" && j.label ? j.label : p.ldg.label,
      phase:
        j.phase === "idle" || j.phase === "connecting" || j.phase === "ready" || j.phase === "tuning" || j.phase === "error"
          ? j.phase
          : p.ldg.phase,
      error: typeof j.error === "string" ? j.error : p.ldg.error,
      ant: j.ant === 2 ? 2 : j.ant === 1 ? 1 : p.ldg.ant,
      mode: j.mode === "MANUAL" || j.mode === "BYPASS" || j.mode === "AUTO" ? j.mode : p.ldg.mode,
      match: j.match === "T" || j.match === "M" || j.match === "F" || j.match === "" ? j.match : p.ldg.match,
      tuning: Boolean(j.tuning),
      fwd: Number.isFinite(Number(j.fwd)) ? Number(j.fwd) : p.ldg.fwd,
      ref: Number.isFinite(Number(j.ref)) ? Number(j.ref) : p.ldg.ref,
      swr: Number.isFinite(Number(j.swr)) ? Number(j.swr) : p.ldg.swr,
      lastRx: typeof j.lastRx === "string" ? j.lastRx : p.ldg.lastRx,
    },
  }));
}

export async function ldgCommand(cmd: string) {
  const r = await fetch("/api/ldg/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd }),
  });
  return (await r.json()) as Record<string, unknown>;
}

export function LdgPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const d = s.ldg;
  const serial = d.serialOk && d.model !== "at100pro2";
  const link = assignedSvc(s.ser2net.services, "ldg");
  const ip = s2nAside(s.ser2net.bind, s.ser2net.services, "ldg") || tx("s2nPick");

  const save = async (patch: Record<string, unknown>) => {
    const r = await fetch("/api/ldg", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: d.model, autoConnect: d.autoConnect, ...patch }),
    });
    applyLdg(setS, (await r.json()) as Record<string, unknown>);
  };

  const connect = async () => {
    if (serial && !link) {
      toast.error(tx("ldgNeedPort"));
      return;
    }
    try {
      const r = await fetch("/api/ldg/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: d.model }),
      });
      const j = (await r.json()) as Record<string, unknown>;
      applyLdg(setS, j);
      if (j.error === "sim") toast.message(tx("ldgSim"));
      else if (j.error === "noserial") toast.message(tx("ldgNoSerial"));
      else if (j.hardware) toast.success(tx("ldgSynced"));
      else toast.success(tx("connected"));
      pushLog("LDG", `${d.label} ${String(j.error || "up")}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const disconnect = async () => {
    const r = await fetch("/api/ldg/disconnect", { method: "POST" });
    applyLdg(setS, (await r.json()) as Record<string, unknown>);
    pushLog("LDG", tx("disconnect"));
  };

  const cmd = async (c: string) => {
    if (c === "mem" || c === "full") toast.message(tx("ldgNeedRf"));
    try {
      const j = await ldgCommand(c);
      applyLdg(setS, j);
      pushLog("LDG", c);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const matchLabel =
    d.match === "T" ? tx("ldgMatchT") : d.match === "M" ? tx("ldgMatchM") : d.match === "F" ? tx("ldgMatchF") : "—";

  return (
    <div>
      <PageHead kicker={tx("ldg")} title={tx("ldgTitle")} aside={<span className="text-xs text-[#8ea0b3]">{serial ? ip : tx("ldgNoSerial")}</span>} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{serial ? tx("ldgHelp") : tx("ldgHelp100")}</p>
      {serial ? <Ser2netLink acc="ldg" /> : null}
      <Panel className="mb-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={tx("ldgModel")}>
            <ConsoleSelect
              value={d.model}
              onChange={(e) => {
                const model = e.target.value as LdgModel;
                setS((p) => ({ ...p, ldg: { ...p.ldg, model } }));
                void save({ model });
              }}
            >
              {LDG_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {tx(m.key)}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <Field label={tx("baud")}>
            <ConsoleInput value="38400 8N1" readOnly />
          </Field>
        </div>
        {serial ? <p className="mt-3 text-xs text-[#ffb300]">{tx("ldgTtlWarn")}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {d.connected ? (
            <GhostBtn onClick={() => void disconnect()}>{tx("disconnect")}</GhostBtn>
          ) : (
            <PrimaryBtn onClick={() => void connect()}>{tx("ldgConnect")}</PrimaryBtn>
          )}
          <Chip
            active={d.autoConnect}
            onClick={() => {
              const autoConnect = !d.autoConnect;
              setS((p) => ({ ...p, ldg: { ...p.ldg, autoConnect } }));
              void save({ autoConnect });
            }}
          >
            {tx("svcAutostart")}
          </Chip>
        </div>
      </Panel>

      <Lcd>
        <div className="mb-3 flex items-center justify-between border-b border-[#0c2236] pb-3">
          <span className="text-xs font-semibold tracking-[0.2em] text-[#4fc3f7]">{d.label}</span>
          <span className="text-[11px] text-[#8ea0b3]">{d.mode}</span>
          <span className="rounded bg-[#4fc3f7]/10 px-2 py-0.5 text-[11px] font-bold text-[#4fc3f7]">
            {tx("ldgAnt")} {d.ant}
          </span>
        </div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[10px] text-[#5d7184]">{tx("ldgFwd")}</p>
            <p className="text-5xl font-semibold tracking-wide text-[#ffb300]">
              {formatWatts(d.fwd)}
              <span className="ml-1 text-lg">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#5d7184]">{tx("ldgMatch")}</p>
            <p className={`text-xl font-semibold ${d.match === "F" ? "text-[#f87171]" : "text-[#34d399]"}`}>{matchLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-[#0c2236] pt-3">
          <LcdCell k={tx("ldgRef")} v={`${formatWatts(d.ref)} W`} tone="red" />
          <LcdCell k={tx("lextelSwr")} v={d.swr.toFixed(2)} tone="amber" />
          <LcdCell k="MAX" v={`${d.maxW} W`} ink />
        </div>
      </Lcd>
      <Panel className="mt-4 flex justify-around py-4">
        <Led on={d.connected} tone="green" label={tx("connected")} />
        <Led on={d.tuning} tone="amber" label={tx("ldgTuning")} />
        <Led on={d.mode === "BYPASS"} tone="cyan" label={tx("ldgBypass")} />
        <Led on={d.match === "T"} tone="green" label={tx("ldgMatchT")} />
      </Panel>
      <Panel className="mt-4">
        <div className="flex flex-wrap gap-2">
          <Chip tone="amber" active={d.tuning} onClick={() => void cmd("mem")}>
            {tx("ldgMemTune")}
          </Chip>
          <Chip tone="amber" onClick={() => void cmd("full")}>
            {tx("ldgFullTune")}
          </Chip>
          <Chip active={d.mode === "BYPASS"} onClick={() => void cmd("bypass")}>
            {tx("ldgBypass")}
          </Chip>
          <Chip active={d.mode === "AUTO"} onClick={() => void cmd("auto")}>
            {tx("ldgAuto")}
          </Chip>
          <Chip active={d.mode === "MANUAL"} onClick={() => void cmd("manual")}>
            {tx("ldgManual")}
          </Chip>
          <Chip onClick={() => void cmd("ant")}>
            {tx("ldgAnt")} {d.ant === 1 ? 2 : 1}
          </Chip>
        </div>
      </Panel>
    </div>
  );
}

const LP_ALARM = ["lp100aAlarmOff", "1.5", "2.0", "2.5", "3.0", "lp100aAlarmUser"] as const;
const LP_RANGE: Record<string, I18nKey> = {
  HIGH: "lp100aRangeHigh",
  MID: "lp100aRangeMid",
  LOW: "lp100aRangeLow",
};

export function Lp100aPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const d = s.lp100a;
  const link = assignedSvc(s.ser2net.services, "lp100a");
  const ip = s2nAside(s.ser2net.bind, s.ser2net.services, "lp100a") || tx("s2nPick");
  const baud = link?.baud || 115200;
  const barMax = d.range === "LOW" ? 25 : d.range === "MID" ? 250 : 2500;
  const alarmLabel = d.alarm === 0 || d.alarm === 5 ? tx(LP_ALARM[d.alarm]!) : LP_ALARM[d.alarm] || "—";

  const apply = (j: Record<string, unknown>) => {
    setS((p) => ({ ...p, lp100a: mergeLp100a(p.lp100a, j) }));
  };

  const save = async (patch: Record<string, unknown>) => {
    const r = await fetch("/api/lp100a", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoConnect: d.autoConnect, ...patch }),
    });
    apply((await r.json()) as Record<string, unknown>);
  };

  const connect = async () => {
    if (!link) {
      toast.error(tx("lp100aNeedPort"));
      return;
    }
    try {
      const r = await fetch("/api/lp100a/connect", { method: "POST" });
      const j = (await r.json()) as Record<string, unknown>;
      apply(j);
      if (j.error === "sim") toast.message(tx("lp100aSim"));
      else if (j.error === "noport") toast.error(tx("lp100aNeedPort"));
      else if (j.hardware) toast.success(tx("lp100aSynced"));
      else toast.success(tx("connected"));
      pushLog("LP100A", String(j.error || "up"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const disconnect = async () => {
    const r = await fetch("/api/lp100a/disconnect", { method: "POST" });
    apply((await r.json()) as Record<string, unknown>);
    pushLog("LP100A", tx("disconnect"));
  };

  const cmd = async (c: string) => {
    try {
      const r = await fetch("/api/lp100a/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: c }),
      });
      apply((await r.json()) as Record<string, unknown>);
      pushLog("LP100A", c);
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div>
      <PageHead kicker={tx("lp100a")} title={tx("lp100aTitle")} aside={<span className="text-xs text-[#8ea0b3]">{ip}</span>} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("lp100aHelp")}</p>
      <Ser2netLink acc="lp100a" />
      <Panel className="mb-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={tx("baud")}>
            <ConsoleInput value={`${baud} 8N1`} readOnly />
          </Field>
          <Field label={tx("s2nEndpoint")}>
            <ConsoleInput value={ip} readOnly />
          </Field>
        </div>
        <p className="mt-3 text-xs text-[#ffb300]">{tx("lp100aKeepWatts")}</p>
        <p className="mt-1 text-xs text-[#8ea0b3]">{tx("lp100aOldBaud")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {d.connected ? (
            <GhostBtn onClick={() => void disconnect()}>{tx("disconnect")}</GhostBtn>
          ) : (
            <PrimaryBtn onClick={() => void connect()}>{tx("lp100aConnect")}</PrimaryBtn>
          )}
          <Chip
            active={d.autoConnect}
            onClick={() => {
              const autoConnect = !d.autoConnect;
              setS((p) => ({ ...p, lp100a: { ...p.lp100a, autoConnect } }));
              void save({ autoConnect });
            }}
          >
            {tx("svcAutostart")}
          </Chip>
        </div>
      </Panel>

      <Lcd>
        <div className="mb-3 flex items-center justify-between border-b border-[#0c2236] pb-3">
          <span className="text-xs font-semibold tracking-[0.2em] text-[#4fc3f7]">LP-100A</span>
          <span className="text-[11px] text-[#8ea0b3]">{d.callsign || tx("lp100aCall")}</span>
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${d.tx ? "bg-[#ef4444] text-white" : "text-[#8ea0b3]"}`}>
            {d.tx ? "TX" : "RX"}
          </span>
        </div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[10px] text-[#5d7184]">{tx("lp100aFwd")}</p>
            <p className="text-5xl font-semibold tracking-wide text-[#ffb300]">
              {formatWatts(d.fwd)}
              <span className="ml-1 text-lg">W</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[#5d7184]">{tx("lp100aAlarm")}</p>
            <p className={`text-xl font-semibold ${d.alarm > 0 && d.swr >= 2 ? "text-[#f87171]" : "text-[#34d399]"}`}>{alarmLabel}</p>
          </div>
        </div>
        <div className="mb-3">
          <LedBar value={d.fwd} max={barMax} tone="red" />
        </div>
        <div className="grid grid-cols-4 gap-3 border-t border-[#0c2236] pt-3">
          <LcdCell k={tx("lextelSwr")} v={d.swr.toFixed(2)} tone={d.swr >= 2 ? "red" : "amber"} />
          <LcdCell k={tx("lp100aRef")} v={`${formatWatts(d.ref)} W`} tone="red" />
          <LcdCell k={tx("lp100aZ")} v={`${d.z.toFixed(1)} Ω`} tone="green" />
          <LcdCell k={tx("lp100aPhase")} v={`${d.phaseDeg.toFixed(1)}°`} ink />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <LcdCell k={tx("lp100aDbm")} v={`${d.dbm.toFixed(1)}`} tone="amber" />
          <LcdCell k={tx("lp100aRange")} v={tx(LP_RANGE[d.range] || "lp100aRangeHigh")} ink />
          <LcdCell k={tx("mode")} v={d.meter} ink />
        </div>
      </Lcd>
      <Panel className="mt-4 flex justify-around py-4">
        <Led on={d.connected} tone="green" label={tx("connected")} />
        <Led on={d.hardware} tone="cyan" label="RS232" />
        <Led on={d.tx} tone="red" label="TX" />
        <Led on={d.alarm > 0 && d.swr >= 2} tone="amber" label={tx("lp100aAlarm")} />
      </Panel>
      <Panel className="mt-4">
        <PanelTitle>{tx("control")}</PanelTitle>
        <div className="flex flex-wrap gap-2">
          <Chip active={d.meter === "AVG"} onClick={() => void cmd("meter")}>
            {tx("lp100aAvg")}
          </Chip>
          <Chip active={d.meter === "PEAK"} onClick={() => void cmd("meter")}>
            {tx("lp100aPeak")}
          </Chip>
          <Chip tone="amber" active={d.meter === "TUNE"} onClick={() => void cmd("meter")}>
            {tx("lp100aTune")}
          </Chip>
          <Chip onClick={() => void cmd("alarm")}>
            {tx("lp100aAlarm")} {alarmLabel}
          </Chip>
        </div>
      </Panel>
    </div>
  );
}

function StatusTile({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <Panel>
      <p className="text-[11px] tracking-wide text-[#8ea0b3] uppercase">{label}</p>
      <p className={`mt-1 font-['IBM_Plex_Mono'] text-lg font-semibold ${on ? "text-[#34d399]" : "text-[#f87171]"}`}>{value}</p>
    </Panel>
  );
}

function LcdCell({
  k,
  v,
  tone,
  ink,
}: {
  k: string;
  v: string;
  tone?: "green" | "red" | "amber";
  ink?: boolean;
}) {
  const color = ink
    ? "text-[#e8eef4]"
    : tone === "green"
      ? "text-[#34d399]"
      : tone === "red"
        ? "text-[#f87171]"
        : tone === "amber"
          ? "text-[#ffb300]"
          : "text-[#4fc3f7]";
  return (
    <div>
      <p className="text-[10px] tracking-wide text-[#5d7184]">{k}</p>
      <p className={`text-lg font-semibold ${color}`}>{v}</p>
    </div>
  );
}
