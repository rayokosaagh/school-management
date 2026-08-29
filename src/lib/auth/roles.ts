import type { Role } from "@/generated/prisma/enums";

// What each role may do, in one place. Everything else — navigation, page
// guards, action guards — reads from here rather than re-deciding.

export type Capability =
  /// School details, logins, roles.
  | "manage:settings"
  /// Students, staff, grades, sections, subjects, offerings, teaching.
  | "manage:registry"
  /// Create and publish exams.
  | "manage:exams"
  /// Enter marks. Teachers are additionally limited to their own subjects.
  | "enter:marks"
  /// Take attendance. Teachers are additionally limited to their own sections.
  | "take:attendance"
  /// See student and staff records at all.
  | "view:records";

/// Every capability, in the order the settings matrix shows them.
export const CAPABILITIES: Capability[] = [
  "manage:settings",
  "manage:registry",
  "manage:exams",
  "enter:marks",
  "take:attendance",
  "view:records",
];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "manage:settings": "School settings and logins",
  "manage:registry": "Students, staff, classes and subjects",
  "manage:exams": "Create and publish exams",
  "enter:marks": "Enter marks",
  "take:attendance": "Take attendance",
  "view:records": "View student and staff records",
};

export const CAPABILITY_NOTE: Partial<Record<Capability, string>> = {
  "enter:marks": "Teachers are limited to the subjects assigned to them.",
  "take:attendance": "Teachers are limited to sections they teach or lead.",
  "manage:settings": "Includes creating logins and editing this matrix.",
};

/// The built-in starting point. The school's own matrix overrides it.
export const DEFAULT_GRANTS: Record<Role, Capability[]> = {
  ADMIN: [
    "manage:settings",
    "manage:registry",
    "manage:exams",
    "enter:marks",
    "take:attendance",
    "view:records",
  ],
  // Runs the office: every record, but cannot hand out logins or change roles.
  OFFICE: [
    "manage:registry",
    "manage:exams",
    "enter:marks",
    "take:attendance",
    "view:records",
  ],
  // Teaches: marks and attendance for their own classes, and nothing structural.
  TEACHER: ["enter:marks", "take:attendance", "view:records"],
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
export const ROUTE_CAPABILITY: { prefix: string; capability: Capability }[] = [
  { prefix: "/dashboard/settings", capability: "manage:settings" },
  { prefix: "/dashboard/classes", capability: "manage:registry" },
  { prefix: "/dashboard/subjects", capability: "manage:registry" },
  { prefix: "/dashboard/assignments", capability: "manage:registry" },
  { prefix: "/dashboard/teachers", capability: "manage:registry" },
  { prefix: "/dashboard/students", capability: "view:records" },
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
