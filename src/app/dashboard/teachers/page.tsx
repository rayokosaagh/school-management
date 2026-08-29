import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-shell";
import { AddPanel } from "@/components/ui/add-panel";
import { formatBs, toBsInput } from "@/lib/date/bs";
import { listActiveStaffForSelect, listStaff } from "@/lib/registry/staff";
import { AddStaffForm } from "./_components/teachers-forms";
import type { StaffRow } from "./_components/teachers-view";
import { StaffByRole } from "./_components/staff-by-role";

import { requirePage } from "@/lib/auth/guard";

export default async function TeachersPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/teachers");

  const [staff, activeStaff] = await Promise.all([
    listStaff(),
    listActiveStaffForSelect(),
  ]);

  const rows: StaffRow[] = staff.map((person) => ({
    id: person.id,
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
    fullName: person.fullName,
    photoId: person.photoId,
    fullNameNp: person.fullNameNp,
    phone: person.phone,
    designation: person.designation,
    joinedOnBs: toBsInput(person.joinedOn),
    joinedLabel: formatBs(person.joinedOn, "YYYY-MM-DD"),
    isActive: person.isActive,
    sectionsLed: person._count.sectionsLed,
    assignments: person._count.assignments,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        icon={Users}
        tint="blue"
        title="Staff"
        meta={[`${rows.length} on record`, `${activeStaff.length} active`]}
      />

      <AddPanel
        icon={UserPlus}
        tint="green"
        title="Add staff"
        description="The Nepali name is optional here, but printed documents use it."
        cta="New staff"
      >
        <AddStaffForm />
      </AddPanel>

      <StaffByRole rows={rows} />

      {/* Class teachers belong to their section, so they are set on the Classes
          page rather than duplicated here. */}
      <p className="text-muted-foreground text-sm">
        Class teachers are set on the{" "}
        <Link href="/dashboard/classes" className="font-medium underline">
          Classes page
        </Link>
        , beside the section they lead.
      </p>
    </div>
  );
}
