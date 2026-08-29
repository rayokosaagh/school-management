"use client";

import { motion, useReducedMotion } from "motion/react";

/// Re-mounts on every navigation, unlike layout, so it can fade each page in.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
}
