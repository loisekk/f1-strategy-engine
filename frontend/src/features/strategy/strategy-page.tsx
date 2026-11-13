"use client";

import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, ReferenceLine,
} from "recharts";
import { SectionHeader, DataSourceBadge, TechPanel, CompoundDot, StatBlock, DataError } from "@/components/brand/primitives";
import { useJson } from "@/hooks/use-hash-route";
import { modelPitProbability, simulateStrategy } from "@/services/data";
import { useMLSession } from "@/stores/ml-session-store";
import type { ModelReport, RaceIndex, TyreData } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Gauge, Timer, Wrench, TrendingDown } from "lucide-react";
import { useEffect } from "react";

const COMPOUNDS = ["SOFT", "MEDIUM", "HARD"] as const;
type Comp = (typeof COMPOUNDS)[number];
const COMPOUND_COLOR: Record<string, string> = { SOFT: "#e10600", MEDIUM: "#FFB800", HARD: "#e9e9e4" };

export function StrategyPage() {
  const { data: tyres, error: tyresError } = useJson<TyreData>("/data/tyres.json");
  const { data: models, error: modelsError } = useJson<ModelReport>("/data/models.json");
  const { data: raceIndex, error: indexError } = useJson<RaceIndex>("/data/races.json");

  const races = useMemo(() => (raceIndex?.races ?? []).filter((r) => !r.isTest), [raceIndex]);
  const [raceId, setRaceId] = useState("bahrain-2022");
  const race = races.find((r) => r.id === raceId) ?? races[0];

  const totalLaps = race?.laps ?? 57;
  const baselineLapS = race?.medianLapS ?? 95;

  const [currentLap, setCurrentLap] = useState(18);
  const [compound, setCompound] = useState<Comp>("MEDIUM");
  const [tyreAge, setTyreAge] = useState(16);

  /* live ML backend — session's warm model */
  const ml = useMLSession();
  const liveModel = ml.models.find((m) => m.card.id === ml.selectedModelId)?.card ?? null;
  const [liveCurveRaw, setLiveCurve] = useState<{ life: number; p: number }[] | null>(null);
  /* live curve is only used while the backend is actually reachable */
  const liveCurve = ml.mode === "live" ? liveCurveRaw : null;

  const clampedLap = Math.min(currentLap, totalLaps - 5);
  const clampedAge = Math.min(tyreAge, Math.max(1, clampedLap));

  /* live verdict: ONE batch call per state change — tyre lives 1..40 at the
     current race progress, all other features at the current state. Falls back
     to the pre-computed grid when the backend is offline. */
  useEffect(() => {
    if (ml.mode !== "live") return;
    const t = setTimeout(async () => {
      const inputs = Array.from({ length: 40 }, (_, i) => ({
        driver: "VER",
        compound,
        lapNumber: clampedLap,
        totalLaps,
        stint: 2,
        tyreLife: i + 1,
        position: 10,
        lapTimeS: baselineLapS,
        lapTimeDelta: 0.15,
      }));
      const probs = await ml.predictBatch(inputs);
      if (probs) {
        setLiveCurve(probs.map((p, i) => ({ life: i + 1, p: p * 100 })));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [ml.mode, ml.predictBatch, compound, clampedLap, totalLaps, baselineLapS]);

  /* champion model pit probability at the current state — live model first,
     pre-computed grid as offline fallback */
  const modelProb = useMemo(() => {
    if (liveCurve && liveCurve.length > 0) {
      const hit = liveCurve.find((d) => d.life === clampedAge);
      if (hit) return hit.p / 100;
    }
    if (!models) return null;
    return modelPitProbability(models, compound, clampedAge, clampedLap / totalLaps);
  }, [liveCurve, models, compound, clampedAge, clampedLap, totalLaps]);

  /* scenario simulation using real empirical curves */
  const results = useMemo(() => {
    if (!tyres) return null;
    const remaining = totalLaps - clampedLap + 1;
    const pitLossS = tyres.pitLossSeconds;
    // Scenario A: one stop — run current set to ~60% of remaining, then the harder compound
    const stopALap = clampedLap + Math.round(remaining * 0.6);
    const aTarget: Comp = compound === "SOFT" ? "MEDIUM" : compound === "MEDIUM" ? "HARD" : "HARD";
    // Scenario B: two stops — split remaining into ~3 equal runs
    const stopB1 = clampedLap + Math.round(remaining / 3);
    const stopB2 = clampedLap + Math.round((remaining * 2) / 3);

    return simulateStrategy(
      { currentLap: clampedLap, totalLaps, baselineLapS, pitLossS },
      [
        {
          label: "A — ONE STOP",
          startCompound: compound,
          startAge: clampedAge,
          stops: [{ lap: stopALap, compound: aTarget }],
        },
        {
          label: "B — TWO STOPS",
          startCompound: compound,
          startAge: clampedAge,
          stops: [
            { lap: stopB1, compound: aTarget },
            { lap: stopB2, compound: compound === "HARD" ? "MEDIUM" : "HARD" },
          ],
        },
      ],
      tyres,
    );
  }, [tyres, clampedLap, totalLaps, baselineLapS, compound, clampedAge]);

  /* pit probability curve for current compound */
  const probCurve = useMemo(() => {
    if (!tyres) return [];
    return Object.entries(tyres.compounds[compound]?.pitProbability ?? {})
      .map(([life, p]) => ({ life: Number(life), p: p * 100 }))
      .filter((d) => d.life <= 40)
      .sort((a, b) => a.life - b.life);
  }, [tyres, compound]);

  /* model surface slice over tyre life at current race progress — live batch
     inference when the backend is up, grid interpolation offline */
  const modelCurve = useMemo(() => {
    if (liveCurve && liveCurve.length > 0) return liveCurve;
    if (!models) return [];
    const out: { life: number; p: number }[] = [];
    for (let life = 1; life <= 40; life++) {
      const v = modelPitProbability(models, compound, life, clampedLap / totalLaps);
      if (v !== null) out.push({ life, p: v * 100 });
    }
    return out;
  }, [liveCurve, models, compound, clampedLap, totalLaps]);

  const decision =
    modelProb === null ? "—" : modelProb >= (liveModel?.threshold ?? 0.64) ? "BOX THIS LAP" : modelProb >= (liveModel?.threshold ?? 0.64) * 0.7 ? "WATCH" : "STAY OUT";
  const decisionColor =
    decision === "BOX THIS LAP" ? "var(--racing-red)" : decision === "WATCH" ? "var(--amber-warn)" : "var(--tyre-inter)";

  if (tyresError || modelsError || indexError) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
        <DataError
          what="Strategy simulator data"
          error={tyresError ?? modelsError ?? indexError}
        />
      </div>
    );
  }

  if (!tyres || !models || races.length === 0) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-8 h-[520px] w-full" />
      </div>
    );
  }

  const winner = results ? (results[0].predictedRaceTimeS <= results[1].predictedRaceTimeS ? results[0] : results[1]) : null;
  const loser = results ? (results[0].predictedRaceTimeS <= results[1].predictedRaceTimeS ? results[1] : results[0]) : null;
  const delta = winner && loser ? loser.predictedRaceTimeS - winner.predictedRaceTimeS : 0;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 05 — Strategy Simulator"
        title="One stop or two? Ask the data."
        description="Scenarios are simulated with the empirical degradation curves and the 19.9s pit-loss estimate measured from 3,271 real stops. The champion LightGBM's response surface shows what the model would call in the same state."
        right={
          <div className="flex flex-col items-end gap-2">
            <DataSourceBadge kind="real" label="CURVES: 101K REAL LAPS" />
            {ml.mode === "live" && liveModel ? (
              <DataSourceBadge kind="model" label={`LIVE: ${liveModel.name.toUpperCase()} V${liveModel.version}`} />
            ) : (
              <DataSourceBadge kind="model" label="PROBABILITY: LIGHTGBM SURFACE" />
            )}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {/* ---------------- control column ---------------- */}
        <div className="space-y-4">
          <TechPanel label="RACE STATE">
            <div className="space-y-6 p-5">
              {/* race selector */}
              <div>
                <p className="text-eyebrow mb-2">Event</p>
                <select
                  value={raceId}
                  onChange={(e) => {
                    setRaceId(e.target.value);
                    const r = races.find((x) => x.id === e.target.value);
                    if (r) setCurrentLap(Math.min(currentLap, Math.round(r.laps * 0.3)));
                  }}
                  className="h-10 w-full border border-[var(--hairline-strong)] bg-[#101014] px-3 font-display text-sm font-semibold uppercase tracking-wide text-[var(--warm-white)] outline-none"
                >
                  {races.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.year} {r.name} — {r.laps} laps
                    </option>
                  ))}
                </select>
              </div>

              {/* lap number */}
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-eyebrow">Current lap</p>
                  <p className="num text-sm text-[var(--warm-white)]">{clampedLap} <span className="text-[var(--silver-dim)]">/ {totalLaps}</span></p>
                </div>
                <Slider
                  value={[clampedLap]}
                  min={2}
                  max={Math.max(3, totalLaps - 5)}
                  step={1}
                  onValueChange={(v) => setCurrentLap(v[0])}
                />
                <p className="mt-1.5 text-mono text-[9.5px] tracking-wider text-[var(--silver-dim)]">
                  RACE PROGRESS {(clampedLap / totalLaps * 100).toFixed(0)}%
                </p>
              </div>

              {/* compound */}
              <div>
                <p className="text-eyebrow mb-2">Current compound</p>
                <div className="flex border border-[var(--hairline)]">
                  {COMPOUNDS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCompound(c)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 py-2.5 font-display text-[13px] font-semibold uppercase tracking-wider transition-colors",
                        compound === c ? "bg-[var(--accent)] text-[var(--warm-white)]" : "text-[var(--silver-dim)] hover:text-[var(--silver)]",
                      )}
                    >
                      <CompoundDot compound={c} />
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* tyre age */}
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-eyebrow">Tyre age</p>
                  <p className="num text-sm text-[var(--warm-white)]">{clampedAge} <span className="text-[var(--silver-dim)]">laps</span></p>
                </div>
                <Slider
                  value={[clampedAge]}
                  min={1}
                  max={Math.max(2, Math.min(40, clampedLap))}
                  step={1}
                  onValueChange={(v) => setTyreAge(v[0])}
                />
              </div>

              {/* readouts */}
              <div className="grid grid-cols-2 gap-px border border-[var(--hairline)] bg-[var(--hairline)]">
                <Readout icon={<Timer className="h-3.5 w-3.5" />} label="Median lap" value={`${baselineLapS.toFixed(1)}s`} />
                <Readout icon={<Wrench className="h-3.5 w-3.5" />} label="Pit loss" value={`${tyres.pitLossSeconds}s`} />
                <Readout icon={<TrendingDown className="h-3.5 w-3.5" />} label="Deg / lap" value={`${(tyres.compounds[compound]?.lapTimeDelta?.[String(Math.min(clampedAge, 40))] ?? 0).toFixed(2)}s`} />
                <Readout icon={<Gauge className="h-3.5 w-3.5" />} label="Remaining" value={`${totalLaps - clampedLap + 1} laps`} />
              </div>
            </div>
          </TechPanel>

          {/* model verdict */}
          <TechPanel
            label={
              ml.mode === "live" && liveModel
                ? `LIVE MODEL — ${liveModel.name.toUpperCase()} V${liveModel.version} · P(IT NEXT LAP)`
                : "CHAMPION MODEL — P(IT NEXT LAP)"
            }
          >
            <div className="p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="num text-5xl font-semibold leading-none" style={{ color: decisionColor }}>
                    {modelProb !== null ? (modelProb * 100).toFixed(1) : "—"}
                    <span className="text-xl text-[var(--silver-dim)]">%</span>
                  </p>
                  <p className="text-mono mt-2 text-[10px] tracking-[0.18em] text-[var(--silver-dim)]">
                    {(liveModel?.name ?? "LIGHTGBM").toUpperCase()} · THRESHOLD {liveModel?.threshold ?? 0.64}
                    {ml.mode === "live" && " · WARM SESSION MODEL"}
                  </p>
                </div>
                <div
                  className="border-2 px-4 py-2.5 font-display text-xl font-bold uppercase tracking-wider"
                  style={{ color: decisionColor, borderColor: decisionColor }}
                >
                  {decision}
                </div>
              </div>
              <div className="mt-4 h-1.5 w-full bg-[#1c1c21]">
                <div className="h-full bg-[var(--racing-red)]" style={{ width: `${((modelProb ?? 0) * 100).toFixed(1)}%` }} />
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--silver-dim)]">
                {ml.mode === "live"
                  ? "Real-time inference from the session's warm model via the FastAPI backend — one batch call per state change, the artifact never reloads."
                  : "Pre-computed response surface of the real champion model at the median race state. Start the ML backend for live full-featured inference."}
              </p>
            </div>
          </TechPanel>
        </div>

        {/* ---------------- results column ---------------- */}
        <div className="space-y-4">
          {results && winner && (
            <TechPanel label={`SCENARIO COMPARISON — REMAINING ${totalLaps - clampedLap + 1} LAPS`}>
              <div className="grid gap-px bg-[var(--hairline)] md:grid-cols-2">
                {results.map((r) => {
                  const isWinner = r.label === winner.label;
                  return (
                    <div key={r.label} className={cn("p-5", isWinner ? "bg-[#12161a]" : "bg-[#0e0e11]")}>
                      <div className="flex items-center justify-between">
                        <p className={cn("font-display text-lg font-bold uppercase tracking-wide", isWinner ? "text-[var(--warm-white)]" : "text-[var(--silver)]")}>
                          {r.label}
                        </p>
                        {isWinner && (
                          <span className="border border-[var(--tyre-inter)] px-2 py-0.5 text-mono text-[9px] tracking-[0.14em] text-[var(--tyre-inter)]">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-y-4">
                        <Metric label="Race time (rest)" value={`${Math.floor(r.predictedRaceTimeS / 60)}:${String(Math.round(r.predictedRaceTimeS % 60)).padStart(2, "0")}`} mono />
                        <Metric label="Pit loss total" value={`+${r.pitLossTotalS.toFixed(1)}s`} mono />
                        <Metric label="Avg deg / lap" value={`+${r.avgDegPerLap.toFixed(2)}s`} mono />
                        <Metric label="Final tyre age" value={`${r.finalTyreAge} laps`} mono />
                      </div>
                      {/* stint bar */}
                      <div className="mt-5">
                        <p className="text-eyebrow mb-2">Stint plan</p>
                        <div className="flex h-6 w-full overflow-hidden border border-[var(--hairline)]">
                          {r.stintPlan.map((s, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-center text-mono text-[8.5px] font-semibold text-black"
                              style={{
                                width: `${((s.toLap - s.fromLap + 1) / (totalLaps - clampedLap + 1)) * 100}%`,
                                background: COMPOUND_COLOR[s.compound],
                                opacity: 0.85,
                              }}
                              title={`${s.compound} L${s.fromLap}–${s.toLap}`}
                            >
                              {s.compound[0]}
                            </div>
                          ))}
                        </div>
                        <div className="mt-1 flex justify-between text-mono text-[9px] text-[var(--silver-dim)]">
                          <span>L{clampedLap}</span>
                          <span>{r.stops} STOP{r.stops === 1 ? "" : "S"}</span>
                          <span>L{totalLaps}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] px-5 py-3">
                <p className="text-[12.5px] text-[var(--silver)]">
                  <span className="text-mono text-[10px] tracking-[0.14em] text-[var(--racing-red)]">DELTA — </span>
                  {winner.label} is <span className="num text-[var(--warm-white)]">{delta.toFixed(1)}s</span> faster over the remaining distance.
                </p>
                <p className="text-mono text-[9px] tracking-wider text-[var(--silver-dim)]">
                  ILLUSTRATIVE — TRACK POSITION & TRAFFIC NOT MODELLING
                </p>
              </div>
            </TechPanel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* empirical pit probability */}
            <TechPanel label={`EMPIRICAL PIT RATE BY TYRE AGE — ${compound}`}>
              <div className="p-2 md:p-3">
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={probCurve} margin={{ top: 8, right: 14, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
                      <XAxis dataKey="life" stroke="#2c2c33" unit=" L" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} />
                      <YAxis stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                        labelFormatter={(l) => `TYRE LIFE ${l} LAPS`}
                        formatter={(v: number | string) => [`${Number(v).toFixed(1)}% of laps end in a stop`, "Pit rate"]}
                      />
                      <Line type="monotone" dataKey="p" stroke="#e10600" strokeWidth={1.8} dot={false} />
                      {clampedAge <= 40 && probCurve.length > 0 && (
                        <ReferenceDot x={clampedAge} y={probCurve.find((d) => d.life === clampedAge)?.p ?? 0} r={4} fill="var(--warm-white)" stroke="#e10600" strokeWidth={2} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="px-2 pb-1 text-[11px] leading-relaxed text-[var(--silver-dim)]">
                  Share of real laps at each tyre age that were followed by a pit stop —
                  measured across every stint in the dataset.
                </p>
              </div>
            </TechPanel>

            {/* model surface */}
            <TechPanel label={`MODEL SURFACE — P(BOX) AT ${Math.round((clampedLap / totalLaps) * 100)}% RACE PROGRESS`}>
              <div className="p-2 md:p-3">
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={modelCurve} margin={{ top: 8, right: 14, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
                      <XAxis dataKey="life" stroke="#2c2c33" unit=" L" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} />
                      <YAxis stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                        labelFormatter={(l) => `TYRE LIFE ${l} LAPS`}
                        formatter={(v: number | string) => [`${Number(v).toFixed(1)}%`, "Model P(box)"]}
                      />
                      <ReferenceLine y={64} stroke="var(--amber-warn)" strokeDasharray="4 4" label={{ value: "THRESHOLD 0.64", fill: "#d9a029", fontSize: 9, position: "insideTopRight" }} />
                      <Line type="monotone" dataKey="p" stroke="#27F4D2" strokeWidth={1.8} dot={false} />
                      {clampedAge <= 40 && modelCurve.length > 0 && (
                        <ReferenceDot x={clampedAge} y={modelCurve.find((d) => d.life === clampedAge)?.p ?? 0} r={4} fill="var(--warm-white)" stroke="#27F4D2" strokeWidth={2} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="px-2 pb-1 text-[11px] leading-relaxed text-[var(--silver-dim)]">
                  {ml.mode === "live"
                    ? `Live ${liveModel?.name ?? "model"} response over tyre life at the current race progress — batch inference through the warm artifact.`
                    : "LightGBM champion response over tyre life, sliced at the current race progress, other features at their median state."}
                </p>
              </div>
            </TechPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Readout({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#0e0e11] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">
        {icon}
        {label.toUpperCase()}
      </p>
      <p className="num mt-1 text-lg text-[var(--warm-white)]">{value}</p>
    </div>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">{label.toUpperCase()}</p>
      <p className={cn("mt-1 text-xl text-[var(--warm-white)]", mono && "num")}>{value}</p>
    </div>
  );
}
