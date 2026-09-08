import { TranslatedText } from "@/components/i18n/language-provider";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { granted, loadGrants } from "@/lib/auth/permissions";
import { getCurrentAcademicYear } from "@/lib/registry/academic-year";
import { getDashboardOverview } from "@/lib/dashboard/overview";
import { getTeacherScheduleForToday } from "@/lib/dashboard/teacher-schedule";
import { allAnnouncements, announcementsFor } from "@/lib/announcements/announcements";
import { getRoleInsights } from "@/lib/dashboard/insights";
import { OverviewWorkspace } from "../_components/overview-workspace";

export default async function DashboardHome({
  searchParams,
}: {
  // `requirePage` sends anyone without the capability for a section here with
  // `?denied=1`. Without reading it the redirect is silent, and the page they
  // asked for just appears to be the dashboard.
  searchParams: Promise<{ denied?: string }>;
}) {
  const actor = await requirePage("/dashboard");
  const { denied } = await searchParams;
  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    const grants = await loadGrants();
    const canSetup = actor.role !== "TEACHER" && granted(grants, actor.role, "manage:registry");
    return (
      <section className="bg-surface border-line mx-auto max-w-3xl rounded-2xl border p-8 sm:p-12">
        <CalendarDays className="text-brand mb-6 size-9" aria-hidden="true" />
        <p className="text-brand-text text-xs font-semibold uppercase tracking-widest"><TranslatedText>Your overview</TranslatedText></p>
        <h1 className="mt-2"><TranslatedText>Welcome, </TranslatedText>{actor.username}.</h1>
        <p className="text-ink-3 mt-3 max-w-lg text-sm leading-6"><TranslatedText>An academic year needs to be selected before your overview is ready. </TranslatedText><TranslatedText>{canSetup ? "Set up the school year to get started." : "Ask your administrator to select the school’s current academic year."}</TranslatedText></p>
        {canSetup ? <Link className="bg-brand text-brand-ink mt-6 inline-flex rounded-lg px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface" href="/dashboard/classes"><TranslatedText>Set up academic year</TranslatedText></Link> : null}
      </section>
    );
  }
  const now = new Date();
  const overview = await getDashboardOverview(actor, currentYear.id, now);
  const periods = actor.role === "TEACHER" && overview.schoolDay
    ? await getTeacherScheduleForToday(actor, currentYear.id, now) : [];
  const insights = await getRoleInsights(
    actor, currentYear.id, overview.access, overview.sections.map((s) => s.id), now,
  );
  const announcements = await announcementsFor(actor, now);
  // Only fetched for somebody who can act on it: the manage list is the whole
  // history, expired notices included, and nobody else has any use for it.
  const manageable = overview.access.announce ? await allAnnouncements() : [];
  return (
    <OverviewWorkspace
      actor={actor}
      yearLabel={currentYear.nameBS}
      overview={overview}
      periods={periods}
      insights={insights}
      announcements={announcements}
      manageableAnnouncements={manageable}
      notice={denied ? "That section is not open to your account. Ask your administrator if you need access." : null}
    />
  );
}
