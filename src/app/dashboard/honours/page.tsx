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
          action={
            <Button nativeButton={false} render={<Link href="/dashboard/classes" />}>
              Go to Classes
            </Button>
          }
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
          action={
            <Button nativeButton={false} render={<Link href="/dashboard/classes" />}>
              Go to Classes
            </Button>
          }
        />
      </PageFrame>
    );
  }

  return <HonoursWorkspace honours={honours} />;
}
