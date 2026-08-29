import { auth } from "@/lib/auth/auth";
import { formatBs } from "@/lib/date/bs";
import {
  getCurrentAcademicYear,
  listAcademicYearsWithSize,
} from "@/lib/registry/academic-year";
import { getLetterhead } from "@/lib/registry/school";
import { currentActor } from "@/lib/auth/guard";
import { loadGrants, granted } from "@/lib/auth/permissions";
import { ROLE_LABEL, capabilityFor } from "@/lib/auth/roles";
import { IconRail } from "./_components/icon-rail";
import { TopBar } from "./_components/top-bar";
import { NAV_GROUPS, SETTINGS } from "./_components/nav-model";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [session, years, currentYear, school] = await Promise.all([
    auth(),
    listAcademicYearsWithSize(),
    getCurrentAcademicYear(),
    getLetterhead(),
  ]);
  const username = session?.user?.username || "Account";

  // Worked out against the stored matrix rather than the token, so a permission
  // change shows in the navigation without waiting for a fresh sign-in.
  const [actor, grants] = await Promise.all([currentActor(), loadGrants()]);
  const allowed = actor
    ? [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS]
        .filter((item) => {
          const capability = capabilityFor(item.href);
          return capability === null || granted(grants, actor.role, capability);
        })
        .map((item) => item.id)
    : [];

  const now = new Date();

  return (
    <div className="bg-page grid h-screen grid-cols-1 grid-rows-[var(--topbar)_1fr] shell:grid-cols-[var(--rail)_1fr]">
      <TopBar
        school={{ name: school.name, address: school.address ?? null }}
        today={formatBs(now, "YYYY MMMM DD, dddd")}
        years={years}
        currentId={currentYear?.id ?? null}
        span={
          currentYear
            ? `${formatBs(currentYear.startsOn, "YYYY-MM-DD")} → ${formatBs(currentYear.endsOn, "YYYY-MM-DD")}`
            : null
        }
        todayInYear={currentYear ? now >= currentYear.startsOn && now <= currentYear.endsOn : false}
        username={username}
        roleLabel={actor ? ROLE_LABEL[actor.role] : "Signed in"}
        allowed={allowed}
      />
      <IconRail allowed={allowed} />
      {/* relative: form controls render absolutely-positioned hidden inputs, which
          would otherwise be contained by the body and stretch the document.
          Bottom padding keeps content clear of the mobile bar. */}
      <main className="relative min-h-0 overflow-y-auto p-4 pb-20 shell:p-6 shell:pb-6">
        {children}
      </main>
    </div>
  );
}
