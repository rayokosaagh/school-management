import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import {
  getCurrentAcademicYear,
  listAcademicYearsWithSize,
} from "@/lib/registry/academic-year";
import { RolloverWorkspace } from "./_components/rollover-workspace";

export default async function RolloverPage() {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/rollover");

  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    return (
      <EmptyState
        icon={CalendarCheck}
        tint="rose"
        title="No academic year is current"
        description="A rollover moves one year into the next, so there has to be a year to move out of. Set one on the Classes page."
        action={
          <Button render={<Link href="/dashboard/classes" />} nativeButton={false}>
            Open Classes
          </Button>
        }
      />
    );
  }

  const [years, examTerms] = await Promise.all([
    listAcademicYearsWithSize(),
    // `endsOn` is nullable, so the term's own order is the reliable sort.
    prisma.examTerm.findMany({
      where: { academicYearId: currentYear.id },
      orderBy: { order: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <RolloverWorkspace
      sourceYear={{ id: currentYear.id, nameBS: currentYear.nameBS }}
      years={years
        .filter((y) => y.id !== currentYear.id)
        .map((y) => ({
          id: y.id,
          nameBS: y.nameBS,
          sections: y.sections,
          enrollments: y.enrollments,
        }))}
      examTerms={examTerms}
    />
  );
}
