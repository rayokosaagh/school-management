"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Callout } from "@/components/ui/page-shell";
import { useToastedActionState } from "@/components/ui/toast";
import type { YearCounts } from "@/lib/registry/year-teardown";
import type { RestoreReport } from "@/lib/registry/restore-point";
import {
  type DeleteRestorePointState,
  type RestoreState,
  deleteRestorePointAction,
  restoreYearAction,
} from "../actions";

const EMPTY_RESTORE: RestoreState = {};
const EMPTY_DELETE: DeleteRestorePointState = {};

const TABLE_LABEL: Record<keyof YearCounts, string> = {
  sections: "sections",
  offerings: "subject offerings",
  assignments: "teacher assignments",
  periods: "timetable periods",
  enrollments: "enrolments",
  examTerms: "exam terms",
  marks: "marks",
  attendanceSessions: "attendance sessions",
  attendanceRecords: "attendance records",
  conduct: "conduct entries",
  activities: "activity entries",
};

/// One line naming every non-empty table, so a row stays scannable without a
/// grid — this card can hold many restore points at once.
function countsLine(counts: YearCounts): string {
  const parts = (Object.keys(TABLE_LABEL) as (keyof YearCounts)[])
    .filter((key) => counts[key] > 0)
    .map((key) => `${counts[key]} ${TABLE_LABEL[key]}`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing recorded";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/// A restore point row shaped for display: the page formats the date and
/// byte count server-side, the same way Accounts is handed a createdLabel —
/// this component stays a presentational client component.
export type RestorePointRow = {
  id: number;
  yearNameBS: string;
  takenLabel: string;
  createdByUsername: string | null;
  payloadBytes: number;
  counts: YearCounts;
};

/// The RestoreReport, worded exactly as the restore module produced it. A
/// clean restore says so plainly; a restore with skips is a rose callout,
/// never something that could be missed — those rows are gone for good.
function RestoreReportView({ report }: { report: RestoreReport }) {
  const skips = (Object.keys(report.tables) as (keyof YearCounts)[])
    .map((key) => ({ key, outcome: report.tables[key] }))
    .filter((row) => row.outcome.skipped > 0);

  if (skips.length === 0) {
    return (
      <Callout icon={CheckCircle2} tint="green">
        {report.yearNameBS}<TranslatedText> restored in full — nothing was skipped.
      </TranslatedText></Callout>
    );
  }

  return (
    <Callout icon={AlertTriangle} tint="rose">
      <p className="font-medium">
        {report.yearNameBS}<TranslatedText> restored, but some rows could not come back — they are gone
        for good:
      </TranslatedText></p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
        {skips.map(({ key, outcome }) => (
          <li key={key}>
            {TABLE_LABEL[key]}: {outcome.reason}
          </li>
        ))}
      </ul>
    </Callout>
  );
}

function RestorePointRowItem({ point }: { point: RestorePointRow }) {
  const [restoreState, restoreAction, restoring] = useToastedActionState(
    restoreYearAction,
    EMPTY_RESTORE,
  );
  const [deleteState, deleteAction, deleting] = useToastedActionState(
    deleteRestorePointAction,
    EMPTY_DELETE,
  );

  return (
    <li className="space-y-2.5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{point.yearNameBS}</p>
          <p className="text-muted-foreground text-xs"><TranslatedText>
            Taken </TranslatedText>{point.takenLabel}<TranslatedText> by </TranslatedText>{point.createdByUsername ?? "unknown"} ·<TranslatedText>{" "}</TranslatedText>
            {formatBytes(point.payloadBytes)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{countsLine(point.counts)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form action={restoreAction}>
            <input type="hidden" name="restorePointId" value={point.id} />
            <Button type="submit" variant="outline" size="sm" disabled={restoring || deleting}>
              <TranslatedText>{restoring ? "Restoring…" : "Restore"}</TranslatedText>
            </Button>
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="restorePointId" value={point.id} />
            <ConfirmSubmit
              label="Delete"
              confirmLabel="Delete forever?"
              size="sm"
              pending={deleting}
              disabled={restoring}
            />
          </form>
        </div>
      </div>

      {restoreState.error ? <p className="text-destructive text-sm">{restoreState.error}</p> : null}
      {restoreState.report ? <RestoreReportView report={restoreState.report} /> : null}
      {deleteState.error ? <p className="text-destructive text-sm">{deleteState.error}</p> : null}
    </li>
  );
}

export function RestorePoints({ restorePoints }: { restorePoints: RestorePointRow[] }) {
  if (restorePoints.length === 0) {
    return (
      <p className="text-muted-foreground text-sm"><TranslatedText>No restore points have been taken yet.</TranslatedText></p>
    );
  }

  return (
    <ul className="divide-y">
      {restorePoints.map((point) => (
        <RestorePointRowItem key={point.id} point={point} />
      ))}
    </ul>
  );
}
