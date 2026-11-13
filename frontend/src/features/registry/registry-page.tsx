"use client";

import { useMemo, useRef, useState } from "react";
import { SectionHeader, DataSourceBadge, TechPanel, StatusDot } from "@/components/brand/primitives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMLSession } from "@/stores/ml-session-store";
import { mlApi, MLRegisterMeta } from "@/services/ml-api";
import { cn } from "@/lib/utils";
import {
  Package, Crown, ArrowUpCircle, FileCode2, Upload, Flame, Snowflake,
  Archive, Trash2, Activity, ShieldCheck, Zap, CircleDot,
} from "lucide-react";

/**
 * Model Registry — LIVE when the FastAPI backend is reachable.
 *
 * MLOps control centre:
 *   · every registered version (champion / candidate / archived) with live
 *     runtime state (warm/cold, predictions served, last use)
 *   · ACTIVATE binds this browser session to a model (pre-warmed server-side,
 *     stays loaded for the whole session)
 *   · REGISTER uploads + validates new artifacts (retrained models) — they
 *     land as CANDIDATE, never touching the champion
 *   · PROMOTE / ARCHIVE / DELETE manage the lifecycle with zero downtime
 *
 * OFFLINE: falls back to the documented static entries; nothing is faked.
 */

/* ---------------- documented reference entries (offline view) ---------------- */

const STATIC_REGISTRY = [
  {
    name: "LightGBM Pit-Stop",
    version: "1.0.0",
    stage: "champion" as const,
    artifact: "model.json (booster)",
    family: "Gradient-boosted trees (leaf-wise)",
    trained: "101,371 laps · 2022–2025",
    threshold: 0.64,
    note: "Verified replica of the documented pipeline — registered in the live backend store.",
  },
  {
    name: "XGBoost Pit-Stop",
    version: "1.0.0",
    stage: "candidate" as const,
    artifact: "model.json (booster)",
    family: "Gradient-boosted trees (level-wise)",
    trained: "101,371 laps · 2022–2025",
    threshold: 0.6,
    note: "Challenger baseline for promotion comparison.",
  },
  {
    name: "LogReg Pit-Stop",
    version: "1.0.0",
    stage: "candidate" as const,
    artifact: "model.joblib + scaler.joblib",
    family: "Linear (scaled features)",
    trained: "101,371 laps · 2022–2025",
    threshold: 0.5,
    note: "Demonstrates the scaler serving path.",
  },
];

export function RegistryPage() {
  const { toast } = useToast();
  const ml = useMLSession();

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-16 md:px-10">
      <SectionHeader
        eyebrow="Module 09 — Model Registry"
        title="One champion. A clear line of succession."
        description="The registry is the MLOps control surface: register retrained models as candidates, evaluate them against the champion, promote with zero downtime. Your session model stays warm and active throughout — switching is instant and reversible."
        right={
          ml.mode === "live" ? (
            <DataSourceBadge kind="real" label="LIVE REGISTRY" />
          ) : (
            <DataSourceBadge kind="mock" label="BACKEND OFFLINE" />
          )
        }
      />

      {ml.mode === "live" ? <LiveRegistry /> : <OfflineRegistry />}
    </div>
  );
}

/* ------------------------------- LIVE VIEW ------------------------------- */

