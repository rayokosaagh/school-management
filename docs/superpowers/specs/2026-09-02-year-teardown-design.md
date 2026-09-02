# Year teardown and restore points — design spec

Date: 2026-09-02. Branch: `redesign/phase-2`.
Companion to `2026-09-02-year-rollover-design.md`, which explicitly left undo out of scope. This is that undo, generalised.

## 1. Goal

Let an administrator remove an academic year and everything recorded in it, having first captured a **restore point** from which that year can be brought back.

Two situations, one flow:

- a rollover went in wrong — wrong target year, wrong options, wrong placements — and the year it produced should not exist;
- a genuinely finished year is being cleared out.

`deleteAcademicYear` already exists and refuses whenever the year holds anything. This work adds the path that does not refuse, and makes it survivable.

## 2. Decisions taken with the user

| Question | Decision |
|---|---|
| Purpose | Both undo and purge, one flow with guards that scale |
| Blast radius | Only that year's rows. Students, staff, grades and subjects are the school's, not the year's, and are never touched |
| Student status | Left exactly as it is — a rollover's `GRADUATED`/`LEFT` writes are not reversed |
| Guard | Type the year's name for a year with history; a plain confirm for one with none |
| Safety net | A restore point captured before the delete, in the same transaction |
| Where it lives | A row in the database, kept until deleted by hand |
| Restore fidelity | Restore what it can, skip what it cannot re-attach, and report both |
| Permission | `manage:settings` — ADMIN only |

## 3. What a year owns

Every table carrying `academicYearId`, plus the rows that hang beneath them:

`Section`, `SubjectOffering`, `Enrollment`, `AttendanceSession` (and its `AttendanceRecord`s), `ExamTerm` (and its `Mark`s), `ConductEntry`, `ActivityEntry`, `TeacherAssignment` (via section), `TimetablePeriod` (via section).

Never touched: **students, guardians, staff, grades, subjects, photos, the bell schedule (`SchoolPeriod`), users and the permission matrix.** `Student.status` is a field on the student, so it stays as it is — including a `GRADUATED` that a rollover wrote.

## 4. Delete

`AcademicYear`'s own relations carry no `onDelete: Cascade` — every child is `Restrict` — so the year cannot simply be deleted and the tree must be walked explicitly. Some children cascade from each other (`AttendanceRecord` from its session, `Mark` from its term, `TeacherAssignment` and `TimetablePeriod` from their section), but each is deleted explicitly anyway so the reported counts are the truth rather than an inference.

Order:

1. `AttendanceRecord` (by session in the year)
2. `AttendanceSession`
3. `Mark` (by exam term in the year)
4. `ExamTerm`
5. `ConductEntry`
6. `ActivityEntry`
7. `Enrollment`
8. `TimetablePeriod` (by section in the year)
9. `TeacherAssignment` (by section in the year)
10. `Section`
11. `SubjectOffering`
12. `AcademicYear`

The snapshot and all twelve deletes are one interactive `prisma.$transaction`. A snapshot that fails aborts the delete: a restore point must never be a promise the delete has already broken.

### 4.1 Guards

- **The current year is refused outright.** Deleting it leaves the school with no current year and blanks every page. Switch year first.
- A year with no `AttendanceSession` and no `Mark` is *untaught*: a plain confirm naming it.
- A year with either is *taught*: the dialog lists the per-table counts and keeps Delete disabled until the operator types the year's name exactly.
- Everything sits behind `manage:settings`. Today `removeAcademicYear` is behind `manage:registry`, which office staff hold; destroying a year of records is a different order of act from adding a section, so the existing action moves too.

## 5. Restore points

### 5.1 Model (`prisma/schema.prisma`, new migration)

```prisma
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
}
```

### 5.2 Original ids

Rows are captured with their primary keys and re-inserted with them. Postgres never reissues a deleted id — the sequence has already moved past it — so every reference *inside* the payload resolves after restore without remapping. The `AcademicYear` row is captured too and restored under its original id.

### 5.3 Size

Attendance is the bulk: roughly *school days × students*, so a 500-student year is on the order of 100k `AttendanceRecord` rows and a payload in the tens of megabytes. Postgres `jsonb` holds that comfortably. The delete dialog shows the counts before anything is captured, and the Settings list shows each restore point's payload size so they do not accumulate unnoticed.

## 6. Restore

Rows go back parents-first, the mirror of the delete:

`AcademicYear` → `SubjectOffering` → `Section` → `TeacherAssignment` → `TimetablePeriod` → `Enrollment` → `ExamTerm` → `Mark` → `AttendanceSession` → `AttendanceRecord` → `ConductEntry` → `ActivityEntry`

