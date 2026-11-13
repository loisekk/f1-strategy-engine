"use client";

import { useMemo, useState } from "react";
import { TechPanel, DataSourceBadge, StatusDot } from "@/components/brand/primitives";
import { Button } from "@/components/ui/button";
import { useMLSession } from "@/stores/ml-session-store";
import { MLPredictResult } from "@/services/ml-api";
import { cn } from "@/lib/utils";
import { Cpu, Gauge, Timer, Zap, Radar, Thermometer } from "lucide-react";

/**
 * Live Inference Console — REAL predictions through the session's warm model.
 *
 * The user selects a model (or keeps the session-bound one), sets a race
 * state, and runs inference against the actual Python artifact served by the
 * FastAPI backend. The model stays warm for the whole session — `loadState`
 * and the session counter prove it (warm + growing, never reloaded).
 */

const DRIVERS = [
  "ALB", "ALO", "ANT", "BEA", "BOR", "BOT", "COL", "DEV", "DOO", "GAS",
  "HAD", "HAM", "HUL", "LAT", "LAW", "LEC", "MAG", "MSC", "NOR", "OCO",
  "PER", "PIA", "RIC", "RUS", "SAI", "SAR", "STR", "TSU", "VER", "VET", "ZHO",
];
const COMPOUNDS = ["SOFT", "MEDIUM", "HARD"] as const;

const inputCls =
  "h-10 w-full border border-[var(--hairline-strong)] bg-[#101014] px-3 text-[13px] text-[var(--warm-white)] outline-none focus:border-[var(--racing-red)]/60";

