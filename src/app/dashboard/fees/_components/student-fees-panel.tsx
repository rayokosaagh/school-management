"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, Plus, Save, Send, Shapes, Users, Wallet } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Button } from "@/components/ui/button";
import type { ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToastedActionState } from "@/components/ui/toast";
import { BS_MONTHS } from "@/lib/date/bs";
import { money } from "@/lib/fees/money";
import type { studentFeeWorkspace } from "@/lib/fees/student-fees";
import { Amount } from "./money-cells";
import { SetupHeader } from "./setup-header";
import { ServiceRoster } from "./service-roster";
import { StudentAvatar } from "@/components/ui/student-avatar";
import { StudentPicker, type StudentChoice } from "./student-picker";
import { addStudentFee, billStudentFee, saveStudentFee, unregisterStudentFee } from "../student-fee-actions";
import type { FeeActionState } from "../actions";

type Data = Awaited<ReturnType<typeof studentFeeWorkspace>>;
type Plan = Data["plans"][number];
const EMPTY: FeeActionState = {};

// Creation belongs to Manage fee types; this only prices an existing service.
export function ServicePriceSetup({ academicYearId, yearLabel, head, onBusy }: { academicYearId: number; yearLabel: string; head: Data["heads"][number]; onBusy: (busy: boolean) => void }) {
  const id = useId();
  const [state, action, pending] = useToastedActionState(addStudentFee, EMPTY);
  const [amount, setAmount] = useState("");
  useEffect(() => { onBusy(pending); return () => onBusy(false); }, [pending, onBusy]);
  return <section className="min-w-0" aria-label={`${head.name} service`}>
    <SetupHeader
      eyebrow={`SERVICES · ${yearLabel}`}
      icon={Shapes}
      title={`${head.name} service`}
      badge={<Badge variant="outline"><TranslatedText>Needs a price</TranslatedText></Badge>}
      description="Set this service’s price for the academic year, then register the students who take it."
      stats={[
        { icon: Users, value: "No students yet", note: "Register them once it is priced" },
        { icon: Wallet, value: "Not priced", note: `Charged ${head.frequency === "MONTHLY" ? "every month" : "once a year"}` },
        { icon: CalendarDays, value: yearLabel, note: "Academic year" },
      ]}
    />
    <form action={action} className="space-y-4 p-5 sm:p-7">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="name" value={head.name} />
      <input type="hidden" name="frequency" value={head.frequency} />
      <input type="hidden" name="convertClassFee" value="false" />
      <div className="max-w-xs space-y-2"><Label htmlFor={id}><TranslatedText>Price per student (Rs.)</TranslatedText></Label><Input id={id} name="amount" type="number" value={amount} onChange={event => setAmount(event.target.value)} min={1} max={2147483647} step={1} required disabled={pending} /></div>
      <p className="text-ink-3 text-xs"><TranslatedText>{head.frequency === "MONTHLY" ? "Monthly" : "Once per academic year"}</TranslatedText><TranslatedText> · Frequency is set in Manage fee types. Saving a price does not issue bills.</TranslatedText></p>
      {state.error ? <p role="alert" className="text-bad text-sm">{state.error}</p> : null}
      <Button type="submit" disabled={pending}><Save data-icon="inline-start" /><TranslatedText>{pending ? "Saving…" : "Save service price"}</TranslatedText></Button>
    </form>
  </section>;
}

/// Takes ticked pupils off the service for good.
///
/// Offered only while every ticked pupil is unbilled. A billed one cannot be
/// removed — the invoice points at the assignment — and the same house rule
/// the fee-type sheet follows applies here: the button is disabled with the
/// reason on it rather than hidden, so somebody hunting for it is told why
/// they cannot have it.
function BulkUnregister({ academicYearId, planId, enrollmentIds, billedIds, disabled, onDone }: {
  academicYearId: number; planId: number; enrollmentIds: number[];
  billedIds: Set<number>; disabled: boolean; onDone: () => void;
}) {
  const [state, action, pending] = useToastedActionState(unregisterStudentFee, EMPTY);
  const blocked = enrollmentIds.filter(id => billedIds.has(id)).length;
  useEffect(() => { if (state.success) onDone(); }, [state.success, onDone]);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="planId" value={planId} />
      {enrollmentIds.map(id => <input key={id} type="hidden" name="enrollmentId" value={id} />)}
      <ConfirmSubmit
        label="Unregister"
        confirmLabel="Really unregister?"
        pending={pending}
        disabled={disabled || blocked === enrollmentIds.length}
        title={blocked === enrollmentIds.length
          ? `${blocked === 1 ? "That student has" : "Those students have"} already been billed for this service, so ${blocked === 1 ? "they cannot" : "they cannot"} be unregistered. Pause instead.`
          : blocked > 0
            ? `Removes ${enrollmentIds.length - blocked}. ${blocked} already billed and will be left in place.`
            : "Removes them from this service entirely. Billing history is unaffected."}
      />
    </form>
  );
}

