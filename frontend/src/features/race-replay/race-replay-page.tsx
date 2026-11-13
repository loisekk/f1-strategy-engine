"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, DataSourceBadge, CompoundDot, TechPanel, DataError } from "@/components/brand/primitives";
import { useJson } from "@/hooks/use-hash-route";
import { useAppStore } from "@/stores/app-store";
import { formatLapTime } from "@/services/data";
import type { RaceMeta, RaceReplay, RaceIndex } from "@/types";
import { ReplayEngine, assignDriverColor } from "./replay-engine";
import {
  Play, Pause, SkipBack, SkipForward, Flag, Timer, Users, Wrench,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 1, 2, 4, 8];

export function RaceReplayPage() {
  const { data: index } = useJson<RaceIndex>("/data/races.json");
  const races = useMemo(
    () => (index?.races ?? []).filter((r) => !r.isTest),
    [index],
  );
  const [raceId, setRaceId] = useState<string | null>(null);
  const effectiveRaceId =
    raceId ?? races.find((r) => r.id === "bahrain-2022")?.id ?? races[0]?.id ?? null;
  const { data: race, loading, error } = useJson<RaceReplay>(
    effectiveRaceId ? `/data/races/${effectiveRaceId}.json` : null,
  );

  if (!races.length && !index) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-8 h-[520px] w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 03 — Race Replay"
        title="Replay any race. Lap by lap."
        description="Every marker on the circuit map is driven by real lap-time data from the strategy dataset — positions, tyre compounds, stops and gaps are reconstructed from 90 real Grands Prix (2022–2025), not simulated."
        right={<DataSourceBadge kind="real" label="REAL RACE DATA" />}
      />
      {loading && <Skeleton className="h-[520px] w-full" />}
      {error && <DataError what="Race data" error={error} className="mb-6" />}
      {race && races.length > 0 && (
        <ReplayWorkspace key={race.id} race={race} races={races} onRaceChange={setRaceId} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReplayWorkspace({
  race,
  races,
  onRaceChange,
}: {
  race: RaceReplay;
  races: RaceMeta[];
  onRaceChange: (id: string) => void;
}) {
  const engine = useMemo(() => new ReplayEngine(race), [race]);
  const [playing, setPlaying] = useState(false);
  /* initial speed comes from the Settings preference */
  const [speed, setSpeed] = useState(() => useAppStore.getState().playbackSpeed);
  const [timeS, setTimeS] = useState(0);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const timeRef = useRef(0);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  /* keep timeRef in sync with scrub-driven state changes */
  useEffect(() => {
    timeRef.current = timeS;
  }, [timeS]);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastTsRef.current = performance.now();
    let uiAccum = 0;
    const loop = (ts: number) => {
      const dt = Math.min(0.12, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      timeRef.current = Math.min(engine.maxTimeS, timeRef.current + dt * speedRef.current);
      uiAccum += dt;
      if (uiAccum > 0.11) {
        uiAccum = 0;
        setTimeS(timeRef.current);
        setTick((t) => t + 1);
      }
      if (timeRef.current >= engine.maxTimeS) {
        setPlaying(false);
        setTimeS(engine.maxTimeS);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, engine]);

  const snapshot = useMemo(
    () => engine.snapshot(timeS),
    [engine, timeS, tick],
  );

  const currentLap = Math.max(1, Math.min(race.laps, Math.ceil(snapshot.lapFloat)));
  const leaderLapTime = snapshot.order[0]?.code;

  const jumpLap = useCallback(
    (dir: 1 | -1) => {
      setPlaying(false);
      const target = Math.max(1, Math.min(race.laps, currentLap + dir));
      setTimeS(engine.timeAtLap(target) + 0.001);
    },
    [currentLap, engine, race.laps],
  );

  const scrubTo = useCallback((val: number) => {
    setPlaying(false);
    timeRef.current = val;
    setTimeS(val);
    setTick((t) => t + 1);
  }, []);

  const racesByYear = useMemo(() => {
    const groups = new Map<number, RaceMeta[]>();
    for (const r of races) {
      if (!groups.has(r.year)) groups.set(r.year, []);
      groups.get(r.year)!.push(r);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [races]);

  return (
    <div className="space-y-6">
      {/* race selector + meta */}
      <div className="panel flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Select value={race.id} onValueChange={(v) => { setPlaying(false); setTimeS(0); onRaceChange(v); }}>
            <SelectTrigger className="h-10 w-[300px] border-[var(--hairline-strong)] bg-[#101014] font-display text-sm font-semibold uppercase tracking-wide text-[var(--warm-white)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80 border-[var(--hairline)] bg-[#16161a] text-[var(--foreground)]">
              {racesByYear.map(([year, list]) => (
                <SelectGroup key={year}>
                  <SelectLabel className="text-eyebrow">{year} SEASON</SelectLabel>
                  {list.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-[13px] aria-selected:bg-[var(--accent)]">
                      {r.name}
                      <span className="ml-2 text-mono text-[10px] text-[var(--silver-dim)]">
                        {r.laps} LAPS · {r.winner ? `WIN ${r.winner}` : "—"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden items-center gap-5 text-mono text-[11px] text-[var(--silver-dim)] md:flex">
            <span className="flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-[var(--silver-dim)]" />{race.circuit.name}</span>
            <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" />{(race.circuit.lengthM / 1000).toFixed(3)} KM</span>
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{race.drivers.length} DRIVERS</span>
            <span className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" />{race.summary.totalPits} STOPS</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-mono text-[10px] tracking-[0.16em] text-[var(--silver-dim)]">RACE TIME</p>
            <p className="num text-xl font-semibold text-[var(--warm-white)]">
              {formatClock(snapshot.raceTimeS)}
            </p>
          </div>
          <div className="h-10 w-px bg-[var(--hairline)]" />
          <div className="text-right">
            <p className="text-mono text-[10px] tracking-[0.16em] text-[var(--silver-dim)]">LAP</p>
            <p className="num text-xl font-semibold text-[var(--warm-white)]">
              {currentLap}<span className="text-sm text-[var(--silver-dim)]">/{race.laps}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* track + controls */}
        <div className="space-y-6">
          <TechPanel label="CIRCUIT — LIVE RECONSTRUCTION">
            <TrackMap
              race={race}
              snapshot={snapshot}
              focusCode={focusCode}
              onFocus={setFocusCode}
            />
          </TechPanel>

          {/* transport controls */}
          <div className="panel p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => jumpLap(-1)}
                className="border border-[var(--hairline)] p-2.5 text-[var(--silver)] hover:border-[var(--silver)] hover:text-[var(--warm-white)]"
                aria-label="Previous lap"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  if (timeRef.current >= engine.maxTimeS) {
                    timeRef.current = 0;
                    setTimeS(0);
                  }
                  setPlaying((p) => !p);
                }}
                className="flex h-11 w-11 items-center justify-center bg-[var(--racing-red)] text-white transition-colors hover:bg-[#c00500]"
                aria-label={playing ? "Pause replay" : "Play replay"}
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <button
                onClick={() => jumpLap(1)}
                className="border border-[var(--hairline)] p-2.5 text-[var(--silver)] hover:border-[var(--silver)] hover:text-[var(--warm-white)]"
                aria-label="Next lap"
              >
                <SkipForward className="h-4 w-4" />
              </button>

              <div className="ml-2 flex items-center border border-[var(--hairline)]">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      "px-2.5 py-2 text-mono text-[11px] transition-colors",
                      speed === s
                        ? "bg-[var(--racing-red)] text-white"
                        : "text-[var(--silver-dim)] hover:text-[var(--silver)]",
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>

              <div className="ml-auto hidden items-center gap-2 text-mono text-[10px] tracking-[0.14em] text-[var(--silver-dim)] sm:flex">
                <span className="h-1.5 w-1.5 bg-[var(--racing-red)]" /> LEADER
                <span className="ml-2 h-1.5 w-1.5 rounded-full border border-[var(--silver-dim)]" /> ON-TRACK
              </div>
            </div>
            <input
              type="range"
              className="scrub mt-4 w-full"
              min={0}
              max={Math.round(engine.maxTimeS)}
              value={Math.round(timeS)}
              onChange={(e) => scrubTo(Number(e.target.value))}
              aria-label="Race timeline scrubber"
            />
            <div className="mt-1.5 flex justify-between text-mono text-[10px] text-[var(--silver-dim)]">
              <span>LIGHTS OUT</span>
              <span>
                LAP {currentLap} · P1 {leaderLapTime ?? "—"}
              </span>
              <span>CHEQUERED FLAG</span>
            </div>
          </div>

          <PositionChart race={race} focusCode={focusCode} currentLap={currentLap} />
        </div>

        {/* standings */}
        <TechPanel label={`ORDER — LAP ${currentLap}`} className="self-start">
          <div className="max-h-[820px] overflow-y-auto">
            <table className="w-full">
              <tbody>
                {snapshot.order.map((d, i) => {
                  const isFocus = focusCode === d.code;
                  return (
                    <tr
                      key={d.code}
                      onClick={() => setFocusCode(isFocus ? null : d.code)}
                      className={cn(
                        "cursor-pointer border-b border-[#1b1b20] transition-colors",
                        isFocus ? "bg-[#18181d]" : "hover:bg-[#141419]",
                        d.dnf && "opacity-40",
                      )}
                    >
                      <td className="num w-9 py-2.5 pl-3 text-[13px] text-[var(--silver-dim)]">
                        {d.dnf ? "DNF" : i + 1}
                      </td>
                      <td className="py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-[3px]" style={{ background: d.color }} />
                          <span className="font-display text-[13px] font-semibold uppercase tracking-wide text-[var(--warm-white)]">
                            {d.code}
                          </span>
                          {d.pitting && (
                            <span className="bg-[var(--racing-red)] px-1 py-px text-mono text-[8.5px] font-semibold tracking-widest text-white">
                              PIT
                            </span>
                          )}
                          {d.isLeader && !d.finished && (
                            <span className="border border-[var(--racing-red)] px-1 py-px text-mono text-[8.5px] tracking-widest text-[var(--racing-red)]">
                              LEADER
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <CompoundDot compound={race.compounds[d.compound] ?? "UNKNOWN"} />
                      </td>
                      <td className="num py-2.5 pr-2 text-right text-[11.5px] text-[var(--silver-dim)]">
                        {d.tyreLife}L
                      </td>
                      <td className="num w-20 py-2.5 pr-3 text-right text-[11.5px]">
                        {d.finished ? (
                          <span className="text-[var(--tyre-inter)]">FIN</span>
                        ) : d.dnf ? (
                          <span className="text-[var(--racing-red)]">OUT</span>
                        ) : d.isLeader ? (
                          <span className="text-[var(--silver)]">INTERVAL</span>
                        ) : (
                          <span className="text-[var(--silver)]">
                            {d.gapToLeaderS === null ? "—" : `+${d.gapToLeaderS.toFixed(1)}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--hairline)] px-3 py-2.5 text-mono text-[9px] leading-relaxed tracking-wider text-[var(--silver-dim)]">
            CLICK A DRIVER TO FOCUS. GAP = TIME BEHIND LEADER AT EQUAL DISTANCE.
          </p>
        </TechPanel>
      </div>

      {/* stint board */}
      <StintBoard race={race} focusCode={focusCode} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function formatClock(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function TrackMap({
  race,
  snapshot,
  focusCode,
  onFocus,
}: {
  race: RaceReplay;
  snapshot: ReturnType<ReplayEngine["snapshot"]>;
  focusCode: string | null;
  onFocus: (code: string) => void;
}) {
  const path = race.circuit.path;
  const n = path.length;

  const pointAt = useCallback(
    (f: number): [number, number] => {
      const clamped = Math.max(0, Math.min(0.9999, f));
      const idx = clamped * n;
      const i = Math.floor(idx);
      const t = idx - i;
      const a = path[i % n];
      const b = path[(i + 1) % n];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
    [path, n],
  );

  const d = useMemo(() => {
    return `M ${path.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`;
  }, [path]);

  // start/finish tick: perpendicular to direction at point 0
  const sf = useMemo(() => {
    const a = pointAt(0);
    const b = pointAt(0.004);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return {
      x1: a[0] + nx * 14, y1: a[1] + ny * 14,
      x2: a[0] - nx * 14, y2: a[1] - ny * 14,
      tx: a[0] + nx * 26, ty: a[1] + ny * 26,
    };
  }, [pointAt]);

  const leader = snapshot.order[0];

  return (
    <div className="relative aspect-square w-full max-h-[640px] p-2 md:p-4">
      <svg viewBox="0 0 1000 1000" className="h-full w-full" role="img" aria-label={`Circuit map of ${race.circuit.name} with live car positions`}>
        {/* track shadow + surface */}
        <path d={d} fill="none" stroke="#1d1d23" strokeWidth="34" strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#2c2c33" strokeWidth="26" strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#3a3a42" strokeWidth="1.5" strokeDasharray="10 14" strokeLinejoin="round" />
        {/* start/finish */}
        <line x1={sf.x1} y1={sf.y1} x2={sf.x2} y2={sf.y2} stroke="var(--warm-white)" strokeWidth="4" />
        <text x={sf.tx} y={sf.ty} fill="var(--silver-dim)" fontSize="20" fontFamily="var(--font-plex-mono), monospace" textAnchor="middle" letterSpacing="3">
          S/F
        </text>

        {/* drivers */}
        {snapshot.order
          .slice()
          .reverse()
          .map((drv) => {
            const [x, y] = pointAt(drv.progress);
            const isLeader = drv.isLeader;
            const isFocus = focusCode === drv.code;
            const dimmed = focusCode !== null && !isFocus;
            return (
              <g
                key={drv.code}
                transform={`translate(${x} ${y})`}
                onClick={() => onFocus(drv.code)}
                className="cursor-pointer"
                opacity={dimmed ? 0.35 : 1}
              >
                {isLeader && (
                  <circle r="17" fill="none" stroke="var(--racing-red)" strokeWidth="2" opacity="0.9" />
                )}
                {isFocus && (
                  <circle r="21" fill="none" stroke="var(--warm-white)" strokeWidth="1.5" strokeDasharray="4 4" />
                )}
                <circle r="11" fill={drv.color} stroke="#0a0a0b" strokeWidth="2.5" />
                {drv.dnf && <line x1="-8" y1="-8" x2="8" y2="8" stroke="var(--racing-red)" strokeWidth="3" />}
                <text
                  y="4"
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#0a0a0b"
                  fontFamily="var(--font-plex-mono), monospace"
                >
                  {drv.code}
                </text>
              </g>
            );
          })}

        {/* circuit label */}
        <text x="500" y="975" textAnchor="middle" fill="var(--silver-dim)" fontSize="22" fontFamily="var(--font-plex-mono), monospace" letterSpacing="6">
          {race.circuit.name.toUpperCase()} — {race.year}
        </text>
      </svg>
      {leader && (
        <div className="absolute right-4 top-4 border border-[var(--hairline)] bg-[#0d0d10]/90 px-3 py-2">
          <p className="text-mono text-[9px] tracking-[0.16em] text-[var(--silver-dim)]">P1 ON TRACK</p>
          <p className="font-display text-lg font-bold uppercase text-[var(--warm-white)]">
            {leader.name ?? leader.code}
            <span className="ml-2 text-sm text-[var(--silver)]">{leader.name ? leader.code : ""}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PositionChart({
  race,
  focusCode,
  currentLap,
}: {
  race: RaceReplay;
  focusCode: string | null;
  currentLap: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const selected = useMemo(() => {
    const top = race.drivers.slice(0, 6).map((d) => d.code);
    if (focusCode && !top.includes(focusCode)) top.push(focusCode);
    return showAll ? race.drivers.map((d) => d.code) : top;
  }, [race, focusCode, showAll]);

  const data = useMemo(() => {
    const rows: Record<string, number | string | null>[] = [];
    for (let lap = 1; lap <= race.laps; lap++) {
      const row: Record<string, number | string | null> = { lap };
      for (const d of race.drivers) {
        if (!selected.includes(d.code)) continue;
        const rec = d.laps[lap - 1];
        if (rec) row[d.code] = rec[0] || null;
      }
      rows.push(row);
    }
    return rows;
  }, [race, selected]);

  const colors = useMemo(() => {
    const map: Record<string, string> = {};
    race.drivers.forEach((d, i) => {
      map[d.code] = assignDriverColor(d.code, d.team, i);
    });
    return map;
  }, [race]);

  return (
    <TechPanel label="POSITION PROGRESSION">
      <div className="p-2 md:p-4">
        <div className="h-[300px] w-full">
          <ResponsivePositionChart data={data} selected={selected} colors={colors} currentLap={currentLap} focusCode={focusCode} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2">
          {selected.slice(0, 10).map((code) => (
            <span key={code} className="flex items-center gap-1.5 text-mono text-[10px] tracking-wider text-[var(--silver)]">
              <span className="h-[3px] w-4" style={{ background: colors[code] }} />
              {code}
            </span>
          ))}
          <button
            onClick={() => setShowAll((v) => !v)}
            className="ml-auto text-mono text-[10px] tracking-widest text-[var(--silver-dim)] underline decoration-dotted underline-offset-4 hover:text-[var(--silver)]"
          >
            {showAll ? "SHOW TOP 6" : `SHOW ALL ${race.drivers.length}`}
          </button>
        </div>
      </div>
    </TechPanel>
  );
}

function ResponsivePositionChart({
  data,
  selected,
  colors,
  currentLap,
  focusCode,
}: {
  data: Record<string, number | string | null>[];
  selected: string[];
  colors: Record<string, string>;
  currentLap: number;
  focusCode: string | null;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: -8 }}>
        <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
        <XAxis dataKey="lap" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} stroke="#2c2c33" />
        <YAxis
          reversed
          domain={[1, 20]}
          tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }}
          stroke="#2c2c33"
          tickFormatter={(v) => `P${v}`}
        />
        <Tooltip
          contentStyle={{
            background: "#121216",
            border: "1px solid #2c2c33",
            borderRadius: 0,
            fontSize: 12,
            fontFamily: "var(--font-plex-mono)",
          }}
          labelFormatter={(l) => `LAP ${l}`}
          formatter={(value: number | string, name: string) => [`P${value}`, name]}
        />
        <ReferenceLine x={currentLap} stroke="var(--racing-red)" strokeWidth={1.5} strokeDasharray="4 4" />
        {selected.map((code) => (
          <Line
            key={code}
            type="stepAfter"
            dataKey={code}
            stroke={colors[code]}
            strokeWidth={focusCode === code ? 2.6 : 1.6}
            dot={false}
            connectNulls
            activeDot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */

function StintBoard({ race, focusCode }: { race: RaceReplay; focusCode: string | null }) {
  const compoundColor: Record<string, string> = {
    SOFT: "var(--tyre-soft)",
    MEDIUM: "var(--tyre-medium)",
    HARD: "var(--tyre-hard)",
    INTERMEDIATE: "var(--tyre-inter)",
    WET: "var(--tyre-wet)",
    UNKNOWN: "var(--silver-dim)",
  };
  return (
    <TechPanel label="TYRE STRATEGY — STINT PLAN">
      <div className="overflow-x-auto p-3">
        <div className="min-w-[760px]">
          {race.drivers.map((d, i) => {
            const color = assignDriverColor(d.code, d.team, i);
            const dim = focusCode !== null && focusCode !== d.code;
            return (
              <div key={d.code} className={cn("flex items-center gap-3 py-1", dim && "opacity-35")}>
                <div className="flex w-36 shrink-0 items-center gap-2">
                  <span className="h-3.5 w-[3px]" style={{ background: color }} />
                  <span className="font-display text-[12.5px] font-semibold uppercase tracking-wide text-[var(--warm-white)]">
                    {d.code}
                  </span>
                  <span className="text-mono text-[9.5px] text-[var(--silver-dim)]">
                    P{d.finishPos === 99 ? "—" : d.finishPos}
                  </span>
                </div>
                <div className="relative h-4 flex-1 bg-[#101014]">
                  {d.stints.map((s, si) => {
                    const left = ((s.from - 1) / race.laps) * 100;
                    const width = ((s.to - s.from + 1) / race.laps) * 100;
                    const comp = race.compounds[s.c] ?? "UNKNOWN";
                    return (
                      <div
                        key={si}
                        className="absolute top-0 h-full"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: compoundColor[comp],
                          opacity: 0.82,
                          borderRight: si < d.stints.length - 1 ? "2px solid #0a0a0b" : undefined,
                        }}
                        title={`${comp} · laps ${s.from}–${s.to}`}
                      />
                    );
                  })}
                </div>
                <div className="flex w-24 shrink-0 items-center gap-1">
                  {d.stints.map((s, si) => (
                    <span key={si} className="text-mono text-[9px] text-[var(--silver-dim)]">
                      {race.compounds[s.c]?.[0]}
                      {si < d.stints.length - 1 ? "→" : ""}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[var(--hairline)] pt-3">
          {["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].map((c) => (
            <span key={c} className="flex items-center gap-1.5 text-mono text-[9px] tracking-widest text-[var(--silver-dim)]">
              <span className="h-2 w-4" style={{ background: compoundColor[c] }} />
              {c}
            </span>
          ))}
          <span className="ml-auto text-mono text-[9px] tracking-widest text-[var(--silver-dim)]">
            LAP 1 → {race.laps}
          </span>
        </div>
      </div>
    </TechPanel>
  );
}
