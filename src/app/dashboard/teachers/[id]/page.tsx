import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  IdCard,
  Info,
  KeyRound,
  Users,
} from "lucide-react";
import { Callout, SectionCard } from "@/components/ui/page-shell";
import { StatusPill } from "@/components/ui/record-table";
import { formatBs } from "@/lib/date/bs";
import { getStaffDetail } from "@/lib/registry/staff";
import { StaffPhotoForm } from "./_components/photo-form";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs tracking-wider uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

import { requirePage } from "@/lib/auth/guard";

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section.
  await requirePage("/dashboard/teachers");

  const { id } = await params;
  const staffId = Number(id);
  if (!Number.isInteger(staffId)) notFound();

  const staff = await getStaffDetail(staffId);
  if (!staff) notFound();

  // Group the teaching load by year, newest first, so past years stay visible
  // without cluttering the current one.
  const byYear = new Map<
    string,
    { year: string; items: { section: string; subject: string }[] }
  >();
  for (const a of staff.assignments) {
    const year = a.section.academicYear.nameBS;
    const entry = byYear.get(year) ?? { year, items: [] };
    entry.items.push({
      section: `${a.section.grade.name} ${a.section.name}`,
      subject: a.subjectOffering.subject.name,
    });
    byYear.set(year, entry);
  }
  const years = [...byYear.values()].sort((a, b) => b.year.localeCompare(a.year));
  for (const y of years) {
    y.items.sort(
      (a, b) => a.subject.localeCompare(b.subject) || a.section.localeCompare(b.section),
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Link
        href="/dashboard/teachers"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        All teachers
      </Link>

      <header className="card-surface flex flex-wrap items-start gap-5 p-6">
        <StaffPhotoForm staffId={staff.id} photoId={staff.photoId} name={staff.fullName} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{staff.fullName}</h1>
          {staff.fullNameNp ? (
            <p className="text-muted-foreground text-lg">{staff.fullNameNp}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={staff.isActive ? "positive" : "neutral"}>
              {staff.isActive ? "Active" : "Left"}
            </StatusPill>
            <StatusPill>{staff.designation}</StatusPill>
            <StatusPill>Staff ID {staff.id}</StatusPill>
            <StatusPill>{staff.assignments.length} subject-sections</StatusPill>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon={IdCard} tint="violet" title="Personal details">
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Staff ID" value={<span className="font-mono">{staff.id}</span>} />
            <Field label="Designation" value={staff.designation} />
            <Field label="First name" value={staff.firstName} />
            <Field label="Middle name" value={staff.middleName} />
            <Field label="Last name" value={staff.lastName} />
            <Field label="Name in Nepali" value={staff.fullNameNp} />
            <Field
              label="Phone"
              value={<span className="tabular-nums">{staff.phone}</span>}
            />
            <Field label="Joined on" value={formatBs(staff.joinedOn, "YYYY MMMM DD")} />
          </dl>
        </SectionCard>

        <SectionCard icon={KeyRound} tint="blue" title="Login account">
          {staff.user ? (
            <dl className="grid grid-cols-2 gap-4">
              <Field label="User ID" value={<span className="font-mono">{staff.user.id}</span>} />
              <Field label="Username" value={staff.user.username} />
              <Field label="Email" value={staff.user.email} />
            </dl>
          ) : (
            <Callout icon={Info} tint="amber">
              No login account is linked, so this person cannot sign in.
            </Callout>
          )}
        </SectionCard>

        <SectionCard
          icon={Users}
          tint="green"
          title="Class teacher of"
          description={
            staff.sectionsLed.length === 0
              ? undefined
              : `${staff.sectionsLed.length} section${staff.sectionsLed.length === 1 ? "" : "s"}`
          }
        >
          {staff.sectionsLed.length === 0 ? (
            <Callout icon={Info} tint="amber">
              Not a class teacher of any section.
            </Callout>
          ) : (
            <ul className="divide-y">
              {staff.sectionsLed.map((section) => (
                <li key={section.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">
                    {section.grade.name} {section.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {section.academicYear.nameBS}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={CalendarCheck}
          tint="amber"
          title="Roll calls taken"
          description="Sessions recorded under this account."
        >
          <p className="text-3xl font-bold tabular-nums">{staff._count.attendanceKept}</p>
          {staff._count.attendanceKept === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Attendance is not yet attributed to whoever takes it.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        icon={ClipboardList}
        tint="rose"
        title="Teaching load"
        description={`${staff.assignments.length} subject-section pair${staff.assignments.length === 1 ? "" : "s"}`}
      >
        {years.length === 0 ? (
          <Callout icon={Info} tint="amber">
            Nothing assigned. Use the Teaching page to give this person a subject.
          </Callout>
        ) : (
          <div className="space-y-4">
            {years.map((year) => (
              <div key={year.year}>
                <p className="mb-2 text-sm font-medium">{year.year}</p>
                <div className="flex flex-wrap gap-1.5">
                  {year.items.map((item, i) => (
                    <span
                      key={`${item.section}-${item.subject}-${i}`}
                      className="bg-rail rounded-lg px-2.5 py-1 text-xs"
                    >
                      <span className="font-medium">{item.section}</span>
                      <span className="text-muted-foreground"> · {item.subject}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
