import { describe, expect, it } from "vitest";
import { groupBillingByGrade, type BillingPlan } from "./grouped-billing";

const grade = { id: 1, name: "Kindergarten" };
const months = [{ month: 1, issued: 12, started: true }, { month: 2, issued: 0, started: false }];
const yearlyLine = { feeHeadId: 1, amount: 2500, feeHead: { name: "Admission", frequency: "ONE_TIME" as const } };
const monthlyLine = { feeHeadId: 2, amount: 1200, feeHead: { name: "Tuition", frequency: "MONTHLY" as const } };
const plan = (overrides: Partial<BillingPlan> = {}): BillingPlan => ({
  id: 10, name: "Class fees", grade, onceIssued: 4, months, lines: [yearlyLine, monthlyLine], ...overrides,
});

describe("groupBillingByGrade", () => {
  it("combines separate admission and monthly plans into one grade card without combining their prices", () => {
    const grouped = groupBillingByGrade([
      plan({ id: 10, name: "Admission", lines: [yearlyLine] }),
      plan({ id: 11, name: "Monthly", lines: [monthlyLine] }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ grade, yearlyTotal: 2500, monthlyTotal: 1200 });
    expect(grouped[0].yearly[0]).toMatchObject({ structureId: 10, monthly: false, issued: 4, months: [], total: 2500 });
    expect(grouped[0].monthly[0]).toMatchObject({ structureId: 11, monthly: true, months, total: 1200 });
  });

  it("splits a mixed structure into two billing periods with the same original structure ID", () => {
    const [grouped] = groupBillingByGrade([plan()]);
    expect(grouped.yearly[0]).toMatchObject({ structureId: 10, lines: [yearlyLine], issued: 4, monthly: false });
    expect(grouped.monthly[0]).toMatchObject({ structureId: 10, lines: [monthlyLine], issued: 12, monthly: true });
    expect(grouped.yearlyTotal).toBe(2500);
    expect(grouped.monthlyTotal).toBe(1200);
  });

  it("keeps multiple issue targets in a period and groups by grade ID, not name", () => {
    const grouped = groupBillingByGrade([
      plan({ id: 1, lines: [monthlyLine] }),
      plan({ id: 2, lines: [{ ...monthlyLine, amount: 300 }] }),
      plan({ id: 3, grade: { id: 2, name: grade.name }, lines: [yearlyLine] }),
    ]);
    expect(grouped.map((group) => group.grade.id)).toEqual([1, 2]);
    expect(grouped[0].monthly.map((slice) => slice.structureId)).toEqual([1, 2]);
    expect(grouped[0].monthlyTotal).toBe(1500);
    expect(grouped[0].yearly).toEqual([]);
    expect(grouped[1].monthly).toEqual([]);
  });

  it("does not create cards for empty plans or mutate source data", () => {
    const source = [plan(), plan({ id: 99, grade: { id: 9, name: "Empty" }, lines: [] })];
    const before = structuredClone(source);
    expect(groupBillingByGrade(source)).toHaveLength(1);
    expect(source).toEqual(before);
    expect(groupBillingByGrade([])).toEqual([]);
  });
});
