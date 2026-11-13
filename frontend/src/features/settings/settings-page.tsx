"use client";

import { useState } from "react";
import { SectionHeader, TechPanel, StatusDot } from "@/components/brand/primitives";
import { useAppStore } from "@/stores/app-store";
import { useMLSession } from "@/stores/ml-session-store";
import { getApiUrl, setApiUrl, getApiKey, setApiKey, resetSessionId } from "@/services/ml-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ServerCog, KeyRound, RefreshCw } from "lucide-react";

const inputCls =
  "h-10 w-full border border-[var(--hairline-strong)] bg-[#101014] px-3 text-[13px] text-[var(--warm-white)] outline-none placeholder:text-[var(--silver-dim)] focus:border-[var(--racing-red)]/60";

function MLBackendPanel() {
  const ml = useMLSession();
  const [urlDraft, setUrlDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [savedAt, setSavedAt] = useState(0);

  const url = urlDraft || getApiUrl();
  const key = keyDraft || getApiKey();

  return (
    <TechPanel label="ML BACKEND">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13.5px] text-[var(--silver)]">Serving layer connection</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--silver-dim)]">
              FastAPI backend that serves real predictions from your registered models. Offline,
              the app falls back to bundled data automatically.
            </p>
          </div>
          <StatusDot state={ml.mode === "live" ? "operational" : ml.mode === "probing" ? "pending" : "offline"} />
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">API URL</label>
            <input
              className={cn(inputCls, "mt-1 font-mono text-[12px]")}
              value={urlDraft}
              placeholder={getApiUrl()}
              onChange={(e) => setUrlDraft(e.target.value)}
            />
          </div>
          <div>
            <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">API KEY (ONLY IF ML_API_KEY IS SET)</label>
            <input
              type="password"
              className={cn(inputCls, "mt-1 font-mono text-[12px]")}
              value={keyDraft}
              placeholder={getApiKey() ? "••••••••" : "not required"}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-[var(--hairline-strong)] bg-transparent text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--warm-white)]"
            onClick={() => {
              setApiUrl(urlDraft.trim());
              setApiKey(keyDraft);
              setSavedAt(Date.now());
              void ml.probe();
            }}
          >
            <ServerCog className="h-3.5 w-3.5" />
            Save & test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-[var(--hairline-strong)] bg-transparent text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--warm-white)]"
            onClick={() => void ml.probe()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", ml.probing && "animate-spin")} />
            Reconnect
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-[var(--hairline-strong)] bg-transparent text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--silver-dim)]"
            onClick={() => {
              resetSessionId();
              void ml.probe();
            }}
          >
            <KeyRound className="h-3.5 w-3.5" />
            New session
          </Button>
        </div>

        <p className="mt-3 border-t border-[var(--hairline)] pt-3 text-mono text-[10px] leading-relaxed tracking-wider text-[var(--silver-dim)]">
          {ml.mode === "live" && ml.health
            ? `LIVE · v${ml.health.version} · ${ml.health.modelsRegistered} MODELS · ${ml.health.modelsLoaded} WARM · ${ml.health.predictionsServed} PREDICTIONS SERVED`
            : ml.mode === "probing"
              ? "PROBING…"
              : "OFFLINE — START WITH: cd backend && python run.py"}
          {savedAt > 0 && " · SAVED"}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--silver-dim)]">
          Default URL resolves from <span className="text-mono">NEXT_PUBLIC_ML_API_URL</span> →
          <span className="text-mono"> http://localhost:8000</span>. The session model binding lives on the
          server — a new browser session starts cold and re-binds on your next model selection.
        </p>
      </div>
    </TechPanel>
  );
}

const SPEEDS = [0.5, 1, 2, 4, 8];

