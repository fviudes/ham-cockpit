import { nanoid } from "nanoid";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import type { ServiceId } from "@shared/const";
import { SER2NET_ACC_BAUD, SER2NET_ACC_IDS, SER2NET_ACC_NAME, assignDevice, nextTcpPort, persistSer2net, type Ser2netAccId } from "./ser2net-api";
import { SerialPicker } from "./ser2net";
import { pickUsbSerial, scanSerials } from "./serial-scan";
import { useConsole } from "./state";
import { Chip, ConsoleInput, ConsoleSelect, Field, GhostBtn, PageHead, Panel, PanelTitle, PrimaryBtn } from "./widgets";

const BAUDS = [1200, 9600, 19200, 38400, 57600, 115200];

export function WizardPage() {
  const { s, setS, tx, pushLog } = useConsole();
  const [, navigate] = useLocation();
  const n = s.ser2net;
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [tcpPort, setTcpPort] = useState(() => nextTcpPort(n.services));
  const [serial, setSerial] = useState("");
  const [device, setDevice] = useState<Ser2netAccId | "">("");
  const [name, setName] = useState("");
  const [baud, setBaud] = useState(9600);
  const [autostart, setAutostart] = useState(true);
  const usedSerials = useMemo(() => new Set(n.services.map((x) => x.serial)), [n.services]);
  const usedPorts = useMemo(() => new Set(n.services.map((x) => x.tcpPort)), [n.services]);
  const takenDevices = useMemo(() => new Set(n.services.map((x) => x.device).filter(Boolean)), [n.services]);
  const available = SER2NET_ACC_IDS.filter((id) => !takenDevices.has(id));
  const bind = n.bind || "127.0.0.1";
  const freePort = nextTcpPort(n.services);

  useEffect(() => {
    setTcpPort((cur) => (usedPorts.has(cur) ? freePort : cur || freePort));
  }, [freePort, usedPorts]);

  useEffect(() => {
    void refreshSerials();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scan once
  }, []);

  const refreshSerials = async () => {
    setScanning(true);
    try {
      const serials = await scanSerials();
      setS((p) => ({ ...p, ser2net: { ...p.ser2net, serials } }));
      setSerial((cur) => {
        if (cur && !usedSerials.has(cur)) return cur;
        return serials.find((d) => !usedSerials.has(d.path))?.path ?? "";
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const pickDevice = (id: Ser2netAccId | "") => {
    setDevice(id);
    if (!id) return;
    setName(SER2NET_ACC_NAME[id]);
    setBaud(SER2NET_ACC_BAUD[id]);
  };

  const goStep2 = () => {
    if (!serial) {
      toast.error(tx("wizardNeedSerial"));
      return;
    }
    setStep(2);
  };

  const goStep3 = () => {
    if (!device) {
      toast.error(tx("wizardNeedDevice"));
      return;
    }
    if (!name.trim()) {
      toast.error(tx("fillRequired"));
      return;
    }
    setStep(3);
  };

  const finish = async () => {
    if (!device) {
      toast.error(tx("wizardNeedDevice"));
      return;
    }
    if (!serial) {
      toast.error(tx("wizardNeedSerial"));
      return;
    }
    const already = n.services.find((x) => x.device === device);
    if (already) {
      setBusy(true);
      try {
        await applyAutostart(device);
        toast.success(tx("wizardDone"));
        navigate(`/console/${device}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tx("ser2netSaveFail"));
      } finally {
        setBusy(false);
      }
      return;
    }
    const port = Math.trunc(Number(tcpPort));
    if (!Number.isFinite(port) || port < 1024 || port > 65535 || usedPorts.has(port)) {
      toast.error(tx("portTaken"));
      return;
    }
    const svcName = name.trim() || SER2NET_ACC_NAME[device];
    setBusy(true);
    try {
      const id = nanoid(8);
      const row = { id, name: svcName, serial, tcpPort: port, baud, device };
      const services = assignDevice([...n.services, row], id, device);
      const saved = await persistSer2net({ bind, folder: n.folder, services });
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
      try {
        await applyAutostart(device);
      } catch {
        /* ser2net already saved — autostart is best-effort */
      }
      pushLog("S2N", `${svcName} ${bind}:${port} → ${device}`);
      toast.success(tx("wizardDone"));
      navigate(`/console/${device}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("ser2netSaveFail"));
    } finally {
      setBusy(false);
    }
  };

  const applyAutostart = async (id: ServiceId) => {
    if (!autostart) return;
    await setDeviceAutostart(id, true);
    if (id !== "ldg" && id !== "lp100a") return;
    await fetch(`/api/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoConnect: true }),
    });
    await fetch(`/api/${id}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
  };

  const setDeviceAutostart = async (id: ServiceId, on: boolean) => {
    const r = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, autostart: on }),
    });
    const j = (await r.json()) as {
      ok?: boolean;
      items?: { id: ServiceId; autostart?: boolean; running?: boolean }[];
    };
    if (!r.ok || j.ok === false || !Array.isArray(j.items)) return;
    setS((p) => ({
      ...p,
      services: p.services.map((row) => {
        const hit = j.items!.find((x) => x.id === row.id);
        return hit ? { ...row, autostart: hit.autostart !== false, running: Boolean(hit.running) } : row;
      }),
    }));
  };

  const steps = [
    { n: 1, label: tx("wizardStep1") },
    { n: 2, label: tx("wizardStep2") },
    { n: 3, label: tx("wizardStep3") },
  ];

  return (
    <div>
      <PageHead kicker={tx("navSetup")} title={tx("wizard")} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("wizardHelp")}</p>

      <div className="mb-6 grid grid-cols-3 gap-2">
        {steps.map((row) => (
          <div
            key={row.n}
            className={`rounded-lg border px-3 py-2 ${
              step === row.n
                ? "border-[#4fc3f7] bg-[#4fc3f7]/10"
                : step > row.n
                  ? "border-[#10b981]/40 bg-[#10b981]/10"
                  : "border-[rgba(79,195,247,0.12)]"
            }`}
          >
            <p className="font-['IBM_Plex_Mono'] text-[10px] tracking-widest text-[#8ea0b3] uppercase">
              {tx("wizardStep")} {row.n}
            </p>
            <p className={`text-sm font-semibold ${step === row.n ? "text-[#4fc3f7]" : "text-[#c5d4e0]"}`}>{row.label}</p>
          </div>
        ))}
      </div>

      {step === 1 ? (
        <Panel>
          <PanelTitle>{tx("wizardStep1")}</PanelTitle>
          <p className="mb-4 text-sm text-[#8ea0b3]">{tx("wizardStep1Help")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={tx("s2nEndpoint")}>
              <ConsoleInput value={bind} readOnly />
            </Field>
            <Field label={tx("netPort")}>
              <ConsoleInput
                type="number"
                min={1024}
                max={65535}
                value={tcpPort}
                onChange={(e) => setTcpPort(Number(e.target.value) || freePort)}
              />
            </Field>
            <div className="block space-y-1.5 md:col-span-2">
              <span className="text-[11px] font-medium tracking-wide text-[#8ea0b3] uppercase">{tx("serialPath")}</span>
              <SerialPicker
                serials={n.serials}
                value={serial}
                used={usedSerials}
                placeholder={tx("pickSerial")}
                onChange={setSerial}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-[#8ea0b3]">{tx("wizardPortHint")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
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
            <PrimaryBtn onClick={goStep2} disabled={!serial}>
              {tx("wizardNext")}
            </PrimaryBtn>
          </div>
        </Panel>
      ) : null}

      {step === 2 ? (
        <Panel>
          <PanelTitle>{tx("wizardStep2")}</PanelTitle>
          <p className="mb-4 text-sm text-[#8ea0b3]">{tx("wizardStep2Help")}</p>
          {available.length === 0 ? (
            <p className="mb-4 text-sm text-[#ffb300]">{tx("wizardNoDevice")}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={tx("s2nFor")}>
                <ConsoleSelect value={device} onChange={(e) => pickDevice(e.target.value as Ser2netAccId | "")}>
                  <option value="">{tx("wizardNeedDevice")}</option>
                  {available.map((id) => (
                    <option key={id} value={id}>
                      {tx(id)} · {SER2NET_ACC_BAUD[id]} 8N1
                    </option>
                  ))}
                </ConsoleSelect>
              </Field>
              <Field label={tx("svcName")}>
                <ConsoleInput value={name} onChange={(e) => setName(e.target.value)} placeholder="SPE" />
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
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <GhostBtn onClick={() => setStep(1)}>{tx("wizardBack")}</GhostBtn>
            <PrimaryBtn onClick={goStep3} disabled={!device}>
              {tx("wizardNext")}
            </PrimaryBtn>
          </div>
        </Panel>
      ) : null}

      {step === 3 ? (
        <Panel>
          <PanelTitle>{tx("wizardStep3")}</PanelTitle>
          <p className="mb-4 text-sm text-[#8ea0b3]">{tx("wizardStep3Help")}</p>
          <div className="mb-4 grid gap-2 font-['IBM_Plex_Mono'] text-sm text-[#c5d4e0]">
            <p>
              {tx("s2nEndpoint")}:{" "}
              <span className="text-[#4fc3f7]">
                {bind}:{tcpPort}
              </span>
            </p>
            <p>
              {tx("serialPath")}: <span className="text-[#4fc3f7]">{serial}</span>
            </p>
            <p>
              {tx("s2nFor")}: <span className="text-[#4fc3f7]">{device ? tx(device) : "—"}</span>
            </p>
            <p>
              {tx("svcName")}: <span className="text-[#4fc3f7]">{name || "—"}</span>
            </p>
            <p>
              {tx("baud")}: <span className="text-[#4fc3f7]">{baud} 8N1</span>
            </p>
          </div>
          <Chip active={autostart} tone="ok" onClick={() => setAutostart((v) => !v)}>
            {tx("svcAutostart")}
          </Chip>
          <div className="mt-4 flex flex-wrap gap-2">
            <GhostBtn onClick={() => setStep(2)}>{tx("wizardBack")}</GhostBtn>
            <PrimaryBtn onClick={() => void finish()} disabled={busy}>
              {tx("wizardFinish")}
            </PrimaryBtn>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
