"use client";

import { useRef, useState } from "react";
import type { ViewId } from "@/types";
import { CAPABILITIES, INITIAL_SCENE_STATE } from "@/three/config";
import type { SceneState } from "@/three/config";
import { CarStage } from "@/features/overview/car-stage";
import { LabelsOverlay } from "@/features/overview/labels-overlay";
import type { LabelScreen } from "@/three/scenes/car-canvas";
import { StatusDot } from "@/components/brand/primitives";

/**
 * Reduced-motion experience: static renders only, no scroll hijacking.
 * The user explicitly toggles between assembled and exploded views.
 */
export function ReducedMotionStory({ navigate }: { navigate: (v: ViewId) => void }) {
  const [exploded, setExploded] = useState(false);
  const stateRef = useRef<SceneState>({
    ...INITIAL_SCENE_STATE,
    shiftX: 0,
    camAz: (168 * Math.PI) / 180,
    camRad: 10.4,
    camPol: (74 * Math.PI) / 180,
    explode: 0,
    labels: 0,
  });
  const labelsStore = useRef<Map<string, LabelScreen>>(new Map());

  const toggle = () => {
    const next = !exploded;
    setExploded(next);
    stateRef.current.explode = next ? 1 : 0;
    stateRef.current.labels = next ? 1 : 0;
  };

  return (
    <>
      {/* hero */}
      <section className="relative h-[92vh] min-h-[620px] overflow-hidden">
        <CarStage
          stateRef={stateRef}
          labelsStore={labelsStore}
          active
          quality="high"
        />
        <LabelsOverlay labelsStore={labelsStore} isMobile={false} />
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center">
          <div className="mx-auto w-full max-w-[1600px] px-6 md:px-10">
            <div className="max-w-[560px]">
              <p className="text-eyebrow mb-5 flex items-center gap-2">
                <span className="inline-block h-px w-8 bg-[var(--racing-red)]" aria-hidden="true" />
                MOTORSPORT INTELLIGENCE SYSTEM
              </p>
              <h1 className="headline text-5xl leading-[0.92] text-[var(--warm-white)] sm:text-6xl lg:text-[5rem]">
                EVERY SECOND
                <br />
                <span className="text-[var(--racing-red)]">CHANGES</span> THE RACE.
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--silver)]">
                An intelligent Formula 1 strategy platform combining machine learning,
                telemetry analysis and race simulation to understand the decisions
                that define race outcomes.
              </p>
              <div className="pointer-events-auto mt-8 flex flex-wrap gap-3">
                <button
                  onClick={toggle}
                  aria-pressed={exploded}
                  className="inline-flex items-center gap-3 bg-[var(--racing-red)] px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-[#c00500]"
                >
                  {exploded ? "Reassemble vehicle" : "Explode vehicle"}
                </button>
                <button
                  onClick={() => navigate("race-replay")}
                  className="inline-flex items-center gap-3 border border-[var(--hairline-strong)] px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--warm-white)] hover:border-[var(--silver)]"
                >
                  Explore race data
                </button>
              </div>
              <div className="mt-8 flex max-w-md flex-wrap gap-x-6 gap-y-2 border border-[var(--hairline)] bg-[#0d0d10]/80 px-4 py-3">
                {[
                  ["MODEL", "LIGHTGBM"],
                  ["PREDICTION ENGINE", "READY"],
                  ["DATA ENGINE", "F1 TELEMETRY"],
                  ["SYSTEM", "OPERATIONAL"],
                ].map(([k, v]) => (
                  <span key={k} className="flex items-center gap-2 text-mono text-[10px] tracking-[0.14em]">
                    <StatusDot />
                    <span className="text-[var(--silver-dim)]">{k}:</span>
                    <span className="text-[var(--warm-white)]">{v}</span>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-mono text-[10px] tracking-wider text-[var(--silver-dim)]">
                ANIMATIONS DISABLED — REDUCED MOTION MODE
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* capabilities in normal flow */}
      <section className="mx-auto max-w-[1600px] px-6 py-20 md:px-10">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <article key={cap.id} className="panel corner-marks p-6">
              <p className="text-eyebrow mb-2">{cap.code} — ENGINEERING INTELLIGENCE</p>
              <h3 className="headline text-2xl text-[var(--warm-white)]">{cap.title}</h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--silver)]">{cap.body}</p>
              <div className="mt-4 grid grid-cols-3 border-t border-[var(--hairline)] pt-4">
                {cap.metric.map((m) => (
                  <div key={m.label}>
                    <p className="num text-lg font-semibold text-[var(--warm-white)]">{m.value}</p>
                    <p className="text-mono mt-0.5 text-[8.5px] tracking-[0.14em] text-[var(--silver-dim)]">
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>
              {cap.link && (
                <button
                  onClick={() => navigate(cap.link!.view as ViewId)}
                  className="mt-5 inline-flex items-center gap-2 text-mono text-[11px] tracking-[0.16em] text-[var(--warm-white)] underline decoration-[var(--racing-red)] decoration-2 underline-offset-4 hover:text-white"
                >
                  OPEN {cap.link.label.toUpperCase()} →
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
