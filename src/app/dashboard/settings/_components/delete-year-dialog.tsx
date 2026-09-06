"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/page-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { YearSummary } from "@/lib/registry/year-teardown";
import { deleteYearAction, summariseYearAction } from "../../classes/actions";
import type { YearRow } from "../../classes/_components/classes-view";

/// Table label, in the same order the teardown itself walks: children before
/// parents, so the list reads like the delete will run.
const COUNT_ROWS: { key: keyof YearSummary["counts"]; label: string }[] = [
  { key: "sections", label: "Sections" },
  { key: "offerings", label: "Subject offerings" },
  { key: "assignments", label: "Teacher assignments" },
  { key: "periods", label: "Timetable periods" },
  { key: "enrollments", label: "Enrolments" },
  { key: "examTerms", label: "Exam terms" },
  { key: "marks", label: "Marks" },
  { key: "attendanceSessions", label: "Attendance sessions" },
  { key: "attendanceRecords", label: "Attendance records" },
  { key: "conduct", label: "Conduct entries" },
  { key: "activities", label: "Activity entries" },
];

const EXPORTS: { kind: "register" | "attendance" | "marks"; label: string }[] = [
  { kind: "register", label: "Register (students, grade, section, roll)" },
  { kind: "attendance", label: "Attendance records" },
  { kind: "marks", label: "Marks" },
];

/// Everything the operator needs to destroy a year with eyes open: exactly
/// what it holds, a restore point offered by default, a download of each
/// export first, and — for a year that was actually taught in — a typed
/// confirmation rather than a click.
export function DeleteYearDialog({
  year,
  open,
  onClose,
  onDeleted,
}: {
  year: YearRow;
  open: boolean;
  onClose: () => void;
  /// Called after a successful delete, so the caller can close its own panel
  /// and let the revalidated year list replace this row.
  onDeleted: () => void;
}) {
  const push = useToast();
  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createRestorePoint, setCreateRestorePoint] = useState(true);
  const [typedName, setTypedName] = useState("");

  // Refetched every time the dialog opens: a summary held from a previous
  // open could be stale by the time the operator comes back to it.
  useEffect(() => {
    if (!open) return;
    // Every reset lives inside the transition, not the effect body itself, so
    // this stays one state update per open rather than a cascade of them.
    startLoad(async () => {
      setSummary(null);
      setLoadError(null);
      setDeleteError(null);
      setCreateRestorePoint(true);
      setTypedName("");
      const outcome = await summariseYearAction(year.id);
      if (outcome.error) setLoadError(outcome.error);
      else if (outcome.summary) setSummary(outcome.summary);
    });
  }, [open, year.id]);

  const nameMatches = summary ? typedName.trim() === summary.year.nameBS : false;
  const canDelete =
    summary !== null && !summary.year.isCurrent && (!summary.hasData || nameMatches);

  function runDelete() {
    if (!summary || !canDelete) return;
    setDeleteError(null);
    startDelete(async () => {
      const outcome = await deleteYearAction({
        id: year.id,
        createRestorePoint,
        typedName,
      });
      if (outcome.error) {
        setDeleteError(outcome.error);
        return;
      }
      push(
        "success",
        outcome.restorePointId
          ? `Academic year ${summary.year.nameBS} deleted. A restore point was captured.`
          : `Academic year ${summary.year.nameBS} deleted.`,
      );
      onDeleted();
    });
  }

  return (
    <Modal open={open} title={`Delete academic year ${year.nameBS}`} onClose={onClose}>
      <div className="space-y-5">
        {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
        {loadError ? (
          <Callout icon={AlertTriangle} tint="rose">
            {loadError}
          </Callout>
        ) : null}

        {summary?.year.isCurrent ? (
          <Callout icon={AlertTriangle} tint="rose">
            Academic year {summary.year.nameBS} is the current year. Switch to another
            year before deleting it.
          </Callout>
        ) : null}

        {summary && !summary.year.isCurrent ? (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
              {COUNT_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="tabular-nums font-medium">
                    {summary.counts[row.key]}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <p className="text-sm font-medium">Download a copy first</p>
              <ul className="space-y-1">
                {EXPORTS.map((e) => (
                  <li key={e.kind}>
                    <a
                      href={`/api/export/year/${e.kind}?year=${year.id}`}
                      className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      {e.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <label className="flex items-center gap-2.5 border-t pt-4 text-sm">
              <Checkbox
                checked={createRestorePoint}
                onCheckedChange={(checked) => setCreateRestorePoint(checked === true)}
              />
              Create a restore point first
            </label>

            {summary.hasData ? (
              <div className="space-y-2">
                <Label htmlFor="delete-year-confirm">
                  Type {summary.year.nameBS} to confirm
                </Label>
                <Input
                  id="delete-year-confirm"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  autoComplete="off"
                  inputMode="numeric"
                />
                <p className="text-muted-foreground text-xs">
                  This year holds data, so it needs a typed confirmation.
                </p>
              </div>
            ) : null}

            {deleteError ? (
              <Callout icon={AlertTriangle} tint="rose">
                {deleteError}
              </Callout>
            ) : null}

            <div className="flex items-center gap-3 border-t pt-4">
              <Button
                type="button"
                variant="destructive"
                disabled={!canDelete || deleting}
                onClick={runDelete}
              >
                {deleting ? "Deleting…" : `Delete ${summary.year.nameBS}`}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
