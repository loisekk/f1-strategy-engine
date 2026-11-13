"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ZAxis, BarChart, Bar, Cell,
} from "recharts";
import { SectionHeader, DataSourceBadge, TechPanel, DataError } from "@/components/brand/primitives";
import { useJson } from "@/hooks/use-hash-route";
import type { DriverStats } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: "#e10600",
  MEDIUM: "#FFB800",
  HARD: "#e9e9e4",
  INTERMEDIATE: "#43C000",
  WET: "#0067FF",
  UNKNOWN: "#5c6068",
};

export function DriversPage() {
  const { data, error } = useJson<{ source: string; drivers: DriverStats[] }>("/data/drivers.json");
  const [sortKey, setSortKey] = useState<keyof DriverStats>("wins");
  const [focus, setFocus] = useState<string | null>(null);

  const drivers = useMemo(() => {
    if (!data) return [];
    return [...data.drivers].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return bv - av;
      return String(av ?? "").localeCompare(String(bv ?? ""));
    });
  }, [data, sortKey]);

  const scatter = useMemo(
    () =>
      (data?.drivers ?? [])
        .filter((d) => d.avgFinish !== null && d.avgPaceDelta !== null)
        .map((d) => ({
          x: d.avgFinish ?? 0,
          y: d.avgPaceDelta ?? 0,
          z: d.laps,
          code: d.code,
          name: d.name ?? d.code,
          wins: d.wins,
        })),
    [data],
  );

  const focusDriver = drivers.find((d) => d.code === focus) ?? drivers[0];

  const columns: { key: keyof DriverStats; label: string }[] = [
    { key: "races", label: "Races" },
    { key: "wins", label: "Wins" },
    { key: "podiums", label: "Podiums" },
    { key: "avgFinish", label: "Avg Fin" },
    { key: "avgPosition", label: "Avg Pos" },
    { key: "avgPaceDelta", label: "Pace Δ" },
    { key: "pitsPerRace", label: "Pits/R" },
    { key: "avgStintLength", label: "Stint" },
    { key: "dnfs", label: "DNF" },
  ];

  if (error) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
        <DataError what="Driver statistics" error={error} />
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

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 06 — Driver Intelligence"
        title="Who protects the tyres. Who pays for it."
        description="Every metric below is aggregated from the real dataset — pace deltas are measured against each driver's own race median, so they reflect genuine relative pace across 2022–2025."
        right={<DataSourceBadge kind="real" label="AGGREGATED FROM 101K LAPS" />}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* table */}
        <TechPanel label="DRIVER SEASON BOARD — CLICK COLUMN TO SORT">
          <div className="max-h-[620px] overflow-auto">
            <table className="data-table w-full">
              <thead className="sticky top-0 bg-[#131316]">
                <tr>
                  <th className="min-w-[150px]">Driver</th>
                  {columns.map((c) => (
                    <th
                      key={String(c.key)}
                      onClick={() => setSortKey(c.key)}
                      className={cn(
                        "cursor-pointer select-none hover:text-[var(--silver)]",
                        sortKey === c.key && "text-[var(--racing-red)]",
                      )}
                    >
                      {c.label}
                      {sortKey === c.key ? " ▾" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr
                    key={d.code}
                    onClick={() => setFocus(d.code)}
                    className={cn("cursor-pointer", focus === d.code && "bg-[#18181d]")}
                  >
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="font-display text-[13px] font-semibold uppercase tracking-wide text-[var(--warm-white)]">
                          {d.name ?? d.code}
                        </span>
                        <span className="text-mono text-[10px] text-[var(--silver-dim)]">{d.code}</span>
                      </span>
                    </td>
                    <td className="num">{d.races}</td>
                    <td className="num text-[var(--racing-red)]">{d.wins}</td>
                    <td className="num">{d.podiums}</td>
                    <td className="num">{d.avgFinish?.toFixed(1) ?? "—"}</td>
                    <td className="num">{d.avgPosition.toFixed(1)}</td>
                    <td className="num">{d.avgPaceDelta !== null ? `${d.avgPaceDelta >= 0 ? "+" : ""}${d.avgPaceDelta.toFixed(2)}s` : "—"}</td>
                    <td className="num">{d.pitsPerRace.toFixed(1)}</td>
                    <td className="num">{d.avgStintLength?.toFixed(0) ?? "—"}L</td>
                    <td className="num">{d.dnfs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TechPanel>

        {/* focus panel */}
        <div className="space-y-4">
          {focusDriver && (
            <TechPanel label={`DRIVER FILE — ${focusDriver.name?.toUpperCase() ?? focusDriver.code}`}>
              <div className="p-5">
                <p className="headline text-3xl text-[var(--warm-white)]">{focusDriver.name ?? focusDriver.code}</p>
                <p className="text-mono mt-1 text-[10px] tracking-[0.16em] text-[var(--silver-dim)]">
                  {focusDriver.code} · {focusDriver.team ?? "TEAM N/A"} · {focusDriver.races} RACES · {focusDriver.laps.toLocaleString()} LAPS
                </p>
                <div className="mt-5 grid grid-cols-3 gap-px border border-[var(--hairline)] bg-[var(--hairline)] text-center">
                  {[
                    ["WINS", String(focusDriver.wins)],
                    ["PODIUMS", String(focusDriver.podiums)],
                    ["BEST", focusDriver.bestFinish ? `P${focusDriver.bestFinish}` : "—"],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-[#0e0e11] py-3">
                      <p className="num text-2xl text-[var(--warm-white)]">{v}</p>
                      <p className="text-mono mt-1 text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">{l}</p>
                    </div>
                  ))}
                </div>

                {/* compound mix */}
                <p className="text-eyebrow mb-2 mt-6">Compound usage</p>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compoundData(focusDriver)} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 34 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" stroke="#2c2c33" tick={{ fontSize: 9.5, fill: "#8e939e", fontFamily: "var(--font-plex-mono)" }} width={80} />
                      <Tooltip
                        contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                        formatter={(v: number | string) => [`${Number(v).toLocaleString()} laps`, "Usage"]}
                      />
                      <Bar dataKey="laps" radius={0}>
                        {compoundData(focusDriver).map((entry) => (
                          <Cell key={entry.name} fill={COMPOUND_COLOR[entry.name] ?? "#5c6068"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TechPanel>
          )}
        </div>
      </div>

      {/* pace scatter */}
      <div className="mt-6">
        <TechPanel label="PACE VS RESULT — EACH DOT IS A DRIVER (SIZE = LAPS DRIVEN)">
          <div className="h-[360px] p-2 md:p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 24, bottom: 10, left: -8 }}>
                <CartesianGrid stroke="#1b1b20" strokeDasharray="2 6" />
                <XAxis
                  type="number" dataKey="x" name="Avg finish" domain={[0, 20]} reversed
                  stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }}
                  tickFormatter={(v: number) => `P${v}`} label={{ value: "AVERAGE FINISHING POSITION →", fill: "#5c6068", fontSize: 10, position: "insideBottom", offset: -6 }}
                />
                <YAxis
                  type="number" dataKey="y" name="Pace delta"
                  stroke="#2c2c33" tick={{ fontSize: 10, fill: "#5c6068", fontFamily: "var(--font-plex-mono)" }}
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}s`}
                  label={{ value: "PACE Δ VS FIELD (S)", fill: "#5c6068", fontSize: 10, angle: -90, position: "insideLeft" }}
                />
                <ZAxis type="number" dataKey="z" range={[40, 240]} />
                <Tooltip
                  contentStyle={{ background: "#121216", border: "1px solid #2c2c33", borderRadius: 0, fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
                  formatter={(v: number | string, n: string) => [n === "Avg finish" ? `P${v}` : `${Number(v).toFixed(2)}s`, n]}
                  labelFormatter={() => ""}
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const p = payload[0].payload as (typeof scatter)[number];
                    return (
                      <div className="border border-[#2c2c33] bg-[#121216] px-3 py-2 text-mono text-[11px]">
                        <p className="text-[var(--warm-white)]">{p.name}</p>
                        <p className="text-[var(--silver-dim)]">AVG FINISH P{p.x} · PACE {p.y >= 0 ? "+" : ""}{p.y.toFixed(2)}s</p>
                        <p className="text-[var(--silver-dim)]">{p.z.toLocaleString()} LAPS · {p.wins} WINS</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatter} fill="#e10600" fillOpacity={0.75} stroke="#e10600" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </TechPanel>
      </div>
    </div>
  );
}

function compoundData(d: DriverStats) {
  return Object.entries(d.compoundMix)
    .map(([name, laps]) => ({ name, laps }))
    .sort((a, b) => b.laps - a.laps);
}
