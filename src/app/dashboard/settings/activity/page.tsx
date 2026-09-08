import { TranslatedText } from "@/components/i18n/language-provider";
import Link from "next/link";
import { History } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { listAuditEvents } from "@/lib/audit";
import { PageFrame, PageFrameBody } from "@/components/ui/page-frame";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requirePage("/dashboard/settings/activity");
  const { before: raw } = await searchParams;
  const value = Number(raw);
  const before = Number.isInteger(value) && value > 0 && value <= 2_147_483_647 ? value : undefined;
  const rows = await listAuditEvents(before);
  const shown = rows.slice(0, 50);
  return (
    <PageFrame icon={<History />} tint="blue" eyebrow="Settings" title="Activity history"
      subtitle="Recorded billing, service, permission and academic-year changes. History starts when auditing is enabled."
      breadcrumb={<><Link href="/dashboard/settings?view=data" className="hover:underline"><TranslatedText>Settings</TranslatedText></Link><TranslatedText> / Activity history</TranslatedText></>}>
      <PageFrameBody className="overflow-y-auto p-4">
        <p className="text-ink-2 mb-4 text-sm"><TranslatedText>This log cannot be edited through the application. It is not a complete security log or a substitute for database backups.</TranslatedText></p>
        <Table>
          <TableHeader><TableRow><TableHead><TranslatedText>When (Nepal)</TranslatedText></TableHead><TableHead><TranslatedText>Staff account</TranslatedText></TableHead><TableHead><TranslatedText>Action</TranslatedText></TableHead><TableHead><TranslatedText>Record</TranslatedText></TableHead><TableHead><TranslatedText>Details</TranslatedText></TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((row) => <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{row.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Kathmandu" })}</TableCell>
              <TableCell>{row.actorUsername}</TableCell><TableCell>{row.action.replaceAll(".", " · ").replaceAll("_", " ")}</TableCell>
              <TableCell>{row.entityType} #{row.entityId}</TableCell>
              <TableCell className="min-w-52 whitespace-normal">{Object.entries(row.details).map(([key, item]) => `${key}: ${String(item)}`).join(" · ") || "—"}</TableCell>
            </TableRow>)}
            {shown.length === 0 ? <TableRow><TableCell colSpan={5}><TranslatedText>No recorded activity on this page.</TranslatedText></TableCell></TableRow> : null}
          </TableBody>
        </Table>
        <nav aria-label="Activity pages" className="mt-4 flex gap-6 text-sm">
          {before ? <Link href="/dashboard/settings/activity" className="text-brand-text underline"><TranslatedText>Newest activity</TranslatedText></Link> : null}
          {rows.length > 50 ? <Link href={`?before=${shown[shown.length - 1].id}`} className="text-brand-text underline"><TranslatedText>Older activity</TranslatedText></Link> : null}
        </nav>
      </PageFrameBody>
    </PageFrame>
  );
}