function LiveRegistry() {
  const { toast } = useToast();
  const ml = useMLSession();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const session = ml.sessionInfo;
  const selected = ml.models.find((m) => m.card.id === ml.selectedModelId) ?? null;

  return (
    <>
      {/* session bar — the active model for this browser session */}
      <TechPanel label="SESSION — MODEL BINDING (PERSISTS UNTIL YOU SWITCH)">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
          <CircleDot className="h-5 w-5 shrink-0 text-[var(--tyre-inter)]" strokeWidth={1.5} />
          <div className="min-w-[240px]">
            <p className="font-display text-lg font-bold uppercase tracking-wide text-[var(--warm-white)]">
              {selected ? (
                <>
                  {selected.card.name}{" "}
                  <span className="text-sm font-medium text-[var(--silver-dim)]">v{selected.card.version}</span>
                </>
              ) : (
                "No model selected"
              )}
            </p>
            <p className="text-mono text-[10px] text-[var(--silver-dim)]">
              {selected
                ? `${selected.card.framework} · threshold ${selected.card.threshold} · ${selected.card.featureSchema.length} features`
                : "Activate a model below to bind this session"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {session && (
              <>
                <span className="flex items-center gap-1.5 border border-[var(--tyre-inter)]/40 bg-[var(--tyre-inter)]/5 px-2.5 py-1 text-mono text-[9px] tracking-[0.16em] text-[var(--tyre-inter)]">
                  {session.modelState === "warm" ? <Flame className="h-3 w-3" /> : <Snowflake className="h-3 w-3" />}
                  {session.modelState === "warm" ? "WARM — LOADED IN MEMORY" : "COLD"}
                </span>
                <span className="border border-[var(--hairline)] px-2.5 py-1 text-mono text-[9px] tracking-[0.14em] text-[var(--silver)]">
                  PREDICTIONS: {session.predictions}
                </span>
                <span className="hidden border border-[var(--hairline)] px-2.5 py-1 text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)] md:inline">
                  SESSION {session.id.slice(0, 8)}
                </span>
              </>
            )}
          </div>
          <p className="ml-auto max-w-xs text-[11px] leading-relaxed text-[var(--silver-dim)] md:text-right">
            Selected once, the artifact stays loaded for the whole session — predictions are
            in-memory calls, never a load-per-request.
          </p>
        </div>
      </TechPanel>

      {/* model list */}
      <div className="mt-6 grid gap-4">
        {ml.models.map(({ card, runtime }) => {
          const isSelected = card.id === ml.selectedModelId;
          const isChampion = card.status === "champion";
          return (
            <div
              key={card.id}
              className={cn(
                "panel flex flex-col gap-4 p-5 md:flex-row md:items-center",
                isChampion && "border-[var(--racing-red)]/40",
                isSelected && "border-[var(--tyre-inter)]/40",
              )}
            >
              <div className="flex min-w-[260px] items-center gap-4">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center border",
                    isChampion
                      ? "border-[var(--racing-red)]/50 bg-[var(--racing-red)]/10 text-[var(--racing-red)]"
                      : "border-[var(--hairline)] text-[var(--silver-dim)]",
                  )}
                >
                  {isChampion ? <Crown className="h-5 w-5" strokeWidth={1.5} /> : <Package className="h-5 w-5" strokeWidth={1.5} />}
                </div>
                <div>
                  <p className="font-display text-lg font-bold uppercase tracking-wide text-[var(--warm-white)]">
                    {card.name} <span className="text-sm font-medium text-[var(--silver-dim)]">v{card.version}</span>
                  </p>
                  <p className="text-mono text-[10px] text-[var(--silver-dim)]">
                    {card.framework} · {card.featureSchema.length} features · {card.id}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isChampion && (
                  <span className="flex items-center gap-1.5 bg-[var(--racing-red)] px-2.5 py-1 text-mono text-[9px] font-semibold tracking-[0.16em] text-white">
                    <StatusDot state="operational" />
                    CHAMPION
                  </span>
                )}
                {card.status === "candidate" && (
                  <span className="border border-[var(--amber-warn)]/50 bg-[var(--amber-warn)]/5 px-2.5 py-1 text-mono text-[9px] tracking-[0.16em] text-[var(--amber-warn)]">
                    CANDIDATE
                  </span>
                )}
                {card.status === "archived" && (
                  <span className="border border-[var(--hairline-strong)] px-2.5 py-1 text-mono text-[9px] tracking-[0.16em] text-[var(--silver-dim)]">
                    ARCHIVED
                  </span>
                )}
                {isSelected && (
                  <span className="flex items-center gap-1.5 border border-[var(--tyre-inter)]/50 px-2.5 py-1 text-mono text-[9px] tracking-[0.16em] text-[var(--tyre-inter)]">
                    <Zap className="h-3 w-3" />
                    SESSION ACTIVE
                  </span>
                )}
                <span className="flex items-center gap-1.5 border border-[var(--hairline)] px-2.5 py-1 text-mono text-[9px] tracking-[0.14em] text-[var(--silver)]">
                  <FileCode2 className="h-3 w-3" />
                  {card.artifact}
                  {card.scaler ? " + scaler" : ""}
                </span>
                {runtime.warm && (
                  <span className="flex items-center gap-1 border border-[var(--tyre-inter)]/30 px-2 py-1 text-mono text-[9px] tracking-[0.14em] text-[var(--tyre-inter)]">
                    <Flame className="h-3 w-3" />
                    WARM · {runtime.predictions} PRED
                  </span>
                )}
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-6">
                <div className="text-right">
                  <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">PIT F1</p>
                  <p className="num text-[13px] text-[var(--warm-white)]">
                    {card.metrics.f1 !== undefined ? card.metrics.f1.toFixed(4) : "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">THRESHOLD</p>
                  <p className="num text-[13px] text-[var(--warm-white)]">{card.threshold}</p>
                </div>
                <div className="text-right">
                  <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">REGISTERED</p>
                  <p className="num text-[13px] text-[var(--warm-white)]">{card.registeredAt.slice(0, 10)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!isSelected && card.status !== "archived" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-[var(--tyre-inter)]/40 text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--tyre-inter)] hover:bg-[var(--tyre-inter)]/10"
                      onClick={async () => {
                        const ok = await ml.selectModel(card.id);
                        toast({
                          title: ok ? "Session model activated" : "Activation failed",
                          description: ok
                            ? `${card.name} v${card.version} is warm and bound to this session — it stays active until you switch.`
                            : "The backend refused the binding — is the artifact intact?",
                        });
                      }}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Activate
                    </Button>
                  )}
                  {!isChampion && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-[var(--hairline-strong)] bg-transparent text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--warm-white)] hover:bg-[var(--accent)]"
                      onClick={async () => {
                        const ok = await ml.promote(card.id);
                        toast({
                          title: ok ? "Promoted to champion" : "Promotion failed",
                          description: ok
                            ? `${card.id} now serves as the default. Previous champion archived (rollback = promote it back). Sessions on the old model continue uninterrupted.`
                            : "Check the backend log — promotion may be blocked by an active session binding.",
                        });
                      }}
                    >
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                      {card.status === "archived" ? "Restore" : "Promote"}
                    </Button>
                  )}
                  {card.status !== "archived" && !isChampion && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-[var(--hairline-strong)] bg-transparent text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--silver-dim)] hover:bg-[var(--accent)]"
                      onClick={async () => {
                        const ok = await ml.archive(card.id);
                        toast({ title: ok ? "Archived" : "Archive failed", description: ok ? `${card.id} moved to archived. Delete is now possible.` : undefined });
                      }}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </Button>
                  )}
                  {card.status === "archived" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "gap-1.5 border-[var(--racing-red)]/40 bg-transparent text-[11px] font-display font-semibold uppercase tracking-wider",
                        confirmDelete === card.id
                          ? "bg-[var(--racing-red)] text-white"
                          : "text-[var(--racing-red)]",
                      )}
                      onClick={async () => {
                        if (confirmDelete !== card.id) {
                          setConfirmDelete(card.id);
                          setTimeout(() => setConfirmDelete((c) => (c === card.id ? null : c)), 3000);
                          return;
                        }
                        const ok = await ml.deleteModel(card.id);
                        setConfirmDelete(null);
                        toast({
                          title: ok ? "Deleted" : "Delete refused",
                          description: ok
                            ? `${card.id} and its artifacts removed from the store.`
                            : "The backend refuses deleting models with bound sessions — switch sessions or restart it.",
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmDelete === card.id ? "Confirm" : "Delete"}
                    </Button>
                  )}
                </div>
              </div>
              {card.notes && (
                <p className="w-full text-[11px] leading-relaxed text-[var(--silver-dim)] md:w-64">{card.notes}</p>
              )}
            </div>
          );
        })}
      </div>

      <RegisterPanel />

      {/* promotion workflow — now live */}
      <TechPanel label="PROMOTION WORKFLOW — LIVE" className="mt-8">
        <div className="grid gap-px bg-[var(--hairline)] md:grid-cols-4">
          {[
            ["01", "Register", "Artifact uploaded, validated (load + smoke prediction + sha256) and staged as CANDIDATE — the champion is untouched."],
            ["02", "Evaluate", "Compare candidate metrics against the champion in Model Intelligence; run live predictions against both."],
            ["03", "Approve", "Human decision — promote only when the challenger beats the champion on pit-class F1 at its threshold."],
            ["04", "Promote", "Atomic manifest swap. Old champion archived (rollback = promote back). Warm sessions keep serving — zero downtime."],
          ].map(([n, t, d]) => (
            <div key={n} className="bg-[#0e0e11] p-5">
              <p className="num text-2xl font-semibold text-[#26262c]">{n}</p>
              <p className="font-display mt-3 text-[15px] font-semibold uppercase tracking-wide text-[var(--warm-white)]">{t}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--silver-dim)]">{d}</p>
            </div>
          ))}
        </div>
      </TechPanel>
    </>
  );
}

