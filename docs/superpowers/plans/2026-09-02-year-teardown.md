# Year Teardown and Restore Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator delete an academic year and everything recorded in it, having first captured a restore point from which that year can be brought back.

**Architecture:** A capture-then-delete pair in one transaction (`year-teardown.ts`), a restore that re-inserts rows under their original ids and reports what it could not re-attach (`restore-point.ts`), and a new `RestorePoint` table holding the payload as JSON. Deletion walks the year's tables explicitly in FK order because `AcademicYear`'s relations are all `Restrict`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Prisma 6 on Postgres, Vitest 4, Tailwind 4 with the project's `@/components/ui` set.

**Spec:** `docs/superpowers/specs/2026-09-02-year-teardown-design.md`

## Global Constraints

- **This work is destructive. Every delete path is guarded and every guard is tested.** No task may add a delete that is reachable without its guard.
- The current academic year can never be deleted — a hard refusal, not a warning.
- Only the year's own rows are touched. **Students, guardians, staff, grades, subjects, photos, `SchoolPeriod`, users and the permission matrix are never written to by any code in this plan**, and `Student.status` is never changed. A test asserts this after every delete.
- Every new server action is behind `await requireCapability("manage:settings")`. The existing `removeAcademicYear` in `src/app/dashboard/classes/actions.ts` moves from `manage:registry` to `manage:settings` too.
- Snapshot and delete are one interactive `prisma.$transaction` with a raised timeout. A failed snapshot must abort the delete.
- Restore is one transaction, refuses an unknown `payload.version`, refuses when a year with that `nameBS` exists again, and does **not** consume the restore point.
- Restored rows keep their original primary keys. `isCurrent` is never restored — a restored year comes back dormant.
- Database tests are gated: `describe.skipIf(!process.env.DB_TESTS)`. Run with `DB_TESTS=1 npx vitest run <file>` (Git Bash) or `$env:DB_TESTS=1; npx vitest run <file>` (PowerShell). Without it they skip silently and prove nothing.
- Integration tests create only their own fixtures, tear them down in `afterAll`, and restore the previously current academic year. Pattern: `src/lib/registry/registry.integration.test.ts`.
- Use BS years around 2080–2095 in fixtures; the shared BS date field throws near 2000 BS.
- After a schema change the running `next dev` keeps its old Prisma client and pages throw `PrismaClientValidationError` until it is restarted. `prisma generate` can also fail with EPERM on the engine dll while dev is running; the generated TypeScript is still written.
- Comments use `///` for the doc comment above an export and `//` for an inline aside, and explain *why*, not what.
- Write files with the Write tool. Bash heredocs beyond roughly 200 lines fail to parse in this environment.
- Baseline before Task 1: `DB_TESTS=1 npx vitest run` → 369 passed, 44 files. `tsc --noEmit` clean. `npm run lint` → 0 errors, 1 pre-existing `data-table.tsx` warning.

---

### Task 1: The `RestorePoint` table

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_restore_point/migration.sql`

**Interfaces:**
- Produces: the `RestorePoint` model and its generated Prisma client types. Tasks 2, 4, 6 all use it.

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma`, and add the back-relation `restorePoints RestorePoint[]` to `model User`:

```prisma
/// A year's rows, captured before that year was deleted, so it can be brought
/// back. Held in the database rather than a file so it travels with the
/// school's existing backups.
model RestorePoint {
  id          Int      @id @default(autoincrement())
  /// Kept as plain values rather than a relation: the year this names is gone
  /// by the time anyone needs the snapshot.
  yearNameBS  String
  startsOn    DateTime @db.Date
  endsOn      DateTime @db.Date
  createdAt   DateTime @default(now())
  createdById Int?
  /// Row counts per table, so the list reads without parsing the payload.
  counts      Json
  /// Every captured row, keyed by table, each carrying its original id.
  payload     Json
  createdBy   User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)

  @@index([createdAt])
}
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name restore_point --create-only`
Then read the generated SQL and confirm it only creates `RestorePoint` and its index — it must not alter or drop any existing table. If it proposes anything else, stop and report.

