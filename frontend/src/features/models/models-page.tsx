"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ReferenceLine, Cell, LabelList,
} from "recharts";
import { SectionHeader, DataSourceBadge, TechPanel, StatusDot, DataError } from "@/components/brand/primitives";
import { useJson } from "@/hooks/use-hash-route";
import type { ModelKey, ModelReport } from "@/types";
import { MODEL_LABELS } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Cpu, Database, ShieldCheck, GitBranch } from "lucide-react";
import { InferenceConsole } from "./inference-console";

const MODEL_ORDER: ModelKey[] = ["lightgbm", "xgboost", "random_forest", "decision_tree", "logistic_regression"];

export function ModelsPage() {
  const { data, error } = useJson<ModelReport>("/data/models.json");
  const [mode, setMode] = useState<"reported" | "verified">("reported");

  const metricsData = useMemo(() => {
    if (!data) return [];
    const src = mode === "reported" ? data.reported.models : data.verified.models;
    return MODEL_ORDER.map((k) => ({
      key: k,
      name: MODEL_LABELS[k],
      accuracy: (src[k]?.accuracy ?? 0) * 100,
      precision: (src[k]?.precision ?? 0) * 100,
      recall: (src[k]?.recall ?? 0) * 100,
      f1: (src[k]?.f1 ?? 0) * 100,
      rocAuc: (src[k]?.rocAuc ?? 0) * 100,
    }));
  }, [data, mode]);

  if (error) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
        <DataError what="Model report" error={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-8 h-[520px] w-full" />
      </div>
    );
  }

  const championVerified = data.verified.models.lightgbm;
  const championReported = data.reported.models.lightgbm;
  const cm = championVerified?.confusion;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 07 — Model Intelligence"
        title="Five models. One champion."
        description="LightGBM's leaf-wise growth captures the sharp tyre-degradation cliff that level-wise boosting smooths over. Reported metrics come from the original training pipeline; verified metrics are a local replication of the documented pipeline on the same data."
        right={
          <div className="flex flex-col items-end gap-2">
            <DataSourceBadge kind="model" label="REAL TRAINING RESULTS" />
          </div>
        }
      />

      {/* champion card */}
      <div className="grid gap-px bg-[var(--hairline)] lg:grid-cols-4">
        <div className="bg-[#0e0e11] p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-eyebrow">Champion model</p>
            <span className="flex items-center gap-2 border border-[var(--tyre-inter)]/40 bg-[var(--tyre-inter)]/5 px-2 py-1 text-mono text-[9px] tracking-[0.16em] text-[var(--tyre-inter)]">
              <StatusDot />
              IN PRODUCTION
            </span>
          </div>
          <h3 className="headline mt-3 text-5xl text-[var(--warm-white)]">
            Light<span className="text-[var(--racing-red)]">GBM</span>
          </h3>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-[var(--silver)]">
            {data.champion.family}. Decision threshold optimised at{" "}
            <span className="num text-[var(--warm-white)]">{data.champion.threshold}</span> — sweeping
            past the default 0.50 recovers 6–8 points of F1 on the pit class.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--hairline)] pt-4">
            {[
              ["Artifact", data.champion.artifact],
              ["Family", "GBDT · leaf-wise"],
              ["Imbalance", "is_unbalance=true"],
              ["Test rows", data.verified.testRows.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">{k.toUpperCase()}</p>
                <p className="mt-0.5 text-mono text-[11.5px] text-[var(--warm-white)]">{v}</p>
              </div>
            ))}
          </div>
        </div>
        {[
          {
            label: "PIT F1 — REPORTED",
            value: championReported?.f1?.toFixed(4) ?? "—",
            sub: "by original pipeline",
            icon: Cpu,
          },
          {
            label: "PIT F1 — VERIFIED",
            value: championVerified?.f1?.toFixed(4) ?? "—",
            sub: `local replication · acc ${championVerified?.accuracy ?? "—"}`,
            icon: ShieldCheck,
          },
        ].map((s) => (
          <div key={s.label} className="flex flex-col justify-between bg-[#0e0e11] p-6">
            <div className="flex items-start justify-between">
              <p className="text-eyebrow">{s.label}</p>
              <s.icon className="h-5 w-5 text-[var(--racing-red)]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="num text-5xl font-semibold text-[var(--warm-white)]">{s.value}</p>
              <p className="mt-2 text-mono text-[10px] tracking-wider text-[var(--silver-dim)]">{s.sub.toUpperCase()}</p>
            </div>
          </div>
        ))}
      </div>

      {/* live inference console — real predictions through the warm model */}
      <div className="mt-6">
        <InferenceConsole />
      </div>

      {/* data quality note */}
      <div className="mt-6 flex gap-4 border-l-2 border-[var(--amber-warn)] bg-[#141410] px-5 py-4">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber-warn)]" />
        <div>
          <p className="text-mono text-[10px] tracking-[0.16em] text-[var(--amber-warn)]">LABEL SEMANTICS — ENGINEERING NOTE</p>
          <p className="mt-1.5 max-w-4xl text-[13px] leading-relaxed text-[var(--silver)]">
            {data.dataQuality.labelNote}
          </p>
        </div>
      </div>

      {/* metrics comparison */}
      <div className="mt-6">
        <TechPanel
          label={`MODEL COMPARISON — ${mode === "reported" ? "AS PUBLISHED BY THE ORIGINAL PIPELINE" : "LOCAL REPLICATION (80/20 SPLIT, DOCUMENTED THRESHOLDS)"}`}
        >
          <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline)] px-4 py-3">
            <div className="flex border border-[var(--hairline)]">
              {(["reported", "verified"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-4 py-2 font-display text-[12px] font-semibold uppercase tracking-wider transition-colors",
                    mode === m ? "bg-[var(--racing-red)] text-white" : "text-[var(--silver-dim)] hover:text-[var(--silver)]",
                  )}
                >
                  {m === "reported" ? "Reported" : "Verified locally"}
                </button>
              ))}
            </div>
            <p className="hidden text-mono text-[9.5px] tracking-wider text-[var(--silver-dim)] md:block">
              {mode === "reported" ? data.reported.source : data.verified.source}
            </p>
          </div>
          <div className="h-[340px] p-2 md:p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metricsData} margin={{ top: 12, right: 12, bottom: 0, left: -16 }} barGap={2}>
                <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" vertical={false} />
                <XAxis dataKey="name" stroke="#2c2c33" tick={{ fontSize: 10.5, fill: "#8e939e", fontFamily: "var(--font-plex-mono)" }} />
                <YAxis stroke="#2c2c33" domain={[0, 100]} tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                  formatter={(v: number | string, name: string) => [`${Number(v).toFixed(2)}%`, name]}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Legend wrapperStyle={{ fontSize: 10.5, fontFamily: "var(--font-plex-mono)", color: "#8e939e" }} />
                <Bar dataKey="accuracy" name="Accuracy" fill="#e10600" />
                <Bar dataKey="precision" name="Pit precision" fill="#FFB800" />
                <Bar dataKey="recall" name="Pit recall" fill="#27F4D2" />
                <Bar dataKey="f1" name="Pit F1" fill="#e9e9e4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TechPanel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* confusion matrix */}
        {cm && (
          <TechPanel label="CONFUSION MATRIX — LIGHTGBM (VERIFIED)">
            <div className="p-5">
              <div className="grid grid-cols-2 gap-px bg-[var(--hairline)]">
                <CMCell label="TN" value={cm.tn} tone="ok" caption="correctly held" />
                <CMCell label="FP" value={cm.fp} tone="warn" caption="false box call" />
                <CMCell label="FN" value={cm.fn} tone="bad" caption="missed stop" />
                <CMCell label="TP" value={cm.tp} tone="ok" caption="correct box call" />
              </div>
              <div className="mt-4 space-y-1.5">
                {[
                  ["Accuracy", championVerified.accuracy],
                  ["Pit precision", championVerified.precision],
                  ["Pit recall", championVerified.recall],
                  ["Pit F1", championVerified.f1],
                  ["ROC AUC", championVerified.rocAuc ?? null],
                  ["Threshold", championVerified.threshold],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between border-b border-[#1b1b20] pb-1.5">
                    <span className="text-[12.5px] text-[var(--silver)]">{k}</span>
                    <span className="num text-[12.5px] text-[var(--warm-white)]">
                      {typeof v === "number" ? v.toFixed(4) : v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TechPanel>
        )}

        {/* ROC */}
        <TechPanel label="ROC — LIGHTGBM VS XGBOOST (VERIFIED)">
          <div className="h-[300px] p-2 md:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 12, right: 14, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
                <XAxis type="number" dataKey="fpr" domain={[0, 1]} stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} tickFormatter={(v: number) => v.toFixed(1)} />
                <YAxis type="number" dataKey="tpr" domain={[0, 1]} stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip
                  contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                  formatter={(v: number | string, n: string) => [Number(v).toFixed(3), n]}
                />
                <Line data={data.roc.lightgbm.map(([fpr, tpr]) => ({ fpr, tpr }))} name="LightGBM" stroke="#e10600" strokeWidth={1.8} dot={false} />
                <Line data={data.roc.xgboost.map(([fpr, tpr]) => ({ fpr, tpr }))} name="XGBoost" stroke="#27F4D2" strokeWidth={1.4} dot={false} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#35353c" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="border-t border-[var(--hairline)] px-4 py-2.5 text-mono text-[9.5px] tracking-wider text-[var(--silver-dim)]">
            AUC — LIGHTGBM {championVerified.rocAuc} · XGBOOST {data.verified.models.xgboost.rocAuc}
          </p>
        </TechPanel>

        {/* threshold sweep */}
        <TechPanel label="THRESHOLD OPTIMISATION — F1 VS THRESHOLD (LIGHTGBM)">
          <div className="h-[300px] p-2 md:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.thresholdSweep} margin={{ top: 12, right: 14, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
                <XAxis dataKey="threshold" domain={[0, 1]} stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} tickFormatter={(v: number) => v.toFixed(2)} />
                <YAxis domain={[0, 1]} stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip
                  contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                  labelFormatter={(l) => `THRESHOLD ${l}`}
                  formatter={(v: number | string, n: string) => [Number(v).toFixed(4), n]}
                />
                <Line dataKey="precision" name="Precision" stroke="#FFB800" strokeWidth={1.4} dot={false} />
                <Line dataKey="recall" name="Recall" stroke="#27F4D2" strokeWidth={1.4} dot={false} />
                <Line dataKey="f1" name="F1" stroke="#e10600" strokeWidth={2} dot={false} />
                <ReferenceLine x={0.64} stroke="var(--warm-white)" strokeDasharray="4 4" label={{ value: "0.64", fill: "#f2f0ec", fontSize: 10, position: "top" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="border-t border-[var(--hairline)] px-4 py-2.5 text-mono text-[9.5px] leading-relaxed tracking-wider text-[var(--silver-dim)]">
            DEFAULT 0.50 LEAVES PIT RECALL UNUSED — SWEEPING TO 0.64 MAXIMISES F1 ON THE CLASS THAT DRIVES STRATEGY.
          </p>
        </TechPanel>
      </div>

      {/* feature importance */}
      <div className="mt-6">
        <TechPanel label="FEATURE IMPORTANCE — LIGHTGBM GAIN (LOCAL REPLICATION)">
          <div className="grid gap-px bg-[var(--hairline)] lg:grid-cols-2">
            <div className="h-[380px] bg-[#0e0e11] p-2 md:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[...data.featureImportance].sort((a, b) => a.importance - b.importance)}
                  layout="vertical"
                  margin={{ top: 4, right: 44, bottom: 0, left: 30 }}
                >
                  <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" horizontal={false} />
                  <XAxis type="number" stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} unit="%" />
                  <YAxis type="category" dataKey="feature" stroke="#2c2c33" width={132} tick={{ fontSize: 10, fill: "#8e939e", fontFamily: "var(--font-plex-mono)" }} />
                  <Tooltip
                    contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                    formatter={(v: number | string) => [`${Number(v).toFixed(2)}%`, "Gain share"]}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="importance">
                    {data.featureImportance.map((f, i) => (
                      <Cell key={f.feature} fill={i < 3 ? "#e10600" : "#6a6f78"} />
                    ))}
                    <LabelList dataKey="importance" position="right" formatter={(v: number) => `${v.toFixed(1)}%`} style={{ fill: "#8e939e", fontSize: 9, fontFamily: "var(--font-plex-mono)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#0e0e11] p-6">
              <p className="text-eyebrow mb-4">Engineered features the model leans on</p>
              <div className="space-y-4">
                {[
                  { f: "TyreLife + Normalized_TyreLife", v: "26.0%", d: "How long the current set has run — normalised within compound so a 20-lap hard is comparable to a 12-lap soft." },
                  { f: "RaceProgress", v: "12.2%", d: "Lap 15 is not Lap 45. The model learns that identical tyre states mean different things at different race stages." },
                  { f: "LapTime_Delta + Cumulative_Degradation", v: "18.4%", d: "Lap-over-lap decay and its cumulative sum — the degradation cliff signal itself." },
                  { f: "Stint + Position dynamics", v: "13.4%", d: "Stint number and position change capture strategic context — traffic, undercut attempts, track position defence." },
                ].map((row) => (
                  <div key={row.f} className="border-l-2 border-[var(--racing-red)] pl-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-mono text-[11.5px] font-semibold text-[var(--warm-white)]">{row.f}</p>
                      <span className="num shrink-0 text-[13px] text-[var(--racing-red)]">{row.v}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--silver)]">{row.d}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 border-t border-[var(--hairline)] pt-4 text-[11.5px] leading-relaxed text-[var(--silver-dim)]">
                Gain shares from the locally replicated champion. The dominance of tyre-state
                features confirms the documented thesis: pit timing is fundamentally a
                degradation problem.
              </p>
            </div>
          </div>
        </TechPanel>
      </div>

      {/* training info */}
      <div className="mt-6 grid gap-px bg-[var(--hairline)] md:grid-cols-3">
        {[
          { icon: GitBranch, t: "Training pipeline", v: `${data.verified.trainRows.toLocaleString()} train · ${data.verified.testRows.toLocaleString()} test rows`, d: "Stratified 80/20 split, seed 42, matching the documented split." },
          { icon: Cpu, t: "Feature set", v: `${data.verified.features.length} features`, d: "10 engineered numeric + driver/compound encodings, exactly as documented." },
          { icon: ShieldCheck, t: "Replication caveat", v: "Hyperparameters approximated", d: "Original used RandomizedSearchCV (50 candidates × 5-fold); local run uses documented defaults — hence reported F1 0.9445 vs verified 0.8610." },
        ].map((s) => (
          <div key={s.t} className="bg-[#0e0e11] p-5">
            <div className="flex items-center gap-2.5">
              <s.icon className="h-4 w-4 text-[var(--racing-red)]" strokeWidth={1.5} />
              <p className="text-eyebrow">{s.t}</p>
            </div>
            <p className="mt-3 font-display text-lg font-semibold uppercase tracking-wide text-[var(--warm-white)]">{s.v}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--silver-dim)]">{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CMCell({ label, value, tone, caption }: { label: string; value: number; tone: "ok" | "warn" | "bad"; caption: string }) {
  const color = tone === "ok" ? "var(--tyre-inter)" : tone === "warn" ? "var(--amber-warn)" : "var(--racing-red)";
  return (
    <div className="relative bg-[#0e0e11] px-4 py-5 text-center">
      <p className="text-mono text-[9px] tracking-[0.2em]" style={{ color }}>{label}</p>
      <p className="num mt-1 text-3xl font-semibold text-[var(--warm-white)]">{value.toLocaleString()}</p>
      <p className="mt-1 text-[10.5px] text-[var(--silver-dim)]">{caption}</p>
      <span className="absolute bottom-0 left-0 h-[2px] w-full" style={{ background: color, opacity: 0.5 }} />
    </div>
  );
}
