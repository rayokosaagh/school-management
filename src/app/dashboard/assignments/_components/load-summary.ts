import type { TeachingRow } from "./teaching-workspace";

export type LoadStaff = { id: number; fullName: string; photoId: number | null };

export function summarizeLoad(
  rows: TeachingRow[],
  staff: LoadStaff[],
  chosen: Record<string, string>,
) {
  const people = staff.map((person) => ({ ...person, assignments: [] as TeachingRow[] }));
  const byId = new Map(people.map((person) => [person.id, person]));
  let unassigned = 0;
  for (const row of rows) {
    const id = Number(chosen[`${row.sectionId}:${row.offeringId}`] ?? row.staffId ?? 0);
    if (!id) unassigned++;
    byId.get(id)?.assignments.push(row);
  }
  return {
    unassigned,
    people: people.map((person) => {
      const subjects = new Map<string, { name: string; tone: number; rows: TeachingRow[] }>();
      for (const row of person.assignments) {
        const subject = subjects.get(row.subjectName) ?? { name: row.subjectName, tone: row.tone, rows: [] };
        subject.rows.push(row);
        subjects.set(row.subjectName, subject);
      }
      return {
        ...person,
        classCount: new Set(person.assignments.map((row) => row.sectionId)).size,
        subjects: [...subjects.values()].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name)),
      };
    }),
  };
}

export type TeacherLoad = ReturnType<typeof summarizeLoad>["people"][number];
