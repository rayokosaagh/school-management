import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { getYearReconciliation } from "@/lib/fees/reconciliation";
import { money } from "@/lib/fees/money";
import { PageFrame, PageFrameBody } from "@/components/ui/page-frame";
import { SectionCard } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ReadinessPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requirePage("/dashboard/settings/readiness");
  const years = await prisma.academicYear.findMany({ orderBy: { nameBS: "desc" }, select: { id: true, nameBS: true, isCurrent: true } });
  const { year: selected } = await searchParams;
  const year = years.find((row) => row.id === Number(selected)) ?? years.find((row) => row.isCurrent) ?? years[0];
  const report = year ? await getYearReconciliation(year.id) : null;
  const setup = year ? await Promise.all([
    prisma.feeStructure.count({ where: { academicYearId: year.id, isActive: true, lines: { some: {} } } }),
    prisma.studentFeePlan.count({ where: { academicYearId: year.id, isActive: true } }),
    prisma.transportRegistration.count({ where: { isActive: true, enrollment: { academicYearId: year.id } } }),
  ]) : null;
  return (
    <PageFrame icon={<ShieldCheck />} tint="green" eyebrow="Settings" title="Operational checks"
      subtitle="Read-only financial reconciliation and a checklist for the next academic year. These checks do not certify the whole system."
      breadcrumb={<><Link href="/dashboard/settings?view=data" className="hover:underline">Settings</Link> / Operational checks</>}>
      <PageFrameBody className="space-y-5 overflow-y-auto p-4">
        <form className="flex flex-wrap items-center gap-3">
          <label htmlFor="check-year" className="text-sm">Review academic year</label>
          <select id="check-year" name="year" defaultValue={year?.id} className="border-line bg-surface rounded-lg border p-2 text-sm">
            {years.map((row) => <option key={row.id} value={row.id}>{row.nameBS}{row.isCurrent ? " (current)" : ""}</option>)}
          </select>
          <Button type="submit" variant="secondary" disabled={!year}>Run checks</Button>
          <span className="text-ink-3 text-xs">Does not switch the school&apos;s active year.</span>
        </form>
        {report && setup ? <>
          <SectionCard icon={ShieldCheck} tint={report.issues.length ? "rose" : "green"} title={report.issues.length ? `${report.issues.length} issue(s) need review` : "Ledger checks passed"}
            description={`Checked ${report.invoices} invoices and ${report.payments} receipts in ${year.nameBS}. A zero-record year has no financial activity to verify.`}>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[["Billed (excluding cancelled)", report.billed], ["Settled on active invoices", report.settled], ["Outstanding", report.outstanding]].map(([label, amount]) => <div key={label}><dt className="text-ink-3 text-xs">{label}</dt><dd className="mt-1 text-lg font-semibold">{money(Number(amount))}</dd></div>)}
            </dl>
            {report.issues.length ? <Table className="mt-4"><TableHeader><TableRow><TableHead>Record</TableHead><TableHead>Check</TableHead></TableRow></TableHeader><TableBody>
              {report.issues.map((issue, index) => <TableRow key={index}><TableCell>{issue.entity} #{issue.id}</TableCell><TableCell className="whitespace-normal">{issue.problem}</TableCell></TableRow>)}
            </TableBody></Table> : null}
          </SectionCard>
          <SectionCard icon={ShieldCheck} tint="amber" title="Before changing academic years"
            description="These are manual completion checks, not an automatic readiness score.">
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Reconcile outstanding {money(report.outstanding)} with the office ledger. Old debt stays in its original year; it is not automatically transferred or forgiven.</li>
              <li>Review pricing: this year has {setup[0]} active class plans, {setup[1]} student-service plans and {setup[2]} active transport registrations. These do not automatically copy to another year.</li>
              <li>Review promoted, retained, graduated and departed students. Graduation/departure statuses change when rollover is confirmed, even if activation is deferred.</li>
              <li>Take a full backup and verify it in an isolated restore drill before a year transition.</li>
            </ul>
          </SectionCard>
        </> : <p>Create an academic year before running financial checks.</p>}
        <SectionCard icon={ShieldCheck} tint="blue" title="Backup and staff acceptance"
          description="No scheduled-backup or restore-verification status is available from this application.">
          <p className="text-sm">Your deployment administrator must configure the backup job and off-site storage using the recovery runbook. Year-deletion restore points are not full backups. Complete a restore drill and staff testing on desktop, mobile and a slow connection before launch.</p>
        </SectionCard>
      </PageFrameBody>
    </PageFrame>
  );
}
