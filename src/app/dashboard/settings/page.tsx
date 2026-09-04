import { redirect } from "next/navigation";
import { Building2, History, KeyRound, ShieldCheck, Trophy, Users } from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, SectionCard } from "@/components/ui/page-shell";
import { getSchool } from "@/lib/registry/school";
import { getWeights } from "@/lib/honours/weights";
import { listAccounts } from "@/lib/auth/registration";
import { listStaff } from "@/lib/registry/staff";
import { listRestorePoints } from "@/lib/registry/restore-point";
import { EmailForm } from "./_components/email-form";
import { SchoolForm } from "./_components/school-form";
import { HonoursWeightsForm } from "./_components/honours-weights-form";
import { Accounts } from "./_components/accounts";
import { PermissionMatrix } from "./_components/permission-matrix";
import { RestorePoints } from "./_components/restore-points";
import { SettingsWorkspace, type SettingsGroup } from "./_components/settings-workspace";
// Imported from the plain module, not the client component: a constant crossing
// that boundary arrives as a proxy and would have no `.includes`.
import {
  DEFAULT_SETTINGS_GROUP,
  isSettingsGroupId,
  type SettingsGroupId,
} from "./_components/settings-groups";
import { loadGrants, granted } from "@/lib/auth/permissions";
import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  CAPABILITY_NOTE,
  canByDefault,
} from "@/lib/auth/roles";

import { requirePage } from "@/lib/auth/guard";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // Redirects unless the stored permission matrix allows this section. This
  // is the only guard the page needs: every card below is reachable by
  // anyone who clears it, since `manage:settings` gates the whole route
  // rather than individual cards — there is no narrower per-card check to
  // preserve, so no group can ever render empty for whoever is here.
  await requirePage("/dashboard/settings");

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // The session carries id and username, but not email — the JWT is issued at
  // sign-in and would go stale the moment the address changes. Read it fresh.
  const [user, school, accounts, weights, restorePoints] = await Promise.all([
    prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      select: { username: true, email: true, createdAt: true },
    }),
    getSchool(),
    listAccounts(),
    getWeights(),
    listRestorePoints(),
  ]);
  const staff = await listStaff();
  const grants = await loadGrants();

  // Each cell also carries whether it differs from the built-in default, so the
  // matrix can mark what the school has changed.
  const matrix = CAPABILITIES.map((capability) => ({
    key: capability,
    label: CAPABILITY_LABEL[capability],
    note: CAPABILITY_NOTE[capability],
    roles: Object.fromEntries(
      (["OFFICE", "TEACHER"] as const).map((role) => {
        const allowed = granted(grants, role, capability);
        return [role, { allowed, changed: allowed !== canByDefault(role, capability) }];
      }),
    ),
  }));
  const anyChanged = matrix.some((row) =>
    Object.values(row.roles).some((cell) => cell.changed),
  );

  if (!user) redirect("/login");

  const { view: viewParam } = await searchParams;
  // The URL owns the selected group, the same as `?view=honours` owns the
  // Students page's switch: a reload or a bookmarked link has to land back
  // on the right one. An unrecognised value falls back to the first group
  // rather than erroring, matching how Students treats a stray `?view=`.
  const view: SettingsGroupId = isSettingsGroupId(viewParam) ? viewParam : DEFAULT_SETTINGS_GROUP;

  // Grouped the way Google's settings are: the school's own identity first,
  // then who can even get in and what they can do once they're in, then the
  // day-to-day academic knob, then this signed-in person's own credentials,
  // and last — deliberately out of the way, since it is the one card that
  // can permanently delete data — the restore points.
  const groups: SettingsGroup[] = [
    {
      id: "school",
      label: "School",
      description: "Identity used on the dashboard header and every printed marksheet.",
      tint: "violet",
      content: (
        <SectionCard
          icon={Building2}
          tint="violet"
          title="School details"
          description="Used on the dashboard header and every printed marksheet."
        >
          <SchoolForm school={school} />
        </SectionCard>
      ),
    },
    {
      id: "privacy",
      label: "Privacy & access",
      description: "Who can sign in, and what each role is allowed to do once they do.",
      tint: "blue",
      content: (
        <>
          <SectionCard
            icon={Users}
            tint="amber"
            title="Who can sign in"
            description="Public sign-up is closed. What each of them can reach is set below."
          >
            <Accounts
              accounts={accounts.map((a) => ({
                id: a.id,
                username: a.username,
                email: a.email,
                role: a.role,
                createdLabel: a.createdAt.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }),
                staffId: a.staff?.id ?? null,
                staffName: a.staff?.fullName ?? null,
              }))}
              staff={staff.map((s) => ({
                id: s.id,
                fullName: s.fullName,
                taken: s.userId !== null,
              }))}
              currentUserId={Number(session.user.id)}
            />
          </SectionCard>

          <SectionCard
            icon={ShieldCheck}
            tint="blue"
            title="What each role can do"
            description="Tick a box to allow that role into a section. Takes effect on their next page load."
          >
            <PermissionMatrix capabilities={matrix} anyChanged={anyChanged} />
          </SectionCard>
        </>
      ),
    },
    {
      id: "academic",
      label: "Academic",
      description: "How exams, attendance, conduct and activities combine into the Honours score.",
      tint: "amber",
      content: (
        <SectionCard
          icon={Trophy}
          tint="amber"
          title="Honours weighting"
          description="How exams, attendance, conduct and activities combine into each student's score on the Honours page."
        >
          <HonoursWeightsForm weights={weights} />
        </SectionCard>
      ),
    },
    {
      id: "account",
      label: "Your account",
      description: "Your own sign-in username, email and password.",
      tint: "green",
      content: (
        <SectionCard
          icon={KeyRound}
          tint="green"
          title="Your account"
          description="How you sign in."
        >
          <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="font-medium">{user.username}</dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="font-medium">
              {user.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </dd>
          </dl>

          <EmailForm currentEmail={user.email} />
        </SectionCard>
      ),
    },
    {
      id: "data",
      label: "Data",
      description: "Restore points captured when an academic year is deleted.",
      tint: "rose",
      content: (
        <SectionCard
          icon={History}
          tint="rose"
          title="Restore points"
          description="Captured when an academic year is deleted. Each one is the only copy of that year's data once the year itself is gone — deleting a restore point loses it for good."
        >
          <RestorePoints
            restorePoints={restorePoints.map((p) => ({
              id: p.id,
              yearNameBS: p.yearNameBS,
              takenLabel: `${p.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })} at ${p.createdAt.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
              createdByUsername: p.createdByUsername,
              payloadBytes: p.payloadBytes,
              counts: p.counts,
            }))}
          />
        </SectionCard>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader icon={Building2} tint="blue" title="Settings" />
      <SettingsWorkspace view={view} groups={groups} />
    </div>
  );
}
