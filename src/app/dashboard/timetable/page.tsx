import { CalendarRange } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePage } from "@/lib/auth/guard";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listSectionsWithAssignmentCounts } from "@/lib/registry/assignments";
import { listActiveStaffForSelect } from "@/lib/registry/staff";
import {
  countLessonsByPeriod,
  getWorkingDays,
  listBellPeriods,
} from "@/lib/timetable/bell";
import {
  countFilledBySection,
  getSectionGrid,
  listBookings,
} from "@/lib/timetable/grid";
import { getTeacherWeek, listTeacherClashes } from "@/lib/timetable/teacher-week";
import { TimetableWorkspace } from "./_components/timetable-workspace";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; teacher?: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/timetable");

  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No academic year is current"
        description="Set one on the Classes page before building a timetable."
      />
    );
  }

  const [sections, staff, bell, workingDays, filled, clashes, lessonsByPeriod] =
    await Promise.all([
      listSectionsWithAssignmentCounts(currentYear.id),
      listActiveStaffForSelect(),
      listBellPeriods(),
      getWorkingDays(),
      countFilledBySection(currentYear.id),
      listTeacherClashes(currentYear.id),
      countLessonsByPeriod(),
    ]);

  // The selected section comes from the URL, so the grid below is server
  // rendered and a deep link opens the class it names.
  const { section: sectionParam, teacher: teacherParam } = await searchParams;
  const asked = Number(sectionParam);
  const selectedId =
    sections.find((s) => s.id === asked)?.id ?? sections[0]?.id ?? null;

  const askedTeacher = Number(teacherParam);

  const [grid, teacherWeek, bookings] = await Promise.all([
    selectedId === null ? null : getSectionGrid(selectedId),
    Number.isInteger(askedTeacher)
      ? getTeacherWeek(askedTeacher, currentYear.id)
      : [],
    listBookings(currentYear.id, selectedId),
  ]);

  return (
    <TimetableWorkspace
      yearLabel={currentYear.nameBS}
      bell={bell}
      workingDays={workingDays}
      sections={sections.map((s) => ({
        id: s.id,
        name: s.name,
        gradeName: s.grade.name,
        filled: filled.get(s.id) ?? 0,
      }))}
      selectedId={selectedId}
      grid={grid}
      clashes={clashes}
      teachers={staff}
      selectedTeacherId={Number.isInteger(askedTeacher) ? askedTeacher : null}
      teacherWeek={teacherWeek}
      bookings={bookings}
      lessonsByPeriod={Object.fromEntries(lessonsByPeriod)}
    />
  );
}
