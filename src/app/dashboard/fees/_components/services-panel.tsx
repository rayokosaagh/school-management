"use client";

import { Bus, Shapes } from "lucide-react";
import { useMemo, useState } from "react";
import { money } from "@/lib/fees/money";
import type { studentFeeWorkspace } from "@/lib/fees/student-fees";
import type { transportWorkspace } from "@/lib/fees/transport";
import { ServiceRail, type ServiceChoice } from "./service-rail";
import { TransportPanel } from "./transport-panel";
import { ServicePriceSetup, PlanEditor } from "./student-fees-panel";

type StudentFees = Awaited<ReturnType<typeof studentFeeWorkspace>>;
type Transport = Awaited<ReturnType<typeof transportWorkspace>>;

const TRANSPORT = "transport";

/// The Services step: every service down the left, the chosen one on the
/// right.
///
/// The rail replaced a bare dropdown. A school with four services could not
/// see that it had four, nor which of them nobody was registered for, without
/// opening the list and reading it — the one question the page exists to
/// answer was the one thing it hid.
export function ServicesPanel({ academicYearId, yearLabel, data, transport }: {
  academicYearId: number;
  yearLabel: string;
  data: StudentFees;
  transport: Transport;
}) {
  const [service, setService] = useState(TRANSPORT);
  const [busy, setBusy] = useState(false);

  const activeEnrollmentIds = useMemo(
    () => new Set(transport.enrollments.map(enrollment => enrollment.id)),
    [transport.enrollments],
  );

  /// Transport, then every priced per-student plan, then any fee type marked
  /// as a per-student service that nobody has put a price on yet. That last
  /// group is why a fee type created elsewhere can still be found here: it
  /// shows up needing setup rather than vanishing until it is priced.
  const services = useMemo<ServiceChoice[]>(() => {
    const transportCount = transport.registrations.filter(
      registration => registration.isActive && activeEnrollmentIds.has(registration.enrollmentId),
    ).length;

    const plans = data.plans.map(plan => ({
      value: `plan:${plan.id}`,
      label: plan.name,
      note: `${plan.frequency === "MONTHLY" ? "Monthly" : "Once a year"} · ${money(plan.amount)}${plan.isActive ? "" : " · Paused"}`,
      icon: Shapes,
      count: plan.assignments.filter(
        assignment => assignment.isActive && activeEnrollmentIds.has(assignment.enrollmentId),
      ).length,
    }));

    const unpriced = data.heads
      .filter(head => head.billingScope === "STUDENT" && !data.plans.some(plan => plan.name === head.name))
      .map(head => ({
        value: `head:${head.id}`,
        label: head.name,
        note: `${head.frequency === "MONTHLY" ? "Monthly" : "Once a year"} · Needs a price`,
        icon: Shapes,
        count: 0,
      }));

    return [
      {
        value: TRANSPORT,
        label: "Transportation",
        note: "Monthly · price set per student",
        icon: Bus,
        count: transportCount,
      },
      ...plans,
      ...unpriced,
    ];
  }, [data.plans, data.heads, transport.registrations, activeEnrollmentIds]);

  const current = services.some(option => option.value === service) ? service : TRANSPORT;
  const plan = data.plans.find(item => current === `plan:${item.id}`);
  const head = data.heads.find(item => current === `head:${item.id}`);

  return (
    <div className="bg-surface border-line min-w-0 overflow-hidden rounded-xl border">
      <div className="grid min-w-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <ServiceRail services={services} value={current} onChange={setService} disabled={busy} />

        <div className="min-w-0">
          {/* Transport stays mounted across service switches so its drafts
              survive. The others are keyed, so switching between them resets
              cleanly rather than carrying one plan's edits into another. */}
          <div hidden={current !== TRANSPORT}>
            <TransportPanel
              academicYearId={academicYearId}
              yearLabel={yearLabel}
              data={transport}
              onBusy={setBusy}
            />
          </div>
          {plan ? (
            <PlanEditor
              key={`${plan.id}:${plan.amount}:${plan.isActive}:${plan.selectedIds.join(",")}`}
              academicYearId={academicYearId}
              yearLabel={yearLabel}
              plan={plan}
              students={transport.enrollments}
              months={data.months}
              onBusy={setBusy}
            />
          ) : null}
          {head ? (
            <ServicePriceSetup
              key={head.id}
              academicYearId={academicYearId}
              yearLabel={yearLabel}
              head={head}
              onBusy={setBusy}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