- [ ] **Step 3: Apply it**

Run: `npx prisma migrate dev`
Then: `npx prisma generate`
Expected: the migration applies and the client regenerates. If `prisma generate` fails with EPERM on the engine dll, that is the running dev server holding it — the generated TypeScript is still written, so continue and note it.

- [ ] **Step 4: Prove the table is usable**

Run: `DB_TESTS=1 npx vitest run src/lib/registry` — the existing suites must still pass (no schema regression).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(teardown): restore point table"
```

---

### Task 2: Summarise and snapshot a year

**Files:**
- Create: `src/lib/registry/year-teardown.ts`
- Test: `src/lib/registry/year-teardown.integration.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; the `RestorePoint` model from Task 1.
- Produces: `YearCounts`, `RestorePayload`, `PAYLOAD_VERSION`, `summariseYear(id): Promise<YearSummary>`, `snapshotYear(tx, id): Promise<{ payload, counts }>`, and `YearTeardownError`. Task 3 calls `snapshotYear` inside its transaction; Task 4 reads `RestorePayload`; Tasks 5–7 render `YearSummary`.

- [ ] **Step 1: Write the types and the reader**

Create `src/lib/registry/year-teardown.ts`:

```ts
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export class YearTeardownError extends Error {}

/// Bumped whenever the captured shape changes. A payload from another version
/// is refused rather than half-understood.
export const PAYLOAD_VERSION = 1;

/// Row counts per table, in the order the delete walks them, so the dialog and
/// the restore report can be read side by side.
export type YearCounts = {
  sections: number;
  offerings: number;
  assignments: number;
  periods: number;
  enrollments: number;
  examTerms: number;
  marks: number;
  attendanceSessions: number;
  attendanceRecords: number;
  conduct: number;
  activities: number;
};

export type YearSummary = {
  year: { id: number; nameBS: string; isCurrent: boolean };
  counts: YearCounts;
  /// A year with attendance or marks has been taught in, so its delete needs
  /// the operator to type the year's name.
  taught: boolean;
};

export type RestorePayload = {
  version: number;
  year: { id: number; nameBS: string; startsOn: string; endsOn: string };
  sections: unknown[];
  offerings: unknown[];
  assignments: unknown[];
  periods: unknown[];
  enrollments: unknown[];
  examTerms: unknown[];
  marks: unknown[];
  attendanceSessions: unknown[];
  attendanceRecords: unknown[];
  conduct: unknown[];
  activities: unknown[];
};

const ZERO: YearCounts = {
  sections: 0, offerings: 0, assignments: 0, periods: 0, enrollments: 0,
  examTerms: 0, marks: 0, attendanceSessions: 0, attendanceRecords: 0,
  conduct: 0, activities: 0,
};

/// Everything the delete dialog needs to tell the truth before anything is
/// destroyed.
export async function summariseYear(academicYearId: number): Promise<YearSummary> {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new YearTeardownError("That academic year no longer exists.");

  const sectionIds = (
    await prisma.section.findMany({ where: { academicYearId }, select: { id: true } })
  ).map((s) => s.id);
  const termIds = (
    await prisma.examTerm.findMany({ where: { academicYearId }, select: { id: true } })
  ).map((t) => t.id);
  const sessionIds = (
    await prisma.attendanceSession.findMany({ where: { academicYearId }, select: { id: true } })
  ).map((s) => s.id);

  const [
    offerings, assignments, periods, enrollments, examTerms,
    marks, attendanceSessions, attendanceRecords, conduct, activities,
  ] = await Promise.all([
    prisma.subjectOffering.count({ where: { academicYearId } }),
    prisma.teacherAssignment.count({ where: { sectionId: { in: sectionIds } } }),
    prisma.timetablePeriod.count({ where: { sectionId: { in: sectionIds } } }),
    prisma.enrollment.count({ where: { academicYearId } }),
    prisma.examTerm.count({ where: { academicYearId } }),
    prisma.mark.count({ where: { examTermId: { in: termIds } } }),
    prisma.attendanceSession.count({ where: { academicYearId } }),
    prisma.attendanceRecord.count({ where: { sessionId: { in: sessionIds } } }),
    prisma.conductEntry.count({ where: { academicYearId } }),
    prisma.activityEntry.count({ where: { academicYearId } }),
  ]);

  const counts: YearCounts = {
    ...ZERO,
    sections: sectionIds.length,
    offerings, assignments, periods, enrollments, examTerms,
    marks, attendanceSessions, attendanceRecords, conduct, activities,
  };

  return {
    year: { id: year.id, nameBS: year.nameBS, isCurrent: year.isCurrent },
    // Attendance or marks mean real teaching happened; copied structure alone
    // does not.
    taught: attendanceSessions > 0 || marks > 0,
    counts,
  };
}

/// Captures every row the delete is about to remove. Takes the transaction
/// client so the capture and the delete cannot be separated by another write.
export async function snapshotYear(
  tx: Prisma.TransactionClient,
  academicYearId: number,
): Promise<{ payload: RestorePayload; counts: YearCounts }> {
  const year = await tx.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new YearTeardownError("That academic year no longer exists.");

  const sections = await tx.section.findMany({ where: { academicYearId } });
  const sectionIds = sections.map((s) => s.id);
  const examTerms = await tx.examTerm.findMany({ where: { academicYearId } });
  const termIds = examTerms.map((t) => t.id);
  const attendanceSessions = await tx.attendanceSession.findMany({ where: { academicYearId } });
  const sessionIds = attendanceSessions.map((s) => s.id);

  const [offerings, assignments, periods, enrollments, marks, attendanceRecords, conduct, activities] =
    await Promise.all([
      tx.subjectOffering.findMany({ where: { academicYearId } }),
      tx.teacherAssignment.findMany({ where: { sectionId: { in: sectionIds } } }),
      tx.timetablePeriod.findMany({ where: { sectionId: { in: sectionIds } } }),
      tx.enrollment.findMany({ where: { academicYearId } }),
      tx.mark.findMany({ where: { examTermId: { in: termIds } } }),
      tx.attendanceRecord.findMany({ where: { sessionId: { in: sessionIds } } }),
      tx.conductEntry.findMany({ where: { academicYearId } }),
      tx.activityEntry.findMany({ where: { academicYearId } }),
    ]);

  const payload: RestorePayload = {
    version: PAYLOAD_VERSION,
    year: {
      id: year.id,
      nameBS: year.nameBS,
      startsOn: year.startsOn.toISOString(),
      endsOn: year.endsOn.toISOString(),
    },
    sections, offerings, assignments, periods, enrollments,
    examTerms, marks, attendanceSessions, attendanceRecords, conduct, activities,
  };

  const counts: YearCounts = {
    sections: sections.length,
    offerings: offerings.length,
    assignments: assignments.length,
    periods: periods.length,
    enrollments: enrollments.length,
    examTerms: examTerms.length,
    marks: marks.length,
    attendanceSessions: attendanceSessions.length,
    attendanceRecords: attendanceRecords.length,
    conduct: conduct.length,
    activities: activities.length,
  };

  return { payload, counts };
}
```

