"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import type { ColumnDef } from "@tanstack/react-table";
import { Bus, CalendarDays, MapPin, Pencil, Plus, Send, Users } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ColumnMeta } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToastedActionState } from "@/components/ui/toast";
import { BS_MONTHS } from "@/lib/date/bs";
import type { transportWorkspace } from "@/lib/fees/transport";
import type { FeeActionState } from "../actions";
import { billTransport, saveTransport, toggleTransport } from "../transport-actions";
import { Amount } from "./money-cells";
import { SetupHeader } from "./setup-header";
import { ServiceRoster } from "./service-roster";
import { StudentAvatar } from "@/components/ui/student-avatar";
import { StudentPicker } from "./student-picker";

type TransportData = Awaited<ReturnType<typeof transportWorkspace>>;
type Registration = TransportData["registrations"][number];
const EMPTY: FeeActionState = {};
const MONTH_OPTIONS = BS_MONTHS.map((label, index) => ({ value: String(index + 1), label }));
type RegistrationState = FeeActionState & { enrollmentId?: string };

async function saveSelectedTransport(previous: RegistrationState, data: FormData): Promise<RegistrationState> {
  return { ...await saveTransport(previous, data), enrollmentId: String(data.get("enrollmentId") ?? "") };
}

function RegistrationFields({ academicYearId, enrollmentId, registration, initialMonth, state, action, pending }: {
  academicYearId: number; enrollmentId: string; registration?: Registration; initialMonth: number;
  state: RegistrationState; action: (data: FormData) => void; pending: boolean;
}) {
  const id = useId();
  const [location, setLocation] = useState(registration?.pickupLocation ?? "");
  const [amount, setAmount] = useState(registration ? String(registration.monthlyAmount) : "");
  const [startMonth, setStartMonth] = useState(String(registration?.startMonth ?? initialMonth));
  const [active, setActive] = useState(registration?.isActive ?? true);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="isActive" value={String(active)} />
      <div className="space-y-2">
        <Label htmlFor={`${id}-location`}><TranslatedText>Pickup location</TranslatedText></Label>
        <Input id={`${id}-location`} name="pickupLocation" value={location} onChange={event => setLocation(event.target.value)} placeholder="Area or pickup stop" minLength={2} maxLength={160} required disabled={pending} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-amount`}><TranslatedText>Monthly price (Rs.)</TranslatedText></Label>
          <Input id={`${id}-amount`} name="monthlyAmount" type="number" inputMode="numeric" min={1} max={2147483647} step={1} value={amount} onChange={event => setAmount(event.target.value)} placeholder="e.g. 1500" required disabled={pending} />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-start`}><TranslatedText>Start month (BS)</TranslatedText></Label>
          <FieldSelect id={`${id}-start`} name="startMonth" aria-label="Transport start month" value={startMonth} onValueChange={value => setStartMonth(value ?? "1")} options={MONTH_OPTIONS} disabled={pending} />
        </div>
      </div>
      <div className="bg-surface-2 border-line min-w-0 rounded-xl border p-5">
        <label className="flex cursor-pointer items-start gap-3" htmlFor={`${id}-active`}>
          <input id={`${id}-active`} type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} disabled={pending} className="accent-brand mt-0.5 size-4 shrink-0" aria-describedby={`${id}-active-note`} />
          <span><span className="block text-sm font-medium"><TranslatedText>Transport is active</TranslatedText></span><span id={`${id}-active-note`} className="text-ink-3 mt-1 block text-xs leading-5"><TranslatedText>Uncheck to pause new transport bills for this student.</TranslatedText></span></span>
        </label>
      </div>
      <p className="text-ink-3 text-xs leading-5"><TranslatedText>Saving a registration does not issue a bill. Price, location, or status changes leave existing bills unchanged.</TranslatedText></p>
      {state.error && state.enrollmentId === enrollmentId ? <p role="alert" className="text-bad text-sm">{state.error}</p> : null}
      <Button type="submit" disabled={pending || !enrollmentId} className="w-full"><TranslatedText>{pending ? "Saving…" : registration ? "Save transport changes" : "Register for transport"}</TranslatedText></Button>
    </form>
  );
}

