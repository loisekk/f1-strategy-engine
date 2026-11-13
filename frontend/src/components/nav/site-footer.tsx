"use client";

import { Wordmark, StatusDot } from "@/components/brand/primitives";
import { NAV_ITEMS } from "@/services/data";
import type { ViewId } from "@/types";

export function SiteFooter({ navigate }: { navigate: (v: ViewId) => void }) {
  return (
    <footer className="mt-auto border-t border-[var(--hairline)] bg-[#0c0c0e]">
      <div className="mx-auto max-w-[1600px] px-4 md:px-6">
        {/* ticker strip */}
        <div className="flex items-center gap-3 overflow-hidden border-b border-[var(--hairline)] py-2.5">
          <span className="shrink-0 bg-[var(--racing-red)] px-2 py-0.5 text-mono text-[10px] font-semibold tracking-[0.18em] text-white">
            SYSTEM
          </span>
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <div className="ticker-track flex shrink-0 items-center gap-8 whitespace-nowrap text-mono text-[11px] text-[var(--silver-dim)]">
              {[
                "MODEL: LIGHTGBM (CHAMPION)",
                "PREDICTION ENGINE: READY",
                "DATA ENGINE: F1 TELEMETRY 2022–2025",
                "DATASET: 101,371 LAPS",
                "THRESHOLD: 0.64",
                "SYSTEM: OPERATIONAL",
                "PIT LOSS ESTIMATE: 19.9S (3,271 STOPS)",
                "CHAMPION PIT F1: 0.9445 (REPORTED)",
              ]
                .concat([
                  "MODEL: LIGHTGBM (CHAMPION)",
                  "PREDICTION ENGINE: READY",
                  "DATA ENGINE: F1 TELEMETRY 2022–2025",
                  "DATASET: 101,371 LAPS",
                  "THRESHOLD: 0.64",
                  "SYSTEM: OPERATIONAL",
                  "PIT LOSS ESTIMATE: 19.9S (3,271 STOPS)",
                  "CHAMPION PIT F1: 0.9445 (REPORTED)",
                ])
                .map((t, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <StatusDot />
                    {t}
                  </span>
                ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-10 py-10 md:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2">
            <Wordmark />
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-[var(--silver)]">
              An intelligent Formula 1 strategy platform combining machine learning,
              telemetry analysis and race simulation — built on 101,371 laps of real
              race telemetry.
            </p>
            <p className="mt-4 text-[11px] leading-relaxed text-[var(--silver-dim)]">
              Independent engineering project. Not affiliated with, or endorsed by,
              Formula One Group, FIA, or any Formula 1 team.
            </p>
          </div>

          <nav aria-label="Footer modules">
            <p className="text-eyebrow mb-3">Modules</p>
            <ul className="space-y-2">
              {NAV_ITEMS.filter((i) => i.primary).slice(1, 6).map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => navigate(i.id)}
                    className="text-[13px] text-[var(--silver)] hover:text-[var(--warm-white)]"
                  >
                    {i.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer system">
            <p className="text-eyebrow mb-3">System</p>
            <ul className="space-y-2">
              {NAV_ITEMS.filter((i) => !i.primary).map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => navigate(i.id)}
                    className="text-[13px] text-[var(--silver)] hover:text-[var(--warm-white)]"
                  >
                    {i.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="col-span-2">
            <p className="text-eyebrow mb-3">Data & Credits</p>
            <ul className="space-y-2 text-[12px] leading-relaxed text-[var(--silver-dim)]">
              <li>
                Race telemetry dataset — <span className="text-[var(--silver)]">f1-strategy-engine</span> (loisekk), derived from official F1 timing data via FastF1.
              </li>
              <li>
                Circuit geometry —{" "}
                <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noreferrer" className="text-[var(--silver)] underline decoration-[var(--hairline-strong)] underline-offset-2 hover:text-[var(--warm-white)]">
                  bacinger/f1-circuits
                </a>
              </li>
              <li>
                3D vehicle model — “F1 2022 Generic” by TheoDevF1 (Sketchfab),{" "}
                <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/" target="_blank" rel="noreferrer" className="text-[var(--silver)] underline decoration-[var(--hairline-strong)] underline-offset-2 hover:text-[var(--warm-white)]">
                  CC-BY-NC-ND-4.0
                </a>
              </li>
              <li>Telemetry channel traces are physics-synthesised from circuit geometry and labelled as such.</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-2 border-t border-[var(--hairline)] py-5 text-[11px] text-[var(--silver-dim)] md:flex-row md:items-center">
          <p className="text-mono tracking-wider">
            F1 STRATEGY ENGINE — MOTORSPORT INTELLIGENCE SYSTEM
          </p>
          <p className="text-mono tracking-wider">
            ML PIPELINE: PYTHON · FRONTEND: REACT 19 / THREE.JS · BUILT 2026
          </p>
        </div>
      </div>
    </footer>
  );
}
