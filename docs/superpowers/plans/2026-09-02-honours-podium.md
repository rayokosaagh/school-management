# Honours Podium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank every active student within their section by a weighted score over exams, attendance, conduct and activities, and show a podium for the top three of each section plus a ranked list, with the conduct and activity records and the weight settings that feed it.

**Architecture:** Two new Prisma models (`ConductEntry`, `ActivityEntry`) and four weight columns on `SchoolProfile` feed a pure scoring module in `src/lib/honours/score.ts`. A loader in `src/lib/honours/honours.ts` runs a fixed number of queries for a year, evaluates exam results with the existing `grading.ts` functions, and ranks with the existing `rank()`. A new `/dashboard/honours` page renders the result; the student pane gains conduct and activity sections with forms; Settings gains a weights form.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Prisma 6 on PostgreSQL, React 19, Tailwind 4, shadcn base-nova primitives, vitest. Read `node_modules/next/dist/docs/` before touching a page or action if anything looks unfamiliar.

**Spec:** `docs/superpowers/specs/2026-09-02-honours-podium-design.md`

## Global Constraints

- Migrations are hand-written SQL under `prisma/migrations/<timestamp>_<name>/migration.sql`, with a comment explaining each decision. Apply with `npx prisma migrate deploy`, then `npx prisma generate`.
- Database-backed test suites are wrapped in `describe.skipIf(!process.env.DB_TESTS)` and clean up every row they create in `afterAll`. Run them with `$env:DB_TESTS=1; npx vitest run <file>` (PowerShell).
- Every server action is a public endpoint: it starts with `requireCapability(...)` and returns `{ error }` rather than throwing for user mistakes.
- Every page starts with `await requirePage("<pathname>")`.
- Dates are stored Gregorian and entered as Bikram Sambat strings `YYYY-MM-DD` via `parseBsInput` / `toBsInput` from `src/lib/date/bs.ts`.
- Colours come from tokens in `src/app/globals.css` mapped in its `@theme inline` block; never hard-code a colour in a component.
- Commit messages end with `Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt`.
- The working tree already holds uncommitted Phase 2 work. Only `git add` the files each task names. Never `git add -A`.

---

### Task 1: Schema, migration, generated client

**Files:**
- Modify: `prisma/schema.prisma` (Student, AcademicYear, User, SchoolProfile models; new models at the end of the Assessment section)
- Create: `prisma/migrations/20260902000000_honours/migration.sql`

**Interfaces:**
- Produces: Prisma models `conductEntry`, `activityEntry`; enums `ConductKind` (`MERIT | DEMERIT`), `ActivityLevel` (`PARTICIPATED | PLACED | WON`); `schoolProfile.weightExams | weightAttendance | weightConduct | weightActivities: Int`.

- [ ] **Step 1: Add the models to the schema**

Append after the `Mark` model in `prisma/schema.prisma`:

```prisma
// ---------------------------------------------------------------------------
// Honours — the conduct and activity records that, with exams and attendance,
// make up a student's overall score. See src/lib/honours/score.ts.
// ---------------------------------------------------------------------------

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

/// One participation in a co-curricular activity. Points are stored rather
/// than derived from the level so a national win can outweigh a house match.
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

Add the back-relations:

- `model Student`: after `marks Mark[]` add `conduct ConductEntry[]` and `activities ActivityEntry[]`.
- `model AcademicYear`: after `examTerms ExamTerm[]` add `conduct ConductEntry[]` and `activities ActivityEntry[]`.
- `model User`: after `staff Staff?` add `conductRecorded ConductEntry[]` and `activitiesRecorded ActivityEntry[]`.

Add the weights to `model SchoolProfile`, after `workingDays`:

```prisma
  /// How the honours score is weighted, in percent. Must sum to 100; enforced
  /// in src/lib/honours/weights.ts.
  weightExams      Int @default(50)
  weightAttendance Int @default(20)
  weightConduct    Int @default(15)
  weightActivities Int @default(15)
```

- [ ] **Step 2: Write the migration**

Create `prisma/migrations/20260902000000_honours/migration.sql`:

```sql
-- Conduct and activity records: the two honours pillars nothing recorded
-- before. Both cascade from the student like guardians do — a student who
-- leaves is marked LEFT, so the cascade only fires on the hard delete that is
-- already reserved for records entered by mistake.
CREATE TYPE "ConductKind" AS ENUM ('MERIT', 'DEMERIT');
CREATE TYPE "ActivityLevel" AS ENUM ('PARTICIPATED', 'PLACED', 'WON');

CREATE TABLE "ConductEntry" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "kind" "ConductKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConductEntry_pkey" PRIMARY KEY ("id"),
    -- The sign lives in "kind"; a zero or negative entry would be a no-op or a
    -- contradiction.
    CONSTRAINT "ConductEntry_points_check" CHECK ("points" > 0)
);

CREATE INDEX "ConductEntry_studentId_academicYearId_idx"
    ON "ConductEntry"("studentId", "academicYearId");

ALTER TABLE "ConductEntry" ADD CONSTRAINT "ConductEntry_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConductEntry" ADD CONSTRAINT "ConductEntry_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Who recorded it is provenance, not ownership: removing the login keeps the entry.
ALTER TABLE "ConductEntry" ADD CONSTRAINT "ConductEntry_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ActivityEntry" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "academicYearId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" "ActivityLevel" NOT NULL,
    "points" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActivityEntry_points_check" CHECK ("points" > 0)
);

CREATE INDEX "ActivityEntry_studentId_academicYearId_idx"
    ON "ActivityEntry"("studentId", "academicYearId");

ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- How the honours score is weighted. Defaults are the spec's 50/20/15/15; the
-- service layer refuses a set that does not sum to 100.
ALTER TABLE "SchoolProfile"
    ADD COLUMN "weightExams" INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN "weightAttendance" INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN "weightConduct" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "weightActivities" INTEGER NOT NULL DEFAULT 15;
```

- [ ] **Step 3: Apply and regenerate**

Run:

```powershell
npx prisma migrate deploy
npx prisma generate
npx prisma migrate diff --from-url "$env:DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: deploy reports `1 migration applied`; generate succeeds; diff exits 0 with "No difference detected" (the schema and the database agree).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (nothing uses the new models yet).

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations/20260902000000_honours/migration.sql
git commit -m "feat(honours): conduct and activity records, score weights on the school profile" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 2: Pure scoring module

**Files:**
- Create: `src/lib/honours/score.ts`
- Test: `src/lib/honours/score.test.ts`

**Interfaces:**
- Produces:
  - `type Weights = { exams: number; attendance: number; conduct: number; activities: number }`
  - `type Pillars = { exams: number | null; attendance: number | null; conduct: number; activities: number }`
  - `DEFAULT_WEIGHTS: Weights`, `CONDUCT_BASE = 80`, `ACTIVITY_POINTS: Record<ActivityLevel, number>`
  - `examScore(percents: (number | null)[]): number | null`
  - `conductScore(merits: number, demerits: number): number`
  - `activityScore(points: number): number`
  - `overallScore(pillars: Pillars, weights: Weights): number | null`
  - `validateWeights(w: Weights): string | null`
  - `ordinal(n: number): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/honours/score.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_POINTS,
  DEFAULT_WEIGHTS,
  activityScore,
  conductScore,
  examScore,
  ordinal,
  overallScore,
  validateWeights,
} from "./score";

describe("examScore", () => {
  it("averages the complete terms and ignores incomplete ones", () => {
    expect(examScore([80, null, 60])).toBe(70);
  });
  it("is null with nothing complete", () => {
    expect(examScore([])).toBeNull();
    expect(examScore([null, null])).toBeNull();
  });
});

describe("conductScore", () => {
  it("starts at the base with no entries", () => {
    expect(conductScore(0, 0)).toBe(80);
  });
  it("adds merits and subtracts demerits", () => {
    expect(conductScore(10, 5)).toBe(85);
  });
  it("clamps to 0..100", () => {
    expect(conductScore(50, 0)).toBe(100);
    expect(conductScore(0, 200)).toBe(0);
  });
});

describe("activityScore", () => {
  it("sums points and caps at 100", () => {
    expect(activityScore(30)).toBe(30);
    expect(activityScore(130)).toBe(100);
  });
  it("has a default for each level", () => {
    expect(ACTIVITY_POINTS.PARTICIPATED).toBe(10);
    expect(ACTIVITY_POINTS.PLACED).toBe(20);
    expect(ACTIVITY_POINTS.WON).toBe(30);
  });
});

describe("overallScore", () => {
  it("weights the four pillars", () => {
    const score = overallScore(
      { exams: 80, attendance: 90, conduct: 80, activities: 20 },
      DEFAULT_WEIGHTS,
    );
    // 50*80 + 20*90 + 15*80 + 15*20 = 4000 + 1800 + 1200 + 300 = 7300 / 100
    expect(score).toBe(73);
  });
  it("is null without an exam result", () => {
    expect(
      overallScore({ exams: null, attendance: 90, conduct: 80, activities: 20 }, DEFAULT_WEIGHTS),
    ).toBeNull();
  });
  it("drops the attendance weight when attendance is null", () => {
    const score = overallScore(
      { exams: 80, attendance: null, conduct: 80, activities: 20 },
      DEFAULT_WEIGHTS,
    );
    // (50*80 + 15*80 + 15*20) / 80 = (4000 + 1200 + 300) / 80 = 68.75 → 68.8
    expect(score).toBe(68.8);
  });
  it("rounds to one decimal place", () => {
    const score = overallScore(
      { exams: 33.333, attendance: 66.666, conduct: 80, activities: 0 },
      DEFAULT_WEIGHTS,
    );
    expect(score).toBe(42);
  });
  it("is null when every present weight is zero", () => {
    expect(
      overallScore(
        { exams: 80, attendance: null, conduct: 80, activities: 20 },
        { exams: 0, attendance: 100, conduct: 0, activities: 0 },
      ),
    ).toBeNull();
  });
});

describe("validateWeights", () => {
  it("accepts a set that sums to 100", () => {
    expect(validateWeights(DEFAULT_WEIGHTS)).toBeNull();
    expect(validateWeights({ exams: 100, attendance: 0, conduct: 0, activities: 0 })).toBeNull();
  });
  it("names the sum when it is not 100", () => {
    expect(validateWeights({ exams: 50, attendance: 20, conduct: 15, activities: 10 })).toMatch(
      /currently 95/,
    );
  });
  it("rejects negatives and fractions", () => {
    expect(validateWeights({ exams: 110, attendance: -10, conduct: 0, activities: 0 })).not.toBeNull();
    expect(validateWeights({ exams: 50.5, attendance: 19.5, conduct: 15, activities: 15 })).not.toBeNull();
  });
});

describe("ordinal", () => {
  it("suffixes positions", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(103)).toBe("103rd");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/honours/score.test.ts`
Expected: FAIL, cannot resolve `./score`.

- [ ] **Step 3: Implement**

Create `src/lib/honours/score.ts`:

