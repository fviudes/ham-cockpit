import type { ReactNode } from "react";
import {
  CONNECTION_LABEL,
  EQUIPMENT_CATALOG,
  EQUIPMENT_MAKERS,
  MAKER_BLURB,
  MAKER_LABEL,
  PROTOCOL_LABEL,
  formatPorts,
  listEquipmentByMaker,
  type ConnectionKind,
  type EquipmentMaker,
  type EquipmentRadio,
} from "@shared/equipment";
import {
  FigFlexNet,
  FigHamlibHub,
  FigIcomLan,
  FigMakerBadges,
  FigOpenHpsdr,
} from "./manual-diagrams";

type Pair = { pt: string; en: string };

function L(lang: "pt" | "en", p: Pair) {
  return lang === "en" ? p.en : p.pt;
}

function kindLabel(lang: "pt" | "en", kind: ConnectionKind) {
  return L(lang, CONNECTION_LABEL[kind]);
}

function portsLine(eq: EquipmentRadio): string {
  const preferred = eq.connections.find((c) => c.preferred) || eq.connections[0];
  return formatPorts(preferred?.ports);
}

/** Guia completo do catálogo — usado na Docs e no Manual. */
export function EquipmentGuide({ lang }: { lang: "pt" | "en" }) {
  const t = (p: Pair) => L(lang, p);
  return (
    <div className="space-y-8">
      <p className="text-[15px] leading-relaxed text-[#94a3b8]">
        {t({
          pt: "O Ham Cockpit centraliza o CAT no Hamlib (rigctld). Cada modelo do catálogo declara protocolos, portas e caminhos de conexão. O painel e o WSJT-X falam com :4532; a serial USB passa pelo ser2net; SDRs Ethernet (HL2/Anan/Flex) usam proxy CAT do app SDR até existir driver nativo.",
          en: "Ham Cockpit centers CAT on Hamlib (rigctld). Each catalog model declares protocols, ports, and connection paths. The panel and WSJT-X talk to :4532; USB serial goes through ser2net; Ethernet SDRs (HL2/Anan/Flex) use the SDR app CAT proxy until a native driver exists.",
        })}
      </p>

      <FigMakerBadges
        caption={t({
          pt: "Fabricantes no catálogo — wordmarks tipográficos (não são logotipos oficiais).",
          en: "Makers in the catalog — typographic wordmarks (not official logos).",
        })}
      />

      <FigHamlibHub
        caption={t({
          pt: "Arquitetura: rádios → (ser2net | proxy CAT | GATT) → Hamlib Hub :4532 → Painel / WSJT-X / WaveLogGate.",
          en: "Architecture: radios → (ser2net | CAT proxy | GATT) → Hamlib Hub :4532 → Panel / WSJT-X / WaveLogGate.",
        })}
      />

      <div className="overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
            <tr>
              <th className="px-3 py-2">{t({ pt: "Fabricante", en: "Maker" })}</th>
              <th className="px-3 py-2">{t({ pt: "Resumo", en: "Summary" })}</th>
              <th className="px-3 py-2">{t({ pt: "Modelos", en: "Models" })}</th>
            </tr>
          </thead>
          <tbody className="text-[#c5d4e0]">
            {EQUIPMENT_MAKERS.map((m) => (
              <tr key={m} className="border-t border-[rgba(79,195,247,0.08)] align-top">
                <td className="px-3 py-2 font-semibold text-[#4fc3f7]">{L(lang, MAKER_LABEL[m])}</td>
                <td className="px-3 py-2 text-[#94a3b8]">{L(lang, MAKER_BLURB[m])}</td>
                <td className="px-3 py-2">{listEquipmentByMaker(m).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MakerBlock lang={lang} maker="icom" extra={<FigIcomLan caption={t({ pt: "Icom LAN/WLAN: UDP 50001 control, 50002 CI-V, 50003 audio. Auth: Network User.", en: "Icom LAN/WLAN: UDP 50001 control, 50002 CI-V, 50003 audio. Auth: Network User." })} />} />
      <MakerBlock lang={lang} maker="kenwood" />
      <MakerBlock lang={lang} maker="yaesu" />
      <MakerBlock lang={lang} maker="flex" extra={<FigFlexNet caption={t({ pt: "Flex Signature: discovery/comando 4992, stream VITA 4991.", en: "Flex Signature: discovery/command 4992, VITA stream 4991." })} />} />
      <MakerBlock lang={lang} maker="tentec" />
      <MakerBlock lang={lang} maker="xiegu" />
      <MakerBlock
        lang={lang}
        maker="hermes"
        extra={
          <FigOpenHpsdr
            caption={t({
              pt: "Hermes Lite 2 (P1) e Anan (P2): IQ no Ethernet; Hamlib no CAT do Thetis (:13013) ou piHPSDR (:19090).",
              en: "Hermes Lite 2 (P1) and Anan (P2): IQ on Ethernet; Hamlib on Thetis CAT (:13013) or piHPSDR (:19090).",
            })}
          />
        }
      />
      <MakerBlock lang={lang} maker="anan" />

      <h3 className="font-['Space_Grotesk'] text-lg font-semibold text-white">
        {t({ pt: "Tabela mestra de modelos", en: "Master model table" })}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
            <tr>
              <th className="px-3 py-2">{t({ pt: "Modelo", en: "Model" })}</th>
              <th className="px-3 py-2">{t({ pt: "Protocolo", en: "Protocol" })}</th>
              <th className="px-3 py-2">Hamlib</th>
              <th className="px-3 py-2">{t({ pt: "Conexão preferida", en: "Preferred link" })}</th>
              <th className="px-3 py-2">{t({ pt: "Portas", en: "Ports" })}</th>
              <th className="px-3 py-2">CI-V / baud</th>
            </tr>
          </thead>
          <tbody className="text-[#c5d4e0]">
            {EQUIPMENT_CATALOG.map((eq) => {
              const pref = eq.connections.find((c) => c.preferred) || eq.connections[0];
              return (
                <tr key={eq.id} className="border-t border-[rgba(79,195,247,0.08)] align-top">
                  <td className="px-3 py-2 font-semibold text-[#4fc3f7]">{eq.label}</td>
                  <td className="px-3 py-2">{L(lang, PROTOCOL_LABEL[eq.protocol])}</td>
                  <td className="px-3 py-2 font-['IBM_Plex_Mono'] text-xs">
                    {eq.hamlibModel != null ? `-m ${eq.hamlibModel}` : "—"}
                  </td>
                  <td className="px-3 py-2">{pref ? kindLabel(lang, pref.kind) : "—"}</td>
                  <td className="px-3 py-2 font-['IBM_Plex_Mono'] text-xs">{portsLine(eq)}</td>
                  <td className="px-3 py-2 font-['IBM_Plex_Mono'] text-xs">
                    {[eq.civAddr, eq.defaultBaud ? `${eq.defaultBaud} baud` : ""].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MakerBlock({
  lang,
  maker,
  extra,
}: {
  lang: "pt" | "en";
  maker: EquipmentMaker;
  extra?: ReactNode;
}) {
  const t = (p: Pair) => L(lang, p);
  const rows = listEquipmentByMaker(maker);
  return (
    <div className="space-y-3">
      <h3 className="font-['Space_Grotesk'] text-lg font-semibold text-white">{t(MAKER_LABEL[maker])}</h3>
      <p className="text-sm leading-relaxed text-[#94a3b8]">{t(MAKER_BLURB[maker])}</p>
      {extra}
      <div className="overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
            <tr>
              <th className="px-3 py-2">{t({ pt: "Modelo", en: "Model" })}</th>
              <th className="px-3 py-2">{t({ pt: "Conexões", en: "Connections" })}</th>
              <th className="px-3 py-2">Hamlib</th>
              <th className="px-3 py-2">{t({ pt: "Notas", en: "Notes" })}</th>
            </tr>
          </thead>
          <tbody className="text-[#c5d4e0]">
            {rows.map((eq) => (
              <tr key={eq.id} className="border-t border-[rgba(79,195,247,0.08)] align-top">
                <td className="px-3 py-2">
                  <div className="font-semibold text-[#4fc3f7]">{eq.label}</div>
                  <div className="font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">{eq.id}</div>
                </td>
                <td className="px-3 py-2">
                  <ul className="list-disc space-y-1 pl-4 text-[#94a3b8]">
                    {eq.connections.map((c) => (
                      <li key={`${eq.id}-${c.kind}-${c.via || ""}`}>
                        <span className="text-[#c5d4e0]">{kindLabel(lang, c.kind)}</span>
                        {c.preferred ? (
                          <span className="ml-1 text-[10px] tracking-wide text-[#FFB300] uppercase">
                            {t({ pt: "preferida", en: "preferred" })}
                          </span>
                        ) : null}
                        {c.hamlibReady ? (
                          <span className="ml-1 text-[10px] text-[#34d399]">Hamlib</span>
                        ) : (
                          <span className="ml-1 text-[10px] text-[#8ea0b3]">
                            {t({ pt: "nativo depois", en: "native later" })}
                          </span>
                        )}
                        {formatPorts(c.ports) !== "—" ? (
                          <div className="font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">{formatPorts(c.ports)}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-2 font-['IBM_Plex_Mono'] text-xs">
                  {eq.hamlibModel != null ? eq.hamlibModel : "—"}
                  <div className="text-[#8ea0b3]">{eq.hamlibBackend}</div>
                </td>
                <td className="px-3 py-2 text-[#94a3b8]">{eq.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
