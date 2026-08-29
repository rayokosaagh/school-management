import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { toBsInput } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { getStaffSummary, listStaff } from "@/lib/registry/staff";
import { StaffWorkspace } from "./_components/staff-workspace";
import type { StaffRow } from "./_components/staff-detail";

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/teachers");

  const { staff } = await searchParams;
  const selectedId = staff && /^\d+$/.test(staff) ? Number(staff) : null;

  const [people, currentYear] = await Promise.all([listStaff(), getCurrentAcademicYear()]);
  const summary = selectedId == null ? null : await getStaffSummary(selectedId, currentYear?.id ?? -1);

  // An id that names nobody — unknown or just deleted — would open a pane with
  // no row behind it. Clear the query string instead, which is also what a
  // delete leaves behind.
  if (selectedId != null && summary == null) redirect("/dashboard/teachers");

  // Dates are converted server-side so the client never re-derives them.
  const rows: StaffRow[] = people.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    fullName: p.fullName,
    fullNameNp: p.fullNameNp,
    photoId: p.photoId,
    phone: p.phone,
    designation: p.designation,
    joinedOnBs: toBsInput(p.joinedOn),
    isActive: p.isActive,
    sectionsLed: p._count.sectionsLed,
    assignments: p._count.assignments,
  }));

  return <StaffWorkspace rows={rows} selectedId={selectedId} summary={summary} />;
}
