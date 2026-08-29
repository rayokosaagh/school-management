import { BookOpen, CalendarRange, Info, Layers } from "lucide-react";
import { Callout, PageHeader } from "@/components/ui/page-shell";
import { AddPanel } from "@/components/ui/add-panel";
import { formatBs } from "@/lib/date/bs";
import {
  getCurrentAcademicYear,
  listAcademicYears,
} from "@/lib/registry/academic-year";
import { listGradesWithSections } from "@/lib/registry/structure";
import { listActiveStaffForSelect } from "@/lib/registry/staff";
import { AddGradeForm, AddSectionForm, AddYearForm } from "./_components/classes-forms";
import { ClassStructure } from "./_components/class-structure";
import {
  GradesView,
  YearsView,
  type GradeRow,
  type SectionRow,
  type YearRow,
} from "./_components/classes-view";

import { requirePage } from "@/lib/auth/guard";

export default async function ClassesPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/classes");

  const [years, currentYear] = await Promise.all([
    listAcademicYears(),
    getCurrentAcademicYear(),
  ]);

  const [grades, activeStaff] = await Promise.all([
    currentYear ? listGradesWithSections(currentYear.id) : [],
    listActiveStaffForSelect(),
  ]);

  const yearRows: YearRow[] = years.map((y) => ({
    id: y.id,
    nameBS: y.nameBS,
    span: `${formatBs(y.startsOn, "YYYY-MM-DD")} → ${formatBs(y.endsOn, "YYYY-MM-DD")}`,
    isCurrent: y.isCurrent,
  }));

  const gradeRows: GradeRow[] = grades.map((g) => ({
    id: g.id,
    name: g.name,
    order: g.order,
    sectionCount: g.sections.length,
    studentCount: g.sections.reduce((sum, s) => sum + s._count.enrollments, 0),
  }));

  const sectionRows: SectionRow[] = grades.flatMap((g) =>
    g.sections.map((s) => ({
      id: s.id,
      name: s.name,
      gradeId: g.id,
      gradeName: g.name,
      classTeacher: s.classTeacher?.fullName ?? null,
      classTeacherId: s.classTeacherId,
      students: s._count.enrollments,
    })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        icon={BookOpen}
        tint="blue"
        title="Classes"
        meta={
          currentYear
            ? [
                `Academic year ${currentYear.nameBS}`,
                `${formatBs(currentYear.startsOn)} to ${formatBs(currentYear.endsOn)}`,
              ]
            : ["No academic year set yet"]
        }
      />

      {!currentYear && years.length > 0 ? (
        <Callout icon={Info} tint="amber">
          No year is marked current, so Students, Subjects, Teaching and Attendance
          have nothing to work against. Open a year below and choose{" "}
          <span className="font-medium">Make current</span>.
        </Callout>
      ) : null}

      <AddPanel
        icon={CalendarRange}
        tint="violet"
        title="Add an academic year"
        description="Enter the Bikram Sambat year; Baisakh 1 to the last day of Chaitra is worked out for you."
        cta="New year"
      >
        <AddYearForm />
      </AddPanel>

      <YearsView rows={yearRows} />

      {/* Grades and sections are one structure, so they are added from one
          panel rather than two stacked cards. */}
      <AddPanel
        icon={Layers}
        tint="green"
        title="Add a grade or section"
        description="A grade is school-wide; its sections belong to one year."
        cta="Add"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium">New grade</p>
            <AddGradeForm />
            <p className="text-muted-foreground text-xs">
              Order drives sorting and year-end promotion.
            </p>
          </div>
          <div className="space-y-3 lg:border-l lg:pl-6">
            <p className="text-sm font-medium">
              New section{currentYear ? ` in ${currentYear.nameBS}` : ""}
            </p>
            {!currentYear ? (
              <Callout icon={Info} tint="amber">
                Mark a year current before adding sections.
              </Callout>
            ) : gradeRows.length > 0 ? (
              <AddSectionForm grades={gradeRows} academicYearId={currentYear.id} />
            ) : (
              <Callout icon={Info} tint="amber">
                Add a grade before adding sections.
              </Callout>
            )}
          </div>
        </div>
      </AddPanel>

      {currentYear ? (
        <>
          <ClassStructure
            grades={gradeRows}
            sections={sectionRows}
            staff={activeStaff}
            yearName={currentYear.nameBS}
          />
        </>
      ) : (
        <GradesView rows={gradeRows} />
      )}
    </div>
  );
}