```ts
import type { ActivityLevel } from "@/generated/prisma/enums";

// The honours score, as pure arithmetic. Every pillar is 0..100 or null for
// "no data"; the loader in ./honours.ts gathers the inputs and this file
// decides what they are worth. Kept free of Prisma so it can be tested cold.

export type Weights = {
  exams: number;
  attendance: number;
  conduct: number;
  activities: number;
};

export type Pillars = {
  /// Mean overall percent across published, complete terms. Null without one.
  exams: number | null;
  /// Attendance percent for the year. Null when no roll call includes them.
  attendance: number | null;
  /// Always present: no entries is a score, not a gap.
  conduct: number;
  activities: number;
};

export const DEFAULT_WEIGHTS: Weights = { exams: 50, attendance: 20, conduct: 15, activities: 15 };

/// What a student with no conduct entries scores. Below 100 so a merit can
/// lift them above the crowd, high enough that a clean year still counts.
export const CONDUCT_BASE = 80;

/// The points the activity form pre-fills for each level.
export const ACTIVITY_POINTS: Record<ActivityLevel, number> = {
  PARTICIPATED: 10,
  PLACED: 20,
  WON: 30,
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function examScore(percents: (number | null)[]): number | null {
  const done = percents.filter((p): p is number => p !== null);
  if (done.length === 0) return null;
  return done.reduce((sum, p) => sum + p, 0) / done.length;
}

export function conductScore(merits: number, demerits: number): number {
  return clamp(CONDUCT_BASE + merits - demerits);
}

export function activityScore(points: number): number {
  return clamp(points);
}

/// Weighted mean over the pillars that have data. Exams are required — a
/// ranking without a published result is a guess — but a missing attendance
/// record only drops that weight, so a new arrival is not scored as absent.
export function overallScore(p: Pillars, w: Weights): number | null {
  if (p.exams === null) return null;

  let sum = w.exams * p.exams + w.conduct * p.conduct + w.activities * p.activities;
  let total = w.exams + w.conduct + w.activities;
  if (p.attendance !== null) {
    sum += w.attendance * p.attendance;
    total += w.attendance;
  }
  if (total === 0) return null;

  return Math.round((sum / total) * 10) / 10;
}

/// Null when the set is usable, otherwise the message to show.
export function validateWeights(w: Weights): string | null {
  const values = [w.exams, w.attendance, w.conduct, w.activities];
  if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) {
    return "Each weight must be a whole number from 0 to 100.";
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum !== 100) return `Weights must add up to 100 (currently ${sum}).`;
  return null;
}

/// 1 → "1st", 12 → "12th", 23 → "23rd".
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/honours/score.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/honours/score.ts src/lib/honours/score.test.ts
git commit -m "feat(honours): pure scoring module" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 3: Weights service and Settings form

**Files:**
- Create: `src/lib/honours/weights.ts`
- Test: `src/lib/honours/weights.integration.test.ts`
- Modify: `src/app/dashboard/settings/actions.ts` (append)
- Create: `src/app/dashboard/settings/_components/honours-weights-form.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `Weights`, `DEFAULT_WEIGHTS`, `validateWeights` from Task 2.
- Produces: `getWeights(): Promise<Weights>`, `saveWeights(w: Weights): Promise<void>`, `class WeightsError`; action `updateHonoursWeights(prev: WeightsState, formData): Promise<WeightsState>`.

- [ ] **Step 1: Write the failing integration test**

Create `src/lib/honours/weights.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { WeightsError, getWeights, saveWeights } from "./weights";
import { DEFAULT_WEIGHTS } from "./score";

// The profile is a single row shared by everything; remember what was there
// and put it back so a run leaves the school's settings alone.
let before: { weightExams: number; weightAttendance: number; weightConduct: number; weightActivities: number } | null = null;

beforeAll(async () => {
  before = await prisma.schoolProfile.findUnique({
    where: { id: 1 },
    select: { weightExams: true, weightAttendance: true, weightConduct: true, weightActivities: true },
  });
});

afterAll(async () => {
  if (before) await prisma.schoolProfile.update({ where: { id: 1 }, data: before });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("honours weights", () => {
  it("round-trips a valid set", async () => {
    const profile = await prisma.schoolProfile.findUnique({ where: { id: 1 } });
    if (!profile) {
      // Nothing to write onto; the service refuses rather than inventing a school.
      await expect(saveWeights({ exams: 40, attendance: 20, conduct: 20, activities: 20 })).rejects.toBeInstanceOf(WeightsError);
      expect(await getWeights()).toEqual(DEFAULT_WEIGHTS);
      return;
    }
    await saveWeights({ exams: 40, attendance: 20, conduct: 20, activities: 20 });
    expect(await getWeights()).toEqual({ exams: 40, attendance: 20, conduct: 20, activities: 20 });
  });

  it("refuses a set that does not sum to 100", async () => {
    await expect(saveWeights({ exams: 40, attendance: 20, conduct: 20, activities: 10 })).rejects.toBeInstanceOf(WeightsError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `$env:DB_TESTS=1; npx vitest run src/lib/honours/weights.integration.test.ts`
Expected: FAIL, cannot resolve `./weights`.

- [ ] **Step 3: Implement the service**

Create `src/lib/honours/weights.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { DEFAULT_WEIGHTS, validateWeights, type Weights } from "./score";

// The weights live on the school profile (one row, id 1) beside the other
// school-wide settings, so there is one place to look for "how does this
// school run".
const ID = 1;

export class WeightsError extends Error {}

export async function getWeights(): Promise<Weights> {
  const s = await prisma.schoolProfile.findUnique({
    where: { id: ID },
    select: { weightExams: true, weightAttendance: true, weightConduct: true, weightActivities: true },
  });
  if (!s) return { ...DEFAULT_WEIGHTS };
  return {
    exams: s.weightExams,
    attendance: s.weightAttendance,
    conduct: s.weightConduct,
    activities: s.weightActivities,
  };
}

/// Refuses to create the profile row: it needs a school name, which this form
/// does not have. Save the school details first.
export async function saveWeights(w: Weights): Promise<void> {
  const problem = validateWeights(w);
  if (problem) throw new WeightsError(problem);

  const exists = await prisma.schoolProfile.findUnique({ where: { id: ID }, select: { id: true } });
  if (!exists) throw new WeightsError("Save the school details before setting the weights.");

  await prisma.schoolProfile.update({
    where: { id: ID },
    data: {
      weightExams: w.exams,
      weightAttendance: w.attendance,
      weightConduct: w.conduct,
      weightActivities: w.activities,
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `$env:DB_TESTS=1; npx vitest run src/lib/honours/weights.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the action**

Append to `src/app/dashboard/settings/actions.ts` (add the import `import { WeightsError, saveWeights } from "@/lib/honours/weights";` at the top with the other imports):

```ts
export type WeightsState = { error?: string; success?: string };

/// Reads four whole numbers; the service checks they sum to 100.
export async function updateHonoursWeights(
  _prev: WeightsState,
  formData: FormData,
): Promise<WeightsState> {
  try {
    await requireCapability("manage:settings");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const read = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw === "" ? Number.NaN : Number(raw);
  };
  const weights = {
    exams: read("exams"),
    attendance: read("attendance"),
    conduct: read("conduct"),
    activities: read("activities"),
  };

  try {
    await saveWeights(weights);
  } catch (e) {
    if (e instanceof WeightsError) return { error: e.message };
    throw e;
  }

  // The Honours page and every student pane show scores built from these.
  revalidatePath("/dashboard", "layout");
  return { success: "Honours weighting saved." };
}
```

- [ ] **Step 6: Add the form**

Create `src/app/dashboard/settings/_components/honours-weights-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useToastedActionState } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Weights } from "@/lib/honours/score";
import { type WeightsState, updateHonoursWeights } from "../actions";

const EMPTY: WeightsState = {};

const FIELDS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: "exams", label: "Exams", hint: "Average of the published terms" },
  { key: "attendance", label: "Attendance", hint: "Present or late, over the year" },
  { key: "conduct", label: "Conduct", hint: "Merits raise it, demerits lower it" },
  { key: "activities", label: "Activities", hint: "Points from participations, capped" },
];

export function HonoursWeightsForm({ weights }: { weights: Weights }) {
  const [state, action, pending] = useToastedActionState(updateHonoursWeights, EMPTY);
  const [draft, setDraft] = useState<Record<keyof Weights, string>>({
    exams: String(weights.exams),
    attendance: String(weights.attendance),
    conduct: String(weights.conduct),
    activities: String(weights.activities),
  });

  const sum = FIELDS.reduce((total, f) => total + (Number(draft[f.key]) || 0), 0);
  const balanced = sum === 100;

  return (
    <form key={`${weights.exams}-${weights.attendance}-${weights.conduct}-${weights.activities}`} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={`weight-${f.key}`}>{f.label}</Label>
            <Input
              id={`weight-${f.key}`}
              name={f.key}
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              required
            />
            <p className="text-muted-foreground text-xs">{f.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !balanced}>
          {pending ? "Saving…" : "Save weighting"}
        </Button>
        <p className={balanced ? "text-muted-foreground text-sm tabular-nums" : "text-destructive text-sm tabular-nums"} aria-live="polite">
          {balanced ? "Adds up to 100." : `Adds up to ${sum}; it must be 100.`}
        </p>
        {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      </div>
      <p className="text-muted-foreground text-xs">
        A student needs a published exam result to be ranked. When they have no
        roll call yet, the attendance weight is left out for them rather than
        counted as absent.
      </p>
    </form>
  );
}
```

- [ ] **Step 7: Render it on Settings**

In `src/app/dashboard/settings/page.tsx`:

- Add imports: `import { Trophy } from "lucide-react";` (merge into the existing lucide import), `import { getWeights } from "@/lib/honours/weights";`, `import { HonoursWeightsForm } from "./_components/honours-weights-form";`.
- Add `getWeights()` to the `Promise.all` that loads `user`, `school`, `accounts`, binding it as `weights`.
- After the "School details" `SectionCard`, add:

```tsx
      <SectionCard
        icon={Trophy}
        tint="amber"
        title="Honours weighting"
        description="How exams, attendance, conduct and activities combine into each student's score on the Honours page."
      >
        <HonoursWeightsForm weights={weights} />
      </SectionCard>
```

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit; npm run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```powershell
git add src/lib/honours/weights.ts src/lib/honours/weights.integration.test.ts src/app/dashboard/settings/actions.ts src/app/dashboard/settings/_components/honours-weights-form.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat(settings): honours weighting form" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 4: Permissions — `record:conduct` capability and the Honours route

**Files:**
- Modify: `src/lib/auth/roles.ts`
- Modify: `src/lib/auth/scope.ts` (append)
- Test: `src/lib/auth/roles.test.ts`

**Interfaces:**
- Produces: capability `"record:conduct"`; `capabilityFor("/dashboard/honours") === "view:records"`; `canRecordConduct(actor: Actor, sectionId: number): Promise<boolean>`.

- [ ] **Step 1: Extend the tests**

In `src/lib/auth/roles.test.ts`:

In the "limits a teacher…" test add:
```ts
    expect(canByDefault("TEACHER", "record:conduct")).toBe(true);
```
In the "keeps the office…" test add:
```ts
    expect(canByDefault("OFFICE", "record:conduct")).toBe(true);
```
In "maps each section…" add:
```ts
    expect(capabilityFor("/dashboard/honours")).toBe("view:records");
```
In "covers every capability…" add:
```ts
    expect(CAPABILITIES).toContain("record:conduct");
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth/roles.test.ts`
Expected: FAIL on the new expectations (type error or false).

- [ ] **Step 3: Implement**

In `src/lib/auth/roles.ts`:

- In the `Capability` union, after `"take:attendance"` add:
```ts
  /// Record merits, demerits and activity participations. Teachers are limited
  /// to their own sections.
  | "record:conduct"
```
- In `CAPABILITIES`, insert `"record:conduct"` after `"take:attendance"`.
- In `CAPABILITY_LABEL`, add `"record:conduct": "Record conduct and activities",`.
- In `CAPABILITY_NOTE`, add `"record:conduct": "Teachers are limited to sections they teach or lead.",`.
- In `DEFAULT_GRANTS`, add `"record:conduct"` to ADMIN (after `"take:attendance"`), OFFICE (same place), and TEACHER (`["enter:marks", "take:attendance", "record:conduct", "view:records"]`).
- In `ROUTE_CAPABILITY`, add `{ prefix: "/dashboard/honours", capability: "view:records" },` after the students rule.

Append to `src/lib/auth/scope.ts`:

```ts
/// Conduct and activities follow the attendance rule: a teacher records for
/// the sections they take the register for. The capability itself is checked
/// separately by the action.
export async function canRecordConduct(actor: Actor, sectionId: number) {
  return canTakeAttendance(actor, sectionId);
}
```

And export it from `src/lib/auth/guard.ts` by extending the existing re-export line:
```ts
export { allowedSectionIds, canEnterMarks, canRecordConduct, canTakeAttendance } from "./scope";
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/auth/roles.test.ts; npx tsc --noEmit`
Expected: PASS, no type errors. (`permissions.integration.test.ts` iterates `CAPABILITIES`, so it needs no change.)

- [ ] **Step 5: Commit**

```powershell
git add src/lib/auth/roles.ts src/lib/auth/roles.test.ts src/lib/auth/scope.ts src/lib/auth/guard.ts
git commit -m "feat(auth): record:conduct capability, honours route needs view:records" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 5: Entries service

**Files:**
- Create: `src/lib/honours/entries.ts`
- Test: `src/lib/honours/entries.integration.test.ts`

**Interfaces:**
- Produces:
  - `class HonoursError extends Error`
  - `type ConductInput = { studentId: number; academicYearId: number; kind: ConductKind; points: number; date: Date; note: string; recordedById: number | null }`
  - `type ActivityInput = { studentId: number; academicYearId: number; name: string; level: ActivityLevel; points: number; date: Date; recordedById: number | null }`
  - `addConduct(input: ConductInput)`, `deleteConduct(id: number)`, `listConduct(studentId, academicYearId)`, `conductEntryStudent(id): Promise<number | null>`
  - `addActivity(input: ActivityInput)`, `deleteActivity(id: number)`, `listActivities(studentId, academicYearId)`, `activityEntryStudent(id): Promise<number | null>`
  - `type ConductRow = { id: number; kind: ConductKind; points: number; dateBs: string; note: string }`
  - `type ActivityRow = { id: number; name: string; level: ActivityLevel; points: number; dateBs: string }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/honours/entries.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createStudent } from "@/lib/registry/students";
