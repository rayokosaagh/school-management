import { BookOpen, GraduationCap, Info, Library } from "lucide-react";
import { Callout, PageHeader } from "@/components/ui/page-shell";
import { AddPanel } from "@/components/ui/add-panel";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listGrades } from "@/lib/registry/structure";
import { listOfferings, listSubjects } from "@/lib/registry/subjects";
import { AddOfferingForm, AddSubjectForm } from "./_components/subjects-forms";
import {
  SubjectsView,
  type OfferingRow,
  type SubjectRow,
} from "./_components/subjects-view";
import { SubjectsWorkspace } from "./_components/subjects-workspace";

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
    code: s.code,
    offerings: s._count.offerings,
    gradeNames: gradesBySubject.get(s.id) ?? [],
  }));

  const offeringRows: OfferingRow[] = offerings.map((o) => ({
    id: o.id,
    subjectName: o.subject.name,
    subjectCode: o.subject.code,
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
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        icon={BookOpen}
        tint="violet"
        title="Subjects"
        meta={[
          `${subjects.length} subject${subjects.length === 1 ? "" : "s"}`,
          currentYear
            ? `${offerings.length} grade subject${offerings.length === 1 ? "" : "s"} in ${currentYear.nameBS}`
            : "no academic year set",
        ]}
      />

      <SubjectsWorkspace
        yearName={currentYear?.nameBS ?? ""}
        offerings={offeringRows}
        subjectsTab={
          <>
            <AddPanel
              icon={Library}
              tint="blue"
              title="Add a subject"
              description="School-wide and reused across grades and years. The mark scheme is set per grade below, not here."
              cta="New subject"
            >
              <AddSubjectForm />
            </AddPanel>

            <SubjectsView rows={subjectRows} />
          </>
        }
        addOffering={
          !currentYear ? (
            <Callout icon={Info} tint="amber">
              Set a current academic year on the Classes page to build the curriculum.
            </Callout>
          ) : subjects.length === 0 || grades.length === 0 ? (
            <Callout icon={Info} tint="amber">
              Add at least one subject and one grade on the Classes page before
              building the curriculum.
            </Callout>
          ) : (
            <AddPanel
              icon={GraduationCap}
              tint="green"
              title="Add a subject to a grade"
              description="One subject, one grade, one year — carrying the full and pass marks that marksheets will use."
              cta="Add to a grade"
            >
              <AddOfferingForm
                subjects={subjects}
                grades={grades}
                academicYearId={currentYear.id}
              />
            </AddPanel>
          )
        }
      />
    </div>
  );
}