/* --------------------------- register (upload) --------------------------- */

function RegisterPanel() {
  const { toast } = useToast();
  const ml = useMLSession();
  const modelRef = useRef<HTMLInputElement>(null);
  const scalerRef = useRef<HTMLInputElement>(null);
  const encodersRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.1.0");
  const [framework, setFramework] = useState<"auto" | "lightgbm" | "xgboost" | "sklearn">("auto");
  const [threshold, setThreshold] = useState("0.64");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileNames, setFileNames] = useState<{ model: string | null; scaler: string | null; encoders: string | null }>({
    model: null,
    scaler: null,
    encoders: null,
  });

  const inputCls =
    "h-10 w-full border border-[var(--hairline-strong)] bg-[#101014] px-3 text-[13px] text-[var(--warm-white)] outline-none placeholder:text-[var(--silver-dim)] focus:border-[var(--racing-red)]/60";

  async function submit() {
    const modelFile = modelRef.current?.files?.[0];
    if (!name.trim() || !modelFile) {
      toast({
        title: "Missing fields",
        description: "A display name and the model artifact file are required.",
      });
      return;
    }
    const t = parseFloat(threshold);
    if (!Number.isFinite(t) || t <= 0 || t >= 1) {
      toast({ title: "Invalid threshold", description: "Threshold must be between 0 and 1 (e.g. 0.64)." });
      return;
    }
    setBusy(true);
    try {
      const meta: MLRegisterMeta = {
        name: name.trim(),
        version: version.trim() || "1.0.0",
        framework,
        threshold: t,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const res = await mlApi.registerModel(
        meta,
        modelFile,
        scalerRef.current?.files?.[0] ?? null,
        encodersRef.current?.files?.[0] ?? null,
      );
      toast({
        title: `Registered ${res.card.id} as CANDIDATE`,
        description: `Smoke test passed (load ${res.smokeTest.loadMs}ms · scaler ${res.smokeTest.scaler ? "yes" : "no"}). Promote it when ready — the champion is untouched until then.`,
      });
      setName("");
      setNotes("");
      setFileNames({ model: null, scaler: null, encoders: null });
      if (modelRef.current) modelRef.current.value = "";
      if (scalerRef.current) scalerRef.current.value = "";
      if (encodersRef.current) encodersRef.current.value = "";
      await ml.refreshModels();
    } catch (e) {
      toast({
        title: "Registration rejected",
        description: e instanceof Error ? e.message : "Validation failed — see the backend log.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <TechPanel label="REGISTER A NEW MODEL — VALIDATED UPLOAD (RETRAINED ARTIFACTS LAND AS CANDIDATE)" className="mt-8">
      <div className="grid gap-5 p-5 lg:grid-cols-3">
        {/* files */}
        <div className="space-y-3">
          <p className="text-eyebrow">Artifacts</p>
          <FileDrop
            inputRef={modelRef}
            label="Model file"
            hint=".json / .txt (LightGBM·XGBoost) or .pkl / .joblib (sklearn)"
            required
            onFileName={(n) => setFileNames((f) => ({ ...f, model: n }))}
          />
          <FileDrop
            inputRef={scalerRef}
            label="Scaler (optional)"
            hint=".pkl / .joblib — fitted StandardScaler"
            onFileName={(n) => setFileNames((f) => ({ ...f, scaler: n }))}
          />
          <FileDrop
            inputRef={encodersRef}
            label="Encoders (optional)"
            hint="encodings.json — driver/compound classes"
            onFileName={(n) => setFileNames((f) => ({ ...f, encoders: n }))}
          />
          <p className="text-[10.5px] leading-relaxed text-[var(--silver-dim)]">
            Uploads are quarantined, loaded and smoke-tested before they enter the store — a broken
            artifact can never displace the champion. sha256 is recorded for every file.
          </p>
        </div>

        {/* meta */}
        <div className="space-y-3">
          <p className="text-eyebrow">Metadata</p>
          <div>
            <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">DISPLAY NAME *</label>
            <input
              className={cn(inputCls, "mt-1")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="LightGBM Pit-Stop"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">VERSION</label>
              <input className={cn(inputCls, "mt-1")} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.1.0" />
            </div>
            <div>
              <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">THRESHOLD</label>
              <input className={cn(inputCls, "mt-1")} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="0.64" />
            </div>
          </div>
          <div>
            <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">FRAMEWORK</label>
            <select
              className={cn(inputCls, "mt-1 cursor-pointer")}
              value={framework}
              onChange={(e) => setFramework(e.target.value as typeof framework)}
            >
              <option value="auto">auto-detect (recommended)</option>
              <option value="lightgbm">lightgbm</option>
              <option value="xgboost">xgboost</option>
              <option value="sklearn">sklearn (pickle/joblib)</option>
            </select>
          </div>
          <div>
            <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">NOTES</label>
            <input
              className={cn(inputCls, "mt-1")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Retrained on 2026 dataset · f1 0.88"
            />
          </div>
        </div>

        {/* preview + submit */}
        <div className="flex flex-col justify-between gap-4">
          <div className="border border-[var(--hairline)] bg-[#101014] p-4">
            <p className="text-eyebrow mb-3">Will register as</p>
            <p className="font-display text-lg font-bold uppercase tracking-wide text-[var(--warm-white)]">
              {(name || "…").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "…"}
              <span className="text-sm font-medium text-[var(--silver-dim)]">-{version || "1.0.0"}</span>
            </p>
            <div className="mt-3 space-y-1.5 text-mono text-[10px] text-[var(--silver-dim)]">
              <p>FILE — {fileNames.model ?? "none selected"}</p>
              <p>SCALER — {fileNames.scaler ?? "none"}</p>
              <p>ENCODERS — {fileNames.encoders ?? "none (default encodings used)"}</p>
              <p>STATUS — candidate (promote separately)</p>
            </div>
          </div>
          <Button
            onClick={submit}
            disabled={busy}
            className="h-11 w-full gap-2 bg-[var(--racing-red)] font-display text-[13px] font-bold uppercase tracking-wider text-white hover:bg-[var(--racing-red)]/85"
          >
            <Upload className="h-4 w-4" />
            {busy ? "Validating…" : "Register model"}
          </Button>
          <p className="text-[10.5px] leading-relaxed text-[var(--silver-dim)]">
            Same validation path as the CLI: <span className="text-mono">python scripts/register_model.py</span>.
            Registering <span className="text-mono">f1_pitstop_model.json</span> +{" "}
            <span className="text-mono">f1_scaler.pkl</span> from the original project takes seconds.
          </p>
        </div>
      </div>
    </TechPanel>
  );
}

const FileDrop = ({
  inputRef,
  label,
  hint,
  required,
  onFileName,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  hint: string;
  required?: boolean;
  onFileName: (name: string | null) => void;
}) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const acceptFile = (file: File | undefined | null) => {
    const n = file?.name ?? null;
    setFileName(n);
    onFileName(n);
  };
  return (
    <div>
      <label className="text-mono text-[9px] tracking-[0.14em] text-[var(--silver-dim)]">
        {label.toUpperCase()} {required && "*"}
      </label>
      <label
        className="mt-1 flex h-14 w-full cursor-pointer items-center gap-3 border border-dashed border-[var(--hairline-strong)] bg-[#0f0f12] px-3 text-[12px] text-[var(--silver-dim)] transition-colors hover:border-[var(--racing-red)]/50 hover:text-[var(--silver)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const input = inputRef.current;
          if (input && e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            acceptFile(e.dataTransfer.files[0]);
          }
        }}
      >
        <Upload className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {fileName ?? <span className="text-[11px]">{hint}</span>}
        </span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".json,.txt,.pkl,.joblib,.ubj"
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />
      </label>
    </div>
  );
};

/* ------------------------------ OFFLINE VIEW ------------------------------ */

function OfflineRegistry() {
  const ml = useMLSession();
  return (
    <>
      <div className="flex flex-col gap-4 border-l-2 border-[var(--amber-warn)] bg-[#141410] px-5 py-4 md:flex-row md:items-center">
        <Activity className="h-5 w-5 shrink-0 text-[var(--amber-warn)]" />
        <div className="flex-1">
          <p className="text-mono text-[10px] tracking-[0.16em] text-[var(--amber-warn)]">ML BACKEND OFFLINE — REGISTRY RUNNING IN REFERENCE MODE</p>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-[var(--silver)]">
            Start the serving layer to manage models live: register retrained artifacts, promote
            candidates, keep your session model warm. Until then the entries below document the
            reference registry that ships pre-seeded with the backend.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-[var(--hairline-strong)] bg-transparent text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--warm-white)]"
          onClick={() => void ml.probe()}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Retry connection
        </Button>
      </div>
      <div className="mt-3 flex items-start gap-3 border border-[var(--hairline)] bg-[#0d0d10] px-5 py-3.5">
        <p className="text-mono text-[10.5px] leading-relaxed tracking-wider text-[var(--silver-dim)]">
          <span className="text-[var(--warm-white)]">$</span> cd backend{" "}
          <span className="text-[var(--silver-dim)]">&amp;&amp;</span> pip install -r requirements.txt{" "}
          <span className="text-[var(--silver-dim)]">&amp;&amp;</span> python run.py{" "}
          <span className="text-[var(--silver-dim)]"># → http://localhost:8000 (3 reference models pre-registered)</span>
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        {STATIC_REGISTRY.map((m) => (
          <div
            key={`${m.name}-${m.version}`}
            className={`panel flex flex-col gap-4 p-5 md:flex-row md:items-center ${m.stage === "champion" ? "border-[var(--racing-red)]/40" : ""}`}
          >
            <div className="flex min-w-[260px] items-center gap-4">
              <div
                className={`flex h-11 w-11 items-center justify-center border ${
                  m.stage === "champion"
                    ? "border-[var(--racing-red)]/50 bg-[var(--racing-red)]/10 text-[var(--racing-red)]"
                    : "border-[var(--hairline)] text-[var(--silver-dim)]"
                }`}
              >
                {m.stage === "champion" ? <Crown className="h-5 w-5" strokeWidth={1.5} /> : <Package className="h-5 w-5" strokeWidth={1.5} />}
              </div>
              <div>
                <p className="font-display text-lg font-bold uppercase tracking-wide text-[var(--warm-white)]">
                  {m.name} <span className="text-sm font-medium text-[var(--silver-dim)]">v{m.version}</span>
                </p>
                <p className="text-mono text-[10px] text-[var(--silver-dim)]">{m.family}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {m.stage === "champion" && (
                <span className="flex items-center gap-1.5 bg-[var(--racing-red)] px-2.5 py-1 text-mono text-[9px] font-semibold tracking-[0.16em] text-white">
                  <StatusDot state="operational" />
                  CHAMPION
                </span>
              )}
              {m.stage === "candidate" && (
                <span className="border border-[var(--amber-warn)]/40 bg-[var(--amber-warn)]/5 px-2.5 py-1 text-mono text-[9px] tracking-[0.16em] text-[var(--amber-warn)]">
                  CANDIDATE
                </span>
              )}
              <span className="flex items-center gap-1.5 border border-[var(--hairline)] px-2.5 py-1 text-mono text-[9px] tracking-[0.14em] text-[var(--silver)]">
                <FileCode2 className="h-3 w-3" />
                {m.artifact}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-6">
              <div className="text-right">
                <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">TRAINED ON</p>
                <p className="text-[12px] text-[var(--silver)]">{m.trained}</p>
              </div>
              <div className="text-right">
                <p className="text-mono text-[8.5px] tracking-[0.16em] text-[var(--silver-dim)]">THRESHOLD</p>
                <p className="num text-[13px] text-[var(--warm-white)]">{m.threshold}</p>
              </div>
            </div>
            <p className="w-full text-[11px] text-[var(--silver-dim)] md:w-64">{m.note}</p>
          </div>
        ))}
      </div>
    </>
  );
}