export function InferenceConsole() {
  const ml = useMLSession();

  const [driver, setDriver] = useState("VER");
  const [compound, setCompound] = useState<(typeof COMPOUNDS)[number]>("MEDIUM");
  const [lapNumber, setLapNumber] = useState("34");
  const [totalLaps, setTotalLaps] = useState("57");
  const [stint, setStint] = useState("2");
  const [tyreLife, setTyreLife] = useState("22");
  const [position, setPosition] = useState("3");
  const [lapTimeS, setLapTimeS] = useState("93.4");
  const [lapTimeDelta, setLapTimeDelta] = useState("0.25");

  const [result, setResult] = useState<MLPredictResult | null>(null);
  const [busy, setBusy] = useState(false);

  const modelOptions = ml.models.filter((m) => m.card.status !== "archived");
  const selectedModel = modelOptions.find((m) => m.card.id === ml.selectedModelId) ?? modelOptions[0] ?? null;
  const canRun = ml.mode === "live" && selectedModel && !busy;

  const decisionColor = useMemo(() => {
    if (!result) return "var(--silver-dim)";
    return result.decision === "BOX"
      ? "var(--racing-red)"
      : result.decision === "WATCH"
        ? "var(--amber-warn)"
        : "var(--tyre-inter)";
  }, [result]);

  async function run() {
    if (!canRun) return;
    setBusy(true);
    const r = await ml.predict({
      driver,
      compound,
      lapNumber: parseInt(lapNumber, 10) || 30,
      totalLaps: parseInt(totalLaps, 10) || 57,
      stint: parseInt(stint, 10) || 2,
      tyreLife: parseInt(tyreLife, 10) || 15,
      position: parseInt(position, 10) || 10,
      lapTimeS: parseFloat(lapTimeS) || 93,
      lapTimeDelta: parseFloat(lapTimeDelta) || 0.15,
    });
    setResult(r);
    setBusy(false);
  }

  /* ------------------------------ offline ------------------------------ */
  if (ml.mode !== "live") {
    return (
      <TechPanel label="LIVE INFERENCE — REAL MODEL PREDICTIONS">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
          <Radar className="h-6 w-6 shrink-0 text-[var(--amber-warn)]" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="font-display text-[15px] font-semibold uppercase tracking-wide text-[var(--warm-white)]">
              ML backend offline — inference console standby
            </p>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[var(--silver-dim)]">
              Start the FastAPI serving layer and this console runs real predictions through your
              actual Python artifacts (f1_pitstop_model.json). The rest of this page keeps showing
              the verified training results.
            </p>
          </div>
          <code className="border border-[var(--hairline)] bg-[#0d0d10] px-3 py-2 text-mono text-[10.5px] text-[var(--silver)]">
            $ cd backend && python run.py
          </code>
        </div>
      </TechPanel>
    );
  }

  /* ------------------------------- live ------------------------------- */
  return (
    <TechPanel label="LIVE INFERENCE CONSOLE — REAL PREDICTIONS THROUGH THE SESSION'S WARM MODEL"
    >
      <div className="grid gap-px bg-[var(--hairline)] lg:grid-cols-[1fr_1fr]">
        {/* inputs */}
        <div className="bg-[#0e0e11] p-5">
          {/* model selector */}
          <div className="mb-4">
            <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">MODEL — SESSION ACTIVE</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {modelOptions.map(({ card }) => {
                const active = selectedModel?.card.id === card.id;
                return (
                  <button
                    key={card.id}
                    onClick={() => void ml.selectModel(card.id)}
                    className={cn(
                      "flex items-center gap-2 border px-3 py-1.5 text-mono text-[10.5px] tracking-wider transition-colors",
                      active
                        ? "border-[var(--tyre-inter)]/50 bg-[var(--tyre-inter)]/10 text-[var(--tyre-inter)]"
                        : "border-[var(--hairline)] text-[var(--silver-dim)] hover:text-[var(--silver)]",
                    )}
                  >
                    {card.status === "champion" && <span className="text-[var(--racing-red)]">◆</span>}
                    {card.name.toUpperCase()} V{card.version}
                  </button>
                );
              })}
            </div>
            {selectedModel && (
              <p className="mt-2 text-mono text-[9.5px] tracking-wider text-[var(--silver-dim)]">
                {selectedModel.card.framework.toUpperCase()} · THRESHOLD {selectedModel.card.threshold} ·{" "}
                {selectedModel.runtime.warm ? "WARM (loaded in memory)" : "COLD (loads on first prediction)"} ·{" "}
                {selectedModel.runtime.predictions} PREDICTIONS SERVED
              </p>
            )}
          </div>

          {/* state inputs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <NumField label="LAP" value={lapNumber} onChange={setLapNumber} min={1} max={120} />
            <NumField label="OF (TOTAL LAPS)" value={totalLaps} onChange={setTotalLaps} min={5} max={120} />
            <NumField label="TYRE LIFE" value={tyreLife} onChange={setTyreLife} min={1} max={80} />
            <NumField label="STINT" value={stint} onChange={setStint} min={1} max={10} />
            <NumField label="POSITION" value={position} onChange={setPosition} min={1} max={24} />
            <NumField label="LAP TIME (S)" value={lapTimeS} onChange={setLapTimeS} step="0.1" />
            <NumField label="LAP-DELTA (S)" value={lapTimeDelta} onChange={setLapTimeDelta} step="0.05" />
            <div>
              <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">DRIVER</label>
              <select className={cn(inputCls, "mt-1 cursor-pointer")} value={driver} onChange={(e) => setDriver(e.target.value)}>
                {DRIVERS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">COMPOUND</label>
              <select
                className={cn(inputCls, "mt-1 cursor-pointer")}
                value={compound}
                onChange={(e) => setCompound(e.target.value as (typeof COMPOUNDS)[number])}
              >
                {COMPOUNDS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={run}
            disabled={!canRun}
            className="mt-5 h-11 w-full gap-2 bg-[var(--racing-red)] font-display text-[13px] font-bold uppercase tracking-wider text-white hover:bg-[var(--racing-red)]/85"
          >
            <Zap className="h-4 w-4" />
            {busy ? "RUNNING…" : "RUN PREDICTION"}
          </Button>
          <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--silver-dim)]">
            Derived features (RaceProgress, Normalized_TyreLife, Cumulative_Degradation) are computed
            server-side exactly as in training; encodings match the dataset's LabelEncoder.
          </p>
        </div>

        {/* result */}
        <div className="flex flex-col bg-[#0e0e11] p-5">
          {!result ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Gauge className="h-8 w-8 text-[#2c2c33]" strokeWidth={1.25} />
              <p className="text-[12.5px] text-[var(--silver-dim)]">
                Set a race state and run — the answer comes from the real artifact, in memory.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="num text-6xl font-semibold leading-none" style={{ color: decisionColor }}>
                    {(result.pitProbability * 100).toFixed(1)}
                    <span className="text-2xl text-[var(--silver-dim)]">%</span>
                  </p>
                  <p className="text-mono mt-2 text-[10px] tracking-[0.18em] text-[var(--silver-dim)]">
                    P(PIT NEXT LAP) · {result.modelName.toUpperCase()} V{result.modelVersion} ·{" "}
                    {result.scaled ? "SCALED" : "RAW"} FEATURES
                  </p>
                </div>
                <div
                  className="border-2 px-4 py-2.5 font-display text-xl font-bold uppercase tracking-wider"
                  style={{ color: decisionColor, borderColor: decisionColor }}
                >
                  {result.decision}
                </div>
              </div>

              <div className="mt-4 h-1.5 w-full bg-[#1c1c21]">
                <div
                  className="h-full transition-[width] duration-300"
                  style={{ width: `${(result.pitProbability * 100).toFixed(1)}%`, background: decisionColor }}
                />
              </div>
              <div className="relative mt-1 h-3">
                <div
                  className="absolute -top-1 h-2 w-px bg-[var(--amber-warn)]"
                  style={{ left: `${result.threshold * 100}%` }}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-px border border-[var(--hairline)] bg-[var(--hairline)]">
                <MiniStat icon={<Timer className="h-3 w-3" />} label="LATENCY" value={`${result.latencyMs.toFixed(2)}ms`} />
                <MiniStat
                  icon={<Thermometer className="h-3 w-3" />}
                  label="MODEL STATE"
                  value={result.loadState === "warm" ? "WARM" : "COLD→LOADED"}
                />
                <MiniStat
                  icon={<Cpu className="h-3 w-3" />}
                  label="SESSION PRED."
                  value={result.session ? String(result.session.predictions) : "—"}
                />
              </div>

              {/* feature vector */}
              <div className="mt-4 max-h-44 overflow-y-auto border border-[var(--hairline)]">
                <table className="w-full">
                  <tbody>
                    {result.featureNames.map((name, i) => (
                      <tr key={name} className="border-b border-[#16161a] last:border-0">
                        <td className="px-3 py-1 text-mono text-[10px] text-[var(--silver-dim)]">{name}</td>
                        <td className="px-3 py-1 text-right text-mono text-[10.5px] text-[var(--warm-white)]">
                          {result.featureVector[i]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-mono text-[9.5px] tracking-wider text-[var(--silver-dim)]">
                  <StatusDot state="operational" />
                  SESSION MODEL ACTIVE — STAYS WARM UNTIL YOU SWITCH
                </p>
                <DataSourceBadge kind="model" label="LIVE INFERENCE" />
              </div>
            </>
          )}
        </div>
      </div>
    </TechPanel>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <div>
      <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">{label}</label>
      <input
        type="number"
        className={cn(inputCls, "mt-1")}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#0e0e11] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-mono text-[8.5px] tracking-[0.14em] text-[var(--silver-dim)]">
        {icon}
        {label}
      </p>
      <p className="num mt-0.5 text-[15px] text-[var(--warm-white)]">{value}</p>
    </div>
  );
}
