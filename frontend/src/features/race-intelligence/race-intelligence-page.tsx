"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { SectionHeader, DataSourceBadge, TechPanel, StatBlock, DataError } from "@/components/brand/primitives";
import { useJson } from "@/hooks/use-hash-route";
import { formatLapTime } from "@/services/data";
import type { RaceIndex, RaceReplay } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { assignDriverColor } from "@/features/race-replay/replay-engine";
import { cn } from "@/lib/utils";

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: "#e10600",
  MEDIUM: "#FFB800",
  HARD: "#e9e9e4",
  INTERMEDIATE: "#43C000",
  WET: "#0067FF",
  UNKNOWN: "#5c6068",
};

export function RaceIntelligencePage() {
  const { data: index, error: indexError } = useJson<RaceIndex>("/data/races.json");
  const races = useMemo(() => (index?.races ?? []).filter((r) => !r.isTest), [index]);
  const [raceId, setRaceId] = useState<string | null>(null);
  const effectiveId = raceId ?? races.find((r) => r.id === "bahrain-2022")?.id ?? races[0]?.id ?? null;
  const { data: race, error: raceError } = useJson<RaceReplay>(effectiveId ? `/data/races/${effectiveId}.json` : null);

  if (indexError || raceError) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
        <DataError what="Race intelligence data" error={indexError ?? raceError} />
      </div>
    );
  }

  if (!index || races.length === 0) {
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
        eyebrow="Module 02 — Race Intelligence"
        title="The strategy board, post-race."
        description="Pit windows, compound transitions and stint architecture for every event in the dataset — reconstructed from real lap records to study how races were actually won."
        right={<DataSourceBadge kind="real" label="REAL RACE DATA" />}
      />
      {race ? (
        <RaceBoard key={race.id} race={race} races={races} onSelect={setRaceId} />
      ) : (
        <Skeleton className="h-[520px] w-full" />
      )}
    </div>
  );
}

