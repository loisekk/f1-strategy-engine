"use client";

import type { ViewId } from "@/types";
import { ScrollStory } from "@/features/overview/scroll-story";
import { SectionHeader, StatBlock, DataSourceBadge, TechPanel, DataError } from "@/components/brand/primitives";
import { useJson } from "@/hooks/use-hash-route";
import type { ModelReport, RaceIndex } from "@/types";
import { ArrowUpRight, Database, Cpu, Gauge, Timer, Layers, GitBranch, Activity } from "lucide-react";

export function OverviewPage({ navigate }: { navigate: (v: ViewId) => void }) {
  const { data: races, error: racesError } = useJson<RaceIndex>("/data/races.json");
  const { data: models, error: modelsError } = useJson<ModelReport>("/data/models.json");
  const verified = models?.verified?.models?.lightgbm;
  const reported = models?.reported?.models?.lightgbm;

  const stats: { label: string; value: string; unit?: string; hint: string }[] = [
    { label: "Telemetry laps", value: "101,371", hint: "2022–2025 seasons, real race timing data" },
    { label: "Events analysed", value: String(races?.races.length ?? 95), hint: "Grands Prix + pre-season tests" },
    { label: "Models compared", value: "5", hint: "LightGBM · XGBoost · RF · DT · LogReg" },
    {
      label: "Champion pit F1",
      value: reported?.f1 != null ? reported.f1.toFixed(4) : "0.9445",
      hint: "LightGBM, reported by original pipeline",
    },
  ];

  const modules = [
    {
      view: "race-replay" as ViewId,
      icon: Timer,
      code: "03",
      title: "Race Replay",
      desc: "Lap-by-lap replay on real circuit geometry — positions, tyre strategy, pit stops and gaps, from 90 Grands Prix.",
      badge: "REAL DATA",
    },
    {
      view: "telemetry" as ViewId,
      icon: Gauge,
      code: "04",
      title: "Telemetry Lab",
      desc: "Speed, throttle, brake, gear and RPM channels on a synchronised distance axis. Physics-synthesised, clearly labelled.",
      badge: "SYNTHESISED + REAL",
    },
    {
      view: "strategy" as ViewId,
      icon: Layers,
      code: "05",
      title: "Strategy Simulator",
      desc: "Compare one-stop and two-stop timelines using measured degradation curves and a 19.9s pit loss estimate.",
      badge: "REAL CURVES",
    },
    {
      view: "drivers" as ViewId,
      icon: Activity,
      code: "06",
      title: "Driver Intelligence",
      desc: "Pace, consistency, stint length and stop patterns for every driver in the dataset.",
      badge: "REAL DATA",
    },
    {
      view: "models" as ViewId,
      icon: Cpu,
      code: "07",
      title: "Model Intelligence",
      desc: "Champion performance, confusion matrices, ROC, threshold optimisation and feature importance — reported and locally verified.",
      badge: "MODEL OUTPUT",
    },
    {
      view: "race-intelligence" as ViewId,
      icon: GitBranch,
      code: "02",
      title: "Race Intelligence",
      desc: "Strategy boards and pit-window analysis across every event in the dataset.",
      badge: "REAL DATA",
    },
  ];

  const pipeline = [
    { step: "01", title: "Data layer", body: "101,371 laps of official F1 timing telemetry, 2022–2025. Lap times, compounds, stints, positions.", tech: "Pandas · FastF1 exports" },
    { step: "02", title: "Feature engineering", body: "LapTime_Delta, Cumulative_Degradation, RaceProgress, Normalized_TyreLife, Position_Change — computed per driver per stint.", tech: "Python pipeline (unchanged)" },
    { step: "03", title: "Model layer", body: "Five classifiers trained with imbalance-aware settings; LightGBM champion at threshold 0.64. Artifacts serialised in Python.", tech: "LightGBM · XGBoost · scikit-learn" },
    { step: "04", title: "Serving layer", body: "Typed API contract defined (see services/api.ts). The frontend runs on bundled pipeline outputs until FastAPI lands.", tech: "FastAPI contract · React client" },
  ];

  return (
    <div>
      <ScrollStory navigate={navigate} />

      {/* ---------------- stats band ---------------- */}
      <section className="border-y border-[var(--hairline)] bg-[#0c0c0e]">
        {(racesError || modelsError) && (
          <div className="mx-auto max-w-[1600px] px-6 pt-4 md:px-10">
            <DataError what="Dataset index" error={racesError ?? modelsError} />
          </div>
        )}
        <div className="mx-auto max-w-[1600px] px-6 md:px-10">
          <div className="grid grid-cols-2 divide-x divide-[var(--hairline)] lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.label} className={`${i > 1 ? "border-t lg:border-t-0" : ""} border-[var(--hairline)]`}>
                <StatBlock label={s.label} value={s.value} hint={s.hint} className="px-5 py-7" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] py-4">
            <DataSourceBadge kind="real" label="SOURCE: F1 STRATEGY DATASET V4" />
            {modelsError ? (
              <span className="text-mono text-[10px] tracking-wider text-[var(--racing-red)]">
                MODEL REPORT UNAVAILABLE — {modelsError.message}
              </span>
            ) : verified ? (
              <span className="text-mono text-[10px] tracking-wider text-[var(--silver-dim)]">
                LOCAL VERIFICATION: ACC {verified.accuracy} · F1 {verified.f1} · AUC {verified.rocAuc}
              </span>
            ) : (
              <span className="text-mono text-[10px] tracking-wider text-[var(--silver-dim)]">
                LOADING VERIFIED METRICS…
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- modules ---------------- */}
      <section className="mx-auto max-w-[1600px] px-6 py-24 md:px-10">
        <SectionHeader
          eyebrow="The Platform"
          title="One system. Six engineering modules."
          description="The marketing site and the engineering application are one product. Every module below runs on the same pipeline that trained the champion model — no decorative dashboards, no fake telemetry."
        />
        <div className="grid gap-px bg-[var(--hairline)] md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <button
              key={m.view}
              onClick={() => navigate(m.view)}
              className="group relative bg-[#0e0e11] p-7 text-left transition-colors hover:bg-[#131318]"
            >
              <div className="flex items-start justify-between">
                <m.icon className="h-6 w-6 text-[var(--silver)] transition-colors group-hover:text-[var(--racing-red)]" strokeWidth={1.5} />
                <span className="text-mono text-[10px] tracking-[0.2em] text-[var(--silver-dim)]">{m.code}</span>
              </div>
              <h3 className="headline mt-6 text-2xl text-[var(--warm-white)]">{m.title}</h3>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--silver)]">{m.desc}</p>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-mono text-[9px] tracking-[0.16em] text-[var(--silver-dim)]">{m.badge}</span>
                <span className="inline-flex items-center gap-1 text-mono text-[11px] tracking-wider text-[var(--silver)] transition-colors group-hover:text-[var(--racing-red)]">
                  OPEN <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ---------------- pipeline ---------------- */}
      <section className="border-y border-[var(--hairline)] bg-[#0c0c0e]">
        <div className="mx-auto max-w-[1600px] px-6 py-24 md:px-10">
          <SectionHeader
            eyebrow="Architecture"
            title="The ML pipeline stays in Python."
            description="This frontend does not reimplement the models — it consumes the pipeline's outputs and defines the API contract the future FastAPI backend will serve. Clean separation, by design."
            right={<DataSourceBadge kind="model" label="PIPELINE OUTPUTS" />}
          />
          <div className="grid gap-px bg-[var(--hairline)] lg:grid-cols-4">
            {pipeline.map((p, i) => (
              <div key={p.step} className="relative bg-[#0e0e11] p-7">
                <div className="flex items-baseline justify-between">
                  <span className="num text-4xl font-semibold text-[#26262c]">{p.step}</span>
                  {i < pipeline.length - 1 && (
                    <ArrowUpRight className="h-4 w-4 text-[var(--silver-dim)] lg:rotate-0" />
                  )}
                </div>
                <h3 className="headline mt-5 text-lg text-[var(--warm-white)]">{p.title}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-[var(--silver)]">{p.body}</p>
                <p className="text-mono mt-4 text-[10px] tracking-[0.12em] text-[var(--silver-dim)]">{p.tech}</p>
              </div>
            ))}
          </div>

          <TechPanel label="API CONTRACT — PREPARED FOR FASTAPI" className="mt-8">
            <div className="grid gap-px bg-[var(--hairline)] sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["GET", "/api/v1/health"],
                ["GET", "/api/v1/models"],
                ["GET", "/api/v1/models/{model_id}"],
                ["POST", "/api/v1/predict"],
                ["POST", "/api/v1/strategy/simulate"],
                ["GET", "/api/v1/races"],
                ["GET", "/api/v1/races/{race_id}/laps"],
                ["GET", "/api/v1/telemetry"],
                ["GET", "/api/v1/experiments"],
              ].map(([method, path]) => (
                <div key={path} className="flex items-center gap-3 bg-[#0e0e11] px-4 py-2.5">
                  <span
                    className={`text-mono text-[9.5px] font-semibold tracking-wider ${method === "POST" ? "text-[var(--racing-red)]" : "text-[var(--tyre-inter)]"}`}
                  >
                    {method}
                  </span>
                  <span className="text-mono text-[11px] text-[var(--silver)]">{path}</span>
                </div>
              ))}
            </div>
            <p className="border-t border-[var(--hairline)] px-4 py-2.5 text-mono text-[10px] tracking-wider text-[var(--silver-dim)]">
              PROPOSED CONTRACT — NOT YET SERVED. THE UI READS BUNDLED PIPELINE OUTPUTS UNTIL THE BACKEND CONNECTS.
            </p>
          </TechPanel>
        </div>
      </section>

      {/* ---------------- closing CTA ---------------- */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-[1600px] px-6 py-28 text-center md:px-10">
          <p className="text-eyebrow mb-5">STRATEGY IS A DECISION SCIENCE</p>
          <h2 className="headline mx-auto max-w-3xl text-4xl text-[var(--warm-white)] md:text-6xl">
            THE PIT WALL CALLS IN <span className="text-[var(--racing-red)]">SECONDS.</span>
            <br />
            THE ENGINE CALLS IT IN <span className="text-[var(--racing-red)]">DATA.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-[var(--silver)]">
            Explore the full platform — replay real races, interrogate the champion
            model, and simulate the strategy calls that decide them.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => navigate("models")}
              className="inline-flex items-center gap-3 bg-[var(--racing-red)] px-7 py-4 font-display text-sm font-semibold uppercase tracking-[0.14em] text-white hover:bg-[#c00500]"
            >
              Inspect the champion model
            </button>
            <button
              onClick={() => navigate("race-replay")}
              className="inline-flex items-center gap-3 border border-[var(--hairline-strong)] px-7 py-4 font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--warm-white)] hover:border-[var(--silver)]"
            >
              Replay a race
            </button>
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-mono text-[10px] tracking-[0.18em] text-[var(--silver-dim)]">
            <Database className="h-3.5 w-3.5" />
            101,371 LAPS · 90 GRANDS PRIX · 5 MODELS · 1 CHAMPION
          </p>
        </div>
      </section>
    </div>
  );
}
