"use client";

import { cn } from "@/lib/utils";

/** Speed-slash wordmark — pure SVG, no external assets. */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <svg width="26" height="18" viewBox="0 0 26 18" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M2 16 L9 2 H24 L17 16 Z" fill="var(--racing-red)" />
        <path d="M12.5 5.5 H21.5 M10.5 9 H19.5 M8.5 12.5 H17.5" stroke="#0a0a0b" strokeWidth="1.4" />
      </svg>
      {!compact && (
        <span className="font-display font-bold uppercase leading-none tracking-wide text-[15px]">
          F1 Strategy<span className="text-[var(--racing-red)]"> Engine</span>
        </span>
      )}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-eyebrow", className)}>{children}</p>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  className,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-8", className)}>
      <div className="flex items-end justify-between gap-6">
        <div className="max-w-3xl">
          {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
          <h2 className="headline text-3xl md:text-4xl text-[var(--warm-white)]">
            <span className="accent-tick" aria-hidden="true" />
            {title}
          </h2>
          {description && (
            <p className="mt-4 text-[15px] leading-relaxed text-[var(--silver)] max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {right && <div className="hidden md:block shrink-0">{right}</div>}
      </div>
      <div className="mt-6 h-px bg-[var(--hairline)]" />
    </div>
  );
}

export function StatBlock({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("py-4", className)}>
      <p className="text-eyebrow mb-2">{label}</p>
      <p className="num text-3xl font-medium text-[var(--warm-white)] leading-none">
        {value}
        {unit && <span className="text-base text-[var(--silver)] ml-1">{unit}</span>}
      </p>
      {hint && <p className="mt-2 text-xs text-[var(--silver-dim)]">{hint}</p>}
    </div>
  );
}

/** Data provenance badge — distinguishes real data from demo/mock data. */
export function DataSourceBadge({
  kind,
  label,
  className,
}: {
  kind: "real" | "demo" | "mock" | "model" | "synth";
  label?: string;
  className?: string;
}) {
  const map = {
    real: { color: "var(--tyre-inter)", text: "REAL DATA" },
    demo: { color: "var(--amber-warn)", text: "DEMO DATA" },
    mock: { color: "var(--silver-dim)", text: "MOCK — BACKEND PENDING" },
    model: { color: "var(--racing-red)", text: "MODEL OUTPUT" },
    synth: { color: "var(--amber-warn)", text: "SYNTHESISED" },
  } as const;
  const c = map[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-mono text-[10px] tracking-[0.14em]",
        className,
      )}
      style={{ color: c.color, borderColor: `${c.color}44`, background: `${c.color}0d` }}
    >
      <span className="h-1 w-1" style={{ background: c.color }} aria-hidden="true" />
      {label ?? c.text}
    </span>
  );
}

export function StatusDot({
  state = "operational",
  className,
}: {
  state?: "operational" | "degraded" | "offline" | "pending";
  className?: string;
}) {
  const color =
    state === "operational"
      ? "var(--tyre-inter)"
      : state === "degraded"
        ? "var(--amber-warn)"
        : state === "pending"
          ? "var(--silver-dim)"
          : "var(--racing-red)";
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5", className)}>
      <span className="absolute inset-0" style={{ background: color }} />
      {state === "operational" && (
        <span className="absolute inset-0 blink" style={{ background: color, opacity: 0.4 }} />
      )}
    </span>
  );
}

/** Thin technical panel with corner registration marks. */
export function TechPanel({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("panel corner-marks", className)}>
      {label && (
        <div className="border-b border-[var(--hairline)] px-4 py-2.5 flex items-center justify-between">
          <span className="text-eyebrow">{label}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/** Inline error panel for failed dataset fetches (role=alert). */
export function DataError({
  what,
  error,
  className,
}: {
  what: string;
  error: Error | null;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={cn("border border-[var(--racing-red)]/40 bg-[#160d0d] p-6", className)}
    >
      <p className="text-eyebrow text-[var(--racing-red)]">DATA LOAD FAILED</p>
      <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--silver)]">
        {what} could not be loaded from the bundled dataset —{" "}
        <span className="text-mono text-[12px] text-[var(--warm-white)]">{error.message}</span>.
      </p>
      <p className="mt-2 text-[12px] text-[var(--silver-dim)]">
        Verify the files under <span className="text-mono">/data</span> are served and reload the
        page. The application runs entirely on bundled pipeline outputs — nothing is fetched
        externally.
      </p>
    </div>
  );
}

export function CompoundDot({ compound, size = 8 }: { compound: string; size?: number }) {
  const colorMap: Record<string, string> = {
    SOFT: "var(--tyre-soft)",
    MEDIUM: "var(--tyre-medium)",
    HARD: "var(--tyre-hard)",
    INTERMEDIATE: "var(--tyre-inter)",
    WET: "var(--tyre-wet)",
    UNKNOWN: "var(--silver-dim)",
  };
  return (
    <span
      aria-label={compound}
      className="inline-block rounded-full border border-black/40"
      style={{ width: size, height: size, background: colorMap[compound] ?? "var(--silver-dim)" }}
    />
  );
}
