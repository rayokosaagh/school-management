import { formatBs } from "@/lib/date/bs";
import {
  getCurrentAcademicYear,
  listAcademicYears,
} from "@/lib/registry/academic-year";
import { listGradesWithSections } from "@/lib/registry/structure";
import { listActiveStaffForSelect } from "@/lib/registry/staff";
import { listExamTerms } from "@/lib/assessment/exams";
import { ClassesWorkspace } from "./_components/classes-workspace";
import type {
  GradeRow,
  SectionRow,
  YearRow,
} from "./_components/classes-view";

import { requirePage } from "@/lib/auth/guard";

export default async function ClassesPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/classes");

  const [years, currentYear] = await Promise.all([
    listAcademicYears(),
    getCurrentAcademicYear(),
  ]);

  const [grades, activeStaff, exams] = await Promise.all([
    currentYear ? listGradesWithSections(currentYear.id) : [],
    listActiveStaffForSelect(),
    currentYear ? listExamTerms(currentYear.id) : [],
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
    <ClassesWorkspace
      years={yearRows}
      grades={gradeRows}
      sections={sectionRows}
      staff={activeStaff}
      exams={exams.map((e) => ({ id: e.id, name: e.name }))}
      academicYearId={currentYear?.id ?? null}
      yearLabel={currentYear?.nameBS ?? "no year set"}
    />
  );
}
