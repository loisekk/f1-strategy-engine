"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ViewId } from "@/types";
import { useReducedMotion, useDeviceTier } from "@/hooks/use-hash-route";
import {
  CAPABILITIES,
  CHAPTER_WINDOWS,
  INITIAL_SCENE_STATE,
  TIMELINE,
} from "@/three/config";
import type { SceneState } from "@/three/config";
import { CarStage } from "@/features/overview/car-stage";
import { LabelsOverlay } from "@/features/overview/labels-overlay";
import { ReducedMotionStory } from "@/features/overview/reduced-motion-story";
import type { LabelScreen } from "@/three/scenes/car-canvas";
import { StatusDot } from "@/components/brand/primitives";
import { ChevronDown } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const HERO_STATUS = [
  { k: "MODEL", v: "LIGHTGBM" },
  { k: "PREDICTION ENGINE", v: "READY" },
  { k: "DATA ENGINE", v: "F1 TELEMETRY" },
  { k: "SYSTEM", v: "OPERATIONAL" },
];

export function ScrollStory({ navigate }: { navigate: (v: ViewId) => void }) {
  const reducedMotionEarly = useReducedMotion();
  if (reducedMotionEarly) return <ReducedMotionStory navigate={navigate} />;
  return <ScrollStoryInner navigate={navigate} />;
}

