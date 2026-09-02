# Honours podium — design spec

Date: 2026-09-02. Branch: `redesign/phase-2`.

## 1. Goal

Rank every active student within their section by overall academic excellence and show the result on a new **Honours** page: a podium for the top three of each section, with photo and name, followed by the rest of the section in ranked order. The score combines four pillars — exams, attendance, conduct and activities — with weights the school can set.

Conduct and activities have no records in the project today, so this work also adds the two record types and the forms to enter them from the student's detail pane.

## 2. Decisions taken with the user

| Question | Decision |
|---|---|
| Discipline and activities have no data | Build the records too, then rank on all four pillars |
| Weighting | Configurable in Settings, defaults 50 / 20 / 15 / 15 |
| Which exams count | Every published term of the current year, averaged |
| Where the podium lives | New Honours page with its own nav entry |

## 3. Data

### 3.1 New models (`prisma/schema.prisma`)

```prisma
/// One conduct event. `points` is always positive; `kind` gives it its sign.
model ConductEntry {
  id             Int         @id @default(autoincrement())
  studentId      Int
  academicYearId Int
  kind           ConductKind
  points         Int
  date           DateTime    @db.Date
  note           String
  recordedById   Int?
  createdAt      DateTime    @default(now())

  student      Student      @relation(fields: [studentId], references: [id], onDelete: Cascade)
  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  recordedBy   User?        @relation(fields: [recordedById], references: [id], onDelete: SetNull)

  @@index([studentId, academicYearId])
}

enum ConductKind {
  MERIT
  DEMERIT
}

/// One participation in a co-curricular activity.
model ActivityEntry {
  id             Int           @id @default(autoincrement())
  studentId      Int
  academicYearId Int
  name           String
  level          ActivityLevel
  points         Int
  date           DateTime      @db.Date
  recordedById   Int?
  createdAt      DateTime      @default(now())

  student      Student      @relation(fields: [studentId], references: [id], onDelete: Cascade)
  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  recordedBy   User?        @relation(fields: [recordedById], references: [id], onDelete: SetNull)

  @@index([studentId, academicYearId])
}

enum ActivityLevel {
  PARTICIPATED
  PLACED
  WON
}
```

`Student`, `AcademicYear` and `User` gain the matching relation arrays. Cascade from `Student` follows the existing rule that a student is marked LEFT rather than deleted, so the cascade only fires for the admin-only hard delete that already cascades guardians.

Points are stored rather than derived so a school can weigh a national win above a house match. The form pre-fills them from the level: participated 10, placed 20, won 30. Conduct points are entered directly; the form defaults to 5.

### 3.2 Weights (`SchoolProfile`)

Four integer columns with defaults: `weightExams 50`, `weightAttendance 20`, `weightConduct 15`, `weightActivities 15`. Saving validates each is a non-negative integer and the four sum to 100.

### 3.3 Migration

`prisma/migrations/20260902000000_honours/migration.sql`: the two enums, the two tables with their foreign keys and indexes, and the four `SchoolProfile` columns. Hand-written in the style of the existing migrations, with a comment on each decision. No backfill: the new tables start empty and the columns have defaults.

## 4. Scoring (`src/lib/honours/score.ts`, pure)

Every pillar is a number from 0 to 100, or null when there is no data.

| Pillar | How it is computed |
|---|---|
| Exams | Mean of the student's overall percent across the year's **published** terms where the result is complete (`summarise().complete`). Null when no published term has a complete result for them. |
| Attendance | `attendancePercent()` over the year's records. Null when the student has no records. |
| Conduct | `clamp(80 + merits − demerits, 0, 100)`. A student with no entries scores 80, so a merit can lift them and a demerit can lower them. |
| Activities | `min(100, sum of points)`. |

Overall score:

- Exams are required. A student with a null exam pillar has a null overall and is **unranked**.
- The other three pillars are always present for conduct and activities (zero entries still score). Attendance may be null, in which case its weight is dropped and the remaining weights are renormalised, so a newly enrolled student is not punished for having no roll calls.
- `overall = Σ (weight_i × pillar_i) / Σ weight_i` over the pillars present, rounded to one decimal place.

Ranking reuses `rank()` from `src/lib/assessment/grading.ts` on the rounded overall. Equal scores share a position; unranked students sort last with position null.

Exports: `conductScore`, `activityScore`, `overallScore`, `DEFAULT_WEIGHTS`, `validateWeights`, plus the `Pillars` and `Weights` types.

## 5. Loader (`src/lib/honours/honours.ts`)

`getHonours(academicYearId)` returns one entry per section of the year, ordered by grade order then section name:

```ts
type SectionHonours = {
  sectionId: number; gradeName: string; sectionName: string; classTeacher: string | null;
  students: {
    studentId: number; fullName: string; fullNameNp: string | null; photoId: number | null; rollNo: number;
    pillars: { exams: number | null; attendance: number | null; conduct: number; activities: number };
    overall: number | null; position: number | null;
  }[];
};
```

