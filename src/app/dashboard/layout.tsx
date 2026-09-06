import { formatBs } from "@/lib/date/bs";
import { yearDateStatus } from "@/lib/date/year-status";
import {
  getCurrentAcademicYear,
  listAcademicYears,
  listAcademicYearsWithSize,
} from "@/lib/registry/academic-year";
import { getLetterhead } from "@/lib/registry/school";
import { requirePage } from "@/lib/auth/guard";
import { loadGrants, granted } from "@/lib/auth/permissions";
import { ROLE_LABEL, capabilityFor } from "@/lib/auth/roles";
import { IconRail } from "./_components/icon-rail";
import { TopBar } from "./_components/top-bar";
import { NAV_GROUPS, SETTINGS } from "./_components/nav-model";
import { getDashboardOverview, schoolDate } from "@/lib/dashboard/overview";
import { dueItems } from "@/lib/dashboard/alerts";
import { AlertsPopover } from "./_components/alerts-popover";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePage("/dashboard");
  const grants = await loadGrants();
  const canManageRegistry = granted(grants, actor.role, "manage:registry");
  const showYearSize = actor.role !== "TEACHER" && canManageRegistry;
  const [years, currentYear, school] = await Promise.all([
    showYearSize ? listAcademicYearsWithSize() : listAcademicYears(),
    getCurrentAcademicYear(),
    getLetterhead(),
  ]);
  const username = actor.username;
  const now = new Date();
  const today = schoolDate(now);

  // Worked out against the stored matrix rather than the token, so a permission
  // change shows in the navigation without waiting for a fresh sign-in.
  const overview = currentYear
    ? await getDashboardOverview(actor, currentYear.id, now)
    : null;
  const allowed = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS]
    .filter((item) => {
      if (item.id === "settings" && canManageRegistry) return true;
      const capability = capabilityFor(item.href);
      return capability === null || granted(grants, actor.role, capability);
    })
    .map((item) => item.id);

  // dueItems already drops what this account may not act on.
  const alerts = overview ? dueItems(overview) : [];

  return (
    <div className="bg-page grid h-[100dvh] grid-cols-1 grid-rows-[var(--topbar)_1fr] shell:grid-cols-[var(--rail)_1fr]">
      <a
        href="#dashboard-main"
        className="bg-brand text-brand-ink focus-visible:ring-brand-ink/50 sr-only fixed top-3 left-3 z-[60] rounded-lg px-3 py-2 text-sm font-semibold shadow-popover focus:not-sr-only focus-visible:ring-3 focus-visible:outline-none"
      >
        Skip to main content
      </a>
      <TopBar
        school={{
          name: school.name,
          address: school.address ?? null,
          logoId: school.logoId,
        }}
        today={formatBs(today, "YYYY MMMM DD, dddd")}
        years={years.map((year) => ({
          id: year.id,
          nameBS: year.nameBS,
          ...(showYearSize && "sections" in year && typeof year.sections === "number"
            ? { sections: year.sections }
            : {}),
        }))}
        canManageRegistry={canManageRegistry}
        currentId={currentYear?.id ?? null}
        span={
          currentYear
            ? `${formatBs(currentYear.startsOn, "YYYY-MM-DD")} → ${formatBs(currentYear.endsOn, "YYYY-MM-DD")}`
            : null
        }
        yearStatus={yearDateStatus(today, currentYear)}
        username={username}
        roleLabel={ROLE_LABEL[actor.role]}
        allowed={allowed}
        alerts={<AlertsPopover items={alerts} />}
      />
      <IconRail allowed={allowed} />
      {/* relative: form controls render absolutely-positioned hidden inputs, which
          would otherwise be contained by the body and stretch the document.
          Bottom padding keeps content clear of the mobile bar. */}
      <main
        id="dashboard-main"
        tabIndex={-1}
        className="relative min-h-0 scroll-smooth overflow-y-auto p-4 pb-20 outline-none shell:p-6 shell:pb-6"
      >
        {children}
      </main>
    </div>
  );
}
