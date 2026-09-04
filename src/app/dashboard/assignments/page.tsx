import { listOfferings } from "@/lib/registry/subjects";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import {
  listSectionsWithAssignmentCounts,
  listTeachingLoad,
} from "@/lib/registry/assignments";
import { listActiveStaffForSelect } from "@/lib/registry/staff";
import { subjectTones } from "@/lib/timetable/grid";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardList } from "lucide-react";
import {
  TeachingWorkspace,
  type TeachingRow,
} from "./_components/teaching-workspace";

import { requirePage } from "@/lib/auth/guard";

export default async function AssignmentsPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/assignments");

  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    return (
      <EmptyState
        icon={ClipboardList}
        tint="green"
        title="No academic year is current"
        description="Set one on the Classes page before assigning teachers."
      />
    );
  }

  const [sections, staff, offerings, load, tones] = await Promise.all([
    listSectionsWithAssignmentCounts(currentYear.id),
    listActiveStaffForSelect(),
    listOfferings(currentYear.id),
    listTeachingLoad(currentYear.id),
    // Same tone lookup the timetable grid uses, so a subject carries the
    // same colour here as it does on the Classes timetable.
    subjectTones(),
  ]);

  // Every section teaches its grade's offerings, so the slots are the product
  // of the two. Loading them all lets the tabs switch without a round trip.
  const assigned = new Map<string, number>();
  for (const row of load) {
    assigned.set(`${row.sectionId}:${row.subjectOfferingId}`, row.staff.id);
  }

  const rows: TeachingRow[] = sections.flatMap((section) =>
    offerings
      .filter((o) => o.gradeId === section.gradeId)
      .map((o) => ({
        sectionId: section.id,
        offeringId: o.id,
        sectionLabel: `${section.grade.name} ${section.name}`,
        subjectName: o.subject.name,
        tone: tones.get(o.subjectId) ?? 0,
        hasPractical: o.hasPractical,
        staffId: assigned.get(`${section.id}:${o.id}`) ?? null,
      })),
  );

  return (
    <TeachingWorkspace
      rows={rows}
      sections={sections.map((s) => ({
        id: s.id,
        name: s.name,
        grade: { name: s.grade.name },
        classTeacher: s.classTeacher?.fullName ?? null,
      }))}
      staff={staff}
      yearLabel={currentYear.nameBS}
    />
  );
}
