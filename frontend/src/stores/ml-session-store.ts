/* ML session store — the frontend half of the session-persistent model
 * loading contract.
 *
 * Flow:
 *   1. probe()          → LIVE / OFFLINE (health check, retried on demand)
 *   2. refreshModels()  → live registry entries
 *   3. selectModel(id)  → binds the browser session server-side; the artifact
 *                         is pre-warmed and stays loaded for the whole session
 *   4. predict(...)     → real inference through the warm model; the session
 *                         counter grows, the model never reloads
 *
 * The selected model survives page reloads (localStorage) — "the user picks a
 * model once and it stays active throughout the session".
 */

"use client";

import { create } from "zustand";
import {
  mlApi,
  MLModelEntry,
  MLHealth,
  MLPredictInputs,
  MLPredictResult,
  MLSessionInfo,
  getStoredModelId,
  setStoredModelId,
  getSessionId,
} from "@/services/ml-api";

export type BackendMode = "probing" | "live" | "offline";

interface MLSessionState {
  mode: BackendMode;
  health: MLHealth | null;
  models: MLModelEntry[];
  championId: string | null;
  selectedModelId: string | null;
  sessionInfo: MLSessionInfo | null;
  lastPrediction: MLPredictResult | null;
  probing: boolean;

  /* actions */
  probe: () => Promise<boolean>;
  refreshModels: () => Promise<void>;
  selectModel: (id: string) => Promise<boolean>;
  clearSelection: () => void;
  predict: (inputs: MLPredictInputs) => Promise<MLPredictResult | null>;
  predictBatch: (inputs: MLPredictInputs[]) => Promise<number[] | null>;
  promote: (id: string) => Promise<boolean>;
  archive: (id: string) => Promise<boolean>;
  deleteModel: (id: string) => Promise<boolean>;
  refreshSession: () => Promise<void>;
}

export const useMLSession = create<MLSessionState>((set, get) => ({
  mode: "probing",
  health: null,
  models: [],
  championId: null,
  selectedModelId: null,
  sessionInfo: null,
  lastPrediction: null,
  probing: true,

  probe: async () => {
    set({ probing: true });
    try {
      const health = await mlApi.health();
      set({ mode: "live", health, probing: false });
      await get().refreshModels();
      await get().refreshSession();
      return true;
    } catch {
      set({ mode: "offline", health: null, probing: false, models: [], sessionInfo: null });
      return false;
    }
  },

  refreshModels: async () => {
    try {
      const res = await mlApi.listModels();
      set({ models: res.models, championId: res.champion });
      // keep selection valid; default to champion on first contact
      const current = get().selectedModelId ?? getStoredModelId();
      const valid = res.models.find((m) => m.card.id === current);
      if (!valid) {
        const champion = res.models.find((m) => m.card.id === res.champion);
        if (champion) await get().selectModel(champion.card.id);
      }
    } catch {
      set({ models: [], championId: null });
    }
  },

  selectModel: async (id) => {
    try {
      const info = await mlApi.bindSession(id);
      setStoredModelId(id);
      set({ selectedModelId: id, sessionInfo: info });
      // update runtime warm flags in the list
      const models = get().models.map((m) =>
        m.card.id === id ? { ...m, runtime: { ...m.runtime, warm: true } } : m,
      );
      set({ models });
      return true;
    } catch {
      return false;
    }
  },

  clearSelection: () => {
    setStoredModelId(null);
    set({ selectedModelId: null });
  },

  predict: async (inputs) => {
    try {
      const modelId = get().selectedModelId ?? undefined;
      const result = await mlApi.predict(inputs, modelId);
      set({ lastPrediction: result, sessionInfo: result.session ?? get().sessionInfo });
      return result;
    } catch {
      return null;
    }
  },

  predictBatch: async (inputs) => {
    try {
      const modelId = get().selectedModelId ?? undefined;
      const result = await mlApi.predictBatch(inputs, modelId);
      set({ sessionInfo: result.session ?? get().sessionInfo });
      return result.results.map((r) => r.pitProbability);
    } catch {
      return null;
    }
  },

  promote: async (id) => {
    try {
      await mlApi.promote(id);
      await get().refreshModels();
      return true;
    } catch {
      return false;
    }
  },

  archive: async (id) => {
    try {
      await mlApi.archive(id);
      await get().refreshModels();
      return true;
    } catch {
      return false;
    }
  },

  deleteModel: async (id) => {
    try {
      await mlApi.deleteModel(id);
      if (get().selectedModelId === id) get().clearSelection();
      await get().refreshModels();
      return true;
    } catch {
      return false;
    }
  },

  refreshSession: async () => {
    try {
      const info = await mlApi.getSession();
      set({ sessionInfo: info, selectedModelId: info.modelId });
      setStoredModelId(info.modelId);
    } catch {
      /* unknown session (backend restarted) — keep local selection; the next
         selectModel()/predict() re-binds automatically */
    }
  },
}));

/** Convenience: the currently selected model entry (null when offline). */
export function useSelectedModel() {
  return useMLSession((s) => s.models.find((m) => m.card.id === s.selectedModelId) ?? null);
}

export { getSessionId };
