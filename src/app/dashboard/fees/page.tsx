import { ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { feeWorkspace, pupilFees } from "@/lib/fees/fees";
import { transportWorkspace } from "@/lib/fees/transport";
import { studentFeeWorkspace } from "@/lib/fees/student-fees";
import { requirePage } from "@/lib/auth/guard";
import { FeesWorkspace } from "./_components/fees-workspace";

export default async function FeesPage({
  searchParams,
}: {
  // The URL owns the pane, as it does on Students: a link to one pupil's fees
  // has to reopen on the same pupil.
  searchParams: Promise<{ pupil?: string }>;
}) {
  await requirePage("/dashboard/fees");

  const year = await getCurrentAcademicYear();
  if (!year) {
    return (
      <PageFrame
        icon={<ReceiptText />}
        tint="rose"
        eyebrow="Finance"
        title="Fees"
        meta="Set an academic year first"
      >
        <EmptyState
          icon={ReceiptText}
          tint="rose"
          title="No current academic year"
          description="Every invoice belongs to a year. Create and select one before setting fees."
        />
      </PageFrame>
    );
  }

  const [data, transport, studentFees] = await Promise.all([feeWorkspace(year.id), transportWorkspace(year.id), studentFeeWorkspace(year.id)]);

  const { pupil } = await searchParams;
  const selected = Number(pupil);
  // Only fetched when a pupil is open, and only if the id is real — a stale
  // link must reopen the list, not crash the page.
  const pane =
    Number.isInteger(selected) && selected > 0 && data.balances.some((b) => b.enrollmentId === selected)
      ? await pupilFees(selected)
      : null;

  return (
    <FeesWorkspace
      {...data}
      transport={transport}
      studentFees={studentFees}
      academicYearId={year.id}
      yearLabel={year.nameBS}
      selectedEnrollmentId={pane ? selected : null}
      pane={pane}
    />
  );
}
