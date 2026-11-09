import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useConsole } from "./state";
import { PageHead, Panel } from "./widgets";

export function TermPage({ embedded = false }: { embedded?: boolean }) {
  const { tx } = useConsole();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace",
      fontSize: 13,
      theme: {
        background: "#03080d",
        foreground: "#d8e6f0",
        cursor: "#4fc3f7",
        selectionBackground: "#4fc3f733",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/term`);
    ws.binaryType = "arraybuffer";

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };

    ws.onopen = () => {
      term.focus();
      sendResize();
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
      term.write(data);
    };
    ws.onclose = () => term.write("\r\n[desconectado]\r\n");
    ws.onerror = () => term.write("\r\n[erro de conexão]\r\n");
    const sub = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d);
    });

    const onResize = () => {
      fit.fit();
      sendResize();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      sub.dispose();
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      ws.close();
      term.dispose();
    };
  }, []);

  return (
    <div>
      {embedded ? null : <PageHead kicker={tx("term")} title={tx("termTitle")} />}
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[#8ea0b3]">{tx("termHelp")}</p>
      <Panel className="p-2">
        <div ref={host} className="h-[min(70vh,640px)] w-full overflow-hidden rounded-lg bg-[#03080d] p-2" />
      </Panel>
    </div>
  );
}
