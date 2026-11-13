"use client";

import { Component, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useProgress } from "@react-three/drei";
import type { CarApi } from "@/three/scenes/f1-car";
import type { LabelScreen } from "@/three/scenes/car-canvas";
import type { SceneState } from "@/three/config";
import { INITIAL_SCENE_STATE } from "@/three/config";

const CarCanvas = dynamic(
  () => import("@/three/scenes/car-canvas").then((m) => m.CarCanvas),
  { ssr: false },
);

/* ---------------- webgl support ---------------- */

const emptySubscribe = () => () => {};

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/* ---------------- error boundary ---------------- */

class CanvasErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("[3D stage] canvas error:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* ---------------- loading overlay ---------------- */

function LoadingOverlay({ done }: { done: boolean }) {
  const { progress, active } = useProgress();
  const [showReady, setShowReady] = useState(false);
  const pct = Math.round(progress);
  useEffect(() => {
    if (!active && progress >= 100) {
      const t = setTimeout(() => setShowReady(true), 250);
      return () => clearTimeout(t);
    }
  }, [active, progress]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0b] transition-opacity duration-700"
      style={{ opacity: done && showReady ? 0 : 1 }}
      aria-hidden={done && showReady}
    >
      <p className="text-eyebrow mb-4">Initialising vehicle model</p>
      <div className="w-64">
        <div className="h-[3px] w-full bg-[#1c1c21]">
          <div
            className="h-full bg-[var(--racing-red)] transition-[width] duration-300"
            style={{ width: `${Math.max(6, pct)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-mono text-[10px] text-[var(--silver-dim)]">
          <span>GLB · DRACO · 342K TRIS</span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- static SVG fallback (no WebGL / crash) ---------------- */

export function CarBlueprintFallback({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid-bg-fine flex h-full w-full items-center justify-center bg-[#0c0c0e] p-6">
      <svg viewBox="0 0 640 220" className="max-h-full w-full max-w-3xl" role="img" aria-label="Technical side view of a 2022-generation Formula 1 car">
        <g stroke="#4a4a54" strokeWidth="1" fill="none">
          {/* floor */}
          <path d="M120 150 L520 150 L520 158 L120 158 Z" fill="#131318" />
          {/* monocoque + engine cover */}
          <path
            d="M150 150 L200 128 L260 118 L330 108 L400 104 L470 112 L500 122 L508 150 Z"
            fill="#17171c"
          />
          {/* nose */}
          <path d="M150 150 L96 140 L86 132 L150 132 Z" fill="#15151a" />
          {/* front wing */}
          <path d="M40 158 L118 158 L118 164 L40 164 Z M52 150 L118 150 L118 156 L52 156 Z" fill="#1a1014" />
          {/* rear wing */}
          <path d="M560 84 L560 92 L505 92 L505 84 Z" fill="#1a1014" />
          <path d="M532 92 L540 150" strokeWidth="2" />
          {/* halo */}
          <path d="M300 108 C310 88 340 84 356 96" strokeWidth="2.5" />
          {/* wheels */}
          <circle cx="150" cy="152" r="34" fill="#101014" />
          <circle cx="150" cy="152" r="14" stroke="#6a6a74" />
          <circle cx="470" cy="152" r="36" fill="#101014" />
          <circle cx="470" cy="152" r="15" stroke="#6a6a74" />
        </g>
        <g stroke="#e10600" strokeWidth="1" fill="none" strokeDasharray="4 4">
          <path d="M60 170 L60 190 M560 170 L560 190 M150 196 L150 204 M470 196 L470 204" />
        </g>
        <g fill="#8e939e" fontSize="9" fontFamily="var(--font-plex-mono), monospace" letterSpacing="2">
          <text x="36" y="205">FRONT WING</text>
          <text x="520" y="205">REAR WING</text>
          <text x="120" y="216">TYRE 18"</text>
          <text x="440" y="216">TYRE 18"</text>
        </g>
        <text x="320" y="30" textAnchor="middle" fill="#5c6068" fontSize="10" fontFamily="var(--font-plex-mono), monospace" letterSpacing="4">
          F1 2022 · TECHNICAL VIEW · WEBGL UNAVAILABLE
        </text>
      </svg>
    </div>
  );
}

/* ---------------- stage wrapper ---------------- */

export interface CarStageProps {
  stateRef: React.MutableRefObject<SceneState>;
  labelsStore: React.MutableRefObject<Map<string, LabelScreen>>;
  active: boolean;
  quality: "high" | "low";
  onCarReady?: (api: CarApi) => void;
}

export function CarStage(props: CarStageProps) {
  // client-only constant via external store pattern (no setState-in-effect)
  const supported = useSyncExternalStore(
    emptySubscribe,
    () => hasWebGL(),
    () => true,
  );
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hide the loading overlay shortly after the model resolves
  useEffect(() => {
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => setReady(true), 1400);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!supported) {
    return <CarBlueprintFallback />;
  }

  return (
    <div className="absolute inset-0">
      <CanvasErrorBoundary fallback={<CarBlueprintFallback />}>
        <CarCanvas {...props} />
        <LoadingOverlay done={ready} />
      </CanvasErrorBoundary>
    </div>
  );
}
