"use client";

import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import type { Honours } from "@/lib/honours/honours";
import { sectionCode } from "@/lib/register-codes";
import { SectionCard } from "./section-card";

const ALL = "all";

export function HonoursWorkspace({ honours }: { honours: Honours }) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  // One tab per grade, in grade order; the sections of a grade sit inside it.
  const grades = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; students: number }>();
    for (const s of honours.sections) {
      const g = seen.get(s.gradeId) ?? { id: s.gradeId, name: s.gradeName, students: 0 };
      g.students += s.students.length;
      seen.set(s.gradeId, g);
    }
    return [...seen.values()];
  }, [honours.sections]);

  // Every section card ranks within itself, so stacking every grade's cards
  // together is a coherent view, not a cross-grade average — the podium page
  // lands on it rather than an arbitrary first grade.
  const [tab, setTab] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const tabs = useMemo<RegisterTab[]>(
    () => [
      { id: ALL, code: "ALL", label: "All grades", count: honours.sections.reduce((n, s) => n + s.students.length, 0) },
      ...grades.map((g) => ({
        id: String(g.id),
        code: sectionCode(g.name, ""),
        label: g.name,
        count: g.students,
        empty: g.students === 0,
      })),
    ],
    [grades, honours.sections],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return honours.sections
      .filter((s) => tab === ALL || String(s.gradeId) === tab)
      .map((s) =>
        q
          ? {
              ...s,
              students: s.students.filter((st) =>
                `${st.fullName} ${st.fullNameNp ?? ""}`.toLowerCase().includes(q),
              ),
            }
          : s,
      );
  }, [honours.sections, tab, query]);

  const ranked = honours.sections.reduce(
    (n, s) => n + s.students.filter((st) => st.position !== null).length,
    0,
  );
  const w = honours.weights;

  // No outer PageFrame here: this is a view inside the Students page, which
  // owns the one title/actions row for both views. Only the tab strip,
  // toolbar and body belong to this view.
  return (
    <>
      <PageFrame.Tabs>
        <RegisterTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          ariaLabel="Grades"
          baseId={baseId}
          panelId={panelId}
        />
      </PageFrame.Tabs>

      <PageFrame.Toolbar>
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names"
            aria-label="Search names"
            className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
          {ranked} ranked
        </span>
        <span className="text-ink-3 shrink-0 font-mono text-[12px] whitespace-nowrap tabular-nums">
          Exam {w.exams} · Att {w.attendance} · Cond {w.conduct} · Act {w.activities}
        </span>
      </PageFrame.Toolbar>

      {honours.publishedTerms === 0 ? (
        <p
          role="status"
          className="text-warn bg-warn-tint border-warn/30 mb-3 rounded-lg border px-3 py-2 text-sm"
        >
          No exam has been published this year, so nobody can be ranked yet. Publish a term on
          the Exams page.
        </p>
      ) : null}

      <PageFrame.Body
        id={panelId}
        labelledBy={registerTabId(baseId, tab)}
        className="overflow-y-auto border-0 bg-transparent"
      >
        <div className="space-y-4 pb-4">
          {visible.map((s) => (
            <SectionCard key={s.sectionId} section={s} />
          ))}
        </div>
      </PageFrame.Body>
    </>
  );
}
