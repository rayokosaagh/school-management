"use client";

import { ReceiptText, Search, WalletCards } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ui/page-frame";
import { RegisterTabs, registerTabId, type RegisterTab } from "@/components/ui/register-tabs";
import { FieldSelect } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { feeTypeFilters } from "@/lib/fees/fee-type-filters";
import type { feeWorkspace } from "@/lib/fees/fees";
import { sectionCode } from "@/lib/register-codes";
import { BalancesTab, scopeToFeeType, type BalanceRow } from "./balances-tab";
import { FeeSegmented } from "./fee-segmented";
import { FeeTypesSheet } from "./fee-types-sheet";
import { PupilPane, type PupilFees } from "./pupil-pane";
import { FeeStatChips, feeStatsLine } from "./stat-chips";
import { CollectPaymentForm } from "./fees-forms";
import { SetupTab } from "./setup-tab";
import type { transportWorkspace } from "@/lib/fees/transport";
import type { studentFeeWorkspace } from "@/lib/fees/student-fees";
import { ServicesPanel } from "./services-panel";

type FeesData = Awaited<ReturnType<typeof feeWorkspace>>;
/// There is no Invoices view. It listed the same year one row per bill that
/// Balances lists one row per pupil, and answered no question Balances plus a
/// pupil's own Bills section does not — a bill is looked up through the child
/// it belongs to, never on its own.
type View = "balances" | "setup";
type Owing = "" | "owing" | "clear" | "unbilled";

const ALL = "all";