function ScrollStoryInner({ navigate }: { navigate: (v: ViewId) => void }) {
  const runwayRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const chapterDotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  const reducedMotion = useReducedMotion();
  const tier = useDeviceTier();
  const isMobile = tier === "mobile";

  const stateRef = useRef<SceneState>({
    ...INITIAL_SCENE_STATE,
    shiftX: isMobile ? 0 : 1.55,
    shiftY: isMobile ? 1.15 : 0,
  });
  const labelsStore = useRef<Map<string, LabelScreen>>(new Map());
  const [active, setActive] = useState(true);

  /* keep the canvas rendering only while the story is on screen */
  useEffect(() => {
    const el = runwayRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setActive(entries[0]?.isIntersecting ?? false),
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* master scroll timeline */
  useEffect(() => {
    if (reducedMotion) return;
    const runway = runwayRef.current;
    if (!runway) return;
    const state = stateRef.current;

    const tl = gsap.timeline({ defaults: { ease: "none" } });
    for (const seg of TIMELINE) {
      tl.to(
        state,
        { ...seg.props, duration: seg.end - seg.start, ease: seg.ease ?? "none" },
        seg.start,
      );
    }

    const st = ScrollTrigger.create({
      trigger: runway,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.7,
      animation: tl,
      onUpdate: (self) => {
        const p = self.progress;
        const heroEl = heroRef.current;
        if (heroEl) {
          const o = Math.max(0, Math.min(1, 1 - (p - 0.05) / 0.05));
          heroEl.style.opacity = String(o);
          heroEl.style.transform = `translateY(${(1 - o) * -36}px)`;
          heroEl.style.pointerEvents = o < 0.1 ? "none" : "auto";
        }
        if (hintRef.current) {
          hintRef.current.style.opacity = String(Math.max(0, 1 - p / 0.025));
        }
        CHAPTER_WINDOWS.forEach(([a, b], i) => {
          const el = panelRefs.current[i];
          if (!el) return;
          const fade = 0.028;
          const o = Math.max(0, Math.min(1, Math.min((p - a) / fade, (b - p) / fade)));
          el.style.opacity = String(o);
          el.style.transform = `translateY(${(1 - o) * 26}px)`;
          el.style.pointerEvents = o > 0.5 ? "auto" : "none";
        });
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleY(${p})`;
        }
        chapterDotsRef.current.forEach((dot, i) => {
          if (!dot) return;
          const [a, b] = CHAPTER_WINDOWS[i];
          const on = p >= a && p <= b;
          dot.style.background = on ? "var(--racing-red)" : "transparent";
          dot.style.borderColor = on ? "var(--racing-red)" : "var(--hairline-strong)";
        });
      },
    });
    return () => {
      st.kill();
      tl.kill();
    };
  }, [reducedMotion, tier]);

  const runwayVh = isMobile ? 560 : 740;

  const scrollToChapter = (i: number) => {
    const runway = runwayRef.current;
    if (!runway) return;
    const [a] = CHAPTER_WINDOWS[i];
    const scrollable = runway.offsetHeight - window.innerHeight;
    window.scrollTo({ top: runway.offsetTop + scrollable * a, behavior: "smooth" });
  };

  const beginStory = () => {
    const runway = runwayRef.current;
    if (!runway) return;
    window.scrollTo({ top: runway.offsetTop + (runway.offsetHeight - window.innerHeight) * 0.18, behavior: "smooth" });
  };

  return (
    <section ref={runwayRef} className="relative" style={{ height: `${runwayVh}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* 3D stage */}
        <CarStage
          stateRef={stateRef}
          labelsStore={labelsStore}
          active={active}
          quality={tier === "mobile" ? "low" : "high"}
        />

        {/* part labels */}
        <LabelsOverlay labelsStore={labelsStore} isMobile={isMobile} />

        {/* hero copy */}
        <div
          ref={heroRef}
          className="absolute inset-0 z-10 flex items-center"
          style={{ pointerEvents: "none" }}
        >
          <div className="mx-auto w-full max-w-[1600px] px-6 md:px-10">
            <div className={`${isMobile ? "pt-20" : ""} max-w-[600px]`}>
              <p className="text-eyebrow mb-5 flex items-center gap-2">
                <span className="inline-block h-px w-8 bg-[var(--racing-red)]" aria-hidden="true" />
                MOTORSPORT INTELLIGENCE SYSTEM
              </p>
              <h1 className="headline text-[13vw] leading-[0.92] text-[var(--warm-white)] sm:text-6xl lg:text-[5.2rem]">
                EVERY SECOND
                <br />
                <span className="text-[var(--racing-red)]">CHANGES</span> THE RACE.
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--silver)]">
                An intelligent Formula 1 strategy platform combining machine learning,
                telemetry analysis and race simulation to understand the decisions
                that define race outcomes.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3" style={{ pointerEvents: "auto" }}>
                <button
                  onClick={beginStory}
                  className="group inline-flex items-center gap-3 bg-[var(--racing-red)] px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c00500]"
                >
                  Explore the engine
                  <ChevronDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
                </button>
                <button
                  onClick={() => navigate("race-replay")}
                  className="inline-flex items-center gap-3 border border-[var(--hairline-strong)] px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--warm-white)] transition-colors hover:border-[var(--silver)] hover:bg-white/[0.03]"
                >
                  Explore race data
                </button>
              </div>
              {/* technical status readout */}
              <div className="mt-10 grid max-w-md grid-cols-2 border border-[var(--hairline)] bg-[#0d0d10]/80 backdrop-blur-[2px]">
                {HERO_STATUS.map((s, i) => (
                  <div
                    key={s.k}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${i < 2 ? "border-b border-[var(--hairline)]" : ""} ${i % 2 === 0 ? "border-r border-[var(--hairline)]" : ""}`}
                  >
                    <span className="text-mono text-[9.5px] tracking-[0.16em] text-[var(--silver-dim)]">
                      {s.k}
                    </span>
                    <span className="flex items-center gap-1.5 text-mono text-[10.5px] font-semibold tracking-[0.1em] text-[var(--warm-white)]">
                      <StatusDot />
                      {s.v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* capability chapters */}
        {CAPABILITIES.map((cap, i) => (
          <div
            key={cap.id}
            ref={(el) => {
              panelRefs.current[i] = el;
            }}
            className="pointer-events-none absolute bottom-[7%] right-6 z-10 w-[min(420px,88vw)] opacity-0 md:bottom-auto md:top-1/2 md:right-10 md:-translate-y-1/2"
            style={{ willChange: "opacity, transform" }}
          >
            <div className="border-l-2 border-[var(--racing-red)] bg-[#0d0d10]/92 p-6 backdrop-blur-[2px] md:p-7">
              <p className="text-eyebrow mb-2">{cap.code} — ENGINEERING INTELLIGENCE</p>
              <h3 className="headline text-3xl text-[var(--warm-white)] md:text-4xl">{cap.title}</h3>
              <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--silver)]">{cap.body}</p>
              <div className="mt-5 grid grid-cols-3 border-t border-[var(--hairline)] pt-4">
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
                  className="pointer-events-auto mt-5 inline-flex items-center gap-2 text-mono text-[11px] tracking-[0.16em] text-[var(--warm-white)] underline decoration-[var(--racing-red)] decoration-2 underline-offset-4 hover:text-white"
                >
                  OPEN {cap.link.label.toUpperCase()} →
                </button>
              )}
            </div>
          </div>
        ))}

        {/* chapter rail (desktop) */}
        <div className="absolute left-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-3 md:flex">
          <div className="relative h-40 w-px bg-[var(--hairline-strong)]">
            <div
              ref={progressRef}
              className="absolute inset-x-0 top-0 h-full origin-top bg-[var(--racing-red)]"
              style={{ transform: "scaleY(0)" }}
            />
          </div>
          <div className="flex flex-col gap-2.5">
            {CAPABILITIES.map((cap, i) => (
              <button
                key={cap.id}
                onClick={() => scrollToChapter(i)}
                aria-label={`Jump to chapter ${cap.title}`}
                className="group flex items-center gap-2"
              >
                <span
                  ref={(el) => {
                    chapterDotsRef.current[i] = el;
                  }}
                  className="h-2.5 w-2.5 rounded-full border transition-colors"
                  style={{ borderColor: "var(--hairline-strong)" }}
                />
                <span className="text-mono text-[9px] tracking-[0.18em] text-[var(--silver-dim)] opacity-0 transition-opacity group-hover:opacity-100">
                  {cap.code}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* scroll hint */}
        <div
          ref={hintRef}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center"
        >
          <p className="text-mono text-[10px] tracking-[0.3em] text-[var(--silver-dim)]">
            SCROLL TO DISASSEMBLE
          </p>
          <div className="mx-auto mt-2 h-8 w-px bg-gradient-to-b from-[var(--racing-red)] to-transparent" />
        </div>
      </div>
    </section>
  );
}