/// One per-student service — Library, Computer lab, anything billed to the
/// pupils who take it.
///
/// Laid out exactly like the transportation panel: the same card header, the
/// same "Register a student" sheet, the roster on the left and the billing
/// form on the right. The two panels sit in the same Services tab and used to
/// look like different products.
///
/// The billing form is a sibling of the plan form rather than a child of it —
/// nested forms are invalid HTML, and the roster's hidden inputs have to post
/// with the price.
export function PlanEditor({ academicYearId, yearLabel, plan, students, months, onBusy }: { academicYearId: number; yearLabel: string; plan: Plan; students: StudentChoice[]; months: Data["months"]; onBusy: (busy: boolean) => void }) {
  const id = useId();
  const activeIds = useMemo(() => new Set(students.map(student => student.id)), [students]);
  const savedIds = useMemo(() => plan.selectedIds.filter(studentId => activeIds.has(studentId)), [plan.selectedIds, activeIds]);
  const [selected, setSelected] = useState(savedIds);
  const [amount, setAmount] = useState(String(plan.amount));
  const [active, setActive] = useState(plan.isActive);
  const [picking, setPicking] = useState(false);
  /// Ticked rows, as `getRowId` strings. Held here rather than in the table so
  /// it survives paging, search and a change of class tab.
  const [ticked, setTicked] = useState<string[]>([]);
  const [month, setMonth] = useState(String(months.filter(item => item.started).at(-1)?.month ?? 1));
  const [state, action, pending] = useToastedActionState(saveStudentFee, EMPTY);
  const [billState, billAction, issuing] = useToastedActionState(billStudentFee, EMPTY);
  const busy = pending || issuing;
  const dirty = amount !== String(plan.amount) || active !== plan.isActive || selected.length !== savedIds.length || selected.some(studentId => !savedIds.includes(studentId));
  useEffect(() => { onBusy(busy || dirty); return () => onBusy(false); }, [busy, dirty, onBusy]);
  const period = plan.frequency === "MONTHLY" ? Number(month) : 0;
  const eligible = plan.assignments.filter(assignment => assignment.isActive && activeIds.has(assignment.enrollmentId) && !assignment.billedMonths.includes(period)).length;
  const started = period === 0 || months.some(item => item.month === period && item.started);
  const periodName = period === 0 ? "the year" : BS_MONTHS[period - 1];
  /// What stands between the button and a bill, or null when nothing does.
  /// Only one can be shown, so they are ordered by what the reader must fix
  /// first: their own unsaved edits, then the plan, then the calendar.
  const blocker = dirty
    ? "Save or discard your changes before issuing."
    : !plan.isActive
      ? "This plan is paused. Turn it on and save before issuing."
      : !started
        ? `${periodName} has not started yet.`
        : eligible === 0
          ? `Everyone on ${plan.name} has already been billed for ${periodName}.`
          : null;
  /// Everyone the plan knows about: whoever is selected now, plus anyone with
  /// an assignment that is currently paused.
  ///
  /// Listing only the selected pupils meant a paused one disappeared from the
  /// roster altogether, and the only route back was to find them in the
  /// picker and register them a second time.
  const tickedIds = useMemo(() => new Set(ticked.map(Number)), [ticked]);
  /// Pupils this service has already billed. They cannot be unregistered —
  /// their bill points at the assignment — so the bar says so rather than
  /// failing halfway through.
  const billedIds = useMemo(
    () => new Set(plan.assignments.filter(a => a.billedMonths.length > 0).map(a => a.enrollmentId)),
    [plan.assignments],
  );

  const known = useMemo(() => {
    const ids = new Set<number>(selected);
    for (const assignment of plan.assignments) {
      if (activeIds.has(assignment.enrollmentId)) ids.add(assignment.enrollmentId);
    }
    return students.filter(student => ids.has(student.id));
  }, [students, selected, plan.assignments, activeIds]);

  const columns = useMemo<ColumnDef<StudentChoice, unknown>[]>(() => [
    {
      id: "student",
      accessorKey: "name",
      header: "Student",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <StudentAvatar photoId={null} name={row.original.name} className="size-8 rounded-lg text-xs" />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="text-ink-3 truncate text-xs">{row.original.admissionNo}</p>
          </div>
        </div>
      ),
    },
    {
      id: "section",
      accessorKey: "section",
      header: "Class",
      meta: { width: "140px" } satisfies ColumnMeta,
      cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span>,
    },
    {
      id: "price",
      header: "Price",
      enableSorting: false,
      meta: { numeric: true, width: "120px" } satisfies ColumnMeta,
      cell: () => <Amount value={plan.amount} strong />,
    },
    {
      id: "status",
      // Read from the live selection, not from the saved plan, so a row shows
      // what Save would write rather than what was written last time.
      accessorFn: row => (selected.includes(row.id) ? "Active" : "Paused"),
      header: "Status",
      meta: { width: "120px" } satisfies ColumnMeta,
      cell: ({ getValue }) => <Badge variant="outline">{String(getValue())}</Badge>,
    },
    {
      id: "billed",
      accessorFn: row => plan.assignments.find(assignment => assignment.enrollmentId === row.id)?.billedMonths.length ?? 0,
      header: "Periods billed",
      meta: { numeric: true, width: "140px" } satisfies ColumnMeta,
    },
  ], [plan.amount, plan.assignments, selected]);

  return <section className="min-w-0" aria-label={`${plan.name} service`}>
    <SetupHeader
      eyebrow={`SERVICES · ${yearLabel}`}
      icon={Shapes}
      title={`${plan.name} service`}
      badge={<Badge variant="outline"><TranslatedText>{plan.isActive ? "Active" : "Paused"}</TranslatedText></Badge>}
      description="Register the students who take this service, with one price for everybody on it. Only registered students are billed."
      stats={[
        {
          icon: Users,
          value: `${savedIds.length} registered ${savedIds.length === 1 ? "student" : "students"}`,
          note: "Only registered students are billed",
        },
        {
          icon: Wallet,
          value: money(plan.amount),
          note: `Price per student (${plan.frequency === "MONTHLY" ? "Monthly" : "Yearly"})`,
        },
        { icon: CalendarDays, value: periodName, note: "Current billing period" },
      ]}
      actions={
        <Button type="button" variant="outline" onClick={() => setPicking(true)} disabled={busy || students.length === 0}>
          <Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>Register a student
        </TranslatedText></Button>
      }
    />

    <div className="grid items-start gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_320px]">
      <form action={action} className="min-w-0 space-y-4">
        <input type="hidden" name="academicYearId" value={academicYearId} /><input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="isActive" value={String(active)} />
        {/* The picker lives in a Sheet, which portals out of this form, so the
            selection posts from here as hidden fields instead. */}
        {selected.map(studentId => <input key={studentId} type="hidden" name="enrollmentId" value={studentId} />)}
        <div className="flex flex-wrap items-end gap-5">
          <div className="w-full space-y-2 sm:w-56"><Label htmlFor={`${id}-price`}><TranslatedText>Price per student (Rs.)</TranslatedText></Label><Input id={`${id}-price`} name="amount" type="number" value={amount} onChange={event => setAmount(event.target.value)} min={1} max={2147483647} step={1} required disabled={busy} /></div>
          <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} disabled={busy} className="accent-brand size-4" /><TranslatedText>Fee plan is active</TranslatedText></label>
        </div>

        <ServiceRoster<StudentChoice>
          id="service-roster"
          rows={known}
          columns={columns}
          getRowId={student => String(student.id)}
          sectionOf={student => student.section}
          searchOf={student => `${student.name} ${student.admissionNo} ${student.section}`}
          noun="student"
          disabled={busy}
          initialSort={[{ id: "student", desc: false }]}
          selection={{
            ids: ticked,
            onChange: setTicked,
            label: student => `Select ${student.name}`,
          }}
          bulkActions={
            <>
              {/* Pause and Resume are selection changes like any other, so
                  they go through the card's Save with the price. Unregister
                  deletes rows, so it posts on its own and confirms first. */}
              <Button type="button" variant="outline" size="sm" disabled={busy}
                onClick={() => { setSelected(previous => previous.filter(id => !tickedIds.has(id))); setTicked([]); }}><TranslatedText>
                Pause
              </TranslatedText></Button>
              <Button type="button" variant="outline" size="sm" disabled={busy}
                onClick={() => { setSelected(previous => [...new Set([...previous, ...tickedIds])]); setTicked([]); }}><TranslatedText>
                Resume
              </TranslatedText></Button>
              <BulkUnregister
                academicYearId={academicYearId}
                planId={plan.id}
                enrollmentIds={[...tickedIds]}
                billedIds={billedIds}
                disabled={busy}
                onDone={() => setTicked([])}
              />
            </>
          }
          rowActions={student => {
            // Pausing is a change to the selection like any other, so it goes
            // through Save with the price — one save, one confirmation, and
            // Discard puts a mis-click back.
            const active = selected.includes(student.id);
            return (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setSelected(previous => active
                  ? previous.filter(studentId => studentId !== student.id)
                  : [...previous, student.id])}
              >
                <TranslatedText>{active ? "Pause" : "Resume"}</TranslatedText><span className="sr-only"> {student.name}</span>
              </Button>
            );
          }}
          empty={{
            icon: Plus,
            tint: "rose",
            title: "No students registered",
            description: students.length
              ? "Use Register a student to choose who pays this fee."
              : "Add active students to this academic year first.",
          }}
        />

        <p className="text-ink-3 text-xs leading-5"><TranslatedText>Pausing stops future bills and keeps the student on the roster; existing bills are retained. Resume puts them back in the next run.</TranslatedText><TranslatedText>{plan.selectedIds.length > savedIds.length ? " Students who have left the school are excluded from new bills whatever their status here." : ""}</TranslatedText></p>
        {state.error ? <p role="alert" className="text-bad text-sm">{state.error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">{/* "Registered", not "selected": the bulk bar above uses "selected" for the
    rows you have ticked, and two counts on one screen using one word for two
    different things is how somebody pauses the wrong pupils. */}
<p role="status" className="text-ink-3 text-xs">{selected.length}<TranslatedText> active on this service · </TranslatedText><TranslatedText>{dirty ? "Unsaved changes" : "Saved"}</TranslatedText></p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || !dirty} onClick={() => { setSelected(savedIds); setAmount(String(plan.amount)); setActive(plan.isActive); }}><TranslatedText>Discard</TranslatedText></Button><Button type="submit" disabled={busy || !dirty}><Save data-icon="inline-start" /><TranslatedText>{pending ? "Saving…" : "Save price and students"}</TranslatedText></Button></div></div>
      </form>

      <form action={billAction} className="bg-surface-2 border-line min-w-0 space-y-5 rounded-xl border p-5">
        <input type="hidden" name="academicYearId" value={academicYearId} /><input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="month" value={period} />
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Send className="text-brand size-4" aria-hidden="true" /><TranslatedText>Issue bills to saved students</TranslatedText></h4>
        {plan.frequency === "MONTHLY" ? <div className="space-y-2"><Label htmlFor={`${id}-month`}><TranslatedText>Billing month (BS)</TranslatedText></Label><FieldSelect id={`${id}-month`} aria-label={`Billing month for ${plan.name}`} value={month} onValueChange={value => setMonth(value ?? "1")} disabled={busy} options={months.map(item => ({ value: String(item.month), label: `${BS_MONTHS[item.month - 1]}${item.started ? "" : " · Not started"}`, disabled: !item.started }))} /></div> : null}
        {/* What pressing the button will do, in pupils and rupees, for the
            period actually selected. It replaced two sentences of standing
            policy — true of every run, so never worth reading before one. */}
        <p className={`text-xs leading-5 ${blocker ? "text-ink-3" : "text-ink-2"}`}>{blocker ?? <><TranslatedText>Bills </TranslatedText><span className="font-semibold">{eligible}</span> <TranslatedText>{eligible === 1 ? "student" : "students"}</TranslatedText> <span aria-hidden="true">·</span> <span className="font-semibold tabular-nums">{money(eligible * plan.amount)}</span><TranslatedText> for </TranslatedText>{periodName}.</>}</p>
        <Button
          type="submit"
          className="w-full"
          disabled={busy || dirty || !plan.isActive || !eligible || !started}
          // The standing caveats, off the card but still reachable.
          title={`Students already billed for this period are skipped, including charges from older class-wide bills. Each bill copies the saved price, and enrolment dates are checked when issuing.`}
        ><Send data-icon="inline-start" /><TranslatedText>{issuing ? "Issuing…" : "Issue student fee bills"}</TranslatedText></Button>
        {billState.error ? <p role="alert" className="text-bad text-sm">{billState.error}</p> : null}
      </form>
    </div>

    <Sheet open={picking} onOpenChange={(nextOpen, details) => { if (busy) { details.cancel(); return; } setPicking(nextOpen); }}>
      <SheetContent showCloseButton={!busy} className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="px-6 pt-6"><SheetTitle><TranslatedText>Register students for </TranslatedText>{plan.name}</SheetTitle><SheetDescription><TranslatedText>Tick everybody who takes this service. Nothing is charged until you save and then issue bills.</TranslatedText></SheetDescription></SheetHeader>
        <div className="space-y-5 px-6 pb-6">
          <StudentPicker students={students} selectedIds={selected} onSelectionChange={setSelected} multiple disabled={busy} />
          <Button type="button" className="w-full" onClick={() => setPicking(false)} disabled={busy}><TranslatedText>Done</TranslatedText></Button>
        </div>
      </SheetContent>
    </Sheet>
  </section>;
}