export function FeesWorkspace({
  heads,
  managedHeads,
  grades,
  structures,
  openInvoices,
  guardians,
  balances,
  totals,
  academicYearId,
  yearLabel,
  selectedEnrollmentId,
  pane,
  transport,
  studentFees,
}: FeesData & {
  transport: Awaited<ReturnType<typeof transportWorkspace>>;
  studentFees: Awaited<ReturnType<typeof studentFeeWorkspace>>;
  academicYearId: number;
  yearLabel: string;
  selectedEnrollmentId: number | null;
  pane: PupilFees | null;
}) {
  const [view, setView] = useState<View>("balances");
  const [tab, setTab] = useState<string>(ALL);
  const [feeType, setFeeType] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [owing, setOwing] = useState<Owing>("");
  // The invoice the collection sheet opens on. `null` while closed; a row click
  // sets it, so taking money from the list never means hunting the same
  // student down again in a dropdown.
  const [collecting, setCollecting] = useState<number | null>(null);
  // Which pupil the sheet was opened for, or null when it was opened from the
  // header or the invoice list. Scopes the picker so a payment taken from one
  // pupil's pane cannot land on another child's bill.
  const [collectingFor, setCollectingFor] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const reduce = useReducedMotion();
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const router = useRouter();
  const search = useSearchParams();

  const needle = query.trim().toLowerCase();
  const matches = (...fields: string[]) =>
    needle === "" || fields.some((field) => field.toLowerCase().includes(needle));

  // One tab per class on the roll. Built from the balances themselves rather
  // than from `grades`, so a class with nobody enrolled this year never gets a
  // tab that leads to an empty table.
  const tabs = useMemo<RegisterTab[]>(() => {
    // Enrolments arrive ordered by grade then roll number, which puts whichever
    // section holds roll 1 first — "B" before "A". Sorted here instead, so the
    // strip reads in the order the school lists its classes.
    const rank = new Map(grades.map((grade, index) => [grade.id, index]));
    const seen = new Map<number, RegisterTab & { gradeId: number; sectionName: string }>();
    for (const row of balances) {
      const found = seen.get(row.sectionId);
      if (found) {
        found.count = (found.count ?? 0) + 1;
        continue;
      }
      seen.set(row.sectionId, {
        id: String(row.sectionId),
        code: sectionCode(row.gradeName, row.sectionName),
        label: row.section,
        count: 1,
        gradeId: row.gradeId,
        sectionName: row.sectionName,
      });
    }
    const classes = [...seen.values()].sort(
      (a, b) =>
        (rank.get(a.gradeId) ?? 0) - (rank.get(b.gradeId) ?? 0) ||
        a.sectionName.localeCompare(b.sectionName),
    );
    return [{ id: ALL, code: "ALL", label: "All classes", count: balances.length }, ...classes];
  }, [balances, grades]);

  const activeLabel = useMemo(
    () => tabs.find((t) => t.id === tab)?.label ?? "All classes",
    [tabs, tab],
  );

  // The class tab alone, before the Show filter, the fee-type strip and the
  // search. Everything below narrows this.
  const inClass = useMemo(
    () => balances.filter((row) => tab === ALL || String(row.sectionId) === tab),
    [balances, tab],
  );

  /// Whether a row survives the Show filter, judged on the fee in view.
  ///
  /// Scoped, because the strip narrows the money columns: with Admission
  /// picked, "Still owing" has to mean owing *admission*. Judged on the
  /// year's total it listed pupils who owe only their monthly fee, under a
  /// column reading Rs. 0.
  const passesShow = useCallback(
    (row: BalanceRow, forType: string | null) => {
      if (owing === "") return true;
      const scoped = scopeToFeeType(row, forType);
      if (owing === "owing") return scoped.due > 0;
      if (owing === "clear") return scoped.hasBill && scoped.due === 0;
      return !scoped.hasBill;
    },
    [owing],
  );

  /// One chip per fee type actually charged in the current class — Admission,
  /// Monthly Fee, Transport, Library. A school adds fee types as it goes, so
  /// this is built from the bills rather than from a fixed list.
  const feeTypes = useMemo(
    () => feeTypeFilters(inClass, ALL, (row, name) => passesShow(row, name === ALL ? null : name)),
    [inClass, passesShow],
  );

  // Switching class can retire the chosen fee type — Transport in 4-A, none
  // in 4-B. Falling back to "All fees" beats showing an empty table under a
  // chip that is still lit.
  const activeFeeType = feeTypes.some((option) => option.value === feeType) ? feeType : ALL;
  const scopedType = activeFeeType === ALL ? null : activeFeeType;

  const visibleBalances = useMemo(
    () =>
      inClass.filter((row) => {
        if (scopedType !== null && !row.feeTypes.includes(scopedType)) return false;
        if (!passesShow(row, scopedType)) return false;
        return matches(row.name, row.admissionNo, row.section);
      }),
    // `matches` closes over `needle`, which is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inClass, needle, scopedType, passesShow],
  );

  /// The invoice a balance row should collect against: the oldest one still
  /// owing, so a part payment clears the longest-standing debt first.
  function oldestOpenFor(enrollmentId: number) {
    const open = openInvoices.filter((invoice) => invoice.enrollmentId === enrollmentId);
    return open.length === 0 ? null : open[open.length - 1].id;
  }

  function collect(invoiceId: number | null, forPupil: number | null = null) {
    setCollecting(invoiceId);
    setCollectingFor(forPupil);
    setSheetOpen(true);
  }

  const activeHeadCount = heads.filter((head) => head.isActive).length;
  const pricedGradeCount = new Set(structures.map((plan) => plan.grade.id)).size;

  const stats = {
    students: balances.length,
    arrears: totals.arrears,
    outstanding: totals.outstanding,
    collected: totals.collected,
    billed: totals.billed,
    overdue: totals.overdue,
    overdueAmount: totals.overdueAmount,
    unbilled: totals.unbilled,
    unbilledMonths: totals.unbilledMonths,
  };

  /// The URL owns which pupil is open, so a link reopens the same pane and
  /// Back closes it. `scroll: false` keeps the list where the reader left it.
  function openPupil(enrollmentId: number | null) {
    const next = new URLSearchParams(search.toString());
    if (enrollmentId === null) next.delete("pupil");
    else next.set("pupil", String(enrollmentId));
    const query = next.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }

  return (
    <PageFrame
      icon={<ReceiptText />}
      tint="rose"
      eyebrow="Finance"
      breadcrumb={
        <>
          Finance <span aria-hidden="true" className="mx-1.5">›</span>
          <span className="text-ink-2 font-medium" aria-current="page">Fees</span>
        </>
      }
      title="Fees"
      subtitle={
        <>
          {view === "setup"
            ? `Set what each class pays, then issue the bills for ${yearLabel}.`
            : `Manage and collect fees for the academic year ${yearLabel}.`}
          {/* The setup counts belong under the sentence they qualify, not out
              beside the step tabs where they read as a caption for whichever
              step happens to be open. */}
          {view === "setup" ? (
            <span className="text-ink-3 mt-1 block text-xs">
              {activeHeadCount} active fee types <span aria-hidden="true">·</span> {pricedGradeCount} of{" "}
              {grades.length} grades with fee plans
            </span>
          ) : null}
        </>
      }
      // The chips beside the view switch carry these figures on a wide
      // screen, so the line is just the year there. Below `sm` the chips are
      // hidden and the summary rides here instead.
      meta={view === "setup" ? yearLabel :
        <>
          <span className="lg:hidden">
            {yearLabel} · {feeStatsLine(stats)}
          </span>
          <span className="hidden lg:inline">{yearLabel}</span>
        </>
      }
      actions={
        // Two rows: the view switch and the year's figures on top, the
        // setup-only tool under them. Managing fee types is a rarer errand
        // than switching view, and putting it in the same row pushed the
        // switch off-centre on every screen that never opens it.
        <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {view !== "setup" ? <FeeStatChips {...stats} /> : null}
          <FeeSegmented
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: "balances" as const, label: "Balances", count: balances.length },
              { value: "setup" as const, label: "Setup" },
            ]}
          />
          <Sheet
            open={sheetOpen}
            onOpenChange={(open) => {
              setSheetOpen(open);
              if (!open) {
                setCollecting(null);
                setCollectingFor(null);
              }
            }}
          >
            {view !== "setup" ? <SheetTrigger
              render={<Button size="sm" disabled={openInvoices.length === 0} />}
              aria-label="Record payment"
            >
              <WalletCards data-icon="inline-start" aria-hidden="true" />
              {/* The label is the first thing to go on a phone, where the row
                  already carries a three-way view switch. */}
              <span className="hidden sm:inline">Record payment</span>
            </SheetTrigger> : null}
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Record a payment</SheetTitle>
                <SheetDescription>
                  The amount is split across the bill&rsquo;s lines and given a receipt number.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <CollectPaymentForm
                  // Remounted per invoice so the form always opens on the row
                  // that was clicked, not the one before it.
                  key={`${collectingFor ?? "all"}-${collecting ?? "any"}`}
                  openInvoices={openInvoices}
                  guardians={guardians}
                  initialInvoiceId={collecting}
                  forPupil={collectingFor}
                  onDone={() => {
                    setSheetOpen(false);
                    setCollecting(null);
                    setCollectingFor(null);
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {/* Setup only: managing fee types from a collections worklist is not
            a thing anybody does, and it governs every step of Setup. */}
        {view === "setup" ? <FeeTypesSheet managedHeads={managedHeads} /> : null}
        </div>
      }
    >
      {/* Keyed on the view, so switching remounts and replays the entrance —
          the same fade and 4px rise `template.tsx` gives a whole page, since
          this switch replaces as much of the screen as a navigation does. */}
      <motion.div
        key={view}
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        className="flex min-h-0 flex-1 flex-col"
      >
      {view === "setup" ? (
        <SetupTab
          academicYearId={academicYearId}
          yearLabel={yearLabel}
          grades={grades}
          heads={heads}
          structures={structures}
          services={<ServicesPanel key={academicYearId} academicYearId={academicYearId} yearLabel={yearLabel} data={studentFees} transport={transport} />}
        />
      ) : (
        <>
          <PageFrame.Tabs>
            <RegisterTabs
              tabs={tabs}
              value={tab}
              onChange={setTab}
              ariaLabel="Classes"
              baseId={baseId}
              panelId={panelId}
            />
          </PageFrame.Tabs>

          {/* A second strip under the classes: the class says whose money,
              this says which money. Only drawn once the year has more than
              one kind of fee on it — a lone "All fees" chip is furniture. */}
          {feeTypes.length > 2 ? (
            <div className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none] shell:-mx-6 shell:px-6 [&::-webkit-scrollbar]:hidden">
              <FeeSegmented
                ariaLabel="Fee type"
                value={activeFeeType}
                onChange={setFeeType}
                options={feeTypes}
              />
            </div>
          ) : null}

          <PageFrame.Toolbar>
            <label className="border-line bg-surface text-ink-3 flex h-8 min-w-[240px] shrink-0 items-center gap-2 rounded-lg border px-2.5">
              <Search className="size-3.5" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${activeLabel}`}
                aria-label={`Search ${activeLabel}`}
                className="h-7 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              />
            </label>
            <FieldSelect
              aria-label="Show"
              value={owing}
              onValueChange={(v) => setOwing((v ?? "") as Owing)}
              options={[
                { value: "", label: "Show: Everyone" },
                { value: "owing", label: "Show: Still owing" },
                { value: "clear", label: "Show: Paid up" },
                { value: "unbilled", label: "Show: Not billed" },
              ]}
              className="h-8 w-44 shrink-0"
            />
            <span className="flex-1" />
            <span className="text-ink-3 shrink-0 text-[12.5px] whitespace-nowrap">
              {visibleBalances.length} student{visibleBalances.length === 1 ? "" : "s"}
            </span>
          </PageFrame.Toolbar>

          <PageFrame.Split
            asideTitle={pane ? pane.student.name : undefined}
            asideOpen={pane !== null}
            onAsideClose={() => openPupil(null)}
            aside={
              pane && selectedEnrollmentId !== null ? (
                <PupilPane
                  key={selectedEnrollmentId}
                  enrollmentId={selectedEnrollmentId}
                  fees={pane}
                  // The pane opens from a filtered list, so its bills answer
                  // the same question the list was asked.
                  feeType={scopedType}
                  canCollect={oldestOpenFor(selectedEnrollmentId) !== null}
                  // A bill row names its own invoice; the header button does
                  // not, and falls back to the oldest one still owing.
                  onCollect={(invoiceId) =>
                    collect(invoiceId ?? oldestOpenFor(selectedEnrollmentId), selectedEnrollmentId)
                  }
                  onClose={() => openPupil(null)}
                />
              ) : undefined
            }
          >
            <PageFrame.Body id={panelId} aria-labelledby={registerTabId(baseId, tab)}>
              <BalancesTab
                id={`${baseId}-balances`}
                rows={visibleBalances}
                anyBalances={balances.length > 0}
                feeType={scopedType}
                selectedId={selectedEnrollmentId}
                // Opening the pupil rather than the payment sheet: you look
                // at what somebody owes before taking money from them.
                onSelect={(row) => openPupil(row.enrollmentId)}
              />
            </PageFrame.Body>
          </PageFrame.Split>
        </>
      )}
      </motion.div>
    </PageFrame>
  );
}
