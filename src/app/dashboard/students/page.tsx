import { Info } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
import { allowedSectionIds, requirePage } from "@/lib/auth/guard";
import { formatBs, toBsInput } from "@/lib/date/bs";
import { recentStudentStrips } from "@/lib/attendance/attendance";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listSections } from "@/lib/registry/structure";
import { getStudentSummary, listEnrolledStudents, suggestAdmissionNo } from "@/lib/registry/students";
import { StudentsWorkspace, type StudentRow } from "./_components/students-workspace";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ student?: string; denied?: string }> }) {
  // Redirects unless the stored permission matrix allows this section.
  const actor = await requirePage("/dashboard/students");

  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    return (
      <PageFrame eyebrow="People" title="Students">
        <EmptyState
          icon={Info}
          title="No current academic year"
          description="Enrolments belong to a year. Set the current year on the Classes page first."
          action={<Button nativeButton={false} render={<Link href="/dashboard/classes" />}>Go to Classes</Button>}
        />
      </PageFrame>
    );
  }

  const { student, denied } = await searchParams;
  const selectedId = student && /^\d+$/.test(student) ? Number(student) : null;
  const now = new Date();

  const [sections, enrollments, suggested, strips, summary, allowed] = await Promise.all([
    listSections(currentYear.id),
    listEnrolledStudents({ academicYearId: currentYear.id }),
    suggestAdmissionNo(),
    recentStudentStrips(currentYear.id, now, 14),
    selectedId == null ? Promise.resolve(null) : getStudentSummary(selectedId, currentYear.id, now),
    selectedId == null ? Promise.resolve<number[] | "all">("all") : allowedSectionIds(actor),
  ]);

  // An id that names nobody — unknown, just deleted, or not enrolled in the
  // current year — would open a pane with no row behind it, since the table
  // lists this year's enrolments. Clear the query string instead, which is
  // also what a delete leaves behind. The list itself is not scoped: only the
  // pane is, and a row outside this actor's sections says so rather than
  // clearing silently, so the click does not read as a dead row.
  if (selectedId != null) {
    const enrollment = summary?.enrollment ?? null;
    if (summary == null || enrollment == null) redirect("/dashboard/students");
    const inScope = allowed === "all" || allowed.includes(enrollment.sectionId);
    if (!inScope) redirect("/dashboard/students?denied=1");
  }

  const empty14: StudentRow["strip"] = Array.from({ length: 14 }, () => "none");

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
        id: g.id, relation: g.relation, fullName: g.fullName, phone: g.phone, occupation: g.occupation, isPrimary: g.isPrimary,
      })),
      rollNo: e.rollNo,
      sectionLabel: `${e.section.grade.name} ${e.section.name}`,
      dobLabel: formatBs(e.student.dob, "YYYY-MM-DD"),
      guardianLabel: primary ? `${primary.fullName} ${primary.phone}` : "",
      strip: strips.get(e.student.id) ?? empty14,
    };
  });

  return (
    <StudentsWorkspace
      rows={rows}
      sections={sections}
      academicYearId={currentYear.id}
      yearLabel={currentYear.nameBS}
      suggestedAdmissionNo={suggested}
      selectedId={selectedId}
      summary={summary}
      notice={denied ? "You can only open students in your own sections." : null}
    />
  );
}
