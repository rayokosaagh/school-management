import Link from "next/link";
import { ClipboardList, Info, LayoutGrid, Users } from "lucide-react";
import { Callout, PageHeader, SectionCard } from "@/components/ui/page-shell";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import {
  getSectionTeachingPlan,
  listSectionsWithAssignmentCounts,
  listTeachingLoad,
} from "@/lib/registry/assignments";
import { listActiveStaffForSelect } from "@/lib/registry/staff";
import { SubjectTeacherRow } from "./_components/assignment-forms";

import { requirePage } from "@/lib/auth/guard";

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/assignments");

  const params = await searchParams;
  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader icon={ClipboardList} tint="amber" title="Teaching" />
        <Callout icon={Info} tint="amber">
          Set a current academic year on the Classes page first.
        </Callout>
      </div>
    );
  }

  const [sections, staff, load] = await Promise.all([
    listSectionsWithAssignmentCounts(currentYear.id),
    listActiveStaffForSelect(),
    listTeachingLoad(currentYear.id),
  ]);

  // Default to the first section so the page is never an empty chooser.
  const requested = Number(params.section);
  const selectedId =
    sections.find((s) => s.id === requested)?.id ?? sections[0]?.id ?? null;
  const plan = selectedId ? await getSectionTeachingPlan(selectedId) : null;

  // Teaching load is shown per teacher, which is how workload gets argued about.
  const byTeacher = new Map<number, { name: string; items: string[] }>();
  for (const row of load) {
    const entry = byTeacher.get(row.staff.id) ?? {
      name: row.staff.fullName,
      items: [],
    };
    entry.items.push(
      `${row.section.grade.name} ${row.section.name} · ${row.subjectOffering.subject.name}`,
    );
    byTeacher.set(row.staff.id, entry);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        icon={ClipboardList}
        tint="amber"
        title="Teaching"
        meta={[
          `Who teaches what in ${currentYear.nameBS}`,
          `${load.length} assignment${load.length === 1 ? "" : "s"}`,
        ]}
      />

      {sections.length === 0 ? (
        <Callout icon={Info} tint="amber">
          Add a section on the Classes page first.
        </Callout>
      ) : (
        <>
          <SectionCard
            icon={LayoutGrid}
            tint="blue"
            title="Sections"
            description="Pick a section to set its subject teachers."
          >
              <div className="flex flex-wrap gap-2">
                {sections.map((section) => (
                  <Link
                    key={section.id}
                    href={`/dashboard/assignments?section=${section.id}`}
                    className={
                      section.id === selectedId
                        ? "bg-primary text-primary-foreground rounded-lg px-2.5 py-1.5 text-sm font-medium"
                        : "border-input hover:bg-muted rounded-lg border px-2.5 py-1.5 text-sm"
                    }
                  >
                    {section.grade.name} {section.name}
                    <span className="opacity-70">
                      {" "}
                      · {section._count.assignments}
                    </span>
                  </Link>
                ))}
              </div>
          </SectionCard>

          {plan ? (
            <SectionCard
              icon={Users}
              tint="green"
              title={`${plan.section.grade.name} ${plan.section.name}`}
              description={
                plan.section.classTeacher
                  ? `Class teacher: ${plan.section.classTeacher.fullName}`
                  : "No class teacher set."
              }
            >
                {plan.rows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No subjects are offered to {plan.section.grade.name} this
                    year. Add offerings on the Subjects page.
                  </p>
                ) : staff.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Add active staff on the Teachers page before assigning.
                  </p>
                ) : (
                  <div className="divide-y">
                    {plan.rows.map(({ offering, assigned }) => (
                      <SubjectTeacherRow
                        key={offering.id}
                        sectionId={plan.section.id}
                        offering={{
                          id: offering.id,
                          subjectName: offering.subject.name,
                          subjectCode: offering.subject.code,
                          hasPractical: offering.hasPractical,
                        }}
                        assignedId={assigned?.id ?? null}
                        staff={staff}
                      />
                    ))}
                  </div>
                )}
            </SectionCard>
          ) : null}

          <SectionCard
            icon={ClipboardList}
            tint="violet"
            title="Load per teacher"
            description="What each teacher will see when marks entry arrives."
          >
              {byTeacher.size === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing assigned yet.
                </p>
              ) : (
                <div className="divide-y">
                  {/* Keyed by staff id, not name: two people can share a name,
                      and one of them is not a duplicate of the other. */}
                  {[...byTeacher.entries()].map(([staffId, teacher]) => (
                    <div key={staffId} className="py-2">
                      <p className="text-sm font-medium">
                        {teacher.name}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · {teacher.items.length} subject
                          {teacher.items.length === 1 ? "" : "s"}
                        </span>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {teacher.items.join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
