import type { Role } from "@/generated/prisma/enums";

// What each role may do, in one place. Everything else — navigation, page
// guards, action guards — reads from here rather than re-deciding.

export type Capability =
  /// School details, logins, roles.
  | "manage:settings"
  /// Students, staff, grades, sections, subjects, offerings, teaching.
  | "manage:registry"
  /// Build the weekly class timetable and set the school day.
  | "manage:timetable"
  /// Create and publish exams.
  | "manage:exams"
  /// Enter marks. Teachers are additionally limited to their own subjects.
  | "enter:marks"
  /// Take attendance. Teachers are additionally limited to their own sections.
  | "take:attendance"
  /// Record merits, demerits and activity participations. Teachers are limited
  /// to their own sections.
  | "record:conduct"
  /// See student and staff records at all.
  | "view:records";

/// Every capability, in the order the settings matrix shows them.
export const CAPABILITIES: Capability[] = [
  "manage:settings",
  "manage:registry",
  "manage:timetable",
  "manage:exams",
  "enter:marks",
  "take:attendance",
  "record:conduct",
  "view:records",
];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "manage:settings": "School settings and logins",
  "manage:registry": "Students, staff, classes and subjects",
  "manage:timetable": "Build the class timetable",
  "manage:exams": "Create and publish exams",
  "enter:marks": "Enter marks",
  "take:attendance": "Take attendance",
  "record:conduct": "Record conduct and activities",
  "view:records": "View student and staff records",
};

export const CAPABILITY_NOTE: Partial<Record<Capability, string>> = {
  "enter:marks": "Teachers are limited to the subjects assigned to them.",
  "take:attendance": "Teachers are limited to sections they teach or lead.",
  "record:conduct": "Teachers are limited to sections they teach or lead.",
  "manage:settings": "Includes creating logins and editing this matrix.",
  "manage:timetable":
    "Teachers always see their own timetable, whether or not this is granted.",
};

/// The built-in starting point. The school's own matrix overrides it.
export const DEFAULT_GRANTS: Record<Role, Capability[]> = {
  ADMIN: [
    "manage:settings",
    "manage:registry",
    "manage:timetable",
    "manage:exams",
    "enter:marks",
    "take:attendance",
    "record:conduct",
    "view:records",
  ],
  // Runs the office: every record, but cannot hand out logins or change roles.
  OFFICE: [
    "manage:registry",
    "manage:timetable",
    "manage:exams",
    "enter:marks",
    "take:attendance",
    "record:conduct",
    "view:records",
  ],
  // Teaches: marks and attendance for their own classes, and nothing structural.
  TEACHER: ["enter:marks", "take:attendance", "record:conduct", "view:records"],
};

/// Default-only check, for places that cannot reach the database — currently
/// nothing enforcing does. Everything authoritative reads the stored matrix.
export function canByDefault(role: Role, capability: Capability): boolean {
  return DEFAULT_GRANTS[role].includes(capability);
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  OFFICE: "Office",
  TEACHER: "Teacher",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: "Everything, including school settings and who can sign in.",
  OFFICE: "All student and staff records, attendance and exams. No account management.",
  TEACHER: "Marks and attendance for their own classes only.",
};

/// Which dashboard sections a role may open. Used for both the navigation and
/// the route guard, so the two cannot disagree.
///
/// /dashboard/timetable is deliberately absent: it is now a bare redirect
/// into /dashboard/classes?view=timetable (see that page), and the Timetable
/// view there is guarded per-view — manage:timetable for the full grid, or a
/// teacher's own read-only week, see canOpenTimetableView below — rather than
/// by one capability on the whole /dashboard/classes prefix. Adding a row here
/// for either path would wrongly gate the other.
export const ROUTE_CAPABILITY: { prefix: string; capability: Capability }[] = [
  { prefix: "/dashboard/settings", capability: "manage:settings" },
  { prefix: "/dashboard/classes", capability: "manage:registry" },
  { prefix: "/dashboard/subjects", capability: "manage:registry" },
  { prefix: "/dashboard/assignments", capability: "manage:registry" },
  { prefix: "/dashboard/teachers", capability: "manage:registry" },
  { prefix: "/dashboard/rollover", capability: "manage:registry" },
  { prefix: "/dashboard/students", capability: "view:records" },
  { prefix: "/dashboard/honours", capability: "view:records" },
  { prefix: "/dashboard/attendance", capability: "take:attendance" },
  { prefix: "/dashboard/exams", capability: "enter:marks" },
];

/// The capability a path requires, or null when it needs only a session.
export function capabilityFor(pathname: string): Capability | null {
  const rule = ROUTE_CAPABILITY.filter((r) => pathname.startsWith(r.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  // Anything unlisted, such as the dashboard home, is open to any signed-in user.
  return rule ? rule.capability : null;
}

/// Whether an actor may open the Timetable view inside Classes at all: full
/// control under manage:timetable, or — making the note above true — their
/// own week, read-only, if they are a teacher with a linked staff record.
/// `isTeacherWithStaff` should already account for both: role === "TEACHER"
/// and a non-null staffId, since an unlinked teacher login has no week of
/// their own to show.
export function canOpenTimetableView(
  hasManageTimetable: boolean,
  isTeacherWithStaff: boolean,
): boolean {
  return hasManageTimetable || isTeacherWithStaff;
}

/// Given that the Timetable view is open at all (canOpenTimetableView above),
/// whether it shows the full editing grid — shape switching, the bell editor,
/// clear timetable, every class's week — or just the signed-in teacher's own
/// week, read-only. manage:timetable is the only thing that unlocks editing;
/// being a teacher never does, even for their own week.
export function timetableViewIsEditable(hasManageTimetable: boolean): boolean {
  return hasManageTimetable;
}