A row is skipped only when something *outside* the year is missing:

| Missing | Effect |
|---|---|
| `Section.classTeacherId` staff | Section restored with a null class teacher — not skipped |
| `Grade` | Section or offering skipped, and everything beneath it |
| `Subject` | Offering skipped, with its assignments and marks |
| `Student` | That enrolment, attendance record, mark, conduct or activity skipped |
| `Staff` on a `TeacherAssignment` | Assignment skipped, with its timetable periods |
| `Staff` on `AttendanceSession.takenById` | Session restored with a null taker — not skipped |
| `SchoolPeriod` | That timetable period skipped |
| `User` on `recordedById` | Entry restored with a null recorder — not skipped |

Whole-restore refusals:

- a year whose `nameBS` already exists again — restore never merges into a live year;
- a payload whose schema version is not the current one (see 6.1).

The result is a report per table: restored, skipped, and the reason for the skips — *"412 of 418 enrolments restored; 6 skipped, their students no longer exist."* A restore that silently drops rows is worse than one that refuses.

The restore is one transaction. The restore point is **not** consumed by a successful restore; it is deleted only by hand, so a restore that produces the wrong thing can be retried.

### 6.1 Payload shape

```ts
type RestorePayload = {
  /// Bumped whenever the captured shape changes; a payload from another
  /// version is refused rather than half-understood.
  version: 1;
  year: { id: number; nameBS: string; startsOn: string; endsOn: string };
  sections: SectionRow[];
  offerings: OfferingRow[];
  assignments: AssignmentRow[];
  periods: PeriodRow[];
  enrollments: EnrollmentRow[];
  examTerms: ExamTermRow[];
  marks: MarkRow[];
  attendanceSessions: SessionRow[];
  attendanceRecords: RecordRow[];
  conduct: ConductRow[];
  activities: ActivityRow[];
};
```

`isCurrent` is deliberately not restored: a restored year comes back dormant, and is made current by the existing year switcher if that is wanted.

## 7. UI

### 7.1 Delete, on the Classes page

The existing year row's delete grows into a dialog: the per-table counts, a **"Create a restore point first"** checkbox ticked by default, the three export links (7.3), and — for a taught year — a text field that must match the year's name before Delete enables. Unticking the restore point on a taught year is allowed but restates the consequence in the confirming button's own words.

### 7.2 Restore points, in Settings

A `SectionCard` listing each restore point: year name, when it was taken, who took it, its counts and payload size, with **Restore** and **Delete** actions. Restore reports its skips inline. Both are behind `manage:settings`.

### 7.3 Export

Three CSV links in the delete dialog, on the existing `toCsv`/`csvResponse` helpers and gated like the other export routes: **register** (students, section, roll), **attendance** (session, student, status), **marks** (term, subject, theory, practical). A convenience for reading in Excel — the restore point, not the CSV, is the safety net.

## 8. Code

- `src/lib/registry/year-teardown.ts` — `summariseYear`, `snapshotYear`, `deleteYearWithData`.
- `src/lib/registry/restore-point.ts` — `listRestorePoints`, `restoreYear`, `deleteRestorePoint`, and the payload types.
- `prisma/migrations/<ts>_restore_point/` — the new table.
- `src/app/api/export/year/[kind]/route.ts` — the three CSVs.
- `src/app/dashboard/classes/_components/delete-year-dialog.tsx` and its action.
- `src/app/dashboard/settings/_components/restore-points.tsx` and its actions.

## 9. Testing

`year-teardown.integration.test.ts` and `restore-point.integration.test.ts`, both gated on `DB_TESTS=1`, over a fixture year holding every record type:

- `summariseYear` counts match what was built;
- delete empties all twelve tables and removes the year;
- **students, staff, grades and subjects still exist afterwards**, and student `status` is unchanged;
- the current year is refused;
- a delete that throws part-way leaves the year entirely intact (transaction rollback);
- snapshot → delete → restore returns every count to its original value;
- a student deleted between snapshot and restore is skipped, reported, and everything else still restores;
- a section whose class teacher was deleted restores with a null class teacher rather than being skipped;
- restore refuses when the year name is taken again;
- restore refuses an unknown payload version;
- the restore point survives a successful restore.

## 10. Out of scope

- Restoring into a differently-named year, or merging into an existing one.
- Reversing student status that a rollover wrote.
- Automatic expiry or pruning of restore points.
- Downloading a restore point as a file, or uploading one into another database.
- Restoring anything outside the year (deleted students, grades or subjects are never recreated).
