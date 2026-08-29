import { GraduationCap, Info, UserPlus } from "lucide-react";
import { Callout, PageHeader } from "@/components/ui/page-shell";
import { AddPanel } from "@/components/ui/add-panel";
import { formatBs, toBsInput } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listSections } from "@/lib/registry/structure";
import {
  listEnrolledStudents,
  suggestAdmissionNo,
} from "@/lib/registry/students";
import { AddStudentForm } from "./_components/student-form";
import type { StudentRow } from "./_components/students-view";
import { StudentsBySection } from "./_components/students-by-section";

import { requirePage } from "@/lib/auth/guard";

export default async function StudentsPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/students");

  const currentYear = await getCurrentAcademicYear();

  if (!currentYear) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader icon={GraduationCap} tint="violet" title="Students" />
        <Callout icon={Info} tint="amber">
          Set a current academic year on the Classes page first — enrollments
          belong to a year.
        </Callout>
      </div>
    );
  }

  const [sections, enrollments, suggestedAdmissionNo] = await Promise.all([
    listSections(currentYear.id),
    listEnrolledStudents({ academicYearId: currentYear.id }),
    suggestAdmissionNo(),
  ]);

  // Dates are converted server-side so the client never re-derives them.
  const rows: StudentRow[] = enrollments.map((e) => {
    const primary = e.student.guardians.find((g) => g.isPrimary) ?? e.student.guardians[0];
    return {
      studentId: e.student.id,
      admissionNo: e.student.admissionNo,
      firstName: e.student.firstName,
      middleName: e.student.middleName,
      lastName: e.student.lastName,
      fullName: e.student.fullName,
      photoId: e.student.photoId,
      fullNameNp: e.student.fullNameNp,
      address: e.student.address,
      gender: e.student.gender,
      status: e.student.status,
      dobBs: toBsInput(e.student.dob),
      admittedOnBs: toBsInput(e.student.admittedOn),
      sectionId: e.sectionId,
      guardians: e.student.guardians.map((g) => ({
        id: g.id,
        relation: g.relation,
        fullName: g.fullName,
        phone: g.phone,
        occupation: g.occupation,
        isPrimary: g.isPrimary,
      })),
      rollNo: e.rollNo,
      gradeName: e.section.grade.name,
      sectionLabel: `${e.section.grade.name} ${e.section.name}`,
      dobLabel: formatBs(e.student.dob, "YYYY-MM-DD"),
      guardianLabel: primary ? `${primary.fullName} ${primary.phone}` : "",
    };
  });

  const active = rows.filter((r) => r.status === "ACTIVE").length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        icon={GraduationCap}
        tint="violet"
        title="Students"
        meta={[`${rows.length} enrolled in ${currentYear.nameBS}`, `${active} active`]}
      />

      {sections.length === 0 ? (
        <Callout icon={Info} tint="amber">
          Add a grade and a section on the Classes page before admitting students.
        </Callout>
      ) : (
        <AddPanel
          icon={UserPlus}
          tint="green"
          title="Admit a student"
          description="Dates are entered in Bikram Sambat and stored as Gregorian."
          cta="New student"
        >
          <AddStudentForm
            sections={sections}
            academicYearId={currentYear.id}
            suggestedAdmissionNo={suggestedAdmissionNo}
          />
        </AddPanel>
      )}

      <StudentsBySection rows={rows} sections={sections} academicYearId={currentYear.id} />
    </div>
  );
}