export function SettingsPage() {
  const { playbackSpeed, setPlaybackSpeed } = useAppStore();

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 11 — Settings"
        title="Preferences"
        description="Playback and presentation preferences are stored in application state. The interface is deliberately dark-first — motorsport analysis happens in dark rooms."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <TechPanel label="PLAYBACK">
          <div className="p-5">
            <p className="text-[13.5px] text-[var(--silver)]">Default replay speed</p>
            <p className="mt-1 text-[12px] text-[var(--silver-dim)]">
              Applies when opening a new race in Race Replay.
            </p>
            <div className="mt-4 flex border border-[var(--hairline)]">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPlaybackSpeed(s)}
                  className={cn(
                    "flex-1 py-2.5 text-mono text-[13px] transition-colors",
                    playbackSpeed === s
                      ? "bg-[var(--racing-red)] text-white"
                      : "text-[var(--silver-dim)] hover:text-[var(--silver)]",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </TechPanel>

        <MLBackendPanel />

        <TechPanel label="MOTION">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13.5px] text-[var(--silver)]">Reduced motion</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--silver-dim)]">
                  Follows your system preference automatically. When enabled, the 3D showcase
                  renders static states with explicit controls instead of scroll-driven animation.
                </p>
              </div>
              <StatusDot state="pending" />
            </div>
            <p className="mt-4 border-t border-[var(--hairline)] pt-3 text-mono text-[10px] tracking-wider text-[var(--silver-dim)]">
              OS-CONTROLLED — NO OVERRIDE NEEDED
            </p>
          </div>
        </TechPanel>
      </div>

      <TechPanel label="DATA SOURCES" className="mt-6">
        <div className="divide-y divide-[#1b1b20]">
          {[
            ["Race telemetry", "f1_strategy_dataset_v4.csv — 101,371 laps, 2022–2025. From the f1-strategy-engine repository (loisekk), derived from official F1 timing data.", "REAL"],
            ["Circuit geometry", "f1-circuits by bacinger — centreline GeoJSON of every modern F1 venue.", "REAL"],
            ["Model metrics — reported", "Published results of the original training pipeline (README).", "REAL"],
            ["Model metrics — verified", "Local replication of the documented pipeline on the same dataset (this build).", "REAL"],
            ["Telemetry channels", "Quasi-steady lap simulation over real circuit geometry — representative, not recorded car data.", "SYNTHESISED"],
            ["Experiments & registry", "Bundled mock records prepared for MLflow integration; no tracking server is connected.", "MOCK"],
          ].map(([name, desc, kind]) => (
            <div key={name} className="flex flex-col gap-1.5 px-5 py-4 md:flex-row md:items-center md:gap-6">
              <div className="min-w-[220px]">
                <p className="text-[13.5px] text-[var(--warm-white)]">{name}</p>
              </div>
              <p className="flex-1 text-[12px] leading-relaxed text-[var(--silver-dim)]">{desc}</p>
              <span
                className={cn(
                  "shrink-0 border px-2 py-0.5 text-mono text-[9px] tracking-[0.14em]",
                  kind === "REAL" && "border-[var(--tyre-inter)]/40 text-[var(--tyre-inter)]",
                  kind === "SYNTHESISED" && "border-[var(--amber-warn)]/40 text-[var(--amber-warn)]",
                  kind === "MOCK" && "border-[var(--silver-dim)]/40 text-[var(--silver-dim)]",
                )}
              >
                {kind}
              </span>
            </div>
          ))}
        </div>
      </TechPanel>

      <TechPanel label="ABOUT & CREDITS" className="mt-6">
        <div className="space-y-4 p-5 text-[12.5px] leading-relaxed text-[var(--silver)]">
          <p>
            <span className="text-mono text-[10px] tracking-[0.16em] text-[var(--silver-dim)]">PROJECT — </span>
            F1 Strategy Engine frontend. The machine-learning pipeline (feature engineering,
            training, serialisation) remains in Python in the source repository; this
            application consumes its outputs and defines the future serving contract.
          </p>
          <p>
            <span className="text-mono text-[10px] tracking-[0.16em] text-[var(--silver-dim)]">3D MODEL — </span>
            “F1 2022 Generic” by TheoDevF1 (Sketchfab), licensed CC-BY-NC-ND-4.0. Split into
            controllable engineering groups by this project&apos;s build pipeline; no team
            liveries or Formula 1 trademarks are used.
          </p>
          <p>
            <span className="text-mono text-[10px] tracking-[0.16em] text-[var(--silver-dim)]">DISCLAIMER — </span>
            Independent engineering project. Not affiliated with, or endorsed by, Formula One
            Group, the FIA, or any Formula 1 team. Race data is used for educational analysis.
          </p>
        </div>
      </TechPanel>
    </div>
  );
}
