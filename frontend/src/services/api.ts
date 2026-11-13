/* Centralised API client — future FastAPI contract.
 *
 * The production backend will expose the endpoints below. Until it exists,
 * `services/data.ts` serves the same shapes from bundled datasets built by
 * the repository's Python pipeline, and callers cannot tell the difference.
 * UI components must import from services/data.ts (or a feature service),
 * never from this file directly. */

import type {
  ModelReport,
  RaceReplay,
  RaceIndex,
  TelemetryData,
  TyreData,
} from "@/types";

const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/* ---------------- proposed contract (not yet connected) ---------------- */

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  modelsLoaded: number;
}

export interface PredictRequest {
  driver: string;
  lapNumber: number;
  compound: string;
  tyreLife: number;
  position: number;
  lapTimeS: number;
  raceProgress: number;
}

export interface PredictResponse {
  modelId: string;
  pitProbability: number;
  decision: "BOX" | "WATCH" | "STAY";
  threshold: number;
}

export interface StrategySimulateRequest {
  raceId: string;
  currentLap: number;
  totalLaps: number;
  compound: string;
  tyreAge: number;
  scenarios: {
    label: string;
    stops: { lap: number; compound: string }[];
  }[];
}

export interface StrategySimulateResponse {
  scenarios: {
    label: string;
    predictedRaceTimeS: number;
    pitLossS: number;
    finalTyreAge: number;
    modelConfidence: number;
  }[];
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  listModels: () => request<unknown[]>("/models"),
  getModel: (modelId: string) => request<unknown>(`/models/${modelId}`),
  predict: (body: PredictRequest) =>
    request<PredictResponse>("/predict", { method: "POST", body: JSON.stringify(body) }),
  simulateStrategy: (body: StrategySimulateRequest) =>
    request<StrategySimulateResponse>("/strategy/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listRaces: () => request<RaceIndex>("/races"),
  getRaceLaps: (raceId: string) => request<RaceReplay>(`/races/${raceId}/laps`),
  getTelemetry: () => request<TelemetryData>("/telemetry"),
  getTyres: () => request<TyreData>("/telemetry/tyres"),
  getModelsReport: () => request<ModelReport>("/models/report"),
  listExperiments: () => request<unknown[]>("/experiments"),
};
