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
import { DashboardNav } from "./_components/dashboard-nav";
import { YearSwitcher } from "./_components/year-switcher";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
  const NAV_PATHS: Record<string, string> = {
    home: "/dashboard",
    students: "/dashboard/students",
    teachers: "/dashboard/teachers",
    classes: "/dashboard/classes",
    subjects: "/dashboard/subjects",
    assignments: "/dashboard/assignments",
    attendance: "/dashboard/attendance",
    exams: "/dashboard/exams",
    settings: "/dashboard/settings",
  };
  const allowed = actor
    ? Object.entries(NAV_PATHS)
        .filter(([, path]) => {
          const capability = capabilityFor(path);
          return capability === null || granted(grants, actor.role, capability);
        })
        .map(([id]) => id)
    : [];

  return (
    <div className="flex h-screen">
      <DashboardNav
        schoolName={school.name}
        username={username}
        roleLabel={actor ? ROLE_LABEL[actor.role] : "Signed in"}
        allowed={allowed}
      />
      <div className="bg-page flex min-w-0 flex-1 flex-col">
        {/* Outside the scrolling region so it stays put as the page moves. */}
        <header className="border-border/60 bg-page/85 no-print flex shrink-0 items-center gap-4 border-b px-6 py-2.5 backdrop-blur lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-[11px] tracking-wider uppercase">
              Today
            </p>
            <p className="truncate text-sm font-medium tabular-nums">
              {formatBs(new Date(), "YYYY MMMM DD, dddd")}
            </p>
          </div>

          <YearSwitcher
            years={years}
            currentId={currentYear?.id ?? null}
            span={
              currentYear
                ? `${formatBs(currentYear.startsOn, "YYYY-MM-DD")} → ${formatBs(currentYear.endsOn, "YYYY-MM-DD")}`
                : null
            }
            todayInYear={
              currentYear
                ? new Date() >= currentYear.startsOn && new Date() <= currentYear.endsOn
                : false
            }
          />
        </header>
        {/* relative: form controls render absolutely-positioned hidden inputs, which
            would otherwise be contained by the body and stretch the document. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
