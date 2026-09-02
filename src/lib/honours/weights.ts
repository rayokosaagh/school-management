import { prisma } from "@/lib/prisma";
import { DEFAULT_WEIGHTS, validateWeights, type Weights } from "./score";

// The weights live on the school profile (one row, id 1) beside the other
// school-wide settings, so there is one place to look for how this school runs.
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