/// Pause or resume one registration from its row.
///
/// Pausing keeps the pupil on the roster with their pickup and price intact —
/// they are simply skipped by the next billing run. Nothing already billed
/// changes.
function TransportToggle({ academicYearId, registration, disabled }: {
  academicYearId: number; registration: Registration; disabled: boolean;
}) {
  const [, action, pending] = useToastedActionState(toggleTransport, EMPTY);
  const next = !registration.isActive;
  return (
    <form action={action} className="inline">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="enrollmentId" value={registration.enrollmentId} />
      <input type="hidden" name="isActive" value={String(next)} />
      {/* Worded, not an icon, and `ghost size="sm"` — the same shape the plan
          rosters give the same verb, so pausing a pupil looks identical
          whichever service you are on. */}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={disabled || pending}
        aria-label={`${next ? "Resume" : "Pause"} transport for ${registration.name}`}
      >
        <TranslatedText>{next ? "Resume" : "Pause"}</TranslatedText>
      </Button>
    </form>
  );
}

/// Pause or resume every ticked registration in one post.
///
/// The same action the row button uses — it takes one id or many — so the two
/// paths cannot drift into treating a pause differently.
function BulkTransportToggle({ academicYearId, enrollmentIds, isActive, label, disabled, onDone }: {
  academicYearId: number; enrollmentIds: number[]; isActive: boolean; label: string;
  disabled: boolean; onDone: () => void;
}) {
  const [state, action, pending] = useToastedActionState(toggleTransport, EMPTY);
  useEffect(() => { if (state.success) onDone(); }, [state.success, onDone]);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="isActive" value={String(isActive)} />
      {enrollmentIds.map(id => <input key={id} type="hidden" name="enrollmentId" value={id} />)}
      <Button type="submit" variant="outline" size="sm" disabled={disabled || pending || enrollmentIds.length === 0}>
        {pending ? "Saving…" : label}
      </Button>
    </form>
  );
}

