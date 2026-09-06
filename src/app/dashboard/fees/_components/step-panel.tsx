"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/// One step of the Fee setup workflow, faded rather than snapped.
///
/// The steps stay mounted whichever one is showing: the pricing matrix holds
/// unsaved amounts and the services step holds unsaved plan drafts, and
/// switching away must not throw either of them away. That rules out the usual
/// trick of keying a `motion.div` and letting it remount.
///
/// Hiding is still `display: none` — which is what keeps an inactive step's
/// forms out of the tab order — and the only new rule is *when* it may be
/// applied: on show it goes at the start, and on hide it waits for the fade to
/// finish, via motion's `transitionEnd`. Doing that with React state instead
/// meant setting state from an effect on every switch, which is both a
/// cascading render and a lint error.
export function StepPanel({
  visible,
  label,
  className,
  children,
}: {
  visible: boolean;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.section
      aria-label={label}
      // No entrance on first paint: the step the page opens on is already
      // where it belongs.
      initial={false}
      animate={
        visible
          ? { opacity: 1, y: 0, display: "block" }
          : { opacity: 0, y: 4, transitionEnd: { display: "none" } }
      }
      transition={reduce ? { duration: 0 } : { duration: 0.12, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}
