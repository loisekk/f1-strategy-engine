"use client";

import type { DriverRace, RaceReplay } from "@/types";

export interface DriverRuntime {
  code: string;
  name: string | null;
  team: string | null;
  color: string;
  /** cumulative time at END of each completed lap (index 0 = after lap 1) */
  cum: number[];
  /** lap time in seconds per lap (0 = missing → filled with median) */
  lapTimes: number[];
  laps: DriverRace["laps"];
  stints: DriverRace["stints"];
  status: "FIN" | "DNF";
  lapsCompleted: number;
  finishPos: number;
  totalTimeS: number;
}

export interface ReplaySnapshot {
  raceTimeS: number;
  lapFloat: number;
  /** per-driver live state, sorted by track position */
  order: {
    code: string;
    color: string;
    name: string | null;
    progress: number; // 0..1 fraction of race distance
    lap: number;
    pos: number;
    compound: number;
    tyreLife: number;
    pitting: boolean;
    finished: boolean;
    dnf: boolean;
    gapToLeaderS: number | null;
    isLeader: boolean;
  }[];
}

/** Stable color assignment for drivers (team colour or palette fallback). */
export function assignDriverColor(code: string, team: string | null, index: number): string {
  const teamColors: Record<string, string> = {
    "Red Bull Racing": "#3671C6",
    Ferrari: "#E8002D",
    Mercedes: "#27F4D2",
    McLaren: "#FF8000",
    Alpine: "#FF87BC",
    "Alfa Romeo": "#C92D4B",
    "Aston Martin": "#229971",
    Haas: "#B6BABD",
    Williams: "#64C4FF",
  };
  if (team && teamColors[team]) return teamColors[team];
  const palette = [
    "#E10600", "#3671C6", "#FF8000", "#27F4D2", "#FF87BC",
    "#229971", "#B6BABD", "#64C4FF", "#FFB800", "#C92D4B",
    "#43C000", "#9D4EDD", "#F77F00", "#00B4D8", "#DE3163",
    "#7F8C8D", "#D4AC0D", "#1ABC9C", "#A569BD", "#E74C3C",
  ];
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export class ReplayEngine {
  race: RaceReplay;
  drivers: DriverRuntime[];
  totalLaps: number;
  maxTimeS: number;
  medianLapS: number;

  constructor(race: RaceReplay) {
    this.race = race;
    this.totalLaps = race.laps;
    const times: number[] = [];
    this.drivers = race.drivers.map((d, i) => {
      const lapTimes = d.laps.map((r) => r[1] / 10);
      for (const t of lapTimes) if (t > 0) times.push(t);
      const cum: number[] = [];
      let acc = 0;
      for (const t of lapTimes) {
        acc += t;
        cum.push(acc);
      }
      return {
        code: d.code,
        name: d.name,
        team: d.team,
        color: assignDriverColor(d.code, d.team, i),
        cum,
        lapTimes,
        laps: d.laps,
        stints: d.stints,
        status: d.status,
        lapsCompleted: d.lapsCompleted,
        finishPos: d.finishPos,
        totalTimeS: acc,
      };
    });
    times.sort((a, b) => a - b);
    this.medianLapS = times[Math.floor(times.length / 2)] ?? 90;
    this.maxTimeS = Math.max(...this.drivers.map((d) => d.totalTimeS), 1);
  }

  /** state of every driver at race time t (seconds since lights out) */
  snapshot(t: number): ReplaySnapshot {
    const rows = this.drivers.map((d) => {
      const n = d.cum.length;
      let lap = 0; // completed laps
      let frac = 0; // fraction into current lap
      if (n === 0) {
        lap = 0;
        frac = Math.min(1, t / Math.max(this.medianLapS, 1));
      } else if (t >= d.cum[n - 1]) {
        lap = n;
        frac = 0;
      } else {
        // binary search first cum > t
        let lo = 0;
        let hi = n - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (d.cum[mid] <= t) lo = mid + 1;
          else hi = mid;
        }
        lap = lo; // laps fully completed = lo
        const prev = lo > 0 ? d.cum[lo - 1] : 0;
        frac = (t - prev) / Math.max(0.001, d.cum[lo] - prev);
      }
      const progress = Math.min(1, (lap + frac) / this.totalLaps);
      const curLapIdx = Math.min(lap, n - 1);
      const rec = d.laps[curLapIdx];
      const pitting = lap < n && d.laps[lap]?.[4] === 1 && frac < 0.55;
      return {
        code: d.code,
        color: d.color,
        name: d.name,
        progress,
        lap: Math.min(lap + 1, this.totalLaps),
        pos: rec ? rec[0] : d.finishPos,
        compound: rec ? rec[2] : 5,
        tyreLife: rec ? rec[3] : 0,
        pitting,
        finished: d.status === "FIN" && lap >= this.totalLaps,
        dnf: d.status === "DNF" && lap >= n,
        gapToLeaderS: null as number | null,
        isLeader: false,
      };
    });

    // sort by race progress (distance covered)
    rows.sort((a, b) => b.progress - a.progress || a.pos - b.pos);

    // gap to leader: time leader needed to reach driver's progress − same for driver
    const leader = rows[0];
    if (leader) {
      leader.isLeader = true;
      const leaderT = this.timeAtProgress(this.drivers.find((d) => d.code === leader.code)!, leader.progress);
      for (const r of rows) {
        if (r.code === leader.code) continue;
        const d = this.drivers.find((x) => x.code === r.code)!;
        if (r.dnf || r.progress <= 0) {
          r.gapToLeaderS = null;
          continue;
        }
        const ownT = this.timeAtProgress(d, r.progress);
        r.gapToLeaderS = ownT - leaderT;
      }
    }
    const lapFloat = Math.min(this.totalLaps, (t / Math.max(this.maxTimeS, 1)) * this.totalLaps);
    return { raceTimeS: t, lapFloat, order: rows };
  }

  /** interpolated time at which driver reached a given progress fraction */
  private timeAtProgress(d: DriverRuntime, progress: number): number {
    const n = d.cum.length;
    if (n === 0) return 0;
    const lapFloat = progress * this.totalLaps;
    if (lapFloat <= 0) return 0;
    if (lapFloat >= n) return d.cum[n - 1];
    const i = Math.floor(lapFloat);
    const f = lapFloat - i;
    const prev = i > 0 ? d.cum[i - 1] : 0;
    const cur = d.cum[Math.min(i, n - 1)];
    return prev + (cur - prev) * f;
  }

  /** total race time at a given lap boundary (leader perspective) */
  timeAtLap(lap: number): number {
    if (lap <= 0) return 0;
    let min = Infinity;
    for (const d of this.drivers) {
      if (d.cum.length >= lap) min = Math.min(min, d.cum[lap - 1]);
    }
    return Number.isFinite(min) ? min : (lap / this.totalLaps) * this.maxTimeS;
  }
}
