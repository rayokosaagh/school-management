"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

type Toast = { id: number; tone: ToastTone; message: string };

const ToastContext = createContext<((tone: ToastTone, message: string) => void) | null>(
  null,
);

const STYLES: Record<ToastTone, { ring: string; icon: typeof Info; tint: string }> = {
  success: {
    ring: "ring-emerald-500/25",
    tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  error: {
    ring: "ring-red-500/25",
    tint: "bg-red-500/10 text-red-700 dark:text-red-400",
    icon: AlertTriangle,
  },
  info: {
    ring: "ring-border",
    tint: "bg-muted text-muted-foreground",
    icon: Info,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const reduce = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, tone, message }]);
      // Errors stay longer, because they usually need reading twice.
      const life = tone === "error" ? 7000 : 4000;
      setTimeout(() => dismiss(id), life);
    },
    [dismiss],
  );

  // Only ever populated by a user action, so it never renders on the server.
  const overlay = toasts.length > 0
    ? createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
          // Announced politely so a screen reader hears the outcome of an action.
          role="status"
          aria-live="polite"
        >
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const style = STYLES[toast.tone];
              const Icon = style.icon;
              return (
                <motion.div
                  key={toast.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={cn(
                    "bg-surface pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl p-3 shadow-lg ring-1",
                    style.ring,
                  )}
                >
                  <span
                    className={cn("grid size-7 shrink-0 place-items-center rounded-lg", style.tint)}
                    aria-hidden="true"
                  >
                    <Icon className="size-4" />
                  </span>
                  <p className="min-w-0 flex-1 pt-1 text-sm">{toast.message}</p>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    aria-label="Dismiss"
                    className="hover:bg-muted focus-visible:ring-ring/50 grid size-7 shrink-0 place-items-center rounded-lg focus-visible:ring-3 focus-visible:outline-none"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )
    : null;

  return (
    <ToastContext.Provider value={push}>
      {children}
      {overlay}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside ToastProvider.");
  return push;
}

/// Mirrors a server action result into a toast. Fires once per distinct result,
/// so a re-render caused by revalidation does not repeat the message.
export function useActionToast(state: { error?: string; success?: string }) {
  const push = useToast();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    const key = state.error
      ? `e:${state.error}`
      : state.success
        ? `s:${state.success}`
        : null;
    if (!key || key === seen.current) return;
    seen.current = key;
    push(state.error ? "error" : "success", state.error ?? state.success ?? "");
  }, [state, push]);
}

/// Drop-in replacement for useActionState that also surfaces the result as a
/// toast, so every create, update and delete confirms itself the same way.
export function useToastedActionState<S extends { error?: string; success?: string }>(
  action: (state: Awaited<S>, payload: FormData) => S | Promise<S>,
  initialState: Awaited<S>,
) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useActionToast(state);
  return [state, formAction, pending] as const;
}