import {
  HonoursError,
  activityEntryStudent,
  addActivity,
  addConduct,
  conductEntryStudent,
  deleteActivity,
  deleteConduct,
  listActivities,
  listConduct,
} from "./entries";

const made = { yearId: 0, gradeId: 0, sectionId: 0, studentId: 0 };
const BS = 2097;

beforeAll(async () => {
  made.yearId = (await createAcademicYear({ nameBS: String(BS) })).id;
  made.gradeId = (await createGrade({ name: "__hon-e Class 4", order: 9981 })).id;
  made.sectionId = (await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })).id;
  made.studentId = (
    await createStudent({
      admissionNo: `__hon-e-${Date.now()}`,
      firstName: "__hon",
      lastName: "Entries",
      dob: new Date(Date.UTC(2014, 0, 1)),
      gender: "FEMALE",
      admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
      guardians: [{ relation: "MOTHER", fullName: "__hon Mum", phone: "9800000031" }],
      enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
    })
  ).id;
});

afterAll(async () => {
  await prisma.conductEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.activityEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.enrollment.deleteMany({ where: { studentId: made.studentId } });
  await prisma.guardian.deleteMany({ where: { studentId: made.studentId } });
  await prisma.student.deleteMany({ where: { id: made.studentId } });
  await prisma.section.deleteMany({ where: { id: made.sectionId } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("conduct and activity entries", () => {
  it("records conduct and lists it newest first", async () => {
    const base = { studentId: made.studentId, academicYearId: made.yearId, recordedById: null };
    const older = await addConduct({ ...base, kind: "DEMERIT", points: 5, date: bsToAd({ year: BS, month: 2, day: 1 }), note: "Late twice" });
    const newer = await addConduct({ ...base, kind: "MERIT", points: 10, date: bsToAd({ year: BS, month: 3, day: 1 }), note: "Helped in the library" });

    const rows = await listConduct(made.studentId, made.yearId);
    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(rows[0]).toMatchObject({ kind: "MERIT", points: 10, note: "Helped in the library", dateBs: `${BS}-03-01` });
    expect(await conductEntryStudent(older.id)).toBe(made.studentId);

    await deleteConduct(older.id);
    expect(await listConduct(made.studentId, made.yearId)).toHaveLength(1);
    expect(await conductEntryStudent(older.id)).toBeNull();
  });

  it("refuses conduct with no points or no note", async () => {
    const base = { studentId: made.studentId, academicYearId: made.yearId, recordedById: null, date: new Date() };
    await expect(addConduct({ ...base, kind: "MERIT", points: 0, note: "x y" })).rejects.toBeInstanceOf(HonoursError);
    await expect(addConduct({ ...base, kind: "MERIT", points: 101, note: "x y" })).rejects.toBeInstanceOf(HonoursError);
    await expect(addConduct({ ...base, kind: "MERIT", points: 5, note: " " })).rejects.toBeInstanceOf(HonoursError);
  });

  it("records activities and lists them newest first", async () => {
    const base = { studentId: made.studentId, academicYearId: made.yearId, recordedById: null };
    const a = await addActivity({ ...base, name: "Science fair", level: "PLACED", points: 20, date: bsToAd({ year: BS, month: 4, day: 5 }) });
    const b = await addActivity({ ...base, name: "Football", level: "WON", points: 30, date: bsToAd({ year: BS, month: 5, day: 5 }) });

    const rows = await listActivities(made.studentId, made.yearId);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(rows[1]).toMatchObject({ name: "Science fair", level: "PLACED", points: 20, dateBs: `${BS}-04-05` });
    expect(await activityEntryStudent(a.id)).toBe(made.studentId);

    await deleteActivity(a.id);
    expect(await listActivities(made.studentId, made.yearId)).toHaveLength(1);
  });

  it("refuses an activity without a name or points", async () => {
    const base = { studentId: made.studentId, academicYearId: made.yearId, recordedById: null, date: new Date(), level: "WON" as const };
    await expect(addActivity({ ...base, name: "", points: 10 })).rejects.toBeInstanceOf(HonoursError);
    await expect(addActivity({ ...base, name: "Quiz", points: 0 })).rejects.toBeInstanceOf(HonoursError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `$env:DB_TESTS=1; npx vitest run src/lib/honours/entries.integration.test.ts`
Expected: FAIL, cannot resolve `./entries`.

- [ ] **Step 3: Implement**

Create `src/lib/honours/entries.ts`:

```ts
import type { ActivityLevel, ConductKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { toBsInput } from "@/lib/date/bs";

// The two record types behind the conduct and activity pillars. Validation
// lives here rather than only in the form action, so a test can prove it
// without standing up a request.

export class HonoursError extends Error {}

export const MAX_POINTS = 100;

export type ConductInput = {
  studentId: number;
  academicYearId: number;
  kind: ConductKind;
  points: number;
  date: Date;
  note: string;
  recordedById: number | null;
};

export type ActivityInput = {
  studentId: number;
  academicYearId: number;
  name: string;
  level: ActivityLevel;
  points: number;
  date: Date;
  recordedById: number | null;
};

export type ConductRow = { id: number; kind: ConductKind; points: number; dateBs: string; note: string };
export type ActivityRow = { id: number; name: string; level: ActivityLevel; points: number; dateBs: string };

function checkPoints(points: number) {
  if (!Number.isInteger(points) || points < 1 || points > MAX_POINTS) {
    throw new HonoursError(`Points must be a whole number from 1 to ${MAX_POINTS}.`);
  }
}

export function addConduct(input: ConductInput) {
  checkPoints(input.points);
  const note = input.note.trim();
  if (note.length < 2) throw new HonoursError("Say what happened, in a few words.");
  if (note.length > 200) throw new HonoursError("Keep the note under 200 characters.");
  return prisma.conductEntry.create({
    data: {
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      kind: input.kind,
      points: input.points,
      date: input.date,
      note,
      recordedById: input.recordedById,
    },
  });
}

export function deleteConduct(id: number) {
  return prisma.conductEntry.delete({ where: { id } });
}

/// Whose entry this is, so an action can check the actor's scope before
/// deleting. Null when it no longer exists.
export async function conductEntryStudent(id: number): Promise<number | null> {
  const row = await prisma.conductEntry.findUnique({ where: { id }, select: { studentId: true } });
  return row?.studentId ?? null;
}

export async function listConduct(studentId: number, academicYearId: number): Promise<ConductRow[]> {
  const rows = await prisma.conductEntry.findMany({
    where: { studentId, academicYearId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return rows.map((r) => ({ id: r.id, kind: r.kind, points: r.points, dateBs: toBsInput(r.date), note: r.note }));
}

export function addActivity(input: ActivityInput) {
  checkPoints(input.points);
  const name = input.name.trim();
  if (name.length < 2) throw new HonoursError("Name the activity.");
  if (name.length > 80) throw new HonoursError("Keep the activity name under 80 characters.");
  return prisma.activityEntry.create({
    data: {
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      name,
      level: input.level,
      points: input.points,
      date: input.date,
      recordedById: input.recordedById,
    },
  });
}

export function deleteActivity(id: number) {
  return prisma.activityEntry.delete({ where: { id } });
}

export async function activityEntryStudent(id: number): Promise<number | null> {
  const row = await prisma.activityEntry.findUnique({ where: { id }, select: { studentId: true } });
  return row?.studentId ?? null;
}

export async function listActivities(studentId: number, academicYearId: number): Promise<ActivityRow[]> {
  const rows = await prisma.activityEntry.findMany({
    where: { studentId, academicYearId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level, points: r.points, dateBs: toBsInput(r.date) }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `$env:DB_TESTS=1; npx vitest run src/lib/honours/entries.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/honours/entries.ts src/lib/honours/entries.integration.test.ts
git commit -m "feat(honours): conduct and activity entry service" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 6: Honours loader

**Files:**
- Create: `src/lib/honours/honours.ts`
- Test: `src/lib/honours/honours.integration.test.ts`

**Interfaces:**
- Consumes: `evaluate`, `summarise`, `rank` from `src/lib/assessment/grading.ts`; `attendancePercent` from `src/lib/attendance/strip.ts`; Task 2 scoring; `getWeights` from Task 3; `listConduct`, `listActivities` from Task 5.
- Produces:

```ts
export type HonoursStudent = {
  studentId: number; fullName: string; fullNameNp: string | null; photoId: number | null; rollNo: number;
  pillars: Pillars; overall: number | null; position: number | null;
};
export type SectionHonours = {
  sectionId: number; gradeId: number; gradeName: string; sectionName: string; classTeacher: string | null;
  students: HonoursStudent[];  // ranked first (position asc, roll asc), then unranked by roll
};
export type Honours = { year: { id: number; nameBS: string }; weights: Weights; publishedTerms: number; sections: SectionHonours[] };
export type StudentHonours = {
  position: number | null; classSize: number; overall: number | null; pillars: Pillars; weights: Weights;
  conduct: ConductRow[]; activities: ActivityRow[];
};
export function getHonours(academicYearId: number, scope?: { sectionId?: number }): Promise<Honours | null>;
export function getStudentHonours(studentId: number, academicYearId: number): Promise<StudentHonours | null>;
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/honours/honours.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bsToAd } from "@/lib/date/bs";
import { createAcademicYear } from "@/lib/registry/academic-year";
import { createGrade, createSection } from "@/lib/registry/structure";
import { createStudent, updateStudent } from "@/lib/registry/students";
import { createOffering, createSubject } from "@/lib/registry/subjects";
import { createExamTerm, saveMarks, setExamPublished } from "@/lib/assessment/exams";
import { saveSheet } from "@/lib/attendance/attendance";
import { addActivity, addConduct } from "./entries";
import { getHonours, getStudentHonours } from "./honours";
import { DEFAULT_WEIGHTS } from "./score";

const made = {
  yearId: 0, gradeId: 0, sectionId: 0, subjectId: 0, offeringId: 0,
  publishedId: 0, draftId: 0, students: [] as number[],
};
const BS = 2098;

beforeAll(async () => {
  made.yearId = (await createAcademicYear({ nameBS: String(BS) })).id;
  made.gradeId = (await createGrade({ name: "__hon Class 3", order: 9982 })).id;
  made.sectionId = (await createSection({ name: "A", gradeId: made.gradeId, academicYearId: made.yearId })).id;

  const subject = await createSubject({ name: `__hon Maths ${Date.now() % 100000}` });
  made.subjectId = subject.id;
  made.offeringId = (
    await createOffering({ subjectId: subject.id, gradeId: made.gradeId, academicYearId: made.yearId, hasPractical: false, fullMarksTheory: 100, passMarksTheory: 40 })
  ).id;

  for (const last of ["Ace", "Bee", "Cee", "Dee"]) {
    const s = await createStudent({
      admissionNo: `__hon-${Date.now()}-${last}`,
      firstName: "__hon",
      lastName: last,
      dob: new Date(Date.UTC(2015, 0, 1)),
      gender: "MALE",
      admittedOn: bsToAd({ year: BS, month: 1, day: 1 }),
      guardians: [{ relation: "FATHER", fullName: "__hon Dad", phone: "9800000041" }],
      enrollment: { sectionId: made.sectionId, academicYearId: made.yearId },
    });
    made.students.push(s.id);
  }
  const [ace, bee, cee, dee] = made.students;

  made.publishedId = (await createExamTerm({ academicYearId: made.yearId, name: "First Terminal" })).id;
  made.draftId = (await createExamTerm({ academicYearId: made.yearId, name: "Second Terminal" })).id;

  // Ace 90, Bee 70, Cee 50, Dee has no mark → unranked.
  await saveMarks(made.publishedId, made.sectionId, made.offeringId, [
    { studentId: ace, theory: 90, practical: null, isAbsent: false },
    { studentId: bee, theory: 70, practical: null, isAbsent: false },
    { studentId: cee, theory: 50, practical: null, isAbsent: false },
  ]);
  await setExamPublished(made.publishedId, true);
  // The draft term would flip the order if it counted.
  await saveMarks(made.draftId, made.sectionId, made.offeringId, [
    { studentId: ace, theory: 10, practical: null, isAbsent: false },
    { studentId: bee, theory: 100, practical: null, isAbsent: false },
  ]);

  // One roll call: Ace absent, the rest present. Dee has no record at all.
  await saveSheet({
    sectionId: made.sectionId,
    date: bsToAd({ year: BS, month: 1, day: 5 }),
    takenById: null,
    entries: [
      { studentId: ace, status: "ABSENT" },
      { studentId: bee, status: "PRESENT" },
      { studentId: cee, status: "LATE" },
    ],
  });

  const base = { academicYearId: made.yearId, recordedById: null, date: bsToAd({ year: BS, month: 1, day: 9 }) };
  await addConduct({ ...base, studentId: cee, kind: "MERIT", points: 20, note: "Class monitor" });
  await addConduct({ ...base, studentId: ace, kind: "DEMERIT", points: 10, note: "Fighting" });
  await addActivity({ ...base, studentId: bee, name: "Quiz", level: "WON", points: 30 });
});

afterAll(async () => {
  await prisma.conductEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.activityEntry.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.attendanceSession.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.mark.deleteMany({ where: { examTermId: { in: [made.publishedId, made.draftId] } } });
  await prisma.examTerm.deleteMany({ where: { academicYearId: made.yearId } });
  await prisma.enrollment.deleteMany({ where: { studentId: { in: made.students } } });
  await prisma.guardian.deleteMany({ where: { studentId: { in: made.students } } });
  await prisma.student.deleteMany({ where: { id: { in: made.students } } });
  await prisma.subjectOffering.deleteMany({ where: { id: made.offeringId } });
  await prisma.subject.deleteMany({ where: { id: made.subjectId } });
  await prisma.section.deleteMany({ where: { id: made.sectionId } });
  await prisma.grade.deleteMany({ where: { id: made.gradeId } });
  await prisma.academicYear.deleteMany({ where: { id: made.yearId } });
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DB_TESTS)("honours", () => {
  it("scores and ranks a section from published exams, attendance, conduct and activities", async () => {
    const honours = await getHonours(made.yearId);
    expect(honours).not.toBeNull();
    expect(honours!.publishedTerms).toBe(1);
    expect(honours!.sections).toHaveLength(1);

    const section = honours!.sections[0];
    expect(section.gradeName).toBe("__hon Class 3");
    expect(section.sectionName).toBe("A");
    const [ace, bee, cee, dee] = made.students;
    const by = new Map(section.students.map((s) => [s.studentId, s]));

    // Ace: exams 90, attendance 0, conduct 70, activities 0.
    expect(by.get(ace)!.pillars).toEqual({ exams: 90, attendance: 0, conduct: 70, activities: 0 });
    // Bee: exams 70 (the draft 100 is ignored), attendance 100, conduct 80, activities 30.
    expect(by.get(bee)!.pillars).toEqual({ exams: 70, attendance: 100, conduct: 80, activities: 30 });
    // Cee: late counts as attended.
    expect(by.get(cee)!.pillars).toEqual({ exams: 50, attendance: 100, conduct: 100, activities: 0 });
    // Dee: nothing published for them, no roll call.
    expect(by.get(dee)!.pillars).toEqual({ exams: null, attendance: null, conduct: 80, activities: 0 });

    const w = honours!.weights;
    const expected = (p: { exams: number; attendance: number; conduct: number; activities: number }) =>
      Math.round(((w.exams * p.exams + w.attendance * p.attendance + w.conduct * p.conduct + w.activities * p.activities) / 100) * 10) / 10;
    expect(by.get(ace)!.overall).toBe(expected({ exams: 90, attendance: 0, conduct: 70, activities: 0 }));
    expect(by.get(bee)!.overall).toBe(expected({ exams: 70, attendance: 100, conduct: 80, activities: 30 }));
    expect(by.get(dee)!.overall).toBeNull();
    expect(by.get(dee)!.position).toBeNull();

    // Ranked ones come first in position order, then the unranked.
    const order = section.students.map((s) => s.studentId);
    expect(order[3]).toBe(dee);
    const ranked = section.students.slice(0, 3);
    expect(ranked.map((s) => s.position)).toEqual([1, 2, 3]);
    expect([...ranked].sort((a, b) => b.overall! - a.overall!).map((s) => s.studentId)).toEqual(ranked.map((s) => s.studentId));
  });

  it("agrees with the student view and carries the entries", async () => {
    const [ace, bee] = made.students;
    const all = await getHonours(made.yearId);
    const mine = await getStudentHonours(bee, made.yearId);
    expect(mine).not.toBeNull();
    const row = all!.sections[0].students.find((s) => s.studentId === bee)!;
    expect(mine!.overall).toBe(row.overall);
    expect(mine!.position).toBe(row.position);
    expect(mine!.classSize).toBe(4);
    expect(mine!.pillars).toEqual(row.pillars);
    expect(mine!.activities.map((a) => a.name)).toEqual(["Quiz"]);
    expect(mine!.conduct).toEqual([]);

    const theirs = await getStudentHonours(ace, made.yearId);
    expect(theirs!.conduct.map((c) => c.note)).toEqual(["Fighting"]);
  });

  it("leaves out students who are not active", async () => {
    const [, , cee] = made.students;
    const student = await prisma.student.findUniqueOrThrow({ where: { id: cee } });
    await updateStudent(cee, {
      admissionNo: student.admissionNo, firstName: student.firstName, middleName: student.middleName, lastName: student.lastName,
      fullNameNp: student.fullNameNp, dob: student.dob, gender: student.gender, address: student.address,
      admittedOn: student.admittedOn, status: "LEFT",
    });
    try {
      const honours = await getHonours(made.yearId);
      const ids = honours!.sections[0].students.map((s) => s.studentId);
      expect(ids).not.toContain(cee);
      expect(ids).toHaveLength(3);
    } finally {
      await prisma.student.update({ where: { id: cee }, data: { status: "ACTIVE" } });
    }
  });

  it("returns null for an unknown year and nothing for an unknown student", async () => {
    expect(await getHonours(-1)).toBeNull();
    expect(await getStudentHonours(-1, made.yearId)).toBeNull();
  });
});
```

Check `saveSheet`'s parameter shape in `src/lib/attendance/attendance.ts:61` before running; if it differs from `{ sectionId, date, takenById, entries }`, adapt the call, not the service. Check `StudentEdit` in `src/lib/registry/students.ts:139` the same way.

- [ ] **Step 2: Run to verify it fails**

Run: `$env:DB_TESTS=1; npx vitest run src/lib/honours/honours.integration.test.ts`
Expected: FAIL, cannot resolve `./honours`.

- [ ] **Step 3: Implement**

Create `src/lib/honours/honours.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { evaluate, rank, summarise } from "@/lib/assessment/grading";
import { attendancePercent } from "@/lib/attendance/strip";
import { listActivities, listConduct, type ActivityRow, type ConductRow } from "./entries";
import {
  activityScore,
  conductScore,
  examScore,
  overallScore,
  type Pillars,
  type Weights,
} from "./score";
import { getWeights } from "./weights";

// Builds the honours table for a year in a fixed number of queries, whatever
// the size of the school: it evaluates each student's published results
// itself with the same grading functions the ledger uses, rather than calling
// getLedger() once per term and section.

export type HonoursStudent = {
  studentId: number;
  fullName: string;
  fullNameNp: string | null;
  photoId: number | null;
  rollNo: number;
  pillars: Pillars;
  overall: number | null;
  position: number | null;
};

export type SectionHonours = {
  sectionId: number;
  gradeId: number;
  gradeName: string;
  sectionName: string;
  classTeacher: string | null;
  /// Ranked students first in position order, then the unranked by roll.
  students: HonoursStudent[];
};

export type Honours = {
  year: { id: number; nameBS: string };
  weights: Weights;
  publishedTerms: number;
  sections: SectionHonours[];
};

export async function getHonours(
  academicYearId: number,
  scope: { sectionId?: number } = {},
): Promise<Honours | null> {
  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, nameBS: true },
  });
  if (!year) return null;

  const sectionWhere = scope.sectionId === undefined ? {} : { id: scope.sectionId };
  const enrolmentWhere = scope.sectionId === undefined ? {} : { sectionId: scope.sectionId };

  const [weights, sections, enrolments, offerings, terms, marks, attendance, conduct, activities] =
    await Promise.all([
      getWeights(),
      prisma.section.findMany({
        where: { academicYearId, ...sectionWhere },
        orderBy: [{ grade: { order: "asc" } }, { name: "asc" }],
        include: { grade: { select: { name: true } }, classTeacher: { select: { fullName: true } } },
      }),
      prisma.enrollment.findMany({
        where: { academicYearId, student: { status: "ACTIVE" }, ...enrolmentWhere },
        orderBy: { rollNo: "asc" },
        include: {
          student: { select: { id: true, fullName: true, fullNameNp: true, photoId: true } },
        },
      }),
      prisma.subjectOffering.findMany({ where: { academicYearId } }),
      prisma.examTerm.findMany({
        where: { academicYearId, isPublished: true },
        select: { id: true },
      }),
      prisma.mark.findMany({
        where: { examTerm: { academicYearId, isPublished: true } },
        select: { examTermId: true, studentId: true, subjectOfferingId: true, theory: true, practical: true, isAbsent: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { session: { academicYearId, ...enrolmentWhere } },
        select: { studentId: true, status: true },
      }),
      prisma.conductEntry.groupBy({
        by: ["studentId", "kind"],
        where: { academicYearId },
        _sum: { points: true },
      }),
      prisma.activityEntry.groupBy({
        by: ["studentId"],
        where: { academicYearId },
        _sum: { points: true },
      }),
    ]);

  // Offerings by grade, marks by (term, student, offering).
  const offeringsByGrade = new Map<number, typeof offerings>();
  for (const o of offerings) {
    const list = offeringsByGrade.get(o.gradeId) ?? [];
    list.push(o);
    offeringsByGrade.set(o.gradeId, list);
  }
  const markKey = (termId: number, studentId: number, offeringId: number) => `${termId}:${studentId}:${offeringId}`;
  const markByKey = new Map(marks.map((m) => [markKey(m.examTermId, m.studentId, m.subjectOfferingId), m]));

  const attendanceByStudent = new Map<number, { status: string }[]>();
  for (const r of attendance) {
    const list = attendanceByStudent.get(r.studentId) ?? [];
    list.push(r);
    attendanceByStudent.set(r.studentId, list);
  }

  const conductByStudent = new Map<number, { merits: number; demerits: number }>();
  for (const row of conduct) {
    const entry = conductByStudent.get(row.studentId) ?? { merits: 0, demerits: 0 };
    if (row.kind === "MERIT") entry.merits += row._sum.points ?? 0;
    else entry.demerits += row._sum.points ?? 0;
    conductByStudent.set(row.studentId, entry);
  }
  const activityByStudent = new Map(activities.map((a) => [a.studentId, a._sum.points ?? 0]));

  const examPillar = (studentId: number, gradeId: number): number | null => {
    const graded = offeringsByGrade.get(gradeId) ?? [];
    if (graded.length === 0) return null;
    const percents = terms.map((term) => {
      const results = graded.map((offering) => {
        const mark = markByKey.get(markKey(term.id, studentId, offering.id));
        return evaluate(
          {
            theory: mark?.theory ?? null,
            practical: mark?.practical ?? null,
            isAbsent: mark?.isAbsent ?? false,
          },
          offering,
        );
      });
      const overall = summarise(results);
      return overall.complete ? overall.percent : null;
    });
    return examScore(percents);
  };

  const pillarsFor = (studentId: number, gradeId: number): Pillars => {
    const c = conductByStudent.get(studentId) ?? { merits: 0, demerits: 0 };
    return {
      exams: examPillar(studentId, gradeId),
      attendance: attendancePercent(attendanceByStudent.get(studentId) ?? []),
      conduct: conductScore(c.merits, c.demerits),
      activities: activityScore(activityByStudent.get(studentId) ?? 0),
    };
  };

  const bySection = new Map<number, typeof enrolments>();
  for (const e of enrolments) {
    const list = bySection.get(e.sectionId) ?? [];
    list.push(e);
    bySection.set(e.sectionId, list);
  }

  const result: SectionHonours[] = sections.map((section) => {
    const rows = (bySection.get(section.id) ?? []).map((e) => {
      const pillars = pillarsFor(e.student.id, section.gradeId);
      return {
        studentId: e.student.id,
        fullName: e.student.fullName,
        fullNameNp: e.student.fullNameNp,
        photoId: e.student.photoId,
        rollNo: e.rollNo,
        pillars,
        overall: overallScore(pillars, weights),
      };
    });
    const positions = rank(rows, (r) => r.overall);
    const students: HonoursStudent[] = rows
      .map((r) => ({ ...r, position: positions.get(r) ?? null }))
      .sort((a, b) => {
        if (a.position === null && b.position === null) return a.rollNo - b.rollNo;
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        return a.position - b.position || a.rollNo - b.rollNo;
      });

    return {
      sectionId: section.id,
      gradeId: section.gradeId,
      gradeName: section.grade.name,
      sectionName: section.name,
      classTeacher: section.classTeacher?.fullName ?? null,
      students,
    };
  });

  return { year, weights, publishedTerms: terms.length, sections: result };
}

export type StudentHonours = {
  position: number | null;
  classSize: number;
  overall: number | null;
  pillars: Pillars;
  weights: Weights;
  conduct: ConductRow[];
  activities: ActivityRow[];
};

/// One student's standing, worked out from their whole section because a
/// position only means something against classmates.
export async function getStudentHonours(
  studentId: number,
  academicYearId: number,
): Promise<StudentHonours | null> {
  const enrolment = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    select: { sectionId: true },
  });
  if (!enrolment) return null;

  const [honours, conduct, activities] = await Promise.all([
    getHonours(academicYearId, { sectionId: enrolment.sectionId }),
    listConduct(studentId, academicYearId),
    listActivities(studentId, academicYearId),
  ]);
  const section = honours?.sections[0];
  const row = section?.students.find((s) => s.studentId === studentId);
  if (!honours || !section || !row) return null;

  return {
    position: row.position,
    classSize: section.students.length,
    overall: row.overall,
    pillars: row.pillars,
    weights: honours.weights,
    conduct,
    activities,
  };
}
```

Note: `evaluate(mark, offering)` works because a `SubjectOffering` row structurally satisfies `Scheme`. If TypeScript objects, pass `{ fullMarksTheory: offering.fullMarksTheory, passMarksTheory: offering.passMarksTheory, hasPractical: offering.hasPractical, fullMarksPractical: offering.fullMarksPractical, passMarksPractical: offering.passMarksPractical }`.

- [ ] **Step 4: Run to verify it passes**

Run: `$env:DB_TESTS=1; npx vitest run src/lib/honours/honours.integration.test.ts`
Expected: PASS. If the attendance pillar for Dee is not null, check that `attendancePercent([])` returns null (it does at `strip.ts:28`) and that the attendance query is not returning other students' rows.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/honours/honours.ts src/lib/honours/honours.integration.test.ts
git commit -m "feat(honours): section and student honours loader" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 7: Honours page, podium, nav

**Files:**
- Modify: `src/app/globals.css` (tokens in `:root`, `.dark`, and `@theme inline`)
- Create: `src/components/ui/student-avatar.tsx`
- Create: `src/app/dashboard/honours/page.tsx`
- Create: `src/app/dashboard/honours/_components/honours-workspace.tsx`
- Create: `src/app/dashboard/honours/_components/section-card.tsx`
- Create: `src/app/dashboard/honours/_components/podium.tsx`
- Create: `src/app/dashboard/honours/_components/ranked-list.tsx`
- Modify: `src/app/dashboard/_components/nav-model.ts`
- Modify: `scripts/ui-smoke.cjs:27-40`

**Interfaces:**
- Consumes: `getHonours`, `Honours`, `SectionHonours`, `HonoursStudent` (Task 6); `ordinal` (Task 2); `sectionCode` from `src/lib/register-codes.ts`; `PageFrame`, `RegisterTabs`, `registerTabId`, `EmptyState`, `Input`.
- Produces: `StudentAvatar({ photoId, name, size, className })` shared by the podium, the list and later tasks.

- [ ] **Step 1: Add medal tokens**

In `src/app/globals.css`:

In `:root`, after the `--bad-tint` line:
```css
  /* Podium metals. One lightness apart so the three steps read in order even
     in greyscale; the position label is always printed beside them. */
  --gold: oklch(0.76 0.14 85);
  --gold-tint: oklch(0.96 0.05 90);
  --silver: oklch(0.72 0.02 250);
  --silver-tint: oklch(0.95 0.008 250);
  --bronze: oklch(0.62 0.10 50);
  --bronze-tint: oklch(0.95 0.04 55);
```
In `.dark`, after its `--bad-tint` line:
```css
  --gold: oklch(0.82 0.14 88);
  --gold-tint: oklch(0.30 0.06 85);
  --silver: oklch(0.80 0.015 250);
  --silver-tint: oklch(0.30 0.01 250);
  --bronze: oklch(0.72 0.11 55);
  --bronze-tint: oklch(0.30 0.05 50);
```
In `@theme inline`, after `--color-bad-tint`:
```css
  --color-gold: var(--gold);
  --color-gold-tint: var(--gold-tint);
  --color-silver: var(--silver);
  --color-silver-tint: var(--silver-tint);
  --color-bronze: var(--bronze);
  --color-bronze-tint: var(--bronze-tint);
```

- [ ] **Step 2: Shared avatar**

Create `src/components/ui/student-avatar.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/// The photo from our own route, or an initials tile in the brand tint. The
/// pane and the podium share it so a student looks the same everywhere.
export function StudentAvatar({
  photoId,
  name,
  className,
}: {
  photoId: number | null;
  name: string;
  className?: string;
}) {
  if (photoId) {
    return (
      // Served from our own authenticated route; next/image would add nothing
      // for a private thumbnail.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/photo/${photoId}`} alt="" className={cn("size-13 shrink-0 rounded-xl object-cover", className)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "from-brand-tint-2 to-brand-tint text-brand-text font-display grid size-13 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-lg font-bold",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
```

- [ ] **Step 3: Podium**

Create `src/app/dashboard/honours/_components/podium.tsx`:

```tsx
import Link from "next/link";
import { StudentAvatar } from "@/components/ui/student-avatar";
import type { HonoursStudent } from "@/lib/honours/honours";
import { ordinal } from "@/lib/honours/score";
import { cn } from "@/lib/utils";

const STEP: Record<1 | 2 | 3, { ring: string; badge: string; height: string; avatar: string; order: string }> = {
  1: { ring: "ring-gold", badge: "bg-gold-tint text-gold", height: "h-24", avatar: "size-20 text-2xl", order: "order-2" },
  2: { ring: "ring-silver", badge: "bg-silver-tint text-silver", height: "h-16", avatar: "size-16 text-xl", order: "order-1" },
  3: { ring: "ring-bronze", badge: "bg-bronze-tint text-bronze", height: "h-12", avatar: "size-14 text-lg", order: "order-3" },
};

/// The top three, second on the left, first raised in the middle, third on
/// the right. Takes whatever is ranked in the first three rows; a tie shares a
/// step label, and a short section leaves steps empty rather than inventing
/// placings.
export function Podium({ students }: { students: HonoursStudent[] }) {
  const top = students.filter((s) => s.position !== null).slice(0, 3);
  const slots = ([1, 2, 3] as const).map((step) => ({ step, student: top[step - 1] ?? null }));

  return (
    <ol className="grid grid-cols-3 items-end gap-3" aria-label="Podium">
      {slots.map(({ step, student }) => {
        const look = STEP[step];
        return (
          <li key={step} className={cn("flex flex-col items-center", look.order)}>
            {student ? (
              <Link
                href={`/dashboard/students?student=${student.studentId}`}
                className="group flex min-w-0 flex-col items-center gap-2 text-center"
              >
                <StudentAvatar
                  photoId={student.photoId}
                  name={student.fullName}
                  className={cn("rounded-full ring-4 ring-offset-2 ring-offset-surface", look.ring, look.avatar)}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium group-hover:underline">{student.fullName}</span>
                  <span className="text-ink-3 block text-[12px]">Roll {student.rollNo}</span>
                </span>
                <span className="font-display text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                  {student.overall?.toFixed(1)}
                </span>
              </Link>
            ) : (
              <span className="text-ink-3 text-[12px]">—</span>
            )}
            <span
              className={cn(
                "mt-2 flex w-full items-start justify-center rounded-t-lg border border-b-0 border-line pt-2",
                look.height,
                step === 1 ? "bg-gold-tint" : step === 2 ? "bg-silver-tint" : "bg-bronze-tint",
              )}
            >
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase", look.badge)}>
                {student?.position ? ordinal(student.position) : ordinal(step)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Ranked list**

Create `src/app/dashboard/honours/_components/ranked-list.tsx`:

```tsx
import Link from "next/link";
import { StudentAvatar } from "@/components/ui/student-avatar";
import type { HonoursStudent } from "@/lib/honours/honours";
import { ordinal } from "@/lib/honours/score";

function Pillar({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="text-ink-3 font-mono text-[11.5px] tabular-nums">
      <span className="text-ink-3/70">{label}</span> {value === null ? "—" : Math.round(value)}
    </span>
  );
}

function Row({ s }: { s: HonoursStudent }) {
  return (
    <li>
      <Link
        href={`/dashboard/students?student=${s.studentId}`}
        className="hover:bg-surface-2 grid grid-cols-[2.5rem_2rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5"
      >
        <span className="text-ink-2 font-mono text-[12.5px] tabular-nums">{s.position === null ? "—" : ordinal(s.position)}</span>
        <StudentAvatar photoId={s.photoId} name={s.fullName} className="size-8 rounded-lg text-xs" />
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {s.fullName} <span className="text-ink-3 font-normal">· Roll {s.rollNo}</span>
          </span>
          <span className="flex flex-wrap gap-x-3">
            <Pillar label="Exam" value={s.pillars.exams} />
            <Pillar label="Att" value={s.pillars.attendance} />
            <Pillar label="Cond" value={s.pillars.conduct} />
            <Pillar label="Act" value={s.pillars.activities} />
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="bg-line hidden h-1.5 w-[72px] overflow-hidden rounded-full sm:block" aria-hidden="true">
            <i className="bg-brand block h-full" style={{ width: `${s.overall ?? 0}%` }} />
          </span>
          <span className="w-11 text-right font-mono text-[13px] tabular-nums">{s.overall === null ? "—" : s.overall.toFixed(1)}</span>
        </span>
      </Link>
    </li>
  );
}

/// Everyone after the podium, then the unranked in their own group so the
/// "—" rows do not read as last place.
export function RankedList({ students }: { students: HonoursStudent[] }) {
  const ranked = students.filter((s) => s.position !== null).slice(3);
  const waiting = students.filter((s) => s.position === null);

  return (
    <div className="space-y-3">
      {ranked.length > 0 ? (
        <ol className="space-y-0.5">{ranked.map((s) => <Row key={s.studentId} s={s} />)}</ol>
      ) : null}
      {waiting.length > 0 ? (
        <div>
          <p className="text-ink-3 mb-1 px-2 text-[11px] font-medium tracking-[0.1em] uppercase">
            Awaiting a published result · {waiting.length}
          </p>
          <ul className="space-y-0.5 opacity-75">{waiting.map((s) => <Row key={s.studentId} s={s} />)}</ul>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Section card**

Create `src/app/dashboard/honours/_components/section-card.tsx`:

```tsx
import type { SectionHonours } from "@/lib/honours/honours";
import { Podium } from "./podium";
import { RankedList } from "./ranked-list";

export function SectionCard({ section }: { section: SectionHonours }) {
  const ranked = section.students.filter((s) => s.position !== null).length;
  return (
    <section className="border-line bg-surface rounded-[10px] border p-4 sm:p-5" aria-labelledby={`honours-${section.sectionId}`}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`honours-${section.sectionId}`} className="font-display text-lg font-semibold tracking-[-0.015em]">
          {section.gradeName} {section.sectionName}
        </h2>
        <p className="text-ink-3 text-[12.5px]">
          {ranked} of {section.students.length} ranked
          {section.classTeacher ? ` · ${section.classTeacher}` : ""}
        </p>
      </header>

      {section.students.length === 0 ? (
        <p className="text-ink-3 text-sm">Nobody is enrolled here.</p>
      ) : ranked === 0 ? (
        <p className="text-ink-3 mb-3 text-sm">No published exam covers this section yet, so nobody can be placed.</p>
      ) : (
        <div className="mx-auto mb-5 max-w-md">
          <Podium students={section.students} />
        </div>
      )}

      <RankedList students={section.students} />
    </section>
  );
}
```

- [ ] **Step 6: Workspace**

Create `src/app/dashboard/honours/_components/honours-workspace.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import type { Honours } from "@/lib/honours/honours";
import { sectionCode } from "@/lib/register-codes";
import { SectionCard } from "./section-card";

export function HonoursWorkspace({ honours }: { honours: Honours }) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  // One tab per grade, in grade order; the sections of a grade sit inside it.
  const grades = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; students: number }>();
    for (const s of honours.sections) {
      const g = seen.get(s.gradeId) ?? { id: s.gradeId, name: s.gradeName, students: 0 };
      g.students += s.students.length;
      seen.set(s.gradeId, g);
    }
    return [...seen.values()];
  }, [honours.sections]);

  const [tab, setTab] = useState<string>(String(grades[0]?.id ?? ""));
  const [query, setQuery] = useState("");

  const tabs = useMemo<RegisterTab[]>(
    () =>
      grades.map((g) => ({
        id: String(g.id),
        code: sectionCode(g.name, ""),
        label: g.name,
        count: g.students,
        empty: g.students === 0,
      })),
    [grades],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return honours.sections
      .filter((s) => String(s.gradeId) === tab)
      .map((s) =>
        q
          ? { ...s, students: s.students.filter((st) => `${st.fullName} ${st.fullNameNp ?? ""}`.toLowerCase().includes(q)) }
          : s,
      );
  }, [honours.sections, tab, query]);

  const ranked = honours.sections.reduce((n, s) => n + s.students.filter((st) => st.position !== null).length, 0);
  const w = honours.weights;

  return (
    <PageFrame eyebrow="Assessment" title="Honours" meta={`${ranked} ranked · ${honours.year.nameBS}`}>
      <PageFrame.Tabs>
        <RegisterTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Grades" baseId={baseId} panelId={panelId} />
      </PageFrame.Tabs>

      <PageFrame.Toolbar>
        <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[220px] shrink-0 items-center gap-2 rounded-lg border px-2.5">
          <Search className="size-3.5" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names"
            aria-label="Search names"
            className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <span className="flex-1" />
        <span className="text-ink-3 shrink-0 font-mono text-[12px] whitespace-nowrap tabular-nums">
          Exam {w.exams} · Att {w.attendance} · Cond {w.conduct} · Act {w.activities}
        </span>
      </PageFrame.Toolbar>

      {honours.publishedTerms === 0 ? (
        <p role="status" className="text-warn bg-warn-tint border-warn/30 mb-3 rounded-lg border px-3 py-2 text-sm">
          No exam has been published this year, so nobody can be ranked yet. Publish a term on the Exams page.
        </p>
      ) : null}

      <PageFrame.Body id={panelId} labelledBy={registerTabId(baseId, tab)} className="bg-transparent border-0 overflow-y-auto">
        <div className="space-y-4 pb-4">
          {visible.map((s) => <SectionCard key={s.sectionId} section={s} />)}
        </div>
      </PageFrame.Body>
    </PageFrame>
  );
}
```

- [ ] **Step 7: Page**

Create `src/app/dashboard/honours/page.tsx`:

```tsx
import { Info, Trophy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
import { requirePage } from "@/lib/auth/guard";
import { getHonours } from "@/lib/honours/honours";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { HonoursWorkspace } from "./_components/honours-workspace";

export default async function HonoursPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/honours");

  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    return (
      <PageFrame eyebrow="Assessment" title="Honours">
        <EmptyState
          icon={Info}
          title="No current academic year"
          description="Rankings belong to a year. Set the current year on the Classes page first."
          action={<Button nativeButton={false} render={<Link href="/dashboard/classes" />}>Go to Classes</Button>}
        />
      </PageFrame>
    );
  }

  const honours = await getHonours(currentYear.id);
  if (!honours || honours.sections.length === 0) {
    return (
      <PageFrame eyebrow="Assessment" title="Honours">
        <EmptyState
          icon={Trophy}
          title="No sections yet"
          description="Add a section on the Classes page and enrol students before ranking them."
          action={<Button nativeButton={false} render={<Link href="/dashboard/classes" />}>Go to Classes</Button>}
        />
      </PageFrame>
    );
  }

  return <HonoursWorkspace honours={honours} />;
}
```

- [ ] **Step 8: Nav and smoke**

In `src/app/dashboard/_components/nav-model.ts`: add `Trophy` to the lucide import and append to the `daily` group's items:
```ts
      { id: "honours", label: "Honours", href: "/dashboard/honours", icon: Trophy },
```
In `scripts/ui-smoke.cjs`, add `"dashboard/honours",` after `"dashboard/exams",`.

- [ ] **Step 9: Verify in the browser**

Run: `npx tsc --noEmit; npm run lint` — expected clean.
Then start `npm run dev` in the background, sign in, open `/dashboard/honours`. Expected: a tab per grade, section cards with a podium where a published exam exists, otherwise the warning line and an "Awaiting" list. Confirm the nav shows Honours and the icon rail highlights it. Check dark mode once.

- [ ] **Step 10: Commit**

```powershell
git add src/app/globals.css src/components/ui/student-avatar.tsx src/app/dashboard/honours src/app/dashboard/_components/nav-model.ts scripts/ui-smoke.cjs
git commit -m "feat(honours): podium page with a tab per grade" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 8: Student pane — standing, conduct, activities

**Files:**
- Modify: `src/lib/registry/students.ts` (`StudentSummary`, `getStudentSummary`)
- Modify: `src/app/dashboard/students/actions.ts` (append)
- Create: `src/app/dashboard/students/_components/honours-sections.tsx`
- Modify: `src/app/dashboard/students/_components/student-pane.tsx`
- Modify: `src/lib/registry/options.ts` (append)

**Interfaces:**
- Consumes: `getStudentHonours`, `StudentHonours` (Task 6); `addConduct`, `deleteConduct`, `conductEntryStudent`, `addActivity`, `deleteActivity`, `activityEntryStudent`, `HonoursError` (Task 5); `canRecordConduct` (Task 4); `ACTIVITY_POINTS`, `ordinal` (Task 2).
- Produces: `StudentSummary.honours: StudentHonours | null`; actions `saveConduct`, `removeConduct`, `saveActivity`, `removeActivity` of type `(prev: ActionState, formData: FormData) => Promise<ActionState>`.

- [ ] **Step 1: Extend the summary**

In `src/lib/registry/students.ts`:

- Import: `import { getStudentHonours, type StudentHonours } from "@/lib/honours/honours";`
- In `StudentSummary`, after `exams`, add `honours: StudentHonours | null;`.
- In `getStudentSummary`, change the `Promise.all` to also load honours:

```ts
  const [records, sheets, honours] = await Promise.all([
    year ? studentCalendar(studentId, year.startsOn, year.endsOn) : Promise.resolve([]),
    getStudentMarksheets(studentId),
    current ? getStudentHonours(studentId, academicYearId) : Promise.resolve(null),
  ]);
```
- In the returned object, after `exams: ...`, add `honours,`.

Run `npx tsc --noEmit`. Expected: an error in `src/lib/registry/summaries.integration.test.ts` only if it builds a `StudentSummary` literal; otherwise clean. Fix any literal by adding `honours: null`.

- [ ] **Step 2: Add the options**

Append to `src/lib/registry/options.ts`:

```ts
export const CONDUCT_KIND_OPTIONS: SelectOption[] = [
  { value: "MERIT", label: "Merit" },
  { value: "DEMERIT", label: "Demerit" },
];

export const ACTIVITY_LEVEL_OPTIONS: SelectOption[] = [
  { value: "PARTICIPATED", label: "Participated" },
  { value: "PLACED", label: "Placed" },
  { value: "WON", label: "Won" },
];
```

- [ ] **Step 3: Add the actions**

Append to `src/app/dashboard/students/actions.ts` (add imports at the top: `import type { ActivityLevel, ConductKind } from "@/generated/prisma/enums";`, `import { canRecordConduct, currentActor } from "@/lib/auth/guard";` — merge with the existing guard import — `import { getCurrentAcademicYear } from "@/lib/registry/academic-year";`, `import { prisma } from "@/lib/prisma";`, and `import { HonoursError, activityEntryStudent, addActivity, addConduct, conductEntryStudent, deleteActivity, deleteConduct } from "@/lib/honours/entries";`):

```ts
const CONDUCT_KINDS: ConductKind[] = ["MERIT", "DEMERIT"];
const ACTIVITY_LEVELS: ActivityLevel[] = ["PARTICIPATED", "PLACED", "WON"];

/// The capability, then the scope: a teacher records only for the sections
/// they take the register for. Returns what the write needs, or the message
/// to show.
async function recordingContext(studentId: number) {
  const actor = await requireCapability("record:conduct");
  const year = await getCurrentAcademicYear();
  if (!year) return { error: "No academic year is current." } as const;

  const enrolment = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
    select: { sectionId: true },
  });
  if (!enrolment) return { error: "That student is not enrolled this year." } as const;

  if (!(await canRecordConduct(actor, enrolment.sectionId))) {
    return { error: "Only teachers of this student's section can record for them." } as const;
  }
  return { actor, year } as const;
}

function readDate(formData: FormData, year: { startsOn: Date; endsOn: Date }) {
  const date = parseBsInput(String(formData.get("dateBs") ?? ""));
  if (!date) return { error: "Enter a valid date (YYYY-MM-DD in BS)." } as const;
  if (date < year.startsOn || date > year.endsOn) {
    return { error: "The date must fall within the current academic year." } as const;
  }
  return { date } as const;
}

export async function saveConduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = numericField(formData, "studentId");
  if (studentId === null) return { error: "Pick a student." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  const kind = String(formData.get("kind") ?? "") as ConductKind;
  if (!CONDUCT_KINDS.includes(kind)) return { error: "Pick merit or demerit." };
  const points = Number(String(formData.get("points") ?? "").trim());
  const when = readDate(formData, context.year);
  if ("error" in when) return { error: when.error };

  try {
    await addConduct({
      studentId,
      academicYearId: context.year.id,
      kind,
      points,
      date: when.date,
      note: String(formData.get("note") ?? ""),
      recordedById: context.actor.userId,
    });
  } catch (e) {
    if (e instanceof HonoursError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/honours");
  return { success: kind === "MERIT" ? "Merit recorded." : "Demerit recorded." };
}

export async function removeConduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = numericField(formData, "conductId");
  if (id === null) return { error: "Pick an entry." };
  const studentId = await conductEntryStudent(id);
  if (studentId === null) return { error: "That entry is already gone." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  await deleteConduct(id);
  revalidatePath(PATH);
  revalidatePath("/dashboard/honours");
  return { success: "Entry removed." };
}

export async function saveActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = numericField(formData, "studentId");
  if (studentId === null) return { error: "Pick a student." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  const level = String(formData.get("level") ?? "") as ActivityLevel;
  if (!ACTIVITY_LEVELS.includes(level)) return { error: "Pick how they did." };
  const points = Number(String(formData.get("points") ?? "").trim());
  const when = readDate(formData, context.year);
  if ("error" in when) return { error: when.error };

  try {
    await addActivity({
      studentId,
      academicYearId: context.year.id,
      name: String(formData.get("name") ?? ""),
      level,
      points,
      date: when.date,
      recordedById: context.actor.userId,
    });
  } catch (e) {
    if (e instanceof HonoursError) return { error: e.message };
    throw e;
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/honours");
  return { success: "Activity recorded." };
}

export async function removeActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = numericField(formData, "activityId");
  if (id === null) return { error: "Pick an entry." };
  const studentId = await activityEntryStudent(id);
  if (studentId === null) return { error: "That entry is already gone." };

  let context;
  try {
    context = await recordingContext(studentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  if ("error" in context) return { error: context.error };

  await deleteActivity(id);
  revalidatePath(PATH);
  revalidatePath("/dashboard/honours");
  return { success: "Entry removed." };
}
```

`currentActor` is not needed if `requireCapability` returns the actor (it does); drop it from the import if unused.

- [ ] **Step 4: The pane sections**

Create `src/app/dashboard/students/_components/honours-sections.tsx`:

```tsx
"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { BsDateField } from "@/components/ui/bs-date-field";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DetailPane } from "@/components/ui/detail-pane";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { toBsInput } from "@/lib/date/bs";
import type { StudentHonours } from "@/lib/honours/honours";
import { ACTIVITY_POINTS, ordinal } from "@/lib/honours/score";
import { ACTIVITY_LEVEL_OPTIONS, CONDUCT_KIND_OPTIONS } from "@/lib/registry/options";
import { type ActionState, removeActivity, removeConduct, saveActivity, saveConduct } from "../actions";

const EMPTY: ActionState = {};

function Pillar({ label, value, weight }: { label: string; value: number | null; weight: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3 text-[11.5px]">
        {label} <span className="font-mono">×{weight}</span>
      </dt>
      <dd className="mt-px font-mono font-medium tabular-nums">{value === null ? "—" : Math.round(value)}</dd>
    </div>
  );
}

/// Standing, conduct and activities for the read view of the pane. Forms are
/// hidden behind "Add" so the pane stays a record first and an editor second.
export function HonoursSections({ studentId, honours }: { studentId: number; honours: StudentHonours }) {
  const [conductState, conductAction, savingConduct] = useToastedActionState(saveConduct, EMPTY);
  const [, conductRemove] = useToastedActionState(removeConduct, EMPTY);
  const [activityState, activityAction, savingActivity] = useToastedActionState(saveActivity, EMPTY);
  const [, activityRemove] = useToastedActionState(removeActivity, EMPTY);
  const [addingConduct, setAddingConduct] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const [level, setLevel] = useState<keyof typeof ACTIVITY_POINTS>("PARTICIPATED");
  const [activityPoints, setActivityPoints] = useState(String(ACTIVITY_POINTS.PARTICIPATED));

  const today = toBsInput(new Date());
  const w = honours.weights;

  return (
    <>
      <DetailPane.Section label="Standing">
        <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {honours.position === null ? "—" : ordinal(honours.position)}
          <span className="font-body text-ink-3 ml-1.5 text-[12.5px] font-normal tracking-normal">
            {honours.position === null
              ? "awaiting a published result"
              : `of ${honours.classSize} · score ${honours.overall?.toFixed(1)}`}
          </span>
        </p>
        <dl className="mt-2.5 grid grid-cols-4 gap-x-3">
          <Pillar label="Exams" value={honours.pillars.exams} weight={w.exams} />
          <Pillar label="Attend." value={honours.pillars.attendance} weight={w.attendance} />
          <Pillar label="Conduct" value={honours.pillars.conduct} weight={w.conduct} />
          <Pillar label="Activities" value={honours.pillars.activities} weight={w.activities} />
        </dl>
      </DetailPane.Section>

      <DetailPane.Section label="Conduct this year">
        <ul className="space-y-1.5 text-[12.5px]">
          {honours.conduct.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className="text-ink-3 font-mono tabular-nums">{c.dateBs}</span>
              <span className={c.kind === "MERIT" ? "text-ok font-mono tabular-nums" : "text-bad font-mono tabular-nums"}>
                {c.kind === "MERIT" ? "+" : "−"}{c.points}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.note}</span>
              <form action={conductRemove}>
                <input type="hidden" name="conductId" value={c.id} />
                <ConfirmSubmit label="Remove" confirmLabel="Remove?" pendingLabel="Removing…" size="sm" icon />
              </form>
            </li>
          ))}
          {honours.conduct.length === 0 ? <li className="text-ink-3">No merits or demerits recorded.</li> : null}
        </ul>
        {addingConduct ? (
          <form
            action={conductAction}
            className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2"
            onSubmit={() => setTimeout(() => setAddingConduct(false), 0)}
          >
            <input type="hidden" name="studentId" value={studentId} />
            <div className="space-y-1">
              <Label htmlFor={`ck-${studentId}`}>Kind</Label>
              <FieldSelect id={`ck-${studentId}`} name="kind" defaultValue="MERIT" options={CONDUCT_KIND_OPTIONS} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cp-${studentId}`}>Points</Label>
              <Input id={`cp-${studentId}`} name="points" type="number" min={1} max={100} defaultValue={5} required />
            </div>
            <BsDateField id={`cd-${studentId}`} name="dateBs" label="Date (BS)" defaultValue={today} required />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`cn-${studentId}`}>What happened</Label>
              <Input id={`cn-${studentId}`} name="note" maxLength={200} placeholder="A few words" required />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={savingConduct}>{savingConduct ? "Saving…" : "Save"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddingConduct(false)}>Cancel</Button>
              {conductState.error ? <p className="text-destructive text-sm">{conductState.error}</p> : null}
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddingConduct(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add merit or demerit
          </Button>
        )}
      </DetailPane.Section>

      <DetailPane.Section label="Activities this year">
        <ul className="space-y-1.5 text-[12.5px]">
          {honours.activities.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <span className="text-ink-3 font-mono tabular-nums">{a.dateBs}</span>
              <span className="min-w-0 flex-1 truncate">
                {a.name} <span className="text-ink-3">· {a.level[0]}{a.level.slice(1).toLowerCase()}</span>
              </span>
              <span className="font-mono tabular-nums">+{a.points}</span>
              <form action={activityRemove}>
                <input type="hidden" name="activityId" value={a.id} />
                <ConfirmSubmit label="Remove" confirmLabel="Remove?" pendingLabel="Removing…" size="sm" icon />
              </form>
            </li>
          ))}
          {honours.activities.length === 0 ? <li className="text-ink-3">No activities recorded.</li> : null}
        </ul>
        {addingActivity ? (
          <form
            action={activityAction}
            className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2"
            onSubmit={() => setTimeout(() => setAddingActivity(false), 0)}
          >
            <input type="hidden" name="studentId" value={studentId} />
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`an-${studentId}`}>Activity</Label>
              <Input id={`an-${studentId}`} name="name" maxLength={80} placeholder="Science fair, football, debate…" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`al-${studentId}`}>Result</Label>
              <FieldSelect
                id={`al-${studentId}`}
                name="level"
                value={level}
                onValueChange={(v) => {
                  const next = (v ?? "PARTICIPATED") as keyof typeof ACTIVITY_POINTS;
                  setLevel(next);
                  setActivityPoints(String(ACTIVITY_POINTS[next]));
                }}
                options={ACTIVITY_LEVEL_OPTIONS}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ap-${studentId}`}>Points</Label>
              <Input id={`ap-${studentId}`} name="points" type="number" min={1} max={100} value={activityPoints} onChange={(e) => setActivityPoints(e.target.value)} required />
            </div>
            <BsDateField id={`ad-${studentId}`} name="dateBs" label="Date (BS)" defaultValue={today} required />
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={savingActivity}>{savingActivity ? "Saving…" : "Save"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAddingActivity(false)}>
                <X data-icon="inline-start" aria-hidden="true" />
                Cancel
              </Button>
              {activityState.error ? <p className="text-destructive text-sm">{activityState.error}</p> : null}
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddingActivity(true)}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add activity
          </Button>
        )}
      </DetailPane.Section>
    </>
  );
}
```

Do not close the form on submit if the action returned an error: replace the `onSubmit` timeouts with an effect that closes the form when `conductState.success` / `activityState.success` changes to a value, if the timeout approach hides a validation error during testing.

- [ ] **Step 5: Mount it in the pane**

In `src/app/dashboard/students/_components/student-pane.tsx`:

- Import `import { HonoursSections } from "./honours-sections";`.
- In the read view, after the "Marks" `DetailPane.Section` and before "History", add:
```tsx
          {summary.honours ? <HonoursSections studentId={summary.studentId} honours={summary.honours} /> : null}
```
- Replace the local `initialsOf` and the inline `<img>` with the shared avatar: `import { StudentAvatar, initialsOf } from "@/components/ui/student-avatar";` and pass `photo={summary.photoId ? <StudentAvatar photoId={summary.photoId} name={summary.fullName} /> : undefined}`. Keep `initials={initialsOf(summary.fullName)}`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit; npm run lint` — expected clean.
In the dev server open `/dashboard/students?student=<an enrolled id>`. Expected: Standing shows a position or "awaiting a published result"; adding a merit shows a toast and the entry; the Honours page reflects the change on reload; removing works; a bad date is refused with the message. Sign in as a teacher whose sections exclude the student and confirm the form is refused with the scope message.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/registry/students.ts src/lib/registry/options.ts src/app/dashboard/students/actions.ts src/app/dashboard/students/_components/honours-sections.tsx src/app/dashboard/students/_components/student-pane.tsx
git commit -m "feat(students): standing, conduct and activities in the pane" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

If `src/lib/registry/summaries.integration.test.ts` needed a `honours: null`, add it to the `git add`.

---

### Task 9: Seed data

**Files:**
- Modify: `scripts/seed.cjs` (main dispatch; two new functions before `main().catch`)

**Interfaces:**
- Produces: `node scripts/seed.cjs --exams` and `--honours` flags.

- [ ] **Step 1: Dispatch**

In `main()`, after the `--attendance` block:

```js
    if (process.argv.includes("--exams")) {
      await seedExams(c);
    }
    if (process.argv.includes("--honours")) {
      await seedHonours(c);
    }
```

- [ ] **Step 2: Exams**

Add before `main().catch(`:

```js
/// Three terminal exams with marks for every offering, the first two
/// published. Each student gets a stable ability so the same names sit near
/// the top across terms, which is what a real ledger looks like.
async function seedExams(c) {
  const year = await c.query(
    'SELECT id, "startsOn", "endsOn" FROM "AcademicYear" WHERE "isCurrent" = true LIMIT 1',
  );
  if (!year.rowCount) {
    console.log("no current academic year — skipping exams");
    return;
  }
  const { id: yearId, startsOn } = year.rows[0];

  const TERMS = [
    { name: "First Terminal", published: true, offsetDays: 90 },
    { name: "Second Terminal", published: true, offsetDays: 180 },
    { name: "Final", published: false, offsetDays: 300 },
  ];

  const termIds = [];
  for (let i = 0; i < TERMS.length; i++) {
    const t = TERMS[i];
    const existing = await c.query(
      'SELECT id FROM "ExamTerm" WHERE "academicYearId" = $1 AND name = $2',
      [yearId, t.name],
    );
    if (existing.rowCount) {
      termIds.push(existing.rows[0].id);
      continue;
    }
    const starts = new Date(startsOn);
    starts.setUTCDate(starts.getUTCDate() + t.offsetDays);
    const ends = new Date(starts);
    ends.setUTCDate(ends.getUTCDate() + 6);
    const r = await c.query(
      `INSERT INTO "ExamTerm" ("academicYearId", name, "order", "startsOn", "endsOn", "isPublished")
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [yearId, t.name, i, starts.toISOString().slice(0, 10), ends.toISOString().slice(0, 10), t.published],
    );
    termIds.push(r.rows[0].id);
  }

  const offerings = await c.query(
    'SELECT id, "gradeId", "hasPractical", "fullMarksTheory", "fullMarksPractical" FROM "SubjectOffering" WHERE "academicYearId" = $1',
    [yearId],
  );
  const byGrade = new Map();
  for (const o of offerings.rows) {
    if (!byGrade.has(o.gradeId)) byGrade.set(o.gradeId, []);
    byGrade.get(o.gradeId).push(o);
  }

  const roll = await c.query(
    `SELECT e."studentId", s."gradeId"
       FROM "Enrollment" e JOIN "Section" s ON s.id = e."sectionId"
      WHERE e."academicYearId" = $1`,
    [yearId],
  );

  const rand = rng(424242);
  let written = 0;
  let skipped = 0;
  for (const termId of termIds) {
    const already = await c.query('SELECT 1 FROM "Mark" WHERE "examTermId" = $1 LIMIT 1', [termId]);
    if (already.rowCount) {
      skipped++;
      continue;
    }
    for (const e of roll.rows) {
      // Ability in 0.35..0.95, fixed per student, so rankings are consistent.
      const ability = 0.35 + (((e.studentId * 7919) % 1000) / 1000) * 0.6;
      for (const o of byGrade.get(e.gradeId) ?? []) {
        if (rand() < 0.02) {
          await c.query(
            `INSERT INTO "Mark" ("examTermId","studentId","subjectOfferingId",theory,practical,"isAbsent","updatedAt")
             VALUES ($1,$2,$3,NULL,NULL,true,NOW())`,
            [termId, e.studentId, o.id],
          );
          continue;
        }
        const wobble = () => (rand() - 0.5) * 0.3;
        const theory = Math.max(0, Math.min(o.fullMarksTheory, Math.round(o.fullMarksTheory * (ability + wobble()))));
        const practical = o.hasPractical
          ? Math.max(0, Math.min(o.fullMarksPractical, Math.round(o.fullMarksPractical * (ability + 0.1 + wobble()))))
          : null;
        await c.query(
          `INSERT INTO "Mark" ("examTermId","studentId","subjectOfferingId",theory,practical,"isAbsent","updatedAt")
           VALUES ($1,$2,$3,$4,$5,false,NOW())`,
          [termId, e.studentId, o.id, theory, practical],
        );
        written++;
      }
    }
  }
  console.log(`exams: ${termIds.length} terms, ${written} marks written, ${skipped} term(s) already marked`);
}

/// A scatter of merits, demerits and activities so the conduct and activity
/// pillars move the ranking. Skipped entirely once the year has any.
async function seedHonours(c) {
  const year = await c.query(
    'SELECT id, "startsOn", "endsOn" FROM "AcademicYear" WHERE "isCurrent" = true LIMIT 1',
  );
  if (!year.rowCount) {
    console.log("no current academic year — skipping honours");
    return;
  }
  const { id: yearId, startsOn, endsOn } = year.rows[0];

  const any = await c.query(
    'SELECT (SELECT 1 FROM "ConductEntry" WHERE "academicYearId" = $1 LIMIT 1) AS c, (SELECT 1 FROM "ActivityEntry" WHERE "academicYearId" = $1 LIMIT 1) AS a',
    [yearId],
  );
  if (any.rows[0].c || any.rows[0].a) {
    console.log("honours: entries already present — skipping");
    return;
  }

  const roll = await c.query('SELECT "studentId" FROM "Enrollment" WHERE "academicYearId" = $1', [yearId]);
  const rand = rng(31337);
  const last = new Date(Math.min(new Date(endsOn).getTime(), Date.now()));
  const span = Math.max(1, Math.floor((last - new Date(startsOn)) / 86_400_000));
  const someDay = () => {
    const d = new Date(startsOn);
    d.setUTCDate(d.getUTCDate() + Math.floor(rand() * span));
    return d.toISOString().slice(0, 10);
  };

  const MERITS = ["Helped a classmate", "Class monitor", "Tidied the lab", "Read at assembly"];
  const DEMERITS = ["Late three times", "Homework missing", "Disrupted the class", "Uniform"];
  const ACTIVITIES = [
    ["Science fair", 1], ["Football", 1], ["Debate", 1], ["Quiz", 1], ["Art exhibition", 1], ["Dance", 1], ["Spelling bee", 1],
  ];
  const LEVELS = [["PARTICIPATED", 10], ["PLACED", 20], ["WON", 30]];

  let conduct = 0;
  let activities = 0;
  for (const { studentId } of roll.rows) {
    if (rand() < 0.25) {
      await c.query(
        'INSERT INTO "ConductEntry" ("studentId","academicYearId",kind,points,date,note) VALUES ($1,$2,$3,$4,$5,$6)',
        [studentId, yearId, "MERIT", 5 + Math.floor(rand() * 6), someDay(), MERITS[Math.floor(rand() * MERITS.length)]],
      );
      conduct++;
    }
    if (rand() < 0.15) {
      await c.query(
        'INSERT INTO "ConductEntry" ("studentId","academicYearId",kind,points,date,note) VALUES ($1,$2,$3,$4,$5,$6)',
        [studentId, yearId, "DEMERIT", 5 + Math.floor(rand() * 11), someDay(), DEMERITS[Math.floor(rand() * DEMERITS.length)]],
      );
      conduct++;
    }
    if (rand() < 0.3) {
      const [name] = ACTIVITIES[Math.floor(rand() * ACTIVITIES.length)];
      const r = rand();
      const [level, points] = r < 0.6 ? LEVELS[0] : r < 0.85 ? LEVELS[1] : LEVELS[2];
      await c.query(
        'INSERT INTO "ActivityEntry" ("studentId","academicYearId",name,level,points,date) VALUES ($1,$2,$3,$4,$5,$6)',
        [studentId, yearId, name, level, points, someDay()],
      );
      activities++;
    }
  }
  console.log(`honours: ${conduct} conduct entries, ${activities} activities`);
}
```

- [ ] **Step 3: Run it**

Run: `node scripts/seed.cjs --exams --honours`
Expected: prints the term and entry counts and `done`. Run it again: prints "already marked" / "already present" and writes nothing new. Reload `/dashboard/honours`: podiums appear in every section that has subjects.

- [ ] **Step 4: Commit**

```powershell
git add scripts/seed.cjs
git commit -m "chore(seed): exams with marks, conduct and activity entries" -m "Claude-Session: https://claude.ai/code/session_01TtusLX4JwS3aMySFkDjVnt"
```

---

### Task 10: Final verification

**Files:** none new.

- [ ] **Step 1: Full test run**

Run: `$env:DB_TESTS=1; npx vitest run`
Expected: every suite passes, including the pre-existing ones.

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint; npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds; `/dashboard/honours` is listed among the routes.

- [ ] **Step 4: Smoke screenshots**

With the dev server running: `npm run smoke`. Open the screenshot for `dashboard/honours` at each width and both themes; confirm the podium reads correctly on the narrow width (three columns still fit; names truncate rather than wrap the layout).

- [ ] **Step 5: Report**

Summarise for the user: what was built, the weights default and where to change them, the new permission, the seed flags, and anything left out.