function TransportBilling({ academicYearId, data, onBusy }: { academicYearId: number; data: TransportData; onBusy: (busy: boolean) => void }) {
  const id = useId();
  const [month, setMonth] = useState(String(data.months.filter(item => item.started).at(-1)?.month ?? 1));
  const [state, action, pending] = useToastedActionState(billTransport, EMPTY);
  useEffect(() => { onBusy(pending); }, [pending, onBusy]);
  const activeEnrollmentIds = new Set(data.enrollments.map(enrollment => enrollment.id));
  const available = data.registrations.some(registration => registration.isActive && activeEnrollmentIds.has(registration.enrollmentId) && registration.startMonth <= Number(month) && !registration.billedMonths.includes(Number(month)));
  const started = data.months.some(item => item.month === Number(month) && item.started);

  return (
    <form action={action} className="bg-surface-2 border-line min-w-0 space-y-5 rounded-xl border p-5">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <div><h4 className="flex items-center gap-2 text-sm font-semibold"><Send className="text-brand size-4" aria-hidden="true" /><TranslatedText>Issue transport bills</TranslatedText></h4><p className="text-ink-3 mt-2 text-xs leading-5"><TranslatedText>Only active registered students are included, from their start month. Students already billed for the month are skipped.</TranslatedText></p></div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-month`}><TranslatedText>Billing month (BS)</TranslatedText></Label>
        <FieldSelect id={`${id}-month`} name="month" aria-label="Transport billing month" value={month} onValueChange={value => setMonth(value ?? "1")} options={data.months.map(item => ({ value: String(item.month), label: `${BS_MONTHS[item.month - 1]}${item.started ? "" : " · Not started"}`, disabled: !item.started }))} disabled={pending} />
      </div>
      <Button type="submit" disabled={pending || !started || !available} className="w-full"><TranslatedText>{pending ? "Issuing…" : "Issue transport bills"}</TranslatedText></Button>
      {!started ? <p className="text-ink-3 text-xs leading-5"><TranslatedText>Billing opens when the selected month begins.</TranslatedText></p> : !available ? <p className="text-ink-3 text-xs leading-5"><TranslatedText>No unbilled active registrations for this month.</TranslatedText></p> : null}
      {state.error ? <p role="alert" className="text-bad text-sm">{state.error}</p> : null}
      <p className="text-ink-3 text-xs leading-5"><TranslatedText>Existing bills stay unchanged. Transport is billed separately from class fees.</TranslatedText></p>
    </form>
  );
}

export function TransportPanel({ academicYearId, yearLabel, data, onBusy }: { academicYearId: number; yearLabel: string; data: TransportData; onBusy?: (busy: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState("");
  /// Ticked rows, as `getRowId` strings — registration ids, not enrolment
  /// ones, so they match what the table hands back.
  const [ticked, setTicked] = useState<string[]>([]);
  const [state, action, pending] = useToastedActionState<RegistrationState>(saveSelectedTransport, EMPTY);
  const [billingBusy, setBillingBusy] = useState(false);
  useEffect(() => { onBusy?.(pending || billingBusy); }, [pending, billingBusy, onBusy]);
  const selected = data.registrations.find(registration => String(registration.enrollmentId) === enrollmentId);
  const selectedStudent = data.enrollments.find(student => String(student.id) === enrollmentId);
  const activeEnrollmentIds = useMemo(() => new Set(data.enrollments.map(enrollment => enrollment.id)), [data.enrollments]);
  const activeCount = data.registrations.filter(registration => registration.isActive && activeEnrollmentIds.has(registration.enrollmentId)).length;
  const stops = new Set(data.registrations.map(registration => registration.pickupLocation.trim().toLowerCase())).size;
  const currentMonth = data.months.filter(item => item.started).at(-1)?.month ?? 1;
  const currentMonthName = BS_MONTHS[currentMonth - 1];
  // The table ticks registrations; the action pauses enrolments.
  const tickedEnrollmentIds = useMemo(() => {
    const ids = new Set(ticked);
    return data.registrations.filter(r => ids.has(String(r.id))).map(r => r.enrollmentId);
  }, [ticked, data.registrations]);

  function edit(studentId: string) {
    if (pending) return;
    setEnrollmentId(studentId);
    setOpen(true);
  }

  const columns = useMemo<ColumnDef<Registration, unknown>[]>(() => [
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
      meta: { width: "120px" } satisfies ColumnMeta,
      cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span>,
    },
    {
      id: "location",
      accessorKey: "pickupLocation",
      header: "Pickup location",
      cell: ({ getValue }) => <span className="text-ink-2">{String(getValue())}</span>,
    },
    {
      id: "amount",
      accessorKey: "monthlyAmount",
      header: "Monthly price",
      meta: { numeric: true, width: "130px" } satisfies ColumnMeta,
      cell: ({ row }) => <Amount value={row.original.monthlyAmount} strong />,
    },
    {
      id: "status",
      // Sorted on the words the badge shows, so ordering by status groups the
      // rows the way the column reads.
      accessorFn: (row) =>
        !activeEnrollmentIds.has(row.enrollmentId) ? "Student inactive" : row.isActive ? "Active" : "Paused",
      header: "Status",
      meta: { width: "150px" } satisfies ColumnMeta,
      cell: ({ getValue }) => <Badge variant="outline">{String(getValue())}</Badge>,
    },
    {
      id: "start",
      accessorKey: "startMonth",
      header: "Start month",
      meta: { width: "140px" } satisfies ColumnMeta,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-xs">{BS_MONTHS[row.original.startMonth - 1]}</p>
          <p className="text-ink-3 text-xs">
            {row.original.billedMonths.length} <TranslatedText>{row.original.billedMonths.length === 1 ? "month" : "months"}</TranslatedText><TranslatedText> billed
          </TranslatedText></p>
        </div>
      ),
    },
  ], [activeEnrollmentIds]);

  return (
    <section className="min-w-0" aria-label="Transportation service">
      <SetupHeader
        eyebrow={`SERVICES · ${yearLabel}`}
        icon={Bus}
      title="Transportation service"
        description="Register students who use school transport, each with their own pickup location and monthly price."
        stats={[
          {
            icon: Users,
            value: `${activeCount} registered ${activeCount === 1 ? "student" : "students"}`,
            note: "Only registered students are billed",
          },
          { icon: MapPin, value: `${stops} pickup ${stops === 1 ? "location" : "locations"}`, note: "Across every registration" },
          { icon: CalendarDays, value: currentMonthName, note: "Current billing month" },
        ]}
        actions={
          <Button variant="outline" onClick={() => edit("")} disabled={pending || data.enrollments.length === 0}>
            <Plus data-icon="inline-start" aria-hidden="true" /><TranslatedText>Register a student
          </TranslatedText></Button>
        }
      />
      <div className="grid items-start gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ServiceRoster<Registration>
          id="service-roster"
          rows={data.registrations}
          columns={columns}
          getRowId={registration => String(registration.id)}
          sectionOf={registration => registration.section}
          searchOf={registration => `${registration.name} ${registration.admissionNo} ${registration.section} ${registration.pickupLocation}`}
          noun="registration"
          disabled={pending}
          initialSort={[{ id: "student", desc: false }]}
          selection={{
            ids: ticked,
            onChange: setTicked,
            // A pupil who has left cannot be resumed onto a bus, so their row
            // cannot be ticked either.
            isSelectable: registration => activeEnrollmentIds.has(registration.enrollmentId),
            label: registration => `Select ${registration.name}`,
          }}
          bulkActions={
            <>
              <BulkTransportToggle academicYearId={academicYearId} enrollmentIds={tickedEnrollmentIds} isActive={false} label="Pause" disabled={pending} onDone={() => setTicked([])} />
              <BulkTransportToggle academicYearId={academicYearId} enrollmentIds={tickedEnrollmentIds} isActive label="Resume" disabled={pending} onDone={() => setTicked([])} />
            </>
          }
          rowActions={registration => {
            // A pupil who has left the school can be neither edited nor
            // resumed: the actions would offer something the billing run
            // would silently ignore.
            const studentActive = activeEnrollmentIds.has(registration.enrollmentId);
            return (
              <>
                <TransportToggle academicYearId={academicYearId} registration={registration} disabled={pending || !studentActive} />
                <Button variant="outline" size="sm" onClick={() => edit(String(registration.enrollmentId))} disabled={pending || !studentActive}>
                  <Pencil data-icon="inline-start" aria-hidden="true" /><TranslatedText>Edit</TranslatedText><span className="sr-only"><TranslatedText> transport for </TranslatedText>{registration.name}</span>
                </Button>
              </>
            );
          }}
          empty={{
            icon: Bus,
            tint: "rose",
            title: "No transport registrations yet",
            description: data.enrollments.length
              ? "Register a student above before issuing monthly transport bills."
              : "Add active students to this academic year before registering them for transport.",
          }}
        />
        <TransportBilling academicYearId={academicYearId} data={data} onBusy={setBillingBusy} />
      </div>

      <Sheet open={open} onOpenChange={(nextOpen, details) => { if (pending) { details.cancel(); return; } setOpen(nextOpen); }}>
        <SheetContent showCloseButton={!pending} className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          <SheetHeader className="px-6 pt-6"><SheetTitle><TranslatedText>{selected ? "Edit transport registration" : "Register for transport"}</TranslatedText></SheetTitle><SheetDescription><TranslatedText>{selectedStudent ? "Set this student's pickup location and monthly transport price." : "Find and select a student to register for transport."}</TranslatedText></SheetDescription></SheetHeader>
          <div className="space-y-5 px-6 pb-6">
            {selectedStudent ? (
              <>
                <div className="bg-brand-tint border-brand-tint-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                  <div className="min-w-0"><p className="break-words text-sm font-semibold">{selectedStudent.name}</p><p className="text-ink-3 mt-1 break-words text-xs">{selectedStudent.admissionNo} · {selectedStudent.section}</p></div>
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEnrollmentId("")}><TranslatedText>Change student</TranslatedText></Button>
                </div>
                <RegistrationFields key={`${academicYearId}-${enrollmentId}`} academicYearId={academicYearId} enrollmentId={enrollmentId} registration={selected} initialMonth={data.months.filter(month => month.started).at(-1)?.month ?? 1} state={state} action={action} pending={pending} />
              </>
            ) : <StudentPicker students={data.enrollments} selectedIds={[]} onSelectionChange={ids => { if (!pending) setEnrollmentId(ids[0] === undefined ? "" : String(ids[0])); }} disabled={pending} />}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
