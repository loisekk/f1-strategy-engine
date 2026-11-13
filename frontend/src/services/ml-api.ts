/* ML backend client — talks to the FastAPI serving layer (backend/).
 *
 * Modes:
 *   LIVE    backend reachable → real registry, real predictions
 *   OFFLINE backend down → every page falls back to bundled data (the app
 *           keeps working exactly as before; badges flip to MOCK/OFFLINE)
 *
 * Session persistence (the serving contract):
 *   A session id is generated once and kept in localStorage. The selected
 *   model is bound server-side via POST /api/v1/sessions and the artifact is
 *   pre-warmed — from then on it stays loaded for the whole session and every
 *   prediction is an in-memory call (no per-prediction load/unload).
 *
 * Config resolution: localStorage("f1ml.apiUrl") → NEXT_PUBLIC_ML_API_URL →
 * http://localhost:8000. API key (optional): localStorage("f1ml.apiKey").
 */

export type MLStatus = "champion" | "candidate" | "archived";
export type MLDecision = "BOX" | "WATCH" | "STAY";

export interface MLRuntime {
  warm: boolean;
  loads: number;
  predictions: number;
  loadMs: number | null;
  lastUsedSecondsAgo: number | null;
  loadedAt: string | null;
}

export interface MLModelCard {
  id: string;
  name: string;
  framework: string;
  version: string;
  status: MLStatus;
  task: string;
  threshold: number;
  artifact: string;
  scaler: string | null;
  encoders: string | null;
  featureSchema: string[];
  metrics: Record<string, number>;
  notes: string | null;
  registeredAt: string;
  sha256: { model: string; scaler: string | null; encoders: string | null } | null;
  sizeBytes: number;
}

export interface MLModelEntry {
  card: MLModelCard;
  runtime: MLRuntime;
}

export interface MLModelsResponse {
  models: MLModelEntry[];
  champion: string | null;
  totalPredictions: number;
}

export interface MLHealth {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  modelsRegistered: number;
  modelsLoaded: number;
  champion: string | null;
  sessionsActive: number;
  predictionsServed: number;
  storePath: string;
}

export interface MLSessionInfo {
  id: string;
  modelId: string;
  createdAt: string;
  lastUsed: string;
  predictions: number;
  modelState: "warm" | "cold";
}

export interface MLPredictInputs {
  driver?: string;
  compound?: string;
  lapNumber: number;
  totalLaps?: number;
  stint?: number;
  tyreLife?: number;
  position?: number;
  lapTimeS?: number;
  lapTimeDelta?: number;
  cumulativeDegradation?: number;
  raceProgress?: number;
  normalizedTyreLife?: number;
  positionChange?: number;
  driverEnc?: number;
  compoundEnc?: number;
}

export interface MLPredictResult {
  modelId: string;
  modelName: string;
  modelVersion: string;
  framework: string;
  status: MLStatus;
  pitProbability: number;
  threshold: number;
  decision: MLDecision;
  latencyMs: number;
  loadState: "warm" | "cold-loaded";
  scaled: boolean;
  session: MLSessionInfo | null;
  featureNames: string[];
  featureVector: number[];
}

export interface MLBatchResult {
  modelId: string;
  modelName: string;
  modelVersion: string;
  framework: string;
  threshold: number;
  latencyMs: number;
  loadState: string;
  results: { pitProbability: number; decision: MLDecision }[];
  session: MLSessionInfo | null;
}

export interface MLRegisterMeta {
  name: string;
  version: string;
  framework: "auto" | "lightgbm" | "xgboost" | "sklearn";
  threshold: number;
  notes?: string;
  metrics?: Record<string, number>;
}

export interface MLRegisterResult {
  card: MLModelCard;
  smokeTest: { loadMs: number; probas: number[]; scaler: boolean; encoders: boolean };
  message: string;
}

/* ---------------- storage keys ---------------- */

const K_URL = "f1ml.apiUrl";
const K_KEY = "f1ml.apiKey";
const K_SESSION = "f1ml.sessionId";
const K_MODEL = "f1ml.selectedModelId";

const isBrowser = typeof window !== "undefined";

export function getApiUrl(): string {
  if (isBrowser) {
    const v = window.localStorage.getItem(K_URL);
    if (v) return v.replace(/\/+$/, "");
  }
  return (process.env.NEXT_PUBLIC_ML_API_URL || "http://localhost:8000").replace(/\/+$/, "");
}

