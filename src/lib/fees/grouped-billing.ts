import type { FeeFrequency } from "@/generated/prisma/enums";

// Browser-safe projection: billing is grouped by grade, while every action
// retains the original structure and billing period understood by the server.
export type BillingPlan = {
  id: number;
  name: string;
  grade: { id: number; name: string };
  onceIssued?: number;
  months: { month: number; issued: number; started: boolean }[];
  lines: {
    feeHeadId: number;
    amount: number;
    feeHead: { name: string; frequency: FeeFrequency };
  }[];
};

export type BillingSlice = {
  structureId: number;
  name: string;
  monthly: boolean;
  total: number;
  issued: number;
  months: BillingPlan["months"];
  lines: BillingPlan["lines"];
};

export type GradeBilling = {
  grade: BillingPlan["grade"];
  yearly: BillingSlice[];
  monthly: BillingSlice[];
  yearlyTotal: number;
  monthlyTotal: number;
};

export function groupBillingByGrade(plans: readonly BillingPlan[]): GradeBilling[] {
  const grades = new Map<number, GradeBilling>();
  for (const plan of plans) {
    for (const monthly of [false, true]) {
      const lines = plan.lines.filter((line) => line.feeHead.frequency === (monthly ? "MONTHLY" : "ONE_TIME"));
      if (lines.length === 0) continue;
      let group = grades.get(plan.grade.id);
      if (!group) {
        group = { grade: plan.grade, yearly: [], monthly: [], yearlyTotal: 0, monthlyTotal: 0 };
        grades.set(plan.grade.id, group);
      }
      const total = lines.reduce((sum, line) => sum + line.amount, 0);
      const slice: BillingSlice = {
        structureId: plan.id,
        name: plan.name,
        monthly,
        total,
        issued: monthly ? plan.months.reduce((sum, month) => sum + month.issued, 0) : (plan.onceIssued ?? 0),
        months: monthly ? plan.months : [],
        lines,
      };
      if (monthly) {
        group.monthly.push(slice);
        group.monthlyTotal += total;
      } else {
        group.yearly.push(slice);
        group.yearlyTotal += total;
      }
    }
  }
  return [...grades.values()];
}
