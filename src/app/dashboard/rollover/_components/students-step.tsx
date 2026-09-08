"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { StudentAvatar } from "@/components/ui/student-avatar";
import { PersonName } from "@/components/ui/person-name";
import type { PlannedStudent, RolloverPlan, StudentDecision } from "@/lib/registry/rollover-plan";

type Row = PlannedStudent & { decision: StudentDecision; toLabel: string | null };

/// Every student the run touches, grouped by the section they are in now, so
/// the office reads it the same way they read a register.
export function StudentsStep({
  plan,
  onDecision,
  onBulk,
  onContinue,
}: {
  plan: RolloverPlan;
  onDecision: (studentId: number, decision: StudentDecision) => void;
  onBulk: (studentIds: number[], decision: StudentDecision) => void;
  onContinue: () => void;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo<Row[]>(
    () => [
      ...plan.students.promote.map((s) => ({ ...s, decision: "PROMOTE" as const, toLabel: s.toLabel })),
      ...plan.students.retain.map((s) => ({ ...s, decision: "RETAIN" as const, toLabel: s.toLabel })),
      ...plan.students.graduate.map((s) => ({ ...s, decision: "PROMOTE" as const, toLabel: null })),
      ...plan.students.leave.map((s) => ({ ...s, decision: "LEFT" as const, toLabel: null })),
    ],
    [plan],
  );

  const groups = useMemo(() => {
    const map = new Map<number, { label: string; rows: Row[] }>();
    for (const row of rows) {
      const group = map.get(row.fromSectionId) ?? { label: row.fromLabel, rows: [] };
      group.rows.push(row);
      map.set(row.fromSectionId, group);
    }
    for (const group of map.values()) {
      group.rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const visible = groups
    .map((g) => ({
      ...g,
      rows: needle ? g.rows.filter((r) => r.fullName.toLowerCase().includes(needle)) : g.rows,
    }))
    .filter((g) => g.rows.length > 0);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Search}
        tint="rose"
        title="No students to move"
        description={`Academic year ${plan.sourceYear.nameBS} has no active enrolments, so this rollover only copies structure.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students"
          className="max-w-xs"
          aria-label="Search students"
        />
        <Button className="ml-auto" onClick={onContinue}><TranslatedText>
          Continue to review
        </TranslatedText></Button>
      </div>

      {visible.map((group) => {
        const ids = group.rows.map((r) => r.studentId);
        // Nothing above the top grade, so Promote here means graduate.
        const graduating = group.rows.every((r) => r.toLabel === null && r.decision !== "LEFT");
        return (
          <section key={group.label} className="border-line bg-surface rounded-[10px] border">
            <header className="border-line flex items-center gap-3 border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">{group.label}</h2>
              <span className="text-ink-3 font-mono text-xs">{group.rows.length}</span>
              {graduating ? (
                <span className="text-ink-3 text-xs"><TranslatedText>leaving school</TranslatedText></span>
              ) : null}
              <div className="ml-auto flex gap-2">
                <Button size="xs" variant="ghost" onClick={() => onBulk(ids, "PROMOTE")}><TranslatedText>
                  All promote
                </TranslatedText></Button>
                <Button size="xs" variant="ghost" onClick={() => onBulk(ids, "RETAIN")}><TranslatedText>
                  All retain
                </TranslatedText></Button>
              </div>
            </header>

            <ul className="divide-line divide-y">
              {group.rows.map((row) => (
                <li key={row.studentId} className="flex items-center gap-3 px-4 py-2">
                  <StudentAvatar
                    photoId={row.photoId}
                    name={row.fullName}
                    className="size-8 rounded-lg"
                  />
                  <div className="min-w-0">
                    <PersonName en={row.fullName} np={row.fullNameNp} className="text-sm font-normal" />
                    <p className="text-ink-3 font-mono text-xs">{row.admissionNo}</p>
                  </div>
                  <p className="text-ink-3 ml-4 w-28 font-mono text-xs tabular-nums">
                    <TranslatedText>{row.total === null ? "no marks" : `${row.total} marks`}</TranslatedText>
                  </p>
                  <p className="text-ink-3 w-20 font-mono text-xs tabular-nums">
                    <TranslatedText>{row.attendancePercent === null ? "—" : `${row.attendancePercent}%`}</TranslatedText>
                  </p>
                  <p className="text-ink-2 ml-auto w-32 truncate text-right text-xs">
                    {row.decision === "LEFT"
                      ? "leaving"
                      : (row.toLabel ?? "graduating")}
                  </p>
                  <Segmented
                    value={row.decision}
                    onChange={(next) => onDecision(row.studentId, next)}
                    ariaLabel={`What happens to ${row.fullName}`}
                    options={[
                      { value: "PROMOTE", label: graduating ? "Graduate" : "Promote" },
                      { value: "RETAIN", label: "Retain" },
                      { value: "LEFT", label: "Left" },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