Also returned: `publishedTerms` (count), `weights`, and `year`.

It does not call `getLedger()` per term and section, which would be three queries for each pair. It runs a fixed number of queries for the whole year — enrolments with students, offerings, marks for published terms, attendance records, conduct entries, activity entries — then evaluates each student's term results with `evaluate()` and `summarise()` from `grading.ts` against the offerings of their grade. Only `ACTIVE` students are ranked, matching the ledger.

`getStudentHonours(studentId, academicYearId)` returns the student's pillars, overall, position and class size, plus the conduct and activity entries for the pane. It reuses the section loader for one section.

## 6. Permissions

- **Viewing** the Honours page requires `view:records`, which every role has by default. `ROUTE_CAPABILITY` gains `/dashboard/honours`.
- **Recording** conduct and activities requires a new capability `record:conduct`, labelled "Record conduct and activities", granted to every role by default. Teachers are limited to students in sections they teach or lead, enforced through the existing `allowedSectionIds()`.
- **Setting weights** requires `manage:settings`.

The permission matrix on Settings lists the new capability automatically because it renders `CAPABILITIES`.

## 7. Pages and components

### 7.1 Honours page (`src/app/dashboard/honours/`)

- `page.tsx`: `requirePage`, current year, `getHonours`, then `HonoursWorkspace`. Empty states for no current year and no sections follow the Students page.
- `_components/honours-workspace.tsx` (client): `PageFrame` with eyebrow "Assessment", title "Honours", meta "`N` ranked · `year`". `RegisterTabs` per grade (code is the grade's short label, label the grade name, count its students). Toolbar: a search box over names and a legend of the four pillars with their weights. Body scrolls a list of `SectionCard`s for the selected grade.
- `_components/section-card.tsx`: header with the section label, count and class teacher. Then `Podium`, then `RankedList`. A section with fewer than three ranked students shows the podium steps it can fill. A section with nobody ranked shows a short line saying no published exam covers it yet, and lists everyone as awaiting results.
- `_components/podium.tsx`: three steps in the order 2nd, 1st, 3rd, the first raised. Each step shows the photo from `/api/photo/{id}` or the initials tile the pane uses, the name, roll number, position badge and overall score. Gold, silver and bronze tones come from three new tokens in `globals.css` with light and dark values, mapped in the `@theme` block.
- `_components/ranked-list.tsx`: the remaining ranked students as rows: position, small photo or initials, name, roll, four compact pillar values and the overall as a bar plus number. Unranked students follow in a muted group. Each row links to `/dashboard/students?student={id}`.

Nav: `{ id: "honours", label: "Honours", href: "/dashboard/honours", icon: Trophy }` at the end of the `daily` group. The smoke script gains `dashboard/honours`.

### 7.2 Student pane

`StudentSummary` gains `honours` (from `getStudentHonours`). The read view of `StudentPane` gains:

- **Standing**: position out of class size, overall score, four pillar values.
- **Conduct**: the year's entries newest first (date, merit or demerit, points, note), a remove button per entry, and an inline add form revealed by an "Add" button: kind, points, date (BS), note.
- **Activities**: the same shape with name, level, points, date.

Actions in `src/app/dashboard/students/actions.ts`: `saveConduct`, `removeConduct`, `saveActivity`, `removeActivity`. Each calls `requireCapability("record:conduct")`, then checks the student's current section against `allowedSectionIds(actor)`, then validates and writes through `src/lib/honours/entries.ts`. Validation: points 1 to 100, note 2 to 200 characters for conduct, name 2 to 80 characters for activities, a valid BS date within the current year.

### 7.3 Settings

A new `SectionCard` "Honours weighting" between School details and Your account: four number inputs and a live sum, saved by `updateHonoursWeights` behind `manage:settings`. The form refuses to submit while the sum is not 100 and the action re-checks.

## 8. Seed

`scripts/seed.cjs` gains `seedAssessment` (three exam terms, the first two published, with marks for every offering) and `seedHonours` (a scatter of merits, demerits and activities), so the podium has something to show on a fresh database. Both are idempotent in the same way as the existing seeders.

## 9. Testing

- `src/lib/honours/score.test.ts`: conduct clamping, activity cap, renormalisation when attendance is null, null overall without exams, rounding, weight validation.
- `src/lib/honours/honours.integration.test.ts` (gated on `DB_TESTS`): one grade, one section, three students, two terms one published; asserts pillars, overall, positions, that the draft term is ignored, that a LEFT student is excluded, and that `getStudentHonours` agrees with the section result.
- `src/lib/auth/roles.test.ts`: the new route and capability defaults.
- `src/lib/auth/scoping.integration.test.ts` or a new case: a teacher cannot record conduct outside their sections.
- Lint, typecheck and the smoke script at the end.

## 10. Out of scope

- Printing or exporting the honours list.
- Ranking across sections or the whole school.
- Per-term weighting or weighting per grade.
- Editing an existing conduct or activity entry; remove and re-add instead.
