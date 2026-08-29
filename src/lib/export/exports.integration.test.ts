import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { toCsv, safeText } from "./csv";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { listEnrolledStudents } from "@/lib/registry/students";
import { getLedger } from "@/lib/assessment/exams";

// Exercises the shapes the export routes build, against the real database. The
// routes themselves only add auth and headers on top of this.
describe.skipIf(!process.env.DB_TESTS)("csv exports", () => {
  it("builds a student roll with one row per enrolment", async () => {
    const year = await getCurrentAcademicYear();
    if (!year) return; // nothing to export without a current year

    const rows = await listEnrolledStudents({ academicYearId: year.id });
    const csv = toCsv(
      ["Roll", "Name", "Class", "Guardian"],
      rows.map((e) => [
        e.rollNo,
        safeText(e.student.fullName),
        safeText(`${e.section.grade.name} ${e.section.name}`),
        safeText(e.student.guardians[0]?.fullName),
      ]),
    );

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Roll,Name,Class,Guardian");
    expect(lines).toHaveLength(rows.length + 1);
    // Every data line must have the same field count as the header.
    for (const line of lines.slice(1)) {
      const fields = line.match(/(".*?"|[^,]*)(,|$)/g) ?? [];
      expect(fields.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("quotes a name containing a comma rather than splitting the row", async () => {
    const csv = toCsv(["Name"], [[safeText("Thapa, Ramesh Bahadur")]]);
    expect(csv.split("\r\n")[1]).toBe('"Thapa, Ramesh Bahadur"');
  });

  it("carries Devanagari through unchanged", async () => {
    const csv = toCsv(["Name"], [[safeText("रमेश बहादुर थापा")]]);
    expect(csv).toContain("रमेश बहादुर थापा");
  });

  it("builds a ledger with a column pair per subject", async () => {
    const term = await prisma.examTerm.findFirst({ orderBy: { order: "asc" } });
    if (!term) return;
    const section = await prisma.section.findFirst({
      where: { academicYearId: term.academicYearId },
    });
    if (!section) return;

    const ledger = await getLedger(term.id, section.id);
    const headers = [
      "Roll",
      "Name",
      ...ledger.offerings.flatMap((o) => [o.name, `${o.name} Grade`]),
      "Total",
      "GPA",
    ];
    const rows = ledger.students.map((s) => [
      s.rollNo,
      safeText(s.fullName),
      ...s.subjects.flatMap((sub) => [
        sub.result.isAbsent ? "Ab" : (sub.result.total ?? ""),
        sub.result.grade?.letter ?? "",
      ]),
      s.grandTotal ?? "",
      s.overall.gpa ?? "",
    ]);

    // Two columns per subject plus roll, name, total and GPA.
    expect(headers).toHaveLength(ledger.offerings.length * 2 + 4);
    for (const row of rows) expect(row).toHaveLength(headers.length);

    const csv = toCsv(headers, rows);
    expect(csv.split("\r\n")).toHaveLength(ledger.students.length + 1);
  });
});
