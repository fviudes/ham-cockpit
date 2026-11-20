/** Indicativo da estação e, ao lado, o sufixo de rádio já separado pela API. */
export function HeardCall({ callsign, radio }: { callsign: string; radio?: string }) {
  const call = callsign.trim();
  const rig = (radio ?? "").trim();
  if (!call && !rig) return <span className="text-[#5d7184]">—</span>;
  return (
    <>
      {call ? <span>{call}</span> : <span className="text-[#5d7184]">—</span>}
      {rig ? <span className="ml-1 font-normal text-[#8ea0b3]">{rig}</span> : null}
    </>
  );
}
