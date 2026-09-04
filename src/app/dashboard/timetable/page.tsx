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
import { listDayShapes } from "@/lib/timetable/day-shapes";
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
  searchParams: Promise<{ section?: string; teacher?: string; shape?: string }>;
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

  // The School day editor works on one shape at a time (see day-shapes.ts).
  // Which one comes from the URL, same as ?section= and ?teacher= below, and
  // falls back to the default shape when nothing — or something stale — is
  // named there.
  const shapes = await listDayShapes();
  const defaultShape = shapes.find((s) => s.isDefault);
  if (!defaultShape) {
    // listDayShapes() already throws if this invariant breaks; this is here
    // only so the type checker knows defaultShape.id below is safe.
    throw new Error("No default day shape is configured.");
  }

  const {
    section: sectionParam,
    teacher: teacherParam,
    shape: shapeParam,
  } = await searchParams;

  const askedShape = Number(shapeParam);
  const selectedShapeId =
    shapes.find((s) => s.id === askedShape)?.id ?? defaultShape.id;

  const [sections, staff, bell, workingDays, filled, clashes, lessonsByPeriod] =
    await Promise.all([
      listSectionsWithAssignmentCounts(currentYear.id),
      listActiveStaffForSelect(),
      listBellPeriods(selectedShapeId),
      getWorkingDays(),
      countFilledBySection(currentYear.id),
      listTeacherClashes(currentYear.id),
      countLessonsByPeriod(),
    ]);

  // The selected section comes from the URL, so the grid below is server
  // rendered and a deep link opens the class it names.
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
      academicYearId={currentYear.id}
      dayShapeId={selectedShapeId}
      shapes={shapes}
      bell={bell}
      workingDays={workingDays}
      sections={sections.map((s) => ({
        id: s.id,
        name: s.name,
        gradeName: s.grade.name,
        filled: filled.get(s.id) ?? 0,
      }))}
      selectedId={selectedId}
      // Client components cannot receive a Map as a prop straight from a
      // server component (see lessonsByPeriod below, the existing instance
      // of the same rule), so periodsByDay crosses the boundary as a Record.
      grid={grid ? { ...grid, periodsByDay: Object.fromEntries(grid.periodsByDay) } : null}
      clashes={clashes}
      teachers={staff}
      selectedTeacherId={Number.isInteger(askedTeacher) ? askedTeacher : null}
      teacherWeek={teacherWeek}
      bookings={bookings}
      lessonsByPeriod={Object.fromEntries(lessonsByPeriod)}
    />
  );
}
