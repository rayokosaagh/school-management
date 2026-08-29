import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/record-table";
import type { SubjectResult, Overall } from "@/lib/assessment/grading";

// One exam's result for one student, laid out the way a marksheet reads:
// subjects down, marks across, the summary underneath.

export type MarksheetSubject = {
  offeringId: number;
  subject: string;
  result: SubjectResult;
};

const dash = <span className="text-muted-foreground">—</span>;

function Cell({ children }: { children: ReactNode }) {
  return <td className="py-1.5 pr-3 tabular-nums">{children}</td>;
}

export function Marksheet({
  examName,
  className,
  subjects,
  overall,
  position,
  classSize,
  isPublished,
  hasPractical,
}: {
  examName: string;
  /** e.g. "Class 5 A". Named to avoid clashing with the CSS prop. */
  className: string;
  subjects: MarksheetSubject[];
  overall: Overall;
  position: number | null;
  classSize: number;
  isPublished: boolean;
  hasPractical: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{examName}</p>
          <p className="text-muted-foreground text-sm">{className}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPublished ? (
            <StatusPill tone="positive">Published</StatusPill>
          ) : (
            <StatusPill tone="warning">Draft</StatusPill>
          )}
          {overall.complete ? (
            <StatusPill tone={overall.passedAll ? "positive" : "critical"}>
              {overall.passedAll ? "Passed" : `Failed ${overall.subjectsFailed}`}
            </StatusPill>
          ) : (
            <StatusPill>Incomplete</StatusPill>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="py-2 pr-3 font-medium">Subject</th>
              <th className="py-2 pr-3 font-medium">Theory</th>
              {hasPractical ? <th className="py-2 pr-3 font-medium">Practical</th> : null}
              <th className="py-2 pr-3 font-medium">Total</th>
              <th className="py-2 pr-3 font-medium">Grade</th>
              <th className="py-2 font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map(({ offeringId, subject, result }) => (
              <tr key={offeringId} className="border-b last:border-0">
                <td className="py-1.5 pr-3">{subject}</td>
                <Cell>{result.isAbsent ? "Ab" : (result.theory ?? dash)}</Cell>
                {hasPractical ? (
                  <Cell>{result.isAbsent ? "Ab" : (result.practical ?? dash)}</Cell>
                ) : null}
                <Cell>
                  {result.total === null ? dash : `${result.total}/${result.fullMarks}`}
                </Cell>
                <td className="py-1.5 pr-3">
                  {result.grade === null ? (
                    dash
                  ) : (
                    <span
                      className={
                        result.passed === false
                          ? "font-medium text-red-700 dark:text-red-400"
                          : "font-medium text-emerald-700 dark:text-emerald-400"
                      }
                    >
                      {result.grade.letter}
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground py-1.5 text-xs">
                  {result.isAbsent
                    ? "Absent"
                    : result.failedParts.length > 0
                      ? `Failed ${result.failedParts.join(" and ")}`
                      : result.total === null
                        ? "Not marked"
                        : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-rail grid grid-cols-2 gap-3 rounded-xl p-3 sm:grid-cols-4">
        {[
          {
            label: "Percentage",
            value: overall.percent === null ? "—" : `${overall.percent}%`,
          },
          { label: "GPA", value: overall.gpa === null ? "—" : overall.gpa.toFixed(2) },
          {
            label: "Position",
            value: position === null ? "—" : `${position} of ${classSize}`,
          },
          {
            label: "Result",
            value: !overall.complete
              ? "Pending"
              : overall.passedAll
                ? "Passed"
                : "Failed",
          },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-muted-foreground text-xs tracking-wider uppercase">
              {stat.label}
            </p>
            <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {!overall.complete ? (
        <p className="text-muted-foreground text-xs">
          Some subjects are not marked yet, so the percentage, GPA and position are
          withheld rather than shown from a partial result.
        </p>
      ) : null}
    </div>
  );
}
