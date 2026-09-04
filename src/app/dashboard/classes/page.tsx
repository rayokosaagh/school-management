import { redirect } from "next/navigation";
import { formatAd } from "@/lib/date/bs";
import { currentActor } from "@/lib/auth/guard";
import { granted, loadGrants } from "@/lib/auth/permissions";
import { canOpenTimetableView, timetableViewIsEditable } from "@/lib/auth/roles";
import {
  getCurrentAcademicYear,
  listAcademicYears,
} from "@/lib/registry/academic-year";
import { listGradesWithSections } from "@/lib/registry/structure";
import { listActiveStaffForSelect } from "@/lib/registry/staff";
import { listExamTerms } from "@/lib/assessment/exams";
import { listSectionsWithAssignmentCounts } from "@/lib/registry/assignments";
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
import { ClassesWorkspace, type TimetableSlot } from "./_components/classes-workspace";
import type {
  GradeRow,
  SectionRow,
  YearRow,
} from "./_components/classes-view";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    section?: string;
    teacher?: string;
    shape?: string;
  }>;
}) {
  // Structure and Years stay behind manage:registry, same as before. The
  // Timetable view is guarded on its own — manage:timetable for the full
  // grid, or a teacher's own read-only week — so it must not require
  // manage:registry, and Structure/Years must not require manage:timetable.
  // See roles.ts's canOpenTimetableView and the note on manage:timetable.
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const grants = await loadGrants();
  const canRegistry = granted(grants, actor.role, "manage:registry");
  const hasManageTimetable = granted(grants, actor.role, "manage:timetable");
  const isTeacherWithStaff = actor.role === "TEACHER" && actor.staffId !== null;
  const canTimetable = canOpenTimetableView(hasManageTimetable, isTeacherWithStaff);
  const timetableEditable = timetableViewIsEditable(hasManageTimetable);

  if (!canRegistry && !canTimetable) redirect("/dashboard?denied=1");

  const { view: viewParam, section: sectionParam, teacher: teacherParam, shape: shapeParam } =
    await searchParams;

  // The URL owns the view, the same as ?student= does on Students. A tab this
  // actor cannot use is never an error — it falls back to one they can,
  // rather than showing "denied" for what is just a hidden tab.
  const requested = viewParam === "years" ? "years" : viewParam === "timetable" ? "timetable" : "structure";
  let view: "structure" | "years" | "timetable";
  if (requested === "timetable" && canTimetable) view = "timetable";
  else if (requested === "years" && canRegistry) view = "years";
  else if (canRegistry) view = "structure";
  else view = "timetable"; // canTimetable must be true — the guard above already ensured some view exists

  const [years, currentYear] = await Promise.all([
    canRegistry ? listAcademicYears() : [],
    getCurrentAcademicYear(),
  ]);

  const [grades, activeStaff, exams] = await Promise.all([
    canRegistry && currentYear ? listGradesWithSections(currentYear.id) : [],
    canRegistry ? listActiveStaffForSelect() : [],
    canRegistry && currentYear ? listExamTerms(currentYear.id) : [],
  ]);

  const yearRows: YearRow[] = years.map((y) => ({
    id: y.id,
    nameBS: y.nameBS,
    span: `${formatAd(y.startsOn)} → ${formatAd(y.endsOn)}`,
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

  // Reads a good deal — the whole year's grid, clashes across every teacher —
  // so, like getHonours() on Students, it only runs for the view that needs
  // it rather than on every Classes page load.
  let timetable: TimetableSlot = { state: "unavailable" };
  if (canTimetable) {
    if (!currentYear) {
      timetable = { state: "no-year" };
    } else if (timetableEditable) {
      // The School day editor works on one shape at a time (see
      // day-shapes.ts). Which one comes from the URL, same as ?section= and
      // ?teacher= below, and falls back to the default shape when nothing —
      // or something stale — is named there.
      const shapes = await listDayShapes();
      const defaultShape = shapes.find((s) => s.isDefault);
      if (!defaultShape) {
        // listDayShapes() already throws if this invariant breaks; this is
        // here only so the type checker knows defaultShape.id below is safe.
        throw new Error("No default day shape is configured.");
      }

      const askedShape = Number(shapeParam);
      const selectedShapeId = shapes.find((s) => s.id === askedShape)?.id ?? defaultShape.id;

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
      const selectedId = sections.find((s) => s.id === asked)?.id ?? sections[0]?.id ?? null;

      const askedTeacher = Number(teacherParam);

      const [grid, teacherWeek, bookings] = await Promise.all([
        selectedId === null ? null : getSectionGrid(selectedId),
        Number.isInteger(askedTeacher) ? getTeacherWeek(askedTeacher, currentYear.id) : [],
        listBookings(currentYear.id, selectedId),
      ]);

      timetable = {
        state: "edit",
        yearLabel: currentYear.nameBS,
        academicYearId: currentYear.id,
        dayShapeId: selectedShapeId,
        shapes,
        bell,
        workingDays,
        sections: sections.map((s) => ({
          id: s.id,
          name: s.name,
          gradeName: s.grade.name,
          filled: filled.get(s.id) ?? 0,
        })),
        selectedId,
        // Client components cannot receive a Map as a prop straight from a
        // server component (see lessonsByPeriod below, the existing instance
        // of the same rule), so periodsByDay crosses the boundary as a Record.
        grid: grid ? { ...grid, periodsByDay: Object.fromEntries(grid.periodsByDay) } : null,
        clashes,
        teachers: staff,
        selectedTeacherId: Number.isInteger(askedTeacher) ? askedTeacher : null,
        teacherWeek,
        bookings,
        lessonsByPeriod: Object.fromEntries(lessonsByPeriod),
      };
    } else {
      // Read-only: just the signed-in teacher's own week, built from the
      // default shape's periods. No shape switching for a view with nothing
      // to switch — the admin grid is the only place that matters, and this
      // teacher cannot open it.
      const shapes = await listDayShapes();
      const defaultShape = shapes.find((s) => s.isDefault);
      if (!defaultShape) {
        throw new Error("No default day shape is configured.");
      }

      const [bell, workingDays, teacherWeek] = await Promise.all([
        listBellPeriods(defaultShape.id),
        getWorkingDays(),
        getTeacherWeek(actor.staffId!, currentYear.id),
      ]);

      timetable = { state: "readonly", bell, workingDays, teacherWeek };
    }
  }

  return (
    <ClassesWorkspace
      view={view}
      showStructure={canRegistry}
      showTimetable={canTimetable}
      years={yearRows}
      grades={gradeRows}
      sections={sectionRows}
      staff={activeStaff}
      exams={exams.map((e) => ({ id: e.id, name: e.name }))}
      academicYearId={currentYear?.id ?? null}
      yearLabel={currentYear?.nameBS ?? "no year set"}
      timetable={timetable}
    />
  );
}
