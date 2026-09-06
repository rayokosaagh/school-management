import { describe, expect, it } from "vitest";
import { feeTypeFilters } from "./fee-type-filters";

const ALL = "all";
const row = (...feeTypes: string[]) => ({ feeTypes });

describe("the fee-type strip's options", () => {
  it("names every type charged in the class, once each, sorted", () => {
    const rows = [row("Monthly Fee", "Admission"), row("Admission"), row("Transport")];
    expect(feeTypeFilters(rows, ALL).map((option) => option.label)).toEqual([
      "All fees",
      "Admission",
      "Monthly Fee",
      "Transport",
    ]);
  });

  it("counts students, not bills, and puts the whole class under All fees", () => {
    const rows = [row("Admission", "Monthly Fee"), row("Admission"), row()];
    const options = feeTypeFilters(rows, ALL);
    expect(options[0]).toEqual({ value: ALL, label: "All fees", count: 3 });
    expect(options.find((option) => option.value === "Admission")?.count).toBe(2);
    expect(options.find((option) => option.value === "Monthly Fee")?.count).toBe(1);
  });

  it("keeps its shape when the Show filter matches nobody on a fee", () => {
    const rows = [row("Admission", "Monthly Fee"), row("Admission")];
    // "Paid up", say, where only admission has ever been settled. The strip
    // must not lose its Monthly Fee chip over it — that was the bug: filtering
    // the list retired the chips as well, so the strip vanished entirely.
    const paidAdmissionOnly = (_: { feeTypes: string[] }, feeType: string | null) =>
      feeType === "Admission";

    const options = feeTypeFilters(rows, ALL, paidAdmissionOnly);
    expect(options.map((option) => option.label)).toEqual(["All fees", "Admission", "Monthly Fee"]);
    expect(options.find((option) => option.value === "Monthly Fee")?.count).toBe(0);
    expect(options.find((option) => option.value === "Admission")?.count).toBe(2);
    expect(options[0].count).toBe(0);
  });

  it("counts each chip under its own fee type, so the number is what picking it shows", () => {
    // Two pupils: one owes admission, the other owes the monthly fee. Under
    // "Still owing", each chip must count only the pupil owing *that* fee.
    const owesAdmission = { feeTypes: ["Admission", "Monthly Fee"], owes: "Admission" };
    const owesMonthly = { feeTypes: ["Admission", "Monthly Fee"], owes: "Monthly Fee" };
    const owing = (row: { owes: string }, feeType: string | null) =>
      feeType === null || row.owes === feeType;

    const options = feeTypeFilters([owesAdmission, owesMonthly], ALL, owing);
    expect(options.find((option) => option.value === "Admission")?.count).toBe(1);
    expect(options.find((option) => option.value === "Monthly Fee")?.count).toBe(1);
    // Neither is paid up overall, so both are listed under All fees.
    expect(options[0].count).toBe(2);
  });

  it("offers nothing but All fees when nobody has been charged", () => {
    expect(feeTypeFilters([row(), row()], ALL)).toEqual([
      { value: ALL, label: "All fees", count: 2 },
    ]);
  });
});
