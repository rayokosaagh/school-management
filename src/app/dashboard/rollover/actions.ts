"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guard";
import { applyRollover, planRollover, RolloverError } from "@/lib/registry/rollover";
import { createAcademicYear } from "@/lib/registry/academic-year";
import type { RolloverOptions, RolloverPlan } from "@/lib/registry/rollover-plan";

export type RolloverResult = { plan?: RolloverPlan; error?: string };

export type RolloverInput = {
  sourceYearId: number;
  targetYearId: number;
  options: RolloverOptions;
};

const PATH = "/dashboard/rollover";

// Server actions are public POST endpoints, so every one re-checks the session.
async function requireSession() {
  await requireCapability("manage:registry");
}

export async function previewRollover(input: RolloverInput): Promise<RolloverResult> {
  await requireSession();
  try {
    return { plan: await planRollover(input.sourceYearId, input.targetYearId, input.options) };
  } catch (e) {
    if (e instanceof RolloverError) return { error: e.message };
    throw e;
  }
}

export async function runRollover(input: RolloverInput): Promise<RolloverResult> {
  await requireSession();
  try {
    const plan = await applyRollover(input.sourceYearId, input.targetYearId, input.options);
    // Every year-scoped page reads different rows now.
    revalidatePath("/dashboard", "layout");
    revalidatePath(PATH);
    return { plan };
  } catch (e) {
    if (e instanceof RolloverError) return { error: e.message };
    throw e;
  }
}

export async function addTargetYear(nameBS: string): Promise<{ id?: number; error?: string }> {
  await requireSession();
  try {
    const year = await createAcademicYear({ nameBS });
    revalidatePath(PATH);
    return { id: year.id };
  } catch (e) {
    if (e instanceof RangeError) return { error: e.message };
    return { error: `Academic year ${nameBS} could not be created.` };
  }
}
