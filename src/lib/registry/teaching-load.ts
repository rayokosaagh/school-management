import { sectionCode } from "@/lib/register-codes";

/// One teacher-assignment, flattened out of the query that read it.
export type LoadAssignment = {
  yearId: number;
  yearName: string;
  sectionId: number;
  sectionName: string;
  gradeName: string;
  gradeOrder: number;
  subject: string;
};

export type TeachingLoad = {
  year: string;
  subjectCount: number;
  /// Distinct sections, so two subjects taught to one class count once.
  classCount: number;
  subjects: {
    subject: string;
    classes: { code: string; label: string; gradeName: string; gradeOrder: number }[];
  }[];
}[];

/// Groups a teacher's assignments by year, then by subject.
///
/// Listing assignments one per line meant a teacher taking one subject across
/// fourteen classes read as fourteen near-identical rows, with the subject
/// name repeated down the whole column. Grouped, the two facts worth knowing —
/// what they teach and how far it spreads — are the shape of the data.
///
/// `currentYearId` is put first; the rest follow newest-first, because the
/// pane is a record and older years are history.
export function groupTeachingLoad(
  assignments: LoadAssignment[],
  currentYearId: number,
): TeachingLoad {
  type Taught = { code: string; label: string; order: number; name: string; gradeName: string };
  const byYear = new Map<string, Map<string, Map<number, Taught>>>();
  const years: { id: number; name: string }[] = [];

  for (const a of assignments) {
    if (!byYear.has(a.yearName)) {
      byYear.set(a.yearName, new Map());
      years.push({ id: a.yearId, name: a.yearName });
    }
    const subjects = byYear.get(a.yearName)!;
    if (!subjects.has(a.subject)) subjects.set(a.subject, new Map());
    // Keyed by section id: one class can reach the same subject through two
    // offerings, and it is still one class to a reader.
    subjects.get(a.subject)!.set(a.sectionId, {
      code: sectionCode(a.gradeName, a.sectionName),
      label: `${a.gradeName} ${a.sectionName}`,
      order: a.gradeOrder,
      name: a.sectionName,
      gradeName: a.gradeName,
    });
  }

  years.sort((a, b) =>
    a.id === currentYearId ? -1 : b.id === currentYearId ? 1 : b.name.localeCompare(a.name),
  );

  return years.map((y) => {
    const subjects = byYear.get(y.name)!;
    const sections = new Set<number>();
    for (const taught of subjects.values()) for (const id of taught.keys()) sections.add(id);
    return {
      year: y.name,
      subjectCount: subjects.size,
      classCount: sections.size,
      subjects: [...subjects.entries()]
        .map(([subject, taught]) => ({
          subject,
          // Grade order, then section name: "Class 2 A" belongs before
          // "Class 10 A", which sorting the labels would not do.
          classes: [...taught.values()]
            .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
            .map(({ code, label, gradeName, order }) => ({
              code,
              label,
              gradeName,
              gradeOrder: order,
            })),
        }))
        // The subject they carry most, first — it is the one that describes
        // them. Name breaks the tie so two panes never disagree.
        .sort((a, b) => b.classes.length - a.classes.length || a.subject.localeCompare(b.subject)),
    };
  });
}
