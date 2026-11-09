import { GripVertical, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  LAYOUT_COLS,
  LAYOUT_GAP,
  LAYOUT_MIN_H,
  LAYOUT_MIN_W,
  LAYOUT_ROW,
  patchTile,
  type PanelTile,
  type TileId,
} from "./panel-layout";
import { useConsole } from "./state";

export function FitTile({ children }: { children: ReactNode }) {
  const viewRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const view = viewRef.current;
    const inner = innerRef.current;
    if (!view || !inner) return;

    const apply = () => {
      const vw = view.clientWidth;
      const vh = view.clientHeight;
      if (vw < 16 || vh < 16) return;
      inner.style.transformOrigin = "top left";
      inner.style.transform = "none";
      inner.style.width = `${vw}px`;
      const ch0 = Math.max(inner.scrollHeight, 1);
      const cw0 = Math.max(inner.scrollWidth, 1);
      let scale = Math.min(vw / cw0, vh / ch0);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
      if (scale >= 0.999 && ch0 < vh) scale = vh / ch0;
      scale = Math.max(0.35, Math.min(2.5, scale));
      for (let i = 0; i < 3; i++) {
        inner.style.width = `${vw / scale}px`;
        const cw = Math.max(inner.scrollWidth, 1);
        const ch = Math.max(inner.scrollHeight, 1);
        const next = Math.min(vw / cw, vh / ch);
        if (!Number.isFinite(next) || next <= 0) break;
        const clamped = Math.max(0.35, Math.min(2.5, next));
        if (Math.abs(clamped - scale) < 0.01) {
          scale = clamped;
          break;
        }
        scale = clamped;
      }
      inner.style.width = `${vw / scale}px`;
      const cw = Math.max(inner.scrollWidth, 1);
      const dx = Math.max(0, (vw - cw * scale) / 2);
      inner.style.transform = Math.abs(scale - 1) < 0.01 ? "none" : `translateX(${dx}px) scale(${scale})`;
    };

    applyRef.current = apply;
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(view);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    applyRef.current();
  });

  return (
    <div ref={viewRef} className="h-full min-h-0 w-full overflow-hidden">
      <div ref={innerRef} className="w-full">
        {children}
      </div>
    </div>
  );
}

export function PanelBoard({
  tiles,
  shown,
  onChange,
  onRemove,
  render,
}: {
  tiles: PanelTile[];
  shown: TileId[];
  onChange: (next: PanelTile[]) => void;
  onRemove?: (id: TileId) => void;
  render: (id: TileId) => ReactNode;
}) {
  const { tx } = useConsole();
  const ref = useRef<HTMLDivElement>(null);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const [width, setWidth] = useState(960);
  const [active, setActive] = useState<TileId | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setWidth(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cell = useMemo(() => {
    const inner = Math.max(240, width - LAYOUT_GAP * (LAYOUT_COLS - 1));
    return inner / LAYOUT_COLS;
  }, [width]);

  const visible = tiles.filter((t) => shown.includes(t.id));
  const bottom = visible.reduce((m, t) => Math.max(m, t.y + t.h), 8);

  const start = (e: PointerEvent<HTMLButtonElement>, id: TileId, kind: "move" | "resize") => {
    if (e.button !== 0) return;
    const tile = tilesRef.current.find((t) => t.id === id);
    if (!tile) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const { x: ox, y: oy, w: ow, h: oh } = tile;
    setActive(id);

    const stepX = () => cell + LAYOUT_GAP;
    const stepY = LAYOUT_ROW + LAYOUT_GAP;

    const move = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (kind === "move") {
        const x = Math.max(0, Math.min(LAYOUT_COLS - ow, ox + Math.round(dx / stepX())));
        const y = Math.max(0, oy + Math.round(dy / stepY));
        onChange(patchTile(tilesRef.current, id, { x, y }));
        return;
      }
      const w = Math.max(LAYOUT_MIN_W, Math.min(LAYOUT_COLS - ox, ow + Math.round(dx / stepX())));
      const h = Math.max(LAYOUT_MIN_H, oh + Math.round(dy / stepY));
      onChange(patchTile(tilesRef.current, id, { w, h }));
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setActive(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={ref} className="relative select-none" style={{ height: bottom * (LAYOUT_ROW + LAYOUT_GAP) - LAYOUT_GAP }}>
      {visible.map((t) => (
        <article
          key={t.id}
          className={`absolute ${active === t.id ? "z-20" : "z-10"}`}
          style={{
            left: t.x * (cell + LAYOUT_GAP),
            top: t.y * (LAYOUT_ROW + LAYOUT_GAP),
            width: t.w * cell + (t.w - 1) * LAYOUT_GAP,
            height: t.h * LAYOUT_ROW + (t.h - 1) * LAYOUT_GAP,
          }}
        >
          <div className="relative h-full overflow-hidden rounded-xl border border-[rgba(79,195,247,0.14)] bg-[#0b1520]">
            <button
              type="button"
              className="absolute left-2 top-2 z-20 grid size-6 cursor-grab place-items-center rounded-md text-[#5d7184] hover:bg-[#4fc3f7]/10 hover:text-[#4fc3f7] active:cursor-grabbing"
              aria-label={tx("layoutMove")}
              onPointerDown={(e) => start(e, t.id, "move")}
            >
              <GripVertical size={14} />
            </button>
            {onRemove ? (
              <button
                type="button"
                className="absolute right-2 top-2 z-20 grid size-6 place-items-center rounded-md text-[#5d7184] hover:bg-[#ef4444]/15 hover:text-[#f87171]"
                aria-label={tx("layoutRemove")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove(t.id);
                }}
              >
                <X size={14} />
              </button>
            ) : null}
            <div className="h-full min-h-0 overflow-hidden p-5 px-9 pt-8">
              <FitTile>{render(t.id)}</FitTile>
            </div>
            <button
              type="button"
              className="absolute bottom-1 right-1 z-20 size-4 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-[#4fc3f7]/70"
              aria-label={tx("layoutResize")}
              onPointerDown={(e) => start(e, t.id, "resize")}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
