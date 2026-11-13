/* Shared domain types for the F1 Strategy Engine frontend.
   These mirror both the bundled demo datasets and the future FastAPI
   contracts (see src/services/api.ts) so the backend can be swapped in
   without touching UI code. */

/* ---------------- races & replay ---------------- */

export interface RaceMeta {
  id: string;
  name: string;
  year: number;
  isTest: boolean;
  circuit: string;
  laps: number;
  drivers: number;
  winner: string | null;
  fastestLap: { driver: string; lap: number; time: number } | null;
  leaderChanges: number;
  totalPits: number;
  medianLapS: number | null;
}

export interface RaceIndex {
  races: RaceMeta[];
}

/** [position, lapTime*10 (0 = missing), compoundIdx, tyreLife, pit] */
export type LapRecord = [number, number, number, number, number];

export interface DriverRace {
  code: string;
  name: string | null;
  team: string | null;
  laps: LapRecord[];
  stints: { c: number; from: number; to: number }[];
  status: "FIN" | "DNF";
  lapsCompleted: number;
  finishPos: number;
}

export interface RaceReplay {
  id: string;
  name: string;
  year: number;
  isTest: boolean;
  circuit: { name: string; lengthM: number; path: [number, number][] };
  laps: number;
  compounds: string[];
  summary: {
    winner: string | null;
    fastestLap: { driver: string; lap: number; time: number } | null;
    leaderChanges: number;
    totalPits: number;
  };
  drivers: DriverRace[];
}

/* ---------------- tyres ---------------- */

export interface TyreCurve {
  lapTimeDelta: Record<string, number>;
  samples: Record<string, number>;
  pitProbability: Record<string, number>;
}

export interface TyreData {
  source: string;
  pitLossSeconds: number;
  pitLossSample: number;
  compounds: Record<string, TyreCurve>;
}

/* ---------------- drivers ---------------- */

export interface DriverStats {
  code: string;
  name: string | null;
  team: string | null;
  races: number;
  laps: number;
  avgPosition: number;
  avgFinish: number | null;
  bestFinish: number | null;
  wins: number;
  podiums: number;
  dnfs: number;
  pitsPerRace: number;
  avgPaceDelta: number | null;
  avgStintLength: number | null;
  compoundMix: Record<string, number>;
}

/* ---------------- models ---------------- */

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  threshold: number;
  rocAuc?: number;
  confusion?: { tn: number; fp: number; fn: number; tp: number };
  fitSeconds?: number;
}

export interface ModelReport {
  reported: {
    source: string;
    models: Record<string, Partial<ModelMetrics>>;
  };
  verified: {
    source: string;
    testRows: number;
    trainRows: number;
    features: string[];
    models: Record<string, ModelMetrics>;
  };
  thresholdSweep: { threshold: number; precision: number; recall: number; f1: number }[];
  roc: { lightgbm: [number, number][]; xgboost: [number, number][] };
  featureImportance: { feature: string; importance: number }[];
  inferenceGrid: Record<string, { tyreLife: number[]; raceProgress: number[]; p: number[] }>;
  dataQuality: { labelNote: string };
  champion: {
    name: string;
    family: string;
    artifact: string;
    threshold: number;
  };
}

export type ModelKey =
  | "lightgbm"
  | "xgboost"
  | "random_forest"
  | "decision_tree"
  | "logistic_regression";

export const MODEL_LABELS: Record<ModelKey, string> = {
  lightgbm: "LightGBM",
  xgboost: "XGBoost",
  random_forest: "Random Forest",
  decision_tree: "Decision Tree",
  logistic_regression: "Logistic Regression",
};

/* ---------------- telemetry ---------------- */

export interface TelemetryLap {
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  rpm: number[];
  lapTimeS: number;
}

export interface TelemetryCircuit {
  name: string;
  lengthM: number;
  resolutionM: number;
  dist: number[];
  laps: { reference: TelemetryLap; attack: TelemetryLap };
  note: string;
}

export interface TelemetryData {
  circuits: Record<string, TelemetryCircuit>;
  source: string;
}

/* ---------------- compounds & teams ---------------- */

export const COMPOUNDS = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"] as const;
export type Compound = (typeof COMPOUNDS)[number];

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "var(--tyre-soft)",
  MEDIUM: "var(--tyre-medium)",
  HARD: "var(--tyre-hard)",
  INTERMEDIATE: "var(--tyre-inter)",
  WET: "var(--tyre-wet)",
  UNKNOWN: "#6b6f78",
};

/** 2022 team colours (drivers in dataset are mostly the 2022 grid). */
export const TEAM_COLORS: Record<string, string> = {
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

/** stable palette for drivers without a known team */
export const DRIVER_PALETTE = [
  "#E10600", "#3671C6", "#FF8000", "#27F4D2", "#FF87BC",
  "#229971", "#B6BABD", "#64C4FF", "#FFB800", "#C92D4B",
  "#43C000", "#9D4EDD", "#F77F00", "#00B4D8", "#DE3163",
  "#7F8C8D", "#D4AC0D", "#1ABC9C", "#A569BD", "#E74C3C",
];

/* ---------------- navigation ---------------- */

export type ViewId =
  | "overview"
  | "race-intelligence"
  | "race-replay"
  | "telemetry"
  | "strategy"
  | "drivers"
  | "models"
  | "experiments"
  | "registry"
  | "monitoring"
  | "settings";

export interface NavItem {
  id: ViewId;
  index: string;
  label: string;
  short: string;
  primary: boolean;
  description: string;
}