function RaceBoard({
  race,
  races,
  onSelect,
}: {
  race: RaceReplay;
  races: RaceIndex["races"];
  onSelect: (id: string) => void;
}) {
  /* pit lap histogram */
  const pitHistogram = useMemo(() => {
    const buckets = new Array(race.laps + 1).fill(0);
    for (const d of race.drivers) {
      for (const rec of d.laps) {
        if (rec[4] === 1 && rec[0] <= race.laps) buckets[rec[0]]++;
      }
    }
    return buckets
      .map((count, lap) => ({ lap, count }))
      .filter((b) => b.lap >= 1);
  }, [race]);

  /* compound transitions */
  const transitions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of race.drivers) {
      for (let i = 1; i < d.stints.length; i++) {
        const from = race.compounds[d.stints[i - 1].c];
        const to = race.compounds[d.stints[i].c];
        const key = `${from}→${to}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([k, v]) => ({ key: k, count: v }))
      .sort((a, b) => b.count - a.count);
  }, [race]);

  const totalTransitions = transitions.reduce((a, b) => a + b.count, 0);

  return (
    <div className="space-y-6">
      {/* selector + summary */}
      <div className="panel flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <select
          value={race.id}
          onChange={(e) => onSelect(e.target.value)}
          className="h-10 w-full max-w-[340px] border border-[var(--hairline-strong)] bg-[#101014] px-3 font-display text-sm font-semibold uppercase tracking-wide text-[var(--warm-white)] outline-none"
          aria-label="Select race"
        >
          {[...races]
            .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.year} {r.name}
              </option>
            ))}
        </select>
        <div className="grid flex-1 grid-cols-2 gap-px bg-[var(--hairline)] sm:grid-cols-5 lg:max-w-3xl">
          {[
            ["Winner", race.drivers.find((d) => d.code === race.summary.winner)?.name ?? race.summary.winner ?? "—"],
            ["Fastest lap", race.summary.fastestLap ? `${race.summary.fastestLap.driver} · ${formatLapTime(race.summary.fastestLap.time)}` : "—"],
            ["Lead changes", String(race.summary.leaderChanges)],
            ["Total stops", String(race.summary.totalPits)],
            ["Median lap", race.laps ? `${(medianLap(race) ?? 0).toFixed(1)}s` : "—"],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#131316] px-4 py-3">
              <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">{label.toUpperCase()}</p>
              <p className="mt-1 truncate text-[13px] font-medium text-[var(--warm-white)]">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* pit window histogram */}
      <TechPanel label="PIT WINDOW — STOPS BY LAP">
        <div className="h-[240px] p-2 md:p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pitHistogram} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" vertical={false} />
              <XAxis dataKey="lap" stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} />
              <YAxis stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                labelFormatter={(l) => `LAP ${l}`}
                formatter={(v: number | string) => [`${v} stops`, "Pit window"]}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="count" fill="#e10600" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </TechPanel>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* strategy board */}
        <TechPanel label="STINT ARCHITECTURE — EVERY DRIVER">
          <div className="overflow-x-auto p-3">
            <div className="min-w-[720px]">
              {race.drivers.map((d, i) => {
                const color = assignDriverColor(d.code, d.team, i);
                return (
                  <div key={d.code} className="group flex items-center gap-3 py-1">
                    <div className="flex w-40 shrink-0 items-center gap-2">
                      <span className="h-3.5 w-[3px]" style={{ background: color }} />
                      <span className="font-display text-[12.5px] font-semibold uppercase tracking-wide text-[var(--warm-white)]">
                        {d.name ?? d.code}
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
                            className="absolute top-0 flex h-full items-center justify-center opacity-80 transition-opacity group-hover:opacity-100"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              background: COMPOUND_COLOR[comp],
                              borderRight: si < d.stints.length - 1 ? "2px solid #0a0a0b" : undefined,
                            }}
                            title={`${comp} · L${s.from}–${s.to} (${s.to - s.from + 1} laps)`}
                          >
                            <span className="text-mono text-[8px] font-bold text-black/70">
                              {s.to - s.from + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <span className="w-24 shrink-0 text-right text-mono text-[9px] text-[var(--silver-dim)]">
                      {d.stints.length - 1} STOP{d.stints.length - 1 === 1 ? "" : "S"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </TechPanel>

        {/* transitions */}
        <TechPanel label="COMPOUND TRANSITIONS">
          <div className="p-4">
            {transitions.length === 0 && (
              <p className="py-8 text-center text-[13px] text-[var(--silver-dim)]">
                No recorded compound changes in this event.
              </p>
            )}
            <div className="space-y-2.5">
              {transitions.map((t) => {
                const [from, to] = t.key.split("→");
                return (
                  <div key={t.key} className="flex items-center gap-3">
                    <span className="w-14 text-right text-mono text-[10px] tracking-wider text-[var(--silver)]">{from}</span>
                    <span className="text-[var(--silver-dim)]">→</span>
                    <span className="w-14 text-mono text-[10px] tracking-wider text-[var(--silver)]">{to}</span>
                    <div className="h-4 flex-1 bg-[#101014]">
                      <div
                        className="h-full"
                        style={{
                          width: `${(t.count / Math.max(1, transitions[0].count)) * 100}%`,
                          background: COMPOUND_COLOR[to] ?? "#5c6068",
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className="num w-8 text-right text-[11px] text-[var(--warm-white)]">{t.count}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 border-t border-[var(--hairline)] pt-3 text-[11.5px] leading-relaxed text-[var(--silver-dim)]">
              {totalTransitions} compound changes recorded across {race.drivers.length} cars.
              Transition counts reflect real stint data, not predictions.
            </p>
          </div>
        </TechPanel>
      </div>
    </div>
  );
}

function medianLap(race: RaceReplay): number | null {
  const times: number[] = [];
  for (const d of race.drivers) {
    d.laps.forEach((rec, i) => {
      if (i > 0 && rec[4] === 0 && rec[1] > 0) times.push(rec[1] / 10);
    });
  }
  times.sort((a, b) => a - b);
  return times.length ? times[Math.floor(times.length / 2)] : null;
}
