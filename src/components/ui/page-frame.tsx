"use client";

import { motion, useReducedMotion } from "motion/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/// Mirrors the `split` breakpoint declared in `globals.css`. Kept here so the
/// JS branch below and the CSS grid track cannot drift apart.
const SPLIT_QUERY = "(min-width: 74rem)";

/// The one page skeleton every dashboard route renders. Owns padding, the
/// split-view grid, and the Sheet fallback for the aside below `split`.
export function PageFrame({
  eyebrow,
  title,
  meta,
  actions,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-3">
        <div className="min-w-0">
          <p className="text-ink-3 text-[11px] font-medium tracking-[0.1em] uppercase">{eyebrow}</p>
          <h1 className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5">
            {title}
            {meta ? <span className="text-ink-3 font-mono text-[13px] font-normal tracking-normal">{meta}</span> : null}
          </h1>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Tabs({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 px-4 shell:-mx-6 shell:px-6">{children}</div>;
}

function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {children}
    </div>
  );
}

/// Body + optional aside. The aside is a column from `split` up and a right
/// Sheet below it; `open`/`onClose` drive only the Sheet.
function Split({
  children,
  aside,
  asideTitle,
  asideOpen,
  onAsideClose,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  asideTitle?: string;
  asideOpen?: boolean;
  onAsideClose?: () => void;
}) {
  const reduce = useReducedMotion();
  // One branch or the other, never both: `aside` is a single node, and
  // rendering it twice would duplicate its ids, its form controls and its
  // focus targets in the DOM.
  const wide = useMediaQuery(SPLIT_QUERY);

  return (
    <div className={cn("grid min-h-0 flex-1 gap-4", aside && wide && "grid-cols-[1fr_340px]")}>
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
      {aside && wide ? (
        <motion.aside
          key="aside"
          initial={reduce ? false : { opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          aria-label={asideTitle}
          className="bg-surface border-line flex min-h-0 flex-col overflow-y-auto rounded-[10px] border"
        >
          {aside}
        </motion.aside>
      ) : null}
      {aside && !wide ? (
        <Sheet open={!!asideOpen} onOpenChange={(open) => { if (!open) onAsideClose?.(); }}>
          <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{asideTitle ?? "Details"}</SheetTitle>
              <SheetDescription>Details for the selected row.</SheetDescription>
            </SheetHeader>
            {aside}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

/// The panel a page's content sits in. It does not scroll itself — whatever it
/// holds owns its own scroll region (`DataTable` scrolls its table container),
/// so a sticky table header has a scrollport to stick to.
///
/// Pass `labelledBy` (with the tab's id, from `registerTabId`) to make the
/// panel the tabpanel for a `RegisterTabs` strip.
function Body({
  children,
  className,
  id,
  labelledBy,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
}) {
  return (
    <div
      id={id}
      role={labelledBy ? "tabpanel" : undefined}
      aria-labelledby={labelledBy}
      className={cn("bg-surface border-line flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border", className)}
    >
      {children}
    </div>
  );
}

PageFrame.Tabs = Tabs;
PageFrame.Toolbar = Toolbar;
PageFrame.Split = Split;
PageFrame.Body = Body;
