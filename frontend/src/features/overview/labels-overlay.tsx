"use client";

import { useEffect, useRef } from "react";
import { LABELS, MOBILE_LABEL_IDS } from "@/three/config";
import type { LabelScreen } from "@/three/scenes/car-canvas";

/**
 * DOM overlay that renders technical part labels with leader lines.
 * Position updates happen outside React (rAF reading the shared store) so
 * the 60fps projection never triggers a re-render.
 */
export function LabelsOverlay({
  labelsStore,
  isMobile,
}: {
  labelsStore: React.MutableRefObject<Map<string, LabelScreen>>;
  isMobile: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lineRefs = useRef<Record<string, SVGLineElement | null>>({});
  const dotRefs = useRef<Record<string, SVGCircleElement | null>>({});

  const visibleLabels = LABELS.filter(
    (l) => !isMobile || MOBILE_LABEL_IDS.includes(l.id),
  );

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const container = containerRef.current;
      if (container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        for (const cfg of visibleLabels) {
          const store = labelsStore.current.get(cfg.id);
          const el = itemRefs.current[cfg.id];
          const line = lineRefs.current[cfg.id];
          const dot = dotRefs.current[cfg.id];
          if (!store || !el || !line || !dot) continue;

          if (!store.visible) {
            if (el.style.opacity !== "0") {
              el.style.opacity = "0";
              line.style.opacity = "0";
              dot.style.opacity = "0";
            }
            continue;
          }
          // label position: anchor + offset, clamped into the viewport
          const lx = Math.max(
            12,
            Math.min(w - 190, store.x + cfg.screenOffset[0] * (isMobile ? 0.35 : 1)),
          );
          const ly = Math.max(
            64,
            Math.min(h - 90, store.y + cfg.screenOffset[1] * (isMobile ? 0.5 : 1)),
          );
          el.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
          el.style.opacity = "1";
          line.style.opacity = "1";
          dot.style.opacity = "1";

          // leader line: from anchor to nearest label edge midpoint
          const toRight = cfg.side === "right";
          const ex = toRight ? lx + 4 : lx + 186;
          const ey = ly + 14;
          line.setAttribute("x1", String(store.x));
          line.setAttribute("y1", String(store.y));
          line.setAttribute("x2", String(ex));
          line.setAttribute("y2", String(ey));
          dot.setAttribute("cx", String(store.x));
          dot.setAttribute("cy", String(store.y));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [labelsStore, visibleLabels, isMobile]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full">
        {visibleLabels.map((cfg) => (
          <g key={cfg.id}>
            <line
              ref={(el) => {
                lineRefs.current[cfg.id] = el;
              }}
              stroke="#8e939e"
              strokeWidth="1"
              strokeDasharray="3 3"
              style={{ opacity: 0, transition: "opacity 0.3s" }}
            />
            <circle
              ref={(el) => {
                dotRefs.current[cfg.id] = el;
              }}
              r="2.5"
              fill="none"
              stroke="#e10600"
              strokeWidth="1.2"
              style={{ opacity: 0, transition: "opacity 0.3s" }}
            />
          </g>
        ))}
      </svg>
      {visibleLabels.map((cfg) => (
        <div
          key={cfg.id}
          ref={(el) => {
            itemRefs.current[cfg.id] = el;
          }}
          className="absolute left-0 top-0 w-[190px] border border-[var(--hairline-strong)] bg-[#0e0e11]/95 px-2.5 py-1.5"
          style={{ opacity: 0, transition: "opacity 0.3s, transform 0.05s linear", willChange: "transform" }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 bg-[var(--racing-red)]" aria-hidden="true" />
            <span className="text-mono text-[10.5px] font-semibold tracking-[0.14em] text-[var(--warm-white)]">
              {cfg.title}
            </span>
          </div>
          <p className="mt-0.5 pl-3 text-mono text-[9px] tracking-[0.12em] text-[var(--silver-dim)]">
            {cfg.spec}
          </p>
        </div>
      ))}
    </div>
  );
}
