"use client";

import { motion, useReducedMotion } from "motion/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
    <div className={cn("flex min-h-full flex-col", className)}>
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
  return (
    <div className={cn("grid min-h-0 flex-1 gap-4", aside && "split:grid-cols-[1fr_340px]")}>
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
      {aside ? (
        <>
          <motion.aside
            key="aside"
            initial={reduce ? false : { opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            aria-label={asideTitle}
            className="bg-surface border-line split:flex hidden min-h-0 flex-col overflow-y-auto rounded-[10px] border"
          >
            {aside}
          </motion.aside>
          <Sheet open={!!asideOpen} onOpenChange={(open) => { if (!open) onAsideClose?.(); }}>
            <SheetContent side="right" className="split:hidden w-full max-w-md overflow-y-auto p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{asideTitle ?? "Details"}</SheetTitle>
                <SheetDescription>Details for the selected row.</SheetDescription>
              </SheetHeader>
              {aside}
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  );
}

function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-surface border-line min-h-0 flex-1 overflow-auto rounded-[10px] border", className)}>{children}</div>;
}

PageFrame.Tabs = Tabs;
PageFrame.Toolbar = Toolbar;
PageFrame.Split = Split;
PageFrame.Body = Body;
