"use client";

import { useEffect } from "react";
import { useHashRoute } from "@/hooks/use-hash-route";
import { TopNavigation } from "@/components/nav/top-navigation";
import { SiteFooter } from "@/components/nav/site-footer";
import { OverviewPage } from "@/features/overview/overview-page";
import { RaceIntelligencePage } from "@/features/race-intelligence/race-intelligence-page";
import { RaceReplayPage } from "@/features/race-replay/race-replay-page";
import { TelemetryPage } from "@/features/telemetry/telemetry-page";
import { StrategyPage } from "@/features/strategy/strategy-page";
import { DriversPage } from "@/features/drivers/drivers-page";
import { ModelsPage } from "@/features/models/models-page";
import { ExperimentsPage } from "@/features/experiments/experiments-page";
import { RegistryPage } from "@/features/registry/registry-page";
import { MonitoringPage } from "@/features/monitoring/monitoring-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { useMLSession } from "@/stores/ml-session-store";

export function AppShell() {
  const { view, navigate } = useHashRoute();
  const probe = useMLSession((s) => s.probe);

  /* probe the ML backend once on app start — flips the global status chip and
     page badges between LIVE and OFFLINE (bundled-data fallback) */
  useEffect(() => {
    void probe();
  }, [probe]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:left-4 focus:top-4 focus:bg-[var(--racing-red)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <TopNavigation view={view} navigate={navigate} />
      <main id="main-content" className="flex-1 pt-14 lg:pt-[93px] xl:pt-14">
        {view === "overview" && <OverviewPage navigate={navigate} />}
        {view === "race-intelligence" && <RaceIntelligencePage />}
        {view === "race-replay" && <RaceReplayPage />}
        {view === "telemetry" && <TelemetryPage />}
        {view === "strategy" && <StrategyPage />}
        {view === "drivers" && <DriversPage />}
        {view === "models" && <ModelsPage />}
        {view === "experiments" && <ExperimentsPage />}
        {view === "registry" && <RegistryPage />}
        {view === "monitoring" && <MonitoringPage />}
        {view === "settings" && <SettingsPage />}
      </main>
      <SiteFooter navigate={navigate} />
    </div>
  );
}
