"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/services/data";
import type { ViewId } from "@/types";
import { useAppStore } from "@/stores/app-store";
import { Wordmark } from "@/components/brand/primitives";
import { CommandMenu } from "@/components/nav/command-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu, ChevronDown, Terminal } from "lucide-react";
import { useMLSession } from "@/stores/ml-session-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function NavButton({
  item,
  active,
  onClick,
  className,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-baseline gap-1.5 px-3 py-2 text-[13px] tracking-wide transition-colors",
        active
          ? "text-[var(--warm-white)]"
          : "text-[var(--silver)] hover:text-[var(--warm-white)]",
        className,
      )}
    >
      <span
        className={cn(
          "text-mono text-[10px]",
          active ? "text-[var(--racing-red)]" : "text-[var(--silver-dim)]",
        )}
      >
        {item.index}
      </span>
      <span className="font-display font-semibold uppercase">{item.label}</span>
      <span
        className={cn(
          "absolute inset-x-2 bottom-0 h-[2px] transition-transform origin-left",
          active ? "scale-x-100 bg-[var(--racing-red)]" : "scale-x-0 bg-[var(--racing-red)]/60 group-hover:scale-x-100",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

export function TopNavigation({ view, navigate }: { view: ViewId; navigate: (v: ViewId) => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mlMode = useMLSession((s) => s.mode);
  const mlModel = useMLSession((s) => s.models.find((m) => m.card.id === s.selectedModelId)?.card ?? null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const primary = NAV_ITEMS.filter((i) => i.primary);
  const secondary = NAV_ITEMS.filter((i) => !i.primary);
  const activeSecondary = secondary.find((i) => i.id === view);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300",
        scrolled
          ? "border-[var(--hairline)] bg-[#0a0a0bee] backdrop-blur-md"
          : "border-transparent bg-gradient-to-b from-[#0a0a0bcc] to-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 md:px-6">
        <button
          onClick={() => navigate("overview")}
          className="shrink-0"
          aria-label="F1 Strategy Engine — home"
        >
          <Wordmark />
        </button>

        {/* primary nav — desktop */}
        <nav className="ml-4 hidden min-w-0 flex-1 items-center xl:flex" aria-label="Primary">
          {primary.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              onClick={() => navigate(item.id)}
            />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* ML engine status — live/offline chip, links to the registry */}
          {mlMode !== "probing" && (
            <button
              onClick={() => navigate("registry")}
              title={
                mlMode === "live"
                  ? `ML backend LIVE — session model: ${mlModel ? `${mlModel.name} ${mlModel.version} (warm)` : "none selected"}`
                  : "ML backend offline — the app runs on bundled data. Start it with: cd backend && python run.py"
              }
              className="hidden h-8 items-center gap-2 border px-2.5 text-mono text-[9.5px] tracking-[0.14em] transition-colors sm:flex"
              style={{
                borderColor: mlMode === "live" ? "rgba(39,244,210,0.35)" : "var(--hairline-strong)",
                color: mlMode === "live" ? "var(--tyre-inter)" : "var(--silver-dim)",
                background: mlMode === "live" ? "rgba(39,244,210,0.06)" : "transparent",
              }}
            >
              <span
                className={cn("h-1.5 w-1.5", mlMode === "live" && "animate-pulse")}
                style={{
                  background: mlMode === "live" ? "var(--tyre-inter)" : "var(--amber-warn)",
                  opacity: mlMode === "live" ? 1 : 0.7,
                }}
              />
              {mlMode === "live" ? `ML LIVE${mlModel ? ` · ${mlModel.name.split(" ")[0].toUpperCase()}` : ""}` : "ML OFFLINE"}
            </button>
          )}
          {/* secondary nav */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "hidden h-8 gap-1.5 border-[var(--hairline)] bg-transparent px-3 text-[12px] font-display font-semibold uppercase tracking-wider hover:bg-[var(--accent)] hover:text-[var(--warm-white)] sm:flex",
                  activeSecondary && "border-[var(--racing-red)]/50 text-[var(--warm-white)]",
                )}
              >
                <Terminal className="h-3.5 w-3.5 text-[var(--silver-dim)]" />
                {activeSecondary ? `${activeSecondary.index} ${activeSecondary.label}` : "System"}
                <ChevronDown className="h-3.5 w-3.5 text-[var(--silver-dim)]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 border-[var(--hairline)] bg-[#16161a] text-[var(--foreground)]"
            >
              <DropdownMenuLabel className="text-eyebrow">Engineering Console</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[var(--hairline)]" />
              {secondary.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={cn(
                    "gap-2.5 cursor-pointer focus:bg-[var(--accent)] focus:text-[var(--warm-white)]",
                    view === item.id && "text-[var(--racing-red)]",
                  )}
                >
                  <span className="text-mono text-[10px] text-[var(--silver-dim)]">{item.index}</span>
                  <div className="flex flex-col">
                    <span className="font-display font-semibold uppercase text-[13px]">{item.label}</span>
                    <span className="text-[11px] text-[var(--silver-dim)]">{item.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <CommandMenu navigate={navigate} />

          {/* mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-[var(--hairline)] bg-transparent xl:hidden" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] border-[var(--hairline)] bg-[#0e0e11] p-0 overflow-y-auto">
              <SheetHeader className="border-b border-[var(--hairline)] px-5 py-4">
                <SheetTitle asChild>
                  <div><Wordmark /></div>
                </SheetTitle>
              </SheetHeader>
              <nav className="py-2" aria-label="All sections">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.id);
                      setMobileOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-baseline gap-3 px-5 py-3 text-left border-b border-[#16161a] transition-colors",
                      view === item.id
                        ? "bg-[var(--accent)] text-[var(--warm-white)]"
                        : "text-[var(--silver)] hover:bg-[#141418] hover:text-[var(--warm-white)]",
                    )}
                  >
                    <span
                      className={cn(
                        "text-mono text-[10px]",
                        view === item.id ? "text-[var(--racing-red)]" : "text-[var(--silver-dim)]",
                      )}
                    >
                      {item.index}
                    </span>
                    <span className="font-display font-semibold uppercase text-sm">{item.label}</span>
                  </button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* secondary nav row — tablet width (primary collapses to menu) */}
      <div className="hidden border-t border-[var(--hairline)] bg-[#0c0c0e]/90 lg:block xl:hidden">
        <nav className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 md:px-6" aria-label="Primary tablet">
          {primary.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              onClick={() => navigate(item.id)}
              className="shrink-0"
            />
          ))}
        </nav>
      </div>
    </header>
  );
}
