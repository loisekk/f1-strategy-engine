"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { SectionHeader, DataSourceBadge, TechPanel, CompoundDot, DataError } from "@/components/brand/primitives";
import { useJson } from "@/hooks/use-hash-route";
import { formatLapTime } from "@/services/data";
import type { RaceReplay, TelemetryData, TyreData } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CIRCUIT_LABELS: Record<string, string> = {
  monza: "Monza",
  monaco: "Monaco",
  bahrain: "Bahrain",
  silverstone: "Silverstone",
};

export function TelemetryPage() {
  const { data: telemetry, error: telemetryError } = useJson<TelemetryData>("/data/telemetry.json");
  const { data: tyres, error: tyresError } = useJson<TyreData>("/data/tyres.json");
  const { data: race, error: raceError } = useJson<RaceReplay>("/data/races/bahrain-2022.json");

  const [circuit, setCircuit] = useState("monza");
  const [showAttack, setShowAttack] = useState(true);

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 04 — Telemetry Lab"
        title="Read the lap the way engineers do."
        description="Six channels on one synchronised distance axis. Channel traces are synthesised by a quasi-steady lap simulation over real circuit geometry — labelled as such. Lap-time comparison and tyre data are real."
        right={
          <div className="flex flex-col items-end gap-2">
            <DataSourceBadge kind="synth" label="CHANNELS: SYNTHESISED PHYSICS" />
            <DataSourceBadge kind="real" label="LAP TIMES & TYRES: REAL DATA" />
          </div>
        }
      />

      {/* circuit selector */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-eyebrow">Circuit</span>
        <div className="flex border border-[var(--hairline)]">
          {telemetry && Object.keys(telemetry.circuits).map((key) => (
            <button
              key={key}
              onClick={() => setCircuit(key)}
              className={cn(
                "px-4 py-2 font-display text-[13px] font-semibold uppercase tracking-wider transition-colors",
                circuit === key
                  ? "bg-[var(--racing-red)] text-white"
                  : "text-[var(--silver)] hover:bg-[var(--accent)] hover:text-[var(--warm-white)]",
              )}
            >
              {CIRCUIT_LABELS[key] ?? key}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAttack((v) => !v)}
          className={cn(
            "ml-2 border px-4 py-2 font-display text-[13px] font-semibold uppercase tracking-wider transition-colors",
            showAttack
              ? "border-[var(--racing-red)]/60 text-[var(--warm-white)]"
              : "border-[var(--hairline)] text-[var(--silver-dim)]",
          )}
        >
          Attack lap {showAttack ? "on" : "off"}
        </button>
      </div>

      {telemetryError ? (
        <DataError what="Telemetry channels" error={telemetryError} />
      ) : !telemetry ? (
        <Skeleton className="h-[600px] w-full" />
      ) : (
        <ChannelStack
          circuit={telemetry.circuits[circuit]}
          showAttack={showAttack}
        />
      )}

      {/* real lap-time comparison */}
      <div className="mt-12 grid gap-6 xl:grid-cols-2">
        {raceError && <DataError what="Lap-time comparison" error={raceError} />}
        {race && <LapTimeCompare race={race} />}
        {tyresError && <DataError what="Tyre degradation data" error={tyresError} />}
        {tyres && <DegradationPanel tyres={tyres} />}
      </div>

      {telemetry && (
        <p className="mt-6 border-l-2 border-[var(--amber-warn)] bg-[#141410] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--silver)]">
          <span className="text-mono text-[10px] tracking-[0.16em] text-[var(--amber-warn)]">METHOD — </span>
          {telemetry.circuits[circuit].note}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChannelStack({
  circuit,
  showAttack,
}: {
  circuit: TelemetryData["circuits"][string];
  showAttack: boolean;
}) {
  // decimate for chart performance
  const data = useMemo(() => {
    const ref = circuit.laps.reference;
    const atk = circuit.laps.attack;
    const rows: Record<string, number>[] = [];
    const stride = Math.max(1, Math.floor(circuit.dist.length / 420));
    for (let i = 0; i < circuit.dist.length; i += stride) {
      const row: Record<string, number> = {
        d: circuit.dist[i],
        refSpeed: ref.speed[i],
        refThrottle: ref.throttle[i] * 100,
        refBrake: ref.brake[i] * 100,
        refGear: ref.gear[i],
        refRpm: ref.rpm[i],
      };
      if (showAttack) {
        row.atkSpeed = atk.speed[i];
        row.atkThrottle = atk.throttle[i] * 100;
        row.atkBrake = atk.brake[i] * 100;
        row.atkGear = atk.gear[i];
        row.atkRpm = atk.rpm[i];
      }
      rows.push(row);
    }
    return rows;
  }, [circuit, showAttack]);

  const axisProps = {
    stroke: "#2c2c33",
    tick: { fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" },
  };
  const tooltipProps = {
    contentStyle: {
      background: "#121216",
      border: "1px solid #2c2c33",
      borderRadius: 0,
      fontSize: 11,
      fontFamily: "var(--font-plex-mono)",
    },
    labelFormatter: (d: number) => `${d} m`,
  };

  return (
    <div className="space-y-4">
      <TechPanel
        label={`SPEED — ${circuit.name.toUpperCase()} · ${(circuit.lengthM / 1000).toFixed(3)} KM · REF ${circuit.laps.reference.lapTimeS.toFixed(1)}S${showAttack ? ` · ATK ${circuit.laps.attack.lapTimeS.toFixed(1)}S` : ""}`}
      >
        <div className="h-[220px] p-2 md:p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }} syncId="tele">
              <defs>
                <linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e10600" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#e10600" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
              <XAxis dataKey="d" {...axisProps} unit=" m" minTickGap={48} />
              <YAxis {...axisProps} domain={[0, 360]} unit=" km/h" width={70} />
              <Tooltip {...tooltipProps} />
              <Area type="monotone" dataKey="refSpeed" name="Reference km/h" stroke="#e10600" strokeWidth={1.6} fill="url(#speedFill)" />
              {showAttack && (
                <Line type="monotone" dataKey="atkSpeed" name="Attack km/h" stroke="#27F4D2" strokeWidth={1.2} dot={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </TechPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <TechPanel label="THROTTLE / BRAKE — PEDAL TRACE">
          <div className="h-[190px] p-2 md:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }} syncId="tele">
                <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
                <XAxis dataKey="d" {...axisProps} unit=" m" minTickGap={48} />
                <YAxis {...axisProps} domain={[0, 100]} unit=" %" width={52} />
                <Tooltip {...tooltipProps} />
                <Area type="step" dataKey="refThrottle" name="Throttle %" stroke="#43C000" fill="#43C000" fillOpacity={0.12} strokeWidth={1.2} />
                <Area type="step" dataKey="refBrake" name="Brake %" stroke="#e10600" fill="#e10600" fillOpacity={0.16} strokeWidth={1.2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </TechPanel>

        <TechPanel label="GEAR — 8-SPEED SEQUENTIAL">
          <div className="h-[190px] p-2 md:p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }} syncId="tele">
                <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
                <XAxis dataKey="d" {...axisProps} unit=" m" minTickGap={48} />
                <YAxis {...axisProps} domain={[1, 8]} width={36} allowDecimals={false} />
                <Tooltip {...tooltipProps} />
                <Line type="stepAfter" dataKey="refGear" name="Gear" stroke="#FFB800" strokeWidth={1.4} dot={false} />
                {showAttack && (
                  <Line type="stepAfter" dataKey="atkGear" name="Attack gear" stroke="#64C4FF" strokeWidth={1} dot={false} opacity={0.7} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TechPanel>
      </div>

      <TechPanel label="ENGINE RPM">
        <div className="h-[160px] p-2 md:p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -6 }} syncId="tele">
              <defs>
                <linearGradient id="rpmFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFB800" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#FFB800" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
              <XAxis dataKey="d" {...axisProps} unit=" m" minTickGap={48} />
              <YAxis {...axisProps} domain={[4000, 12000]} width={64} unit=" rpm" />
              <Tooltip {...tooltipProps} />
              <Area type="monotone" dataKey="refRpm" name="RPM" stroke="#FFB800" strokeWidth={1.4} fill="url(#rpmFill)" />
              {showAttack && (
                <Line type="monotone" dataKey="atkRpm" name="Attack RPM" stroke="#64C4FF" strokeWidth={1} dot={false} opacity={0.7} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </TechPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LapTimeCompare({ race }: { race: RaceReplay }) {
  const [selected, setSelected] = useState<string[]>(() =>
    race.drivers.slice(0, 4).map((d) => d.code),
  );

  const colors: Record<string, string> = {};
  race.drivers.forEach((d, i) => {
    colors[d.code] =
      d.team === "Ferrari" ? "#E8002D"
      : d.team === "Red Bull Racing" ? "#3671C6"
      : d.team === "Mercedes" ? "#27F4D2"
      : ["#E10600", "#3671C6", "#FF8000", "#27F4D2", "#FF87BC", "#229971"][i % 6];
  });

  const data = useMemo(() => {
    const rows: Record<string, number | string>[] = [];
    for (let lap = 1; lap <= race.laps; lap++) {
      const row: Record<string, number | string> = { lap };
      for (const d of race.drivers) {
        const rec = d.laps[lap - 1];
        if (rec && rec[1] > 0) row[d.code] = rec[1] / 10;
      }
      rows.push(row);
    }
    return rows;
  }, [race]);

  const pitLaps = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const d of race.drivers) {
      map[d.code] = d.laps.filter((r) => r[4] === 1).map((r, i) => i + 1);
    }
    return map;
  }, [race]);

  const toggle = (code: string) => {
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code].slice(-6)));
  };

  return (
    <TechPanel label={`LAP TIMES — ${race.name.toUpperCase()} ${race.year} · REAL DATA`}>
      <div className="p-2 md:p-3">
        <div className="mb-3 flex flex-wrap gap-2 px-2">
          {race.drivers.slice(0, 10).map((d) => (
            <button
              key={d.code}
              onClick={() => toggle(d.code)}
              className={cn(
                "flex items-center gap-1.5 border px-2 py-1 text-mono text-[10px] tracking-wider transition-colors",
                selected.includes(d.code)
                  ? "border-[var(--hairline-strong)] text-[var(--warm-white)]"
                  : "border-[var(--hairline)] text-[var(--silver-dim)] hover:text-[var(--silver)]",
              )}
            >
              <span className="h-2 w-2" style={{ background: colors[d.code] }} />
              {d.code}
            </button>
          ))}
          <span className="ml-auto self-center text-mono text-[9px] tracking-widest text-[var(--silver-dim)]">
            ▲ PIT LAPS SHOWN AS DOTS
          </span>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 14, bottom: 0, left: -4 }}>
              <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
              <XAxis dataKey="lap" stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} />
              <YAxis
                stroke="#2c2c33"
                tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }}
                domain={["dataMin - 1", "dataMax + 1"]}
                tickFormatter={(v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`}
              />
              <Tooltip
                contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                labelFormatter={(l) => `LAP ${l}`}
                formatter={(v: number | string) => formatLapTime(Number(v))}
              />
              {selected.map((code) => (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  stroke={colors[code]}
                  strokeWidth={1.5}
                  dot={(props: { cx?: number; cy?: number; payload?: Record<string, number | string>; key?: string }) => {
                    const lap = Number(props.payload?.lap);
                    const pits = pitLaps[code] ?? [];
                    if (pits.includes(lap)) {
                      return (
                        <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#e10600" stroke="#fff" strokeWidth={0.8} />
                      );
                    }
                    return <g key={props.key} />;
                  }}
                  connectNulls
                  activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </TechPanel>
  );
}

/* ------------------------------------------------------------------ */

function DegradationPanel({ tyres }: { tyres: TyreData }) {
  const compounds = ["SOFT", "MEDIUM", "HARD"];
  const compoundColor: Record<string, string> = {
    SOFT: "#e10600",
    MEDIUM: "#FFB800",
    HARD: "#e9e9e4",
  };

  const data = useMemo(() => {
    const maxLife = 40;
    const rows: Record<string, number | string>[] = [];
    for (let life = 2; life <= maxLife; life++) {
      const row: Record<string, number | string> = { life };
      let any = false;
      for (const c of compounds) {
        const v = tyres.compounds[c]?.lapTimeDelta?.[String(life)];
        if (v !== undefined) {
          row[c] = v;
          any = true;
        }
      }
      if (any) rows.push(row);
    }
    return rows;
  }, [tyres]);

  return (
    <TechPanel label={`TYRE DEGRADATION — NET LAP-TIME DELTA VS BASELINE · PIT LOSS ${tyres.pitLossSeconds}S (N=${tyres.pitLossSample.toLocaleString()})`}>
      <div className="p-2 md:p-3">
        <div className="mb-2 flex flex-wrap items-center gap-3 px-2">
          {compounds.map((c) => (
            <span key={c} className="flex items-center gap-1.5 text-mono text-[10px] tracking-wider text-[var(--silver)]">
              <CompoundDot compound={c} />
              {c}
            </span>
          ))}
          <span className="ml-auto text-mono text-[9px] tracking-widest text-[var(--silver-dim)]">
            MEDIAN OVER ALL DRIVERS & RACES · 2022–2025
          </span>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 14, bottom: 0, left: -14 }}>
              <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
              <XAxis dataKey="life" stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} unit=" laps" />
              <YAxis
                stroke="#2c2c33"
                tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}s`}
              />
              <Tooltip
                contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                labelFormatter={(l) => `TYRE LIFE ${l} LAPS`}
                formatter={(v: number | string, name: string) => [`${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}s`, name]}
              />
              <ReferenceLine y={0} stroke="#35353c" />
              {compounds.map((c) => (
                <Line key={c} type="monotone" dataKey={c} stroke={compoundColor[c]} strokeWidth={1.6} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="px-3 pb-2 text-[11.5px] leading-relaxed text-[var(--silver-dim)]">
          Net delta includes fuel burn — cars get lighter through the stint, which offsets
          degradation until the cliff. Empirical medians from the real dataset.
        </p>
      </div>
    </TechPanel>
  );
}
