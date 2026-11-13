"use client";

import { useEffect, useState } from "react";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { NAV_ITEMS } from "@/services/data";
import type { ViewId } from "@/types";

export function CommandMenu({ navigate }: { navigate: (v: ViewId) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const primary = NAV_ITEMS.filter((i) => i.primary);
  const secondary = NAV_ITEMS.filter((i) => !i.primary);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex h-8 items-center gap-2 border border-[var(--hairline)] bg-[#101014]/80 px-3 text-[12px] text-[var(--silver-dim)] hover:border-[var(--hairline-strong)] hover:text-[var(--silver)] transition-colors"
        aria-label="Open command menu"
      >
        <span className="text-mono text-[10px] tracking-widest">⌘K</span>
        <span className="w-px h-3.5 bg-[var(--hairline)]" aria-hidden="true" />
        <span className="text-mono text-[10px]">NAVIGATE</span>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} className="border-[var(--hairline)] bg-[#121216] text-[var(--foreground)]">
        <CommandInput placeholder="Jump to a module…" className="font-sans" />
        <CommandList>
          <CommandEmpty className="text-[var(--silver-dim)] text-sm py-6 text-center">
            No module matches your query.
          </CommandEmpty>
          <CommandGroup heading="Primary Modules" className="text-eyebrow">
            {primary.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.index} ${item.label} ${item.description}`}
                onSelect={() => {
                  navigate(item.id);
                  setOpen(false);
                }}
                className="text-sm text-[var(--silver)] aria-selected:bg-[var(--accent)] aria-selected:text-[var(--warm-white)]"
              >
                <span className="text-mono text-[10px] text-[var(--racing-red)] mr-2">{item.index}</span>
                <span className="font-display font-semibold uppercase">{item.label}</span>
                <span className="ml-auto text-[11px] text-[var(--silver-dim)] hidden sm:inline">{item.description}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="System" className="text-eyebrow">
            {secondary.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.index} ${item.label} ${item.description}`}
                onSelect={() => {
                  navigate(item.id);
                  setOpen(false);
                }}
                className="text-sm text-[var(--silver)] aria-selected:bg-[var(--accent)] aria-selected:text-[var(--warm-white)]"
              >
                <span className="text-mono text-[10px] text-[var(--silver-dim)] mr-2">{item.index}</span>
                <span className="font-display font-semibold uppercase">{item.label}</span>
                <span className="ml-auto text-[11px] text-[var(--silver-dim)] hidden sm:inline">{item.description}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
