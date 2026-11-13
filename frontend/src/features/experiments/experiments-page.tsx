"use client";

import { useState } from "react";
import { SectionHeader, DataSourceBadge, TechPanel, StatusDot } from "@/components/brand/primitives";
import { Button } from "@/components/ui/button";
import { FlaskConical, ArrowUpDown, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Experiment tracking view. The run list below is MOCK DATA that mirrors the
 * documented training pipeline — it exists to demonstrate the tracking UI
 * until an MLflow backend is connected. Nothing here fakes a live connection.
 */
const MOCK_RUNS = [
  {
    id: "run_lgbm_tuned_v4",
    name: "lgbm_tuned",
    family: "LightGBM",
    status: "finished",
    startedAt: "2026-05-28 14:02",
    duration: "4.7s",
    params: { num_leaves: 63, learning_rate: 0.05, is_unbalance: true, threshold: 0.64 },
    metrics: { f1: 0.861, accuracy: 0.927, rocAuc: 0.975 },
    origin: "verified",
  },
  {
    id: "run_xgb_tuned_v3",
    name: "xgb_randomsearch",
    family: "XGBoost",
    status: "finished",
    startedAt: "2026-05-28 13:44",
    duration: "3.1s",
    params: { max_depth: 6, learning_rate: 0.05, scale_pos_weight: "auto", threshold: 0.60 },
    metrics: { f1: 0.795, accuracy: 0.886, rocAuc: 0.954 },
    origin: "verified",
  },
  {
    id: "run_rf_baseline",
    name: "rf_baseline",
    family: "Random Forest",
    status: "finished",
    startedAt: "2026-05-28 13:31",
    duration: "28.8s",
    params: { n_estimators: 300, class_weight: "balanced" },
    metrics: { f1: 0.779, accuracy: 0.870, rocAuc: 0.952 },
    origin: "verified",
  },
  {
    id: "run_dt_baseline",
    name: "dt_baseline",
    family: "Decision Tree",
    status: "finished",
    startedAt: "2026-05-28 13:30",
    duration: "0.5s",
    params: { max_depth: 8, class_weight: "balanced" },
    metrics: { f1: 0.654, accuracy: 0.777, rocAuc: 0.868 },
    origin: "verified",
  },
  {
    id: "run_logreg_baseline",
    name: "logreg_baseline",
    family: "Logistic Regression",
    status: "finished",
    startedAt: "2026-05-28 13:29",
    duration: "0.1s",
    params: { C: 1.0, scaler: "standard" },
    metrics: { f1: 0.342, accuracy: 0.765, rocAuc: 0.775 },
    origin: "verified",
  },
] as const;

export function ExperimentsPage() {
  const [sortMetric, setSortMetric] = useState<"f1" | "startedAt">("f1");
  const { toast } = useToast();

  const runs = [...MOCK_RUNS].sort((a, b) =>
    sortMetric === "f1" ? b.metrics.f1 - a.metrics.f1 : b.startedAt.localeCompare(a.startedAt),
  );

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 08 — Experiments"
        title="Experiment tracking, ready to wire."
        description="Run records mirror the documented training pipeline with locally verified metrics. The tracking server itself is not yet connected — this view is prepared for MLflow integration and every run is labelled accordingly."
        right={<DataSourceBadge kind="mock" label="TRACKING SERVER NOT CONNECTED" />}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-eyebrow">Sort</span>
          <div className="flex border border-[var(--hairline)]">
            {(["f1", "startedAt"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSortMetric(k)}
                className={cn(
                  "px-3.5 py-1.5 font-display text-[12px] font-semibold uppercase tracking-wider",
                  sortMetric === k ? "bg-[var(--accent)] text-[var(--warm-white)]" : "text-[var(--silver-dim)]",
                )}
              >
                {k === "f1" ? "Pit F1" : "Latest"}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-[var(--hairline-strong)] bg-transparent text-[12px] font-display font-semibold uppercase tracking-wider text-[var(--silver-dim)]"
          onClick={() =>
            toast({
              title: "MLflow not connected",
              description: "This action requires the FastAPI backend and an MLflow tracking server. The UI contract is prepared — connect GET /api/v1/experiments to activate.",
            })
          }
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Connect MLflow
        </Button>
      </div>

      <div className="space-y-3">
        {runs.map((run) => (
          <div key={run.id} className="panel group p-5 transition-colors hover:border-[var(--hairline-strong)]">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex min-w-[220px] items-center gap-3">
                <FlaskConical className="h-4 w-4 text-[var(--silver-dim)]" strokeWidth={1.5} />
                <div>
                  <p className="font-display text-[15px] font-semibold uppercase tracking-wide text-[var(--warm-white)]">
                    {run.family}
                  </p>
                  <p className="text-mono text-[10px] text-[var(--silver-dim)]">{run.name} · {run.duration}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 border border-[var(--hairline)] px-2 py-0.5 text-mono text-[9px] tracking-widest text-[var(--silver-dim)]">
                  <StatusDot state="operational" />
                  {run.status.toUpperCase()}
                </span>
                <span className="border border-[var(--tyre-inter)]/30 bg-[var(--tyre-inter)]/5 px-2 py-0.5 text-mono text-[9px] tracking-widest text-[var(--tyre-inter)]">
                  METRICS: LOCALLY VERIFIED
                </span>
              </div>
              <div className="ml-auto flex items-center gap-8">
                {(["f1", "accuracy", "rocAuc"] as const).map((m) => (
                  <div key={m} className="text-right">
                    <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">
                      {m === "f1" ? "PIT F1" : m === "accuracy" ? "ACC" : "AUC"}
                    </p>
                    <p className="num text-lg text-[var(--warm-white)]">{run.metrics[m].toFixed(3)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[var(--hairline)] pt-3">
              {Object.entries(run.params).map(([k, v]) => (
                <span key={k} className="text-mono text-[10px] text-[var(--silver-dim)]">
                  <span className="text-[var(--silver)]">{k}</span>=<span className="text-[var(--warm-white)]">{String(v)}</span>
                </span>
              ))}
              <span className="ml-auto text-mono text-[9.5px] tracking-wider text-[var(--silver-dim)]">{run.startedAt}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-l-2 border-[var(--silver-dim)] bg-[#121215] px-5 py-4">
        <p className="text-[13px] leading-relaxed text-[var(--silver)]">
          <span className="text-mono text-[10px] tracking-[0.16em] text-[var(--silver-dim)]">INTEGRATION PLAN — </span>
          When the FastAPI backend ships, <span className="text-mono text-[12px] text-[var(--warm-white)]">GET /api/v1/experiments</span> replaces the
          bundled run list. Params and metrics schemas already match the MLflow search API so the
          swap is a data-source change, not a UI rebuild.
        </p>
      </div>
    </div>
  );
}
