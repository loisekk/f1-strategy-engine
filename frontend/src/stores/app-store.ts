"use client";

import { create } from "zustand";
import type { ViewId } from "@/types";

interface AppState {
  view: ViewId;
  setView: (v: ViewId) => void;
  /* playback preferences (race replay) */
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "overview",
  setView: (view) => set({ view }),
  playbackSpeed: 1,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
}));
