import { useLocation } from "wouter";
import { toast } from "sonner";
import { assignedSvc, assignDevice, persistSer2net, s2nDeviceLabelKey, type Ser2netAccId } from "./ser2net-api";
import { useConsole } from "./state";
import { ConsoleInput, ConsoleSelect, Field, GhostBtn, Panel, PanelTitle } from "./widgets";

export function Ser2netLink({ acc }: { acc: Ser2netAccId }) {
  const { s, setS, tx } = useConsole();
  const [, navigate] = useLocation();
  const n = s.ser2net;
  const selected = assignedSvc(n.services, acc);
  const endpoint = selected ? `${n.bind}:${selected.tcpPort}` : "—";

  const pick = async (id: string) => {
    try {
      const next = id
        ? assignDevice(n.services, id, acc)
        : n.services.map((x) => ({ ...x, device: x.device === acc ? "" : x.device }));
      const saved = await persistSer2net({ bind: n.bind, folder: n.folder, services: next });
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tx("ser2netSaveFail"));
    }
  };

  return (
    <Panel className="mb-4">
      <PanelTitle>{tx("s2nIpLink")}</PanelTitle>
      <p className="mb-3 text-sm leading-relaxed text-[#8ea0b3]">{tx("s2nUsing")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={tx("s2nPick")}>
          <ConsoleSelect value={selected?.id ?? ""} onChange={(e) => void pick(e.target.value)}>
            <option value="">{tx("s2nPick")}</option>
            {n.services.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {n.bind}:{row.tcpPort} · {row.baud}
                {row.device && row.device !== acc ? ` · ${tx(s2nDeviceLabelKey(row.device))}` : ""}
              </option>
            ))}
          </ConsoleSelect>
        </Field>
        <Field label={tx("s2nEndpoint")}>
          <ConsoleInput value={endpoint} readOnly />
        </Field>
      </div>
      {n.services.length === 0 ? <p className="mt-3 text-sm text-[#ffb300]">{tx("s2nNone")}</p> : null}
      <div className="mt-3">
        <GhostBtn onClick={() => navigate("/console/ser2net")}>{tx("s2nOpen")}</GhostBtn>
      </div>
    </Panel>
  );
}
