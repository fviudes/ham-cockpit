import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  SER2NET_ACC_BAUD,
  SER2NET_ACC_IDS,
  SER2NET_ACC_NAME,
  SER2NET_RADIO_ID,
  assignDevice,
  ctlHamlib,
  persistSer2net,
  s2nDeviceLabelKey,
  type Ser2netDevice,
} from "./ser2net-api";
import { pickUsbSerial, scanSerials } from "./serial-scan";
import { useConsole, type Ser2netSvc, type SerialDev } from "./state";
import { ConsoleInput, ConsoleSelect, Field, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

const BAUDS = [1200, 9600, 19200, 38400, 57600, 115200];

export function Ser2netPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const n = s.ser2net;
  const [editingId, setEditingId] = useState<string | null>(null);
  const usedPorts = n.services.filter((x) => x.id !== editingId).map((x) => x.tcpPort);
  const nextPort = useMemo(() => {
    let p = 4001;
    while (usedPorts.includes(p)) p += 1;
    return p;
  }, [usedPorts]);

  const usedSerials = useMemo(() => {
    return new Set(n.services.filter((x) => x.id !== editingId).map((x) => x.serial));
  }, [n.services, editingId]);

  const [name, setName] = useState("");
  const [tcpPort, setTcpPort] = useState(nextPort);
  const [serial, setSerial] = useState("");
  const [baud, setBaud] = useState(115200);
  const [device, setDevice] = useState<Ser2netDevice>(SER2NET_RADIO_ID);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!editingId) setTcpPort(nextPort);
  }, [nextPort, editingId]);

  useEffect(() => {
    void refreshSerials();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scan once on open
  }, []);

  useEffect(() => {
    if (editingId) return;
    if (serial && usedSerials.has(serial)) setSerial("");
  }, [editingId, serial, usedSerials]);

  const refreshSerials = async () => {
    setScanning(true);
    try {
      const serials = await scanSerials();
      setS((p) => ({ ...p, ser2net: { ...p.ser2net, serials } }));
      setSerial((cur) => {
        if (cur && !usedSerials.has(cur)) return cur;
        return serials.find((d) => !usedSerials.has(d.path))?.path ?? "";
      });
      pushLog("S2N", `${serials.length} seriais`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const nextFreePort = (extra?: number) => {
    const taken = n.services.map((x) => x.tcpPort);
    if (extra) taken.push(extra);
    let p = 4001;
    while (taken.includes(p)) p += 1;
    return p;
  };

  const resetForm = (addedPort?: number) => {
    setEditingId(null);
    setName("");
    setSerial("");
    setBaud(115200);
    setDevice(SER2NET_RADIO_ID);
    setTcpPort(nextFreePort(addedPort));
  };

  const startEdit = (row: Ser2netSvc) => {
    setEditingId(row.id);
    setName(row.name);
    setTcpPort(row.tcpPort);
    setSerial(row.serial);
    setBaud(row.baud);
    // Não forçar "radio" em linha sem vínculo (ex.: GPS) — senão o save rouba device=radio do CI-V.
    setDevice(row.device || "");
  };

  const others = n.services.filter((x) => x.id !== editingId);

  const persist = async (services: Ser2netSvc[]) => {
    const saved = await persistSer2net({ bind: n.bind, folder: n.folder, services });
    setS((p) => ({
      ...p,
      ser2net: {
        ...p.ser2net,
        bind: saved.bind,
        folder: saved.folder,
        services: saved.services,
        running: saved.running,
        hamlibRunning: saved.hamlibRunning,
      },
    }));
  };

  const saveService = async () => {
    const svcName = name.trim();
    if (!svcName || !serial || !tcpPort) {
      toast.error(tx("fillRequired"));
      return;
    }
    if (usedSerials.has(serial)) {
      toast.error(tx("serialTaken"));
      return;
    }
    if (others.some((x) => x.name.toLowerCase() === svcName.toLowerCase())) {
      toast.error(tx("nameTaken"));
      return;
    }
    if (others.some((x) => x.tcpPort === tcpPort)) {
      toast.error(tx("portTaken"));
      return;
    }
    const id = editingId || nanoid(8);
    const row: Ser2netSvc = { id, name: svcName, serial, tcpPort, baud, device };
    const mapped = editingId ? n.services.map((x) => (x.id === editingId ? row : x)) : [...n.services, row];
    const next = assignDevice(mapped, id, device);
    try {
      await persist(next);
      pushLog("S2N", `${svcName} ${serial} ${n.bind}:${tcpPort}${device ? ` · ${device}` : ""}`);
      toast.success(editingId ? tx("svcUpdated") : tx("svcAdded"));
      resetForm(editingId ? undefined : tcpPort);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("ser2netSaveFail"));
    }
  };

  const removeService = async (id: string) => {
    const row = n.services.find((x) => x.id === id);
    try {
      await persist(n.services.filter((x) => x.id !== id));
      if (editingId === id) resetForm();
      if (row) {
        pushLog("S2N", `${tx("remove")} ${row.name}`);
        toast.message(tx("svcRemoved"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("ser2netSaveFail"));
    }
  };

  const serials = n.serials;

  return (
    <div>
      <PageHead kicker={tx("ser2net")} title={tx("ser2netTitle")} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("ser2netHelp")}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="ser2net" value={n.running ? tx("connected") : tx("disconnected")} on={n.running} />
        <Tile label={tx("registered")} value={String(n.services.length)} on={n.services.length > 0} />
        <Tile label={tx("ser2netBind")} value={n.bind} on={n.bind === "127.0.0.1"} />
        <Tile label={tx("scan")} value={String(serials.length)} on={serials.length > 0} />
      </div>

      <Panel className="mt-4">
        <PanelTitle>{editingId ? tx("editDevice") : tx("addDevice")}</PanelTitle>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label={tx("svcName")}>
            <ConsoleInput value={name} onChange={(e) => setName(e.target.value)} placeholder="SPE" />
          </Field>
          <Field label={tx("s2nFor")}>
            <ConsoleSelect
              value={device}
              onChange={(e) => {
                const next = e.target.value as Ser2netDevice;
                setDevice(next);
                if (next && next !== SER2NET_RADIO_ID && SER2NET_ACC_IDS.includes(next)) {
                  if (!name.trim()) setName(SER2NET_ACC_NAME[next]);
                  setBaud(SER2NET_ACC_BAUD[next]);
                }
              }}
            >
              <option value="">{tx("s2nForNone")}</option>
              <option value={SER2NET_RADIO_ID}>{tx("s2nForRadio")}</option>
              {SER2NET_ACC_IDS.map((id) => (
                <option key={id} value={id}>
                  {tx(id)}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <Field label={tx("netPort")}>
            <ConsoleInput
              type="number"
              min={1024}
              max={65535}
              value={tcpPort}
              onChange={(e) => setTcpPort(Number(e.target.value) || nextPort)}
            />
          </Field>
          <Field label={tx("baud")}>
            <ConsoleSelect value={baud} onChange={(e) => setBaud(Number(e.target.value))}>
              {BAUDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </ConsoleSelect>
          </Field>
          <div className="block space-y-1.5 md:col-span-2 lg:col-span-4">
            <span className="text-[11px] font-medium tracking-wide text-[#8ea0b3] uppercase">{tx("serialPath")}</span>
            <SerialPicker
              serials={serials}
              value={serial}
              used={usedSerials}
              placeholder={tx("pickSerial")}
              onChange={setSerial}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn onClick={() => void saveService()}>{editingId ? tx("save") : tx("add")}</PrimaryBtn>
          {editingId ? <GhostBtn onClick={resetForm}>{tx("cancelEdit")}</GhostBtn> : null}
          <GhostBtn onClick={() => void refreshSerials()}>{scanning ? tx("scanning") : tx("scanSerials")}</GhostBtn>
          <GhostBtn
            onClick={async () => {
              try {
                const d = await pickUsbSerial();
                if (!d) {
                  toast.error(tx("usbUnavailable"));
                  return;
                }
                if (usedSerials.has(d.path)) {
                  toast.error(tx("serialTaken"));
                  return;
                }
                setS((p) => {
                  const exists = p.ser2net.serials.some((x) => x.path === d.path);
                  return {
                    ...p,
                    ser2net: { ...p.ser2net, serials: exists ? p.ser2net.serials : [...p.ser2net.serials, d] },
                  };
                });
                setSerial(d.path);
                toast.success(d.label);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (!/cancel|choos/i.test(msg)) toast.error(msg);
              }
            }}
          >
            {tx("usbPick")}
          </GhostBtn>
        </div>
      </Panel>

      <Panel className="mt-4">
        <PanelTitle>{tx("registered")}</PanelTitle>
        {n.services.length === 0 ? (
          <p className="text-sm text-[#8ea0b3]">{tx("noServices")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] tracking-wide text-[#ffb300] uppercase">
                <tr>
                  <th className="py-2">{tx("svcName")}</th>
                  <th>{tx("s2nFor")}</th>
                  <th>{tx("serialPath")}</th>
                  <th>{tx("netPort")}</th>
                  <th>{tx("baud")}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {n.services.map((row) => (
                  <tr key={row.id} className="border-t border-[rgba(79,195,247,0.08)]">
                    <td className="py-2 font-semibold text-[#4fc3f7]">{row.name}</td>
                    <td className="py-2">{tx(s2nDeviceLabelKey(row.device))}</td>
                    <td className="py-2 font-['IBM_Plex_Mono'] text-[11px]">{row.serial}</td>
                    <td className="py-2 font-['IBM_Plex_Mono']">
                      {n.bind}:{row.tcpPort}
                    </td>
                    <td className="py-2 font-['IBM_Plex_Mono']">{row.baud}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <GhostBtn onClick={() => startEdit(row)}>{tx("edit")}</GhostBtn>
                        <GhostBtn danger onClick={() => void removeService(row.id)}>
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

      <Panel className="mt-4">
        <PanelTitle>{tx("config")}</PanelTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={tx("folder")}>
            <ConsoleInput
              value={n.folder}
              onChange={(e) => setS((p) => ({ ...p, ser2net: { ...p.ser2net, folder: e.target.value } }))}
            />
          </Field>
          <Field label={tx("ser2netBind")}>
            <ConsoleInput
              value={n.bind}
              onChange={(e) => setS((p) => ({ ...p, ser2net: { ...p.ser2net, bind: e.target.value } }))}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryBtn
            onClick={() => {
              void persist(n.services)
                .then(() => {
                  setS((p) => ({ ...p, ser2net: { ...p.ser2net, running: true } }));
                  pushLog("S2N", `up ${n.services.length} svc · ${n.bind}`);
                  toast.success(tx("ser2netRunning"));
                })
                .catch((err: unknown) => toast.error(err instanceof Error ? err.message : tx("ser2netSaveFail")));
            }}
          >
            {tx("startService")}
          </PrimaryBtn>
          <GhostBtn
            danger
            onClick={() => {
              setS((p) => ({ ...p, ser2net: { ...p.ser2net, running: false, hamlibRunning: false } }));
              pushLog("S2N", "ser2net parado");
            }}
          >
            {tx("stopService")}
          </GhostBtn>
          <PrimaryBtn
            onClick={() => {
              if (!n.running || n.services.length === 0) {
                toast.error(tx("noServices"));
                return;
              }
              void ctlHamlib("start")
                .then((up) => {
                  setS((p) => ({ ...p, ser2net: { ...p.ser2net, hamlibRunning: up } }));
                  const first =
                    n.services.find((x) => x.device === SER2NET_RADIO_ID) ||
                    n.services.find((x) => !x.device) ||
                    n.services[0];
                  pushLog("S2N", `rigctld -r ${n.bind}:${first?.tcpPort ?? "?"} · ${up ? ":4532" : "falha"}`);
                  if (up) toast.success(tx("hamlibRunning"));
                  else toast.error(tx("disconnected"));
                })
                .catch((err: unknown) => toast.error(err instanceof Error ? err.message : tx("disconnected")));
            }}
          >
            {tx("startHamlib")}
          </PrimaryBtn>
          <GhostBtn
            danger
            onClick={() => {
              void ctlHamlib("stop")
                .then(() => {
                  setS((p) => ({ ...p, ser2net: { ...p.ser2net, hamlibRunning: false } }));
                  pushLog("S2N", "Hamlib parado");
                })
                .catch((err: unknown) => toast.error(err instanceof Error ? err.message : tx("disconnected")));
            }}
          >
            {tx("stopHamlib")}
          </GhostBtn>
        </div>
      </Panel>
    </div>
  );
}

function serialLabel(d: SerialDev) {
  return `${d.kind === "usb" ? "USB" : "TTY"} · ${d.label}`;
}

export function SerialPicker({
  serials,
  value,
  used,
  placeholder,
  onChange,
}: {
  serials: SerialDev[];
  value: string;
  used: Set<string>;
  placeholder: string;
  onChange: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = serials.find((d) => d.path === value);

  useEffect(() => {
    const hide = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  const rows: { path: string; prefix: string; extra?: boolean }[] = serials.map((d) => ({
    path: d.path,
    prefix: serialLabel(d),
  }));
  if (value && !current) {
    rows.unshift({ path: value, prefix: value, extra: true });
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-[rgba(79,195,247,0.22)] bg-[#101c28] px-3 text-left text-sm text-[#e8eef4] outline-none hover:border-[#4fc3f7] focus:border-[#4fc3f7]"
      >
        <span className="min-w-0 truncate">
          {value ? (
            <>
              {current ? `${serialLabel(current)} · ` : null}
              <span className="font-['IBM_Plex_Mono'] text-[12px]">{value}</span>
            </>
          ) : (
            <span className="text-[#5d7184]">{placeholder}</span>
          )}
        </span>
        <span className="shrink-0 text-[#5d7184]">▾</span>
      </button>
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-56 min-w-full overflow-auto rounded-md border border-[rgba(79,195,247,0.22)] bg-[#0b1520] py-1 shadow-lg">
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[#5d7184]">{placeholder}</li>
          ) : (
            rows.map((row) => {
              const busy = used.has(row.path);
              return (
                <li key={row.path}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (busy) return;
                      onChange(row.path);
                      setOpen(false);
                    }}
                    className={`flex w-full items-baseline gap-1 whitespace-nowrap px-3 py-2 text-left text-sm ${
                      busy
                        ? "cursor-not-allowed text-[#8ea0b3]"
                        : "text-[#e8eef4] hover:bg-[#4fc3f7]/15"
                    } ${value === row.path && !busy ? "bg-[#4fc3f7]/10" : ""}`}
                  >
                    {row.extra ? null : <span className="shrink-0">{row.prefix} · </span>}
                    <span className={`font-['IBM_Plex_Mono'] text-[12px] ${busy ? "text-[#f87171]" : "text-[#7ee0ff]"}`}>
                      {row.path}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Tile({ label, value, on }: { label: string; value: string; on?: boolean }) {
  return (
    <Panel>
      <p className="text-[11px] tracking-wide text-[#8ea0b3] uppercase">{label}</p>
      <p className={`mt-1 truncate font-['IBM_Plex_Mono'] text-lg font-semibold ${on ? "text-[#34d399]" : "text-[#f87171]"}`}>
        {value}
      </p>
    </Panel>
  );
}
