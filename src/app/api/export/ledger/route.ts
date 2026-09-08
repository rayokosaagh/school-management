import { auth } from "@/lib/auth/auth";
import { currentActor } from "@/lib/auth/guard";
import { granted, loadGrants } from "@/lib/auth/permissions";
import { capabilityFor } from "@/lib/auth/roles";
import { csvResponse, safeText, toCsv, type Cell } from "@/lib/export/csv";
import { AssessmentError, getLedger } from "@/lib/assessment/exams";

/// The class ledger as a spreadsheet: one row per student, one column per
/// subject, then the totals. This is what schools paste into their own reports.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  // The CSV is the same records the page shows, so it is gated by the same
  // capability as the page — an `auth()` session alone is not enough.
  // (Section scoping of the rows themselves is Phase 3.)
  const actor = await currentActor();
  const cap = capabilityFor("/dashboard/exams");
  if (!actor || (cap && !granted(await loadGrants(), actor.role, cap))) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const examTermId = Number(url.searchParams.get("exam"));
  const sectionId = Number(url.searchParams.get("section"));

  if (!Number.isInteger(examTermId) || !Number.isInteger(sectionId)) {
    return new Response("Pick an exam and a section", { status: 400 });
  }

  let ledger;
  try {
    ledger = await getLedger(examTermId, sectionId);
  } catch (e) {
    if (e instanceof AssessmentError) return new Response(e.message, { status: 409 });
    throw e;
  }

  const headers = [
    "Roll",
    "Name",
    "Name (Nepali)",
    ...ledger.offerings.flatMap((o) => [`${o.name} (${o.fullMarks})`, `${o.name} Grade`]),
    "Total",
    "Percent",
    "GPA",
    "Position",
    "Result",
  ];

  const rows: Cell[][] = ledger.students.map((s) => [
    s.rollNo,
    safeText(s.fullName),
    safeText(s.fullNameNp),
    ...s.subjects.flatMap((sub) => [
      // Absent is its own value; a blank means not marked, and neither is zero.
      sub.result.isAbsent ? "Ab" : (sub.result.total ?? ""),
      sub.result.grade?.letter ?? "",
    ]),
    s.grandTotal ?? "",
    s.overall.percent ?? "",
    s.overall.gpa ?? "",
    s.position ?? "",
    s.overall.complete ? (s.overall.passedAll ? "Passed" : "Failed") : "Incomplete",
  ]);

  const name = `${ledger.section.grade.name}-${ledger.section.name}-${ledger.term.name}`;
  return csvResponse(`ledger-${name}.csv`, toCsv(headers, rows));
}
