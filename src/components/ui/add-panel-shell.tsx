"use client";

import { type ReactNode, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// The interactive half of AddPanel. It receives the already-rendered header as
// an element, because a component type cannot cross the server/client boundary.
export function AddPanelShell({
  header,
  cta,
  children,
  defaultOpen = false,
}: {
  header: ReactNode;
  cta: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();

  return (
    <section className="card-surface overflow-hidden">
      <div className="flex items-start gap-3 p-5">
        {header}
        <Button
          type="button"
          variant={open ? "ghost" : "outline"}
          size="lg"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronDown /> : <Plus />}
          {open ? "Close" : cta}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t px-5 py-5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
