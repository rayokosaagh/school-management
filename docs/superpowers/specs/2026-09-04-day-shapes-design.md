# Day shapes and period kinds — design spec

Date: 2026-09-04. Branch: `redesign/phase-2`.
Phase 1 of two. Phase 2 (a dated school calendar) has its own spec and is deliberately out of scope here.

## 1. Goal

Let the school run a different timetable shape on different weekdays — a half-day Friday alongside full days — and let a period be something other than a lesson, so extra-curricular time and events sit in the grid as first-class blocks.

Today `SchoolPeriod` is one global list applied to every working day. A school that finishes early on Friday cannot say so, and the only non-teaching period is a break.

## 2. Decisions taken with the user

| Question | Decision |
|---|---|
| Half days | Per-weekday period lists |
| How lists are managed | Named shapes assigned to weekdays, not one list edited per day |
| Non-teaching periods | Teaching, break, and event (extra-curricular, assembly, third-party) |
| Dated one-off events | Wanted, but a separate phase — this spec is weekly only |
| Roll call on event days | Phase 2 concern; recorded here so phase 1 does not foreclose it: attendance is still taken, the day is labelled, lessons are suppressed |
| Build order | Weekly shapes first |

## 3. Data

### 3.1 `DayShape`

```prisma
/// A named shape for a school day — "Regular day", "Half day". Periods belong
/// to a shape rather than to the school, so Friday can finish early without
/// every other day having to be edited to match.
model DayShape {
  id       Int            @id @default(autoincrement())
  name     String         @unique
  /// The shape a weekday falls back to when nothing else is assigned, and the
  /// one the seed and the migration attach existing periods to. Exactly one
  /// row is true; enforced in the library, not the schema.
  isDefault Boolean       @default(false)
  periods  SchoolPeriod[]
  weekdays WeekdayShape[]
}

/// Which shape each weekday runs. Absent means the default shape.
model WeekdayShape {
  /// Sunday = 0 through Saturday = 6, matching JavaScript's getDay().
  dayOfWeek  Int      @id
  dayShapeId Int
  dayShape   DayShape @relation(fields: [dayShapeId], references: [id])
}
```

### 3.2 `SchoolPeriod` changes

```prisma
enum PeriodKind {
  TEACHING
  BREAK
  /// Extra-curricular, assembly, club time. Occupies a slot, carries a label,
  /// takes no teacher or subject.
  EVENT
}

model SchoolPeriod {
  // …existing fields…
  dayShapeId Int
  kind       PeriodKind @default(TEACHING)
  /// Shown in the grid for an EVENT period. Empty for the other kinds.
  label      String     @default("")

  dayShape   DayShape   @relation(fields: [dayShapeId], references: [id])

  @@unique([dayShapeId, order])
}
```

`isBreak` is replaced by `kind`. Keeping both would let them disagree.

`order` becomes unique **per shape** rather than globally, so two shapes can each have a "Period 1".

### 3.3 Migration

1. Create `DayShape` "Regular day" with `isDefault = true`.
2. Attach every existing `SchoolPeriod` to it.
3. Set `kind = BREAK` where `isBreak`, else `TEACHING`; drop `isBreak`.
4. Insert no `WeekdayShape` rows — every weekday falls back to the default.

Nothing changes visibly until a second shape exists. `TimetablePeriod` is untouched: it still points at a `SchoolPeriod` and a `dayOfWeek`.

## 4. The hazard this design must handle

`TimetablePeriod` addresses a lesson as `(sectionId, dayOfWeek, schoolPeriodId)`. Once weekdays can run different shapes, **a lesson can be left pointing at a period that its weekday no longer runs** — Friday moves to "Half day", and every Friday lesson in periods 5–7 now refers to a period that is not in Friday's shape.

Those rows do not become invalid at the database level; they become invisible and meaningless, which is worse.

So assigning a shape to a weekday is a **destructive operation with a preview**, in the same family as the year delete:

- before applying, count the lessons on that weekday whose period is not in the new shape;
- show that count and the affected classes;
- require confirmation, and delete those lessons in the same transaction as the assignment.

`orphanedLessons(dayOfWeek, dayShapeId)` computes it; the same function feeds the preview and the write, so they cannot disagree.

Deleting a shape is refused while any weekday uses it.

## 5. Library

`src/lib/timetable/day-shapes.ts`:

- `listDayShapes()` — shapes with their periods and the weekdays using them.
- `createDayShape(name, copyFromId?)` — a new shape, optionally cloning another's periods, which is how "Half day" starts life.
- `renameDayShape(id, name)`, `deleteDayShape(id)` (refused while in use, or while it is the default).
- `assignWeekday(dayOfWeek, dayShapeId)` — one transaction: delete orphaned lessons, then write the assignment.
- `orphanedLessons(dayOfWeek, dayShapeId)` — the count and the affected sections.

`src/lib/timetable/bell.ts` becomes shape-scoped: `listBellPeriods(dayShapeId)`, `saveBellSchedule(dayShapeId, rows)`. `validateBell` gains a rule that an `EVENT` period has a label and a `TEACHING` period does not.

`getSectionGrid` resolves each weekday's shape, so the grid renders each day's own periods. A day with fewer periods renders shorter rather than padding with blanks.

## 6. Clearing a timetable

`clearTimetable({ sectionId })` or `({ academicYearId })` deletes `TimetablePeriod` rows for that scope in one transaction, returning the count. Behind `manage:timetable`, with a confirm dialog naming the count — the same pattern as the year delete, without a restore point: a timetable is rebuilt from the assignments it already has, and snapshotting it would be a second, unrelated feature.

## 7. UI

- **Timetable page** gains a shape switcher above the grid: which shape each weekday runs, and a control to change it. Changing one opens the orphaned-lesson confirmation when it would strand lessons.
- **Bell editor** (currently one list in Settings/School day) becomes per-shape: pick a shape, edit its periods, add periods, set each period's kind and — for events — its label.
- **Clear timetable** sits in the timetable page's toolbar, scoped to the section on screen or the whole year.
- Event periods render in the grid as a labelled band spanning the row, visually distinct from a lesson and from a break, and are not clickable for assignment.

## 8. Testing

- `day-shapes.test.ts` — pure: validation that exactly one shape is default, that an event period needs a label, that a teaching period does not carry one.
- `day-shapes.integration.test.ts` (`DB_TESTS=1`) — creating a shape by cloning; assigning a weekday; `orphanedLessons` counting exactly the lessons stranded by a narrower shape; the assignment deleting precisely those and no others; deleting a shape refused while a weekday uses it; the default shape never deletable.
- `bell` tests extended for shape scoping and the new kind rules.
- `clearTimetable` integration: deletes only the scoped rows, leaves other sections and years untouched.
- Every integration fixture creates and removes its own `DayShape` and `SchoolPeriod` rows — `SchoolPeriod` is global-ish and has already leaked into this developer's live data once.

## 9. Out of scope

- Dated calendar events, holidays, and anything that overrides a specific date. That is phase 2.
- Per-section shapes: the shape is a property of the school's week, not of a class.
- Teacher availability, room booking, or automatic timetable generation.
- Snapshotting a timetable before clearing it.
