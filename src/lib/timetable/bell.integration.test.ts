import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createDayShape } from "./day-shapes";
import { listBellPeriods, saveBellSchedule } from "./bell";

// bell.ts used to write every period onto the one shape that existed. Now
// that a shape is an explicit parameter, the thing worth proving is that two
// shapes' schedules cannot see or clobber each other — the exact hazard the
// LIVE DATA WARNING calls out: SchoolPeriod rows have leaked into the real
// database from a test before.

const made = { shapeIds: [] as number[] };

afterAll(async () => {
  // This suite never assigns a shape to a weekday, so nothing but the
  // periods and the shapes themselves needs sweeping up.
  for (const id of made.shapeIds) {
    await prisma.schoolPeriod.deleteMany({ where: { dayShapeId: id } });
  }
  await prisma.dayShape.deleteMany({ where: { id: { in: made.shapeIds } } });
  await prisma.$disconnect();
});

async function shape(name: string): Promise<number> {
  const created = await createDayShape(`__bell ${name} ${Date.now()}${Math.random()}`);
  made.shapeIds.push(created.id);
  return created.id;
}

describe.skipIf(!process.env.DB_TESTS)("listBellPeriods", () => {
  it("is scoped to one shape and does not see another's periods", async () => {
    const a = await shape("a");
    const b = await shape("b");

    await saveBellSchedule(a, [
      { order: 0, name: "P1", startMinute: 600, endMinute: 645, kind: "TEACHING", label: "" },
    ]);
    await saveBellSchedule(b, [
      { order: 0, name: "Q1", startMinute: 600, endMinute: 630, kind: "TEACHING", label: "" },
      { order: 1, name: "Q2", startMinute: 630, endMinute: 660, kind: "TEACHING", label: "" },
    ]);

    expect((await listBellPeriods(a)).map((p) => p.name)).toEqual(["P1"]);
    expect((await listBellPeriods(b)).map((p) => p.name)).toEqual(["Q1", "Q2"]);
  });

  it("never touches the real default shape's periods", async () => {
    const defaultShape = await prisma.dayShape.findFirstOrThrow({ where: { isDefault: true } });
    const before = await listBellPeriods(defaultShape.id);

    const a = await shape("isolated");
    await saveBellSchedule(a, [
      { order: 0, name: "P1", startMinute: 600, endMinute: 645, kind: "TEACHING", label: "" },
    ]);

    const after = await listBellPeriods(defaultShape.id);
    expect(after).toEqual(before);
  });
});

describe.skipIf(!process.env.DB_TESTS)("saveBellSchedule", () => {
  it("saving an empty schedule on one shape does not delete another's rows", async () => {
    const a = await shape("keep");
    const b = await shape("wipe");

    await saveBellSchedule(a, [
      { order: 0, name: "P1", startMinute: 600, endMinute: 645, kind: "TEACHING", label: "" },
    ]);
    await saveBellSchedule(b, [
      { order: 0, name: "Q1", startMinute: 600, endMinute: 645, kind: "TEACHING", label: "" },
    ]);

    // b's editor clears its own schedule — a's row must survive untouched.
    await expect(saveBellSchedule(b, [])).rejects.toThrow(/at least one/i);
    expect((await listBellPeriods(a)).map((p) => p.name)).toEqual(["P1"]);
  });

  it("updates rows carrying an id in place, keeping their id", async () => {
    const a = await shape("update");
    await saveBellSchedule(a, [
      { order: 0, name: "P1", startMinute: 600, endMinute: 645, kind: "TEACHING", label: "" },
    ]);
    const [row] = await listBellPeriods(a);

    await saveBellSchedule(a, [
      { id: row.id, order: 0, name: "P1 renamed", startMinute: 600, endMinute: 650, kind: "TEACHING", label: "" },
    ]);

    const after = await listBellPeriods(a);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: row.id, name: "P1 renamed", endMinute: 650 });
  });

  it("rejects an event period with no label before writing anything", async () => {
    const a = await shape("rejects");
    await expect(
      saveBellSchedule(a, [
        { order: 0, name: "Assembly", startMinute: 600, endMinute: 645, kind: "EVENT", label: "" },
      ]),
    ).rejects.toThrow(/needs a label/i);
    expect(await listBellPeriods(a)).toEqual([]);
  });

  it("accepts an event period alongside a teaching period, keeping the label", async () => {
    const a = await shape("event");
    await saveBellSchedule(a, [
      { order: 0, name: "P1", startMinute: 600, endMinute: 645, kind: "TEACHING", label: "" },
      { order: 1, name: "Assembly", startMinute: 645, endMinute: 675, kind: "EVENT", label: "Whole school" },
    ]);

    const rows = await listBellPeriods(a);
    const event = rows.find((r) => r.kind === "EVENT");
    expect(event?.label).toBe("Whole school");
  });
});
