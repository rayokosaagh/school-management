"use client";

import { useEffect, useState, useTransition } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToastedActionState } from "@/components/ui/toast";
import { setGradeOrder, type ActionState } from "../actions";
import type { GradeRow } from "./classes-view";

const EMPTY: ActionState = {};

function GradeRowItem({
  grade,
  position,
  reduce,
  onMove,
}: {
  grade: GradeRow;
  position: number;
  reduce: boolean | null;
  onMove: (id: number, direction: "up" | "down") => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={grade}
      as="li"
      dragListener={false}
      dragControls={controls}
      transition={reduce ? { duration: 0 } : undefined}
      className="border-line bg-surface flex items-center gap-3 rounded-lg border px-3 py-2"
    >
      {/* Focusable on its own, so keyboard users can move a grade without ever
          touching the mouse-only drag gesture. */}
      <button
        type="button"
        className="text-ink-3 hover:text-foreground cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
        aria-label={`Reorder ${grade.name}. Position ${position}. Press Alt+Up or Alt+Down to move, or drag.`}
        onPointerDown={(e) => controls.start(e)}
        onKeyDown={(e) => {
          if (!e.altKey) return;
          if (e.key === "ArrowUp") {
            e.preventDefault();
            onMove(grade.id, "up");
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onMove(grade.id, "down");
          }
        }}
      >
        <GripVertical aria-hidden="true" />
      </button>
      <span className="text-ink-3 w-5 shrink-0 text-right text-xs tabular-nums">
        {position}
      </span>
      <span className="flex-1 truncate font-medium">{grade.name}</span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {grade.sectionCount} section{grade.sectionCount === 1 ? "" : "s"}
      </span>
    </Reorder.Item>
  );
}

/// The dialog body, mounted only while open — same idiom as GradeDetail and
/// SectionDetail in classes-view.tsx. A fresh mount on every open means the
/// local order always starts from the latest `grades` prop, with no stale
/// state left over from a previous open, and no effect needed to reset it.
function ReorderGradesBody({
  grades,
  onClose,
}: {
  grades: GradeRow[];
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [order, setOrder] = useState<GradeRow[]>(() =>
    [...grades].sort((a, b) => a.order - b.order),
  );
  const [state, action, pending] = useToastedActionState(setGradeOrder, EMPTY);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  function move(id: number, direction: "up" | "down") {
    setOrder((prev) => {
      const index = prev.findIndex((g) => g.id === id);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    const data = new FormData();
    data.set("ids", JSON.stringify(order.map((g) => g.id)));
    startTransition(() => action(data));
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Drag a row by its handle, or focus the handle and press Alt+Up /
        Alt+Down. The numbers on the left are the order that will be saved.
      </p>
      <Reorder.Group
        as="ul"
        axis="y"
        values={order}
        onReorder={setOrder}
        layoutScroll={!reduce}
        className="space-y-1.5"
      >
        {order.map((grade, index) => (
          <GradeRowItem
            key={grade.id}
            grade={grade}
            position={index}
            reduce={reduce}
            onMove={move}
          />
        ))}
      </Reorder.Group>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending || order.length === 0}>
          {pending ? "Saving…" : "Save order"}
        </Button>
      </div>
    </div>
  );
}

/// Every grade, draggable into a new order in one panel, instead of the
/// up/down arrows' one-step-at-a-time swap. Nothing is written until Save —
/// dragging (and Alt+Up/Down) only ever touch the body's own local state.
export function ReorderGradesDialog({
  grades,
  open,
  onClose,
}: {
  /// The full, currently-saved grade list, read fresh on every open.
  grades: GradeRow[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title="Reorder grades" onClose={onClose}>
      {open ? <ReorderGradesBody grades={grades} onClose={onClose} /> : null}
    </Modal>
  );
}
