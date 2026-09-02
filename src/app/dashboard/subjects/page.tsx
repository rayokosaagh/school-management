import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listGrades } from "@/lib/registry/structure";
import { listOfferings, listSubjects } from "@/lib/registry/subjects";
import { SubjectsWorkspace } from "./_components/subjects-workspace";
import type { OfferingRow, SubjectRow } from "./_components/subjects-view";

import { requirePage } from "@/lib/auth/guard";

export default async function SubjectsPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/subjects");

  const [subjects, grades, currentYear] = await Promise.all([
    listSubjects(),
    listGrades(),
    getCurrentAcademicYear(),
  ]);

  const offerings = currentYear ? await listOfferings(currentYear.id) : [];

  // Which grades each subject reaches, in grade order, for the list's summary.
  const gradesBySubject = new Map<number, string[]>();
  for (const offering of offerings) {
    const list = gradesBySubject.get(offering.subject.id) ?? [];
    list.push(offering.grade.name);
    gradesBySubject.set(offering.subject.id, list);
  }

  const subjectRows: SubjectRow[] = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    offerings: s._count.offerings,
    gradeNames: gradesBySubject.get(s.id) ?? [],
  }));

  const offeringRows: OfferingRow[] = offerings.map((o) => ({
    id: o.id,
    subjectName: o.subject.name,
    gradeName: o.grade.name,
    gradeOrder: o.grade.order,
    hasPractical: o.hasPractical,
    fullMarksTheory: o.fullMarksTheory,
    passMarksTheory: o.passMarksTheory,
    fullMarksPractical: o.fullMarksPractical,
    passMarksPractical: o.passMarksPractical,
    assignments: o._count.assignments,
  }));

  return (
    <SubjectsWorkspace
      subjects={subjectRows}
      offerings={offeringRows}
      grades={grades.map((g) => ({ id: g.id, name: g.name }))}
      academicYearId={currentYear?.id ?? null}
      yearLabel={currentYear?.nameBS ?? "no year set"}
    />
  );
}