- [ ] **Step 2: Write the integration test**

Create `src/lib/registry/year-teardown.integration.test.ts`. Follow `src/lib/registry/registry.integration.test.ts` exactly for the `made` record, `afterAll` teardown and current-year restoration.

Build a fixture year containing **every** record type: two grades, two sections (one with a class teacher), one subject and offering, one teacher assignment, one timetable period, two students with enrolments, one exam term with a mark each, one attendance session with a record each, one conduct entry and one activity entry.

Assert:
- `summariseYear` returns counts matching exactly what was built;
- `taught` is `true` for that fixture, and `false` for a year holding only sections and offerings;
- `summariseYear` on an unknown id throws `YearTeardownError`.

Test the snapshot by calling it inside `prisma.$transaction` and asserting `payload.version === PAYLOAD_VERSION`, that `payload.year.nameBS` matches, and that each array's length equals the corresponding count.

- [ ] **Step 3: Run it**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/year-teardown.integration.test.ts`
Expected: PASS. Run it twice in a row to prove teardown.

- [ ] **Step 4: Commit**

```bash
git add src/lib/registry/year-teardown.ts src/lib/registry/year-teardown.integration.test.ts
git commit -m "feat(teardown): summarise and snapshot a year"
```

---

### Task 3: Delete a year with its data

**Files:**
- Modify: `src/lib/registry/year-teardown.ts`
- Test: `src/lib/registry/year-teardown.integration.test.ts`

**Interfaces:**
- Consumes: `snapshotYear`, `YearTeardownError` from Task 2.
- Produces: `deleteYearWithData(academicYearId, { createRestorePoint, actorUserId }): Promise<{ counts: YearCounts; restorePointId: number | null }>`. Task 5's action calls it.

- [ ] **Step 1: Implement**

Append to `src/lib/registry/year-teardown.ts`:

```ts
/// Removes a year and everything recorded in it, optionally capturing a restore
/// point first. Capture and delete share one transaction: a restore point must
/// never be a promise the delete has already broken.
export async function deleteYearWithData(
  academicYearId: number,
  options: { createRestorePoint: boolean; actorUserId: number | null },
): Promise<{ counts: YearCounts; restorePointId: number | null }> {
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new YearTeardownError("That academic year no longer exists.");
  // Deleting the current year would leave the school with none, which blanks
  // every page in the app.
  if (year.isCurrent) {
    throw new YearTeardownError(
      `Academic year ${year.nameBS} is the current year. Switch to another year before deleting it.`,
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const { payload, counts } = await snapshotYear(tx, academicYearId);

      let restorePointId: number | null = null;
      if (options.createRestorePoint) {
        const point = await tx.restorePoint.create({
          data: {
            yearNameBS: year.nameBS,
            startsOn: year.startsOn,
            endsOn: year.endsOn,
            createdById: options.actorUserId,
            counts,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        restorePointId = point.id;
      }

      const sectionIds = payload.sections.map((s) => (s as { id: number }).id);
      const termIds = payload.examTerms.map((t) => (t as { id: number }).id);
      const sessionIds = payload.attendanceSessions.map((s) => (s as { id: number }).id);

      // Children before parents. Some of these cascade from each other, but
      // each is deleted explicitly so the counts reported are the truth.
      await tx.attendanceRecord.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.attendanceSession.deleteMany({ where: { academicYearId } });
      await tx.mark.deleteMany({ where: { examTermId: { in: termIds } } });
      await tx.examTerm.deleteMany({ where: { academicYearId } });
      await tx.conductEntry.deleteMany({ where: { academicYearId } });
      await tx.activityEntry.deleteMany({ where: { academicYearId } });
      await tx.enrollment.deleteMany({ where: { academicYearId } });
      await tx.timetablePeriod.deleteMany({ where: { sectionId: { in: sectionIds } } });
      await tx.teacherAssignment.deleteMany({ where: { sectionId: { in: sectionIds } } });
      await tx.section.deleteMany({ where: { academicYearId } });
      await tx.subjectOffering.deleteMany({ where: { academicYearId } });
      await tx.academicYear.delete({ where: { id: academicYearId } });

      return { counts, restorePointId };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
```

- [ ] **Step 2: Test it**

Add to the same integration file. Assert:
- deleting the fixture year empties all eleven tables and removes the year;
- **students, staff, grades and subjects still exist, and every student's `status` is unchanged** — capture the statuses before the delete and compare after;
- the returned counts match what `summariseYear` reported beforehand;
- a `RestorePoint` row exists with matching `counts` when `createRestorePoint` is true, and none when false;
- deleting the **current** year throws `YearTeardownError` and changes nothing (assert a count afterwards);
- deleting an unknown id throws.

- [ ] **Step 3: Run**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/year-teardown.integration.test.ts`
Expected: PASS, twice in a row.

- [ ] **Step 4: Commit**

```bash
git add src/lib/registry/year-teardown.ts src/lib/registry/year-teardown.integration.test.ts
git commit -m "feat(teardown): delete a year and its data in one transaction"
```

---

### Task 4: Restore a year from a restore point

**Files:**
- Create: `src/lib/registry/restore-point.ts`
- Test: `src/lib/registry/restore-point.integration.test.ts`

**Interfaces:**
- Consumes: `RestorePayload`, `PAYLOAD_VERSION`, `YearCounts` from `./year-teardown`.
- Produces: `listRestorePoints()`, `restoreYear(restorePointId): Promise<RestoreReport>`, `deleteRestorePoint(id)`, and `RestoreReport`. Task 6's actions call all three.

- [ ] **Step 1: Implement**

Create `src/lib/registry/restore-point.ts`. The shape:

```ts
export type RestoreOutcome = { restored: number; skipped: number; reason?: string };
export type RestoreReport = {
  yearNameBS: string;
  tables: Record<keyof YearCounts, RestoreOutcome>;
};
```

`listRestorePoints()` selects id, `yearNameBS`, `createdAt`, `counts`, the creator's username, and the payload's byte size — use `prisma.$queryRaw` with `pg_column_size(payload)` so the list never loads the payload itself into memory. That is the point of the raw query; do not select `payload` in the list.

`restoreYear(id)`:
1. Load the restore point. Missing → throw.
2. `payload.version !== PAYLOAD_VERSION` → throw naming both versions.
3. A year with `payload.year.nameBS` already exists → throw; restore never merges into a live year.
4. Load the id sets that decide skips: existing grade ids, subject ids, student ids, staff ids, `SchoolPeriod` ids, user ids.
5. In one transaction, insert parents-first in this order, each row keeping its original id, and tally a `RestoreOutcome` per table:
   `AcademicYear` (with `isCurrent: false`) → `SubjectOffering` → `Section` → `TeacherAssignment` → `TimetablePeriod` → `Enrollment` → `ExamTerm` → `Mark` → `AttendanceSession` → `AttendanceRecord` → `ConductEntry` → `ActivityEntry`.

Skip rules — a row is skipped only when something outside the year is missing:

| Row | Skip when | Null-out instead |
|---|---|---|
| `Section` | its `gradeId` is gone | `classTeacherId` when that staff is gone |
| `SubjectOffering` | its `subjectId` or `gradeId` is gone | — |
| `TeacherAssignment` | its `staffId` is gone, or its section/offering was skipped | — |
| `TimetablePeriod` | its `schoolPeriodId` is gone, or its assignment/section was skipped | — |
| `Enrollment` | its `studentId` is gone, or its section was skipped | — |
| `Mark` | its `studentId` is gone, or its term/offering was skipped | — |
| `AttendanceSession` | its section was skipped | `takenById` when that staff is gone |
| `AttendanceRecord` | its `studentId` is gone, or its session was skipped | — |
| `ConductEntry`, `ActivityEntry` | its `studentId` is gone | `recordedById` when that user is gone |

Track the ids you skipped per table so dependent rows can be skipped too — a `Set<number>` of skipped section ids, offering ids, assignment ids, term ids and session ids. Each `RestoreOutcome.reason` is a short human sentence, e.g. `"6 skipped — those students no longer exist"`.

The restore point is **not** deleted on success.

`deleteRestorePoint(id)` is a plain delete.

- [ ] **Step 2: Test it**

Create `src/lib/registry/restore-point.integration.test.ts` following the house fixture pattern. Assert:
- snapshot → delete → restore returns **every count to its original value**, and the restored year exists with `isCurrent === false`;
- restored rows keep their original ids (check one section and one enrolment by id);
- a student deleted between snapshot and restore is skipped, its enrolment/mark/attendance record skipped and **reported**, and everything else still restores;
- a section whose class teacher was deleted restores with `classTeacherId === null` rather than being skipped;
- restore refuses when a year with that name exists again, and writes nothing;
- restore refuses a payload whose `version` is not current;
- the restore point still exists after a successful restore.

- [ ] **Step 3: Run**

Run: `DB_TESTS=1 npx vitest run src/lib/registry/restore-point.integration.test.ts`
Expected: PASS, twice in a row.

- [ ] **Step 4: Commit**

```bash
git add src/lib/registry/restore-point.ts src/lib/registry/restore-point.integration.test.ts
git commit -m "feat(teardown): restore a year, reporting what could not be re-attached"
```

---

### Task 5: The delete dialog on Classes

**Files:**
- Modify: `src/app/dashboard/classes/actions.ts`
- Create: `src/app/dashboard/classes/_components/delete-year-dialog.tsx`
- Modify: `src/app/dashboard/classes/_components/classes-view.tsx`
- Test: `src/lib/auth/roles.test.ts` (permission move)

**Interfaces:**
- Consumes: `summariseYear`, `deleteYearWithData`, `YearTeardownError`.
- Produces: `summariseYearAction(id)` and `deleteYearAction(input)`, both behind `manage:settings`.

- [ ] **Step 1: Move the permission**

In `src/app/dashboard/classes/actions.ts`, `removeAcademicYear` moves from the shared `requireSession()` (`manage:registry`) to `requireCapability("manage:settings")`. Read the file first: it has one `requireSession` helper used by every action — do **not** change that helper, since the other actions must stay on `manage:registry`. Give the year-deleting actions their own check.

- [ ] **Step 2: Add the actions**

```ts
export async function summariseYearAction(
  id: number,
): Promise<{ summary?: YearSummary; error?: string }> {
  await requireCapability("manage:settings");
  try {
    return { summary: await summariseYear(id) };
  } catch (e) {
    if (e instanceof YearTeardownError) return { error: e.message };
    throw e;
  }
}

export async function deleteYearAction(input: {
  id: number;
  createRestorePoint: boolean;
  typedName: string;
}): Promise<{ counts?: YearCounts; restorePointId?: number | null; error?: string }> {
  const actor = await requireCapability("manage:settings");
  try {
    const summary = await summariseYear(input.id);
    // The typed name is re-checked here, not only in the browser: the action is
    // a public POST endpoint and the dialog's guard does not protect it.
    if (summary.taught && input.typedName.trim() !== summary.year.nameBS) {
      return { error: `Type ${summary.year.nameBS} exactly to confirm.` };
    }
    const result = await deleteYearWithData(input.id, {
      createRestorePoint: input.createRestorePoint,
      actorUserId: actor.userId ?? null,
    });
    revalidatePath("/dashboard", "layout");
    return result;
  } catch (e) {
    if (e instanceof YearTeardownError) return { error: e.message };
    throw e;
  }
}
```

Check `Actor`'s real shape in `src/lib/auth/guard.ts` for the user id field before writing `actor.userId`.

- [ ] **Step 3: Build the dialog**

`delete-year-dialog.tsx`, a client component using `Modal` (`open` / `title` / `onClose` / `children`):
- on open, calls `summariseYearAction` and shows a per-table count list;
- refuses immediately, with the message and no Delete button, when the year is current;
- a **"Create a restore point first"** checkbox, checked by default;
- for a taught year, an `Input` that must equal the year name before Delete enables; for an untaught year, no text field;
- the three export links from Task 7 (add them once Task 7 lands; until then leave the row out rather than linking to a 404);
- Delete calls `deleteYearAction` and reports the outcome.

Wire it into `classes-view.tsx` in place of the current `removeAcademicYear` `ConfirmSubmit` for the year row. Read that file first and match its existing idiom.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`, `npx eslint src/app/dashboard/classes`, and `npx vitest run src/lib/auth/roles.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/classes src/lib/auth
git commit -m "feat(teardown): delete-year dialog behind admin settings"
```

---

### Task 6: Restore points in Settings

**Files:**
- Create: `src/app/dashboard/settings/_components/restore-points.tsx`
- Modify: `src/app/dashboard/settings/actions.ts`
- Modify: `src/app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `listRestorePoints`, `restoreYear`, `deleteRestorePoint`, `RestoreReport`.
- Produces: `restoreYearAction(id)` and `deleteRestorePointAction(id)`, both behind `manage:settings`.

- [ ] **Step 1: Actions**

Both behind `await requireCapability("manage:settings")`, both returning `{ report? | ok?, error? }` and calling `revalidatePath("/dashboard", "layout")` on success. Map the restore module's thrown errors to `{ error }` the way the other settings actions do — read `src/app/dashboard/settings/actions.ts` first and match it.

- [ ] **Step 2: The section**

A `SectionCard` matching the existing Settings cards, listing each restore point: year name, when it was taken, who by, its counts as a compact line, and its payload size formatted in KB/MB. Each row has **Restore** and **Delete**. Restore shows its `RestoreReport` inline afterwards — one line per table that had skips, worded as the report gives it. Delete uses the existing `ConfirmSubmit` idiom.

Empty state: a short line saying no restore points have been taken.

`page.tsx` loads `listRestorePoints()` and renders the card between the existing cards; follow the page's current composition.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx eslint src/app/dashboard/settings`.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings
git commit -m "feat(teardown): restore points in settings"
```

---

### Task 7: The three CSV exports

**Files:**
- Create: `src/app/api/export/year/[kind]/route.ts`
- Modify: `src/app/dashboard/classes/_components/delete-year-dialog.tsx` (add the links)

**Interfaces:**
- Consumes: `toCsv`, `csvResponse`, `safeText` from `@/lib/export/csv`.
- Produces: `GET /api/export/year/register|attendance|marks?year=<id>`.

- [ ] **Step 1: Implement**

Read `src/app/api/export/students/route.ts` first and follow it exactly for the auth shape — session, then `currentActor`, then the capability check. This route requires `manage:settings`, since it is reached from the delete dialog.

`kind` is one of `register`, `attendance`, `marks`; anything else is a 400. `year` is a required numeric query param; a missing year is a 404.

- **register**: admission no., name, grade, section, roll.
- **attendance**: date (BS), grade, section, admission no., name, status.
- **marks**: exam term, subject, admission no., name, theory, practical, absent.

- [ ] **Step 2: Add the links to the dialog**

Three plain download links in the dialog, pointing at the three routes with the year id.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx eslint src/app/api/export src/app/dashboard/classes`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/export src/app/dashboard/classes
git commit -m "feat(teardown): per-year CSV exports"
```

---

### Task 8: Whole-feature verification

**Files:** none — this task only runs things and reports.

- [ ] **Step 1: Full suite**

Run: `DB_TESTS=1 npx vitest run`
Expected: PASS, with the new year-teardown and restore-point suites included. Compare against the 369-test baseline and account for the difference exactly.

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint` then `npx tsc --noEmit`
Expected: 0 errors; the one pre-existing `data-table.tsx` warning is acceptable and must be the only one.

- [ ] **Step 3: Restart the dev server**

The schema changed in Task 1, so a dev server started before it holds a stale Prisma client and every page will throw `PrismaClientValidationError`. Restart it before any browser check.

- [ ] **Step 4: Browser round trip**

With a temporary ADMIN login: create a throwaway year, give it a section and a student enrolment, then delete it from Classes **with** a restore point, confirm it is gone, restore it from Settings, and confirm the section and enrolment came back. Then delete the restore point. Remove the temporary login afterwards.

- [ ] **Step 5: Report**

Report the suite counts, the lint result, and what the browser round trip showed.
