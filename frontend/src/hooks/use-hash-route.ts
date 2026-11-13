"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ViewId } from "@/types";
import { useAppStore } from "@/stores/app-store";
import { loadJson } from "@/services/data";

const VALID_VIEWS: ViewId[] = [
  "overview",
  "race-intelligence",
  "race-replay",
  "telemetry",
  "strategy",
  "drivers",
  "models",
  "experiments",
  "registry",
  "monitoring",
  "settings",
];

function parseHash(): ViewId {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return (VALID_VIEWS as string[]).includes(h) ? (h as ViewId) : "overview";
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useHashView(): ViewId {
  return useSyncExternalStore(
    subscribeHash,
    () => parseHash(),
    () => "overview" as ViewId,
  );
}

/**
 * Hash-based router. The whole application lives on a single route; views are
 * switched client-side so links stay shareable (#/race-replay etc.).
 */
export function useHashRoute() {
  const setView = useAppStore((s) => s.setView);
  const view = useHashView();

  useEffect(() => {
    setView(view);
  }, [view, setView]);

  const navigate = useCallback((v: ViewId) => {
    window.location.hash = `/${v}`;
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  return { view, navigate };
}

/** Respect the user's reduced-motion preference. */
export function useReducedMotion(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, []);
  const snapshot = useCallback(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Detect coarse pointers / small screens for 3D quality tiers. */
export function useDeviceTier(): "desktop" | "tablet" | "mobile" {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("resize", cb);
    return () => window.removeEventListener("resize", cb);
  }, []);
  const snapshot = useCallback((): "desktop" | "tablet" | "mobile" => {
    const w = window.innerWidth;
    return w < 768 ? "mobile" : w < 1180 ? "tablet" : "desktop";
  }, []);
  return useSyncExternalStore(subscribe, snapshot, () => "desktop");
}

/** Fetch JSON with typed result + loading/error states (goes through the shared cache). */
export function useJson<T>(url: string | null) {
  const [state, setState] = useState<{
    url: string | null;
    data: T | null;
    error: Error | null;
  }>({ url: null, data: null, error: null });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadJson<T>(url)
      .then((d) => {
        if (alive) setState({ url, data: d, error: null });
      })
      .catch((e: Error) => {
        if (alive) setState({ url, data: null, error: e });
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const current = state.url === url;
  return {
    data: current ? state.data : null,
    loading: !!url && !current,
    error: current ? state.error : null,
  };
}
