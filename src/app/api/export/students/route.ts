import { auth } from "@/lib/auth/auth";
import { currentActor } from "@/lib/auth/guard";
import { granted, loadGrants } from "@/lib/auth/permissions";
import { capabilityFor } from "@/lib/auth/roles";
import { csvResponse, safeText, toCsv } from "@/lib/export/csv";
import { formatBs } from "@/lib/date/bs";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listEnrolledStudents } from "@/lib/registry/students";

const STATUS: Record<string, string> = {
  ACTIVE: "Active",
  LEFT: "Left",
  GRADUATED: "Graduated",
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  // The CSV is the same records the page shows, so it is gated by the same
  // capability as the page — an `auth()` session alone is not enough.
  // (Section scoping of the rows themselves is Phase 3.)
  const actor = await currentActor();
  const cap = capabilityFor("/dashboard/students");
  if (!actor || (cap && !granted(await loadGrants(), actor.role, cap))) {
    return new Response("Forbidden", { status: 403 });
  }

  const year = await getCurrentAcademicYear();
  if (!year) return new Response("No current academic year", { status: 409 });

  const url = new URL(request.url);
  const sectionParam = Number(url.searchParams.get("section"));
  const sectionId = Number.isInteger(sectionParam) ? sectionParam : undefined;

  const rows = await listEnrolledStudents({ academicYearId: year.id, sectionId });

  const csv = toCsv(
    [
      "Roll",
      "Admission No",
      "First Name",
      "Middle Name",
      "Last Name",
      "Name (Nepali)",
      "Class",
      "Section",
      "Gender",
      "Date of Birth (BS)",
      "Admitted On (BS)",
      "Address",
      "Status",
      "Guardian",
      "Relation",
      "Guardian Phone",
    ],
    rows.map((e) => {
      const guardian =
        e.student.guardians.find((g) => g.isPrimary) ?? e.student.guardians[0];
      return [
        e.rollNo,
        safeText(e.student.admissionNo),
        safeText(e.student.firstName),
        safeText(e.student.middleName),
        safeText(e.student.lastName),
        safeText(e.student.fullNameNp),
        safeText(e.section.grade.name),
        safeText(e.section.name),
        e.student.gender,
        formatBs(e.student.dob, "YYYY-MM-DD"),
        formatBs(e.student.admittedOn, "YYYY-MM-DD"),
        safeText(e.student.address),
        STATUS[e.student.status] ?? e.student.status,
        safeText(guardian?.fullName),
        guardian?.relation ?? "",
        safeText(guardian?.phone),
      ];
    }),
  );

  const label = sectionId
    ? `${rows[0]?.section.grade.name ?? "section"}-${rows[0]?.section.name ?? sectionId}`
    : "all";
  return csvResponse(`students-${year.nameBS}-${label}.csv`, csv);
}