export function setApiUrl(url: string): void {
  if (!isBrowser) return;
  if (url) window.localStorage.setItem(K_URL, url.replace(/\/+$/, ""));
  else window.localStorage.removeItem(K_URL);
}

export function getApiKey(): string {
  return isBrowser ? window.localStorage.getItem(K_KEY) || "" : "";
}

export function setApiKey(key: string): void {
  if (!isBrowser) return;
  if (key) window.localStorage.setItem(K_KEY, key);
  else window.localStorage.removeItem(K_KEY);
}

/** Stable browser session id — created once, survives reloads. */
export function getSessionId(): string {
  if (!isBrowser) return "";
  let id = window.localStorage.getItem(K_SESSION);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(K_SESSION, id);
  }
  return id;
}

export function resetSessionId(): string {
  if (isBrowser) {
    window.localStorage.removeItem(K_SESSION);
    window.localStorage.removeItem(K_MODEL);
  }
  return getSessionId();
}

export function getStoredModelId(): string | null {
  return isBrowser ? window.localStorage.getItem(K_MODEL) : null;
}

export function setStoredModelId(id: string | null): void {
  if (!isBrowser) return;
  if (id) window.localStorage.setItem(K_MODEL, id);
  else window.localStorage.removeItem(K_MODEL);
}

/* ---------------- fetch core ---------------- */

export class MLApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = 6000, ...rest } = init || {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiUrl()}${path}`, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        ...(rest.body && !(rest.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        "X-Session-ID": getSessionId(),
        ...(getApiKey() ? { "X-API-Key": getApiKey() } : {}),
        ...(rest.headers || {}),
      },
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
        else if (Array.isArray(body?.detail)) detail = JSON.stringify(body.detail);
      } catch {
        /* keep status text */
      }
      throw new MLApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- endpoint wrappers ---------------- */

export const mlApi = {
  health: () => request<MLHealth>("/api/v1/health", { timeoutMs: 3500 }),

  listModels: () => request<MLModelsResponse>("/api/v1/models"),

  getModel: (id: string) => request<{ card: MLModelCard; runtime: MLRuntime }>(`/api/v1/models/${encodeURIComponent(id)}`),

  /** Bind this browser session to a model (pre-warms it server-side). */
  bindSession: (modelId: string) =>
    request<MLSessionInfo>("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ modelId, sessionId: getSessionId() }),
    }),

  getSession: () => request<MLSessionInfo>(`/api/v1/sessions/${encodeURIComponent(getSessionId())}`),

  predict: (inputs: MLPredictInputs, modelId?: string) =>
    request<MLPredictResult>("/api/v1/predict", {
      method: "POST",
      body: JSON.stringify({ ...(modelId ? { modelId } : {}), inputs }),
    }),

  predictBatch: (inputs: MLPredictInputs[], modelId?: string) =>
    request<MLBatchResult>("/api/v1/predict/batch", {
      method: "POST",
      body: JSON.stringify({ ...(modelId ? { modelId } : {}), inputs }),
      timeoutMs: 15000,
    }),

  registerModel: (meta: MLRegisterMeta, modelFile: File, scalerFile?: File | null, encodersFile?: File | null) => {
    const fd = new FormData();
    fd.append("meta", JSON.stringify(meta));
    fd.append("model_file", modelFile);
    if (scalerFile) fd.append("scaler_file", scalerFile);
    if (encodersFile) fd.append("encoders_file", encodersFile);
    return request<MLRegisterResult>("/api/v1/models/register", {
      method: "POST",
      body: fd,
      timeoutMs: 120000,
    });
  },

  promote: (id: string) =>
    request<{ card: MLModelCard }>(`/api/v1/models/${encodeURIComponent(id)}/promote`, { method: "POST" }),

  archive: (id: string) =>
    request<{ card: MLModelCard }>(`/api/v1/models/${encodeURIComponent(id)}/archive`, { method: "POST" }),

  deleteModel: (id: string) =>
    request<void>(`/api/v1/models/${encodeURIComponent(id)}`, { method: "DELETE" }),

  simulateStrategy: (body: unknown) =>
    request<unknown>("/api/v1/strategy/simulate", {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 15000,
    }),
};
