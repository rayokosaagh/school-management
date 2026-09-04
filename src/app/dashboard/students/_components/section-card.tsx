import type { SectionHonours } from "@/lib/honours/honours";
import { Podium } from "./podium";
import { RankedList } from "./ranked-list";

export function SectionCard({ section, query = "" }: { section: SectionHonours; query?: string }) {
  // Always the section's real standing — never narrowed by `query`, so a
  // search that happens to match only unranked students cannot make a fully
  // ranked section claim nobody can be placed.
  const ranked = section.students.filter((s) => s.position !== null).length;
  return (
    <section
      className="border-line bg-surface rounded-[10px] border p-4 sm:p-5"
      aria-labelledby={`honours-${section.sectionId}`}
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id={`honours-${section.sectionId}`}
          className="font-display text-lg font-semibold tracking-[-0.015em]"
        >
          {section.gradeName} {section.sectionName}
        </h2>
        <p className="text-ink-3 text-[12.5px]">
          {ranked} of {section.students.length} ranked
          {section.classTeacher ? ` · ${section.classTeacher}` : ""}
        </p>
      </header>

      {section.students.length === 0 ? (
        <p className="text-ink-3 text-sm">Nobody is enrolled here.</p>
      ) : ranked === 0 ? (
        <p className="text-ink-3 mb-3 text-sm">
          No published exam covers this section yet, so nobody can be placed.
        </p>
      ) : (
        <div className="mx-auto mb-5 max-w-md">
          <Podium students={section.students} />
        </div>
      )}

      {section.students.length > 0 ? (
        <RankedList students={section.students} query={query} />
      ) : null}
    </section>
  );
}
