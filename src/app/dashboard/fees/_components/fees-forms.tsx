"use client";

import { CalendarPlus, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { BsDateField } from "@/components/ui/bs-date-field";
import { BS_MONTHS, BS_MONTHS_SHORT } from "@/lib/date/bs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldSelect } from "@/components/ui/select";
import { useToastedActionState } from "@/components/ui/toast";
import { money } from "@/lib/fees/money";
import type { InvoiceRow } from "@/lib/fees/fees";
import {
  addFeeHead,
  addFeeStructure,
  issueInvoices,
  takePayment,
  type FeeActionState,
} from "../actions";

const EMPTY: FeeActionState = {};

export type HeadOption = { id: number; name: string; isActive: boolean };
export type GradeOption = { id: number; name: string };

/// Clears a form once the server confirms the write, by remounting it.
///
/// `token` is the id of the row just created, so it changes on every success —
/// the message text alone repeats ("Tuition added.") and would leave a second
/// add looking like the first. Remounting is also what resets state a field
/// owns itself, which no `form.reset()` would reach.
function resetKey(state: FeeActionState) {
  return state.success ? (state.token ?? -1) : "draft";
}

export function AddHeadForm() {
  const [state, action, pending] = useToastedActionState(addFeeHead, EMPTY);
  const id = useId();

  return (
    <form key={resetKey(state)} action={action} className="space-y-4">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${id}-name`}>New fee type</Label>
        <Input
          id={`${id}-name`}
          name="name"
          placeholder="Tuition, Library…"
          maxLength={60}
          required
        />
      </div>
      {/* How often it is charged belongs to the type, so it is chosen once
          here rather than restated for every class. */}
      <div className="space-y-2">
        <Label htmlFor={`${id}-scope`}>Who pays this fee?</Label>
        <FieldSelect id={`${id}-scope`} name="billingScope" aria-label="Who pays this fee" defaultValue="CLASS" options={[{ value: "CLASS", label: "Class-wide · all students in a class" }, { value: "STUDENT", label: "Per-student service · selected students only" }]} />
        <p className="text-ink-3 text-xs leading-5">Per-student types are priced and assigned in Services, not Class pricing.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-frequency`}>How often is it charged?</Label>
        <FieldSelect
          id={`${id}-frequency`}
          name="frequency"
          aria-label="How often"
          defaultValue="ONE_TIME"
          options={[
            { value: "ONE_TIME", label: "Once a year" },
            { value: "MONTHLY", label: "Every month" },
          ]}
          className="w-full"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        <Plus data-icon="inline-start" aria-hidden="true" />
        {pending ? "Adding…" : "Add fee type"}
      </Button>
    </form>
  );
}

/// One row of the structure builder. `key` is its identity, so removing the
/// middle row does not shuffle what the remaining inputs hold; `headId` is
/// React state rather than the select's own, because the list of heads can
/// change underneath an open form when one is added beside it.
type LineDraft = { key: number; headId: string };

export function AddStructureForm({
  academicYearId,
  grades,
  heads,
}: {
  academicYearId: number;
  grades: GradeOption[];
  heads: HeadOption[];
}) {
  const [state, action, pending] = useToastedActionState(addFeeStructure, EMPTY);

  const active = heads.filter((h) => h.isActive);
  // Nothing to build a structure out of: say which piece is missing rather than
  // offering a form whose selects are empty.
  const blocked = active.length === 0 ? "fee type" : grades.length === 0 ? "grade" : null;
  if (blocked) {
    return <p className="text-ink-3 text-sm">Add a {blocked} before building a fee plan.</p>;
  }

  // The draft lines live inside the remounted subtree, so a successful save
  // clears them along with the inputs — one mechanism, not two.
  return (
    <StructureFields
      key={resetKey(state)}
      action={action}
      pending={pending}
      academicYearId={academicYearId}
      grades={grades}
      active={active}
    />
  );
}

function StructureFields({
  action,
  pending,
  academicYearId,
  grades,
  active,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  academicYearId: number;
  grades: GradeOption[];
  active: HeadOption[];
}) {
  const [lines, setLines] = useState<LineDraft[]>([{ key: 0, headId: String(active[0].id) }]);
  const id = useId();

  const taken = new Set(lines.map((line) => line.headId));
  const unused = active.find((head) => !taken.has(String(head.id)));

  function setHead(key: number, headId: string) {
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, headId } : row)));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="academicYearId" value={academicYearId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>Plan name</Label>
          <Input
            id={`${id}-name`}
            name="name"
            placeholder="Term admission, Monthly fees…"
            maxLength={80}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-grade`}>Grade</Label>
          <FieldSelect
            id={`${id}-grade`}
            name="gradeId"
            required
            options={grades.map((g) => ({ value: String(g.id), label: g.name }))}
            defaultValue={String(grades[0].id)}
            placeholder="Choose a grade"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-ink-2 text-sm font-medium">Fee lines</p>
        {lines.map((line, index) => (
          <div key={line.key} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
            {/* React posts the value, so the picker cannot drift out of step
                with the hidden input the way an uncontrolled select would. */}
            <input type="hidden" name="feeHeadId" value={line.headId} />
            <FieldSelect
              value={line.headId}
              onValueChange={(next) => setHead(line.key, next ?? "")}
              aria-label={`Fee type for line ${index + 1}`}
              // A type already on another line is shown but not choosable: the
              // plan's unique index would reject it, and hiding it outright
              // would make the list jump about as rows are filled in.
              options={active.map((h) => ({
                value: String(h.id),
                label: h.name,
                disabled: h.id !== Number(line.headId) && taken.has(String(h.id)),
              }))}
              placeholder="Fee type"
            />
            <Input
              name="amount"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder="Rs."
              aria-label={`Amount for line ${index + 1}`}
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              // The last line is what makes the structure a structure.
              disabled={lines.length === 1}
              aria-label={`Remove line ${index + 1}`}
              onClick={() => setLines((rows) => rows.filter((r) => r.key !== line.key))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Every head is already on a line; another row could only duplicate one.
          disabled={unused === undefined}
          onClick={() =>
            setLines((rows) =>
              unused ? [...rows, { key: Date.now(), headId: String(unused.id) }] : rows,
            )
          }
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Add a line
        </Button>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create plan"}
      </Button>
    </form>
  );
}

export type PlanMonth = { month: number; issued: number; started: boolean };

/// One cell of the month strip.
///
/// A month that has not arrived is shown but inert — leaving it out would make
/// the strip a different width every month and hide how much of the year is
/// left. A month already billed states its count. Only a month that has
/// arrived and was missed is a button, so the strip reads as a to-do list.
function MonthCell({ month, issued, started, pending }: PlanMonth & { pending: boolean }) {
  const label = BS_MONTHS[month - 1];
  const short = BS_MONTHS_SHORT[month - 1];

  if (issued > 0) {
    return (
      <span
        title={`${label}: ${issued} billed`}
        className="bg-tint-green text-tint-green-fg flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium tabular-nums"
      >
        {short}
        <span className="text-[10px] font-normal">{issued} billed</span>
      </span>
    );
  }
  if (!started) {
    return (
      <span
        title={`${label}: not started`}
        className="text-ink-3 border-line flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-2 text-xs"
      >
        {short}
        <span className="text-[10px]">Upcoming</span>
      </span>
    );
  }
  return (
    <Button
      type="submit"
      name="month"
      value={String(month)}
      variant="outline"
      size="xs"
      disabled={pending}
      title={`Bill ${label}`}
      aria-label={`Bill ${label}`}
      className="text-tint-amber-fg border-tint-amber-fg/40 h-auto min-h-14 min-w-0 flex-col gap-1 rounded-lg px-2 py-2 text-xs"
    >
      {short}
      <span className="text-[10px] font-normal">{pending ? "Billing…" : "Bill month"}</span>
    </Button>
  );
}

export function IssueForm({
  structureId,
  issued,
  monthly = false,
  months = [],
}: {
  structureId: number;
  issued: number;
  monthly?: boolean;
  months?: PlanMonth[];
}) {
  // Deliberately not reset on success: a bursar billing several plans in a
  // row wants the same due date carried across them.
  const [, action, pending] = useToastedActionState(issueInvoices, EMPTY);
  const id = useId();
  const [dated, setDated] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="structureId" value={structureId} />
      {/* Most bills go out without a due date, and the field carries a
          two-line format hint. Open on every plan it dwarfed the button beside
          it, so it is revealed only when wanted. Unrendered means no `dueOn` is
          submitted, which is what a blank field did anyway. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{monthly ? "Monthly billing" : "Yearly billing"}</p>
          <p className="text-ink-3 mt-1 text-xs leading-5">{monthly ? "Select an available month to bill the class." : issued > 0 ? `${issued} pupils billed. Only remaining pupils will receive a bill.` : "Create one bill for each active pupil in this class."}</p>
        </div>
      {dated ? (
        <div className="w-full space-y-1 sm:w-52">
          <BsDateField id={`${id}-due`} name="dueOn" label="Due by" />
          <Button type="button" variant="ghost" size="xs" onClick={() => setDated(false)}>Remove due date</Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="xs" onClick={() => setDated(true)}>
          <CalendarPlus data-icon="inline-start" aria-hidden="true" />
          Add a due date
        </Button>
      )}
      </div>

      {monthly ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-12" role="group" aria-label="Bill a month">
          {months.map((m) => (
            <MonthCell key={m.month} {...m} pending={pending} />
          ))}
        </div>
      ) : (
        <Button
          type="submit"
          name="month"
          value="0"
          size="sm"
          variant={issued > 0 ? "outline" : "default"}
          disabled={pending}
        >
          <Send data-icon="inline-start" aria-hidden="true" />
          {pending ? "Billing…" : issued > 0 ? "Bill remaining" : "Bill the class"}
        </Button>
      )}
    </form>
  );
}

/// The collection counter. Picking the invoice fills the amount with what is
/// still owed, because paying the balance in full is the common case and
/// retyping it is where a digit goes missing.
export function CollectPaymentForm({
  openInvoices,
  guardians,
  initialInvoiceId,
  forPupil,
  onDone,
}: {
  openInvoices: InvoiceRow[];
  /// The guardians of every pupil who owes, keyed by enrolment. Offered as the
  /// payer so the commonest case is one click and no retyping of a phone
  /// number that is already on file.
  guardians: Record<number, { id: number; fullName: string; phone: string; relation: string }[]>;
  initialInvoiceId: number | null;
  /// Set when the sheet was opened from a pupil's pane. Offering the whole
  /// school's unpaid bills there invites taking money against the wrong
  /// child — the names repeat, and the list is sorted by debt, not by who is
  /// standing at the counter.
  forPupil: number | null;
  onDone: () => void;
}) {
  const requestKey = useRef<string | null>(null);
  const [state, action, pending] = useToastedActionState(async (previous, data) => {
    const key = requestKey.current ?? crypto.randomUUID();
    requestKey.current = key;
    data.set("requestKey", key);
    let result: FeeActionState;
    try {
      result = await takePayment(previous, data);
    } catch {
      return { error: "The payment response was interrupted. Retry with the same details to recover the receipt; check payment history before starting a new collection." };
    }
    // Keep the key through errors/lost responses. Clear only this successful
    // request here, never in an effect that could reset a newer submission.
    if (result.success && requestKey.current === key) requestKey.current = null;
    return result;
  }, EMPTY);
  const id = useId();

  const choices =
    forPupil === null
      ? openInvoices
      : openInvoices.filter((invoice) => invoice.enrollmentId === forPupil);

  const fallback = initialInvoiceId ?? choices[0]?.id ?? null;
  const [invoiceId, setInvoiceId] = useState(fallback === null ? "" : String(fallback));
  const chosen = choices.find((invoice) => String(invoice.id) === invoiceId) ?? null;

  // Who handed the money over. "" means nobody was named, which stays valid —
  // an office that does not track this must not be blocked by a required
  // field. "other" reveals the free-text pair.
  const payers = chosen ? (guardians[chosen.enrollmentId] ?? []) : [];
  const [payer, setPayer] = useState("");
  const namedGuardian = payers.find((g) => String(g.id) === payer) ?? null;

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.token]);

  if (choices.length === 0) {
    return (
      <p className="text-ink-3 text-sm">
        {forPupil === null
          ? "Every bill for this year is settled. Bill a class to collect more."
          : "This pupil owes nothing. Every bill of theirs is settled."}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={pending} className="space-y-4 min-w-0">
      {/* The picker is controlled, so React posts the value rather than relying
          on the select's own hidden input staying in step with it. */}
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <div className="space-y-2">
        <Label htmlFor={`${id}-invoice`}>Invoice</Label>
        <FieldSelect
          id={`${id}-invoice`}
          value={invoiceId}
          onValueChange={(next) => setInvoiceId(next ?? "")}
          placeholder="Choose an invoice"
          className="w-full"
          contentClassName="max-h-72"
          // What the bill is *for* leads, because a number identifies a bill
          // to the system and to nobody else. The pupil's name is dropped once
          // the list is already one pupil's.
          options={choices.map((invoice) => ({
            value: String(invoice.id),
            label: [
              invoice.feeTypes.length > 0 ? invoice.feeTypes.join(" + ") : invoice.number,
              // Twelve monthly bills carry the same fee type; the month is the
              // only thing that tells them apart.
              invoice.periodMonth > 0 ? BS_MONTHS[invoice.periodMonth - 1] : null,
              forPupil === null ? invoice.student : null,
              `${money(invoice.due)} due`,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
        {chosen ? (
          <p className="text-ink-3 text-xs">
            <span className="font-mono">{chosen.number}</span> · {chosen.section} ·{" "}
            {money(chosen.paid)} of {money(chosen.total)} paid
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-amount`}>Amount</Label>
          <Input
            id={`${id}-amount`}
            name="amount"
            type="number"
            min="1"
            step="1"
            max={chosen?.due}
            inputMode="numeric"
            // Remounted whenever the amount owed changes — a different invoice,
            // or the same one after a part payment lands. An uncontrolled input
            // ignores a `defaultValue` that changes under it, so the field would
            // otherwise keep offering a balance that has already been paid.
            key={`${invoiceId}:${chosen?.due ?? 0}`}
            defaultValue={chosen ? String(chosen.due) : ""}
            required
          />
          {chosen ? <p className="text-ink-3 text-xs">{money(chosen.due)} outstanding</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-method`}>Method</Label>
          <FieldSelect
            id={`${id}-method`}
            name="method"
            required
            defaultValue="CASH"
            options={[
              { value: "CASH", label: "Cash" },
              { value: "BANK_TRANSFER", label: "Bank transfer" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-reference`}>Reference (optional)</Label>
        <Input
          id={`${id}-reference`}
          name="reference"
          placeholder="Cheque or bank reference"
          maxLength={80}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-payer`}>Paid by (optional)</Label>
        <FieldSelect
          id={`${id}-payer`}
          value={payer}
          onValueChange={(next) => setPayer(next ?? "")}
          placeholder="Not recorded"
          className="w-full"
          options={[
            { value: "", label: "Not recorded" },
            ...payers.map((g) => ({
              value: String(g.id),
              label: `${g.fullName} · ${g.relation.toLowerCase()}`,
            })),
            { value: "other", label: "Someone else…" },
          ]}
        />
        {/* Snapshotted on the payment, so the receipt keeps saying what it said
            the day it was printed. */}
        {namedGuardian ? (
          <>
            <input type="hidden" name="paidByGuardianId" value={namedGuardian.id} />
            <input type="hidden" name="paidByName" value={namedGuardian.fullName} />
            <input type="hidden" name="paidByPhone" value={namedGuardian.phone} />
            <p className="text-ink-3 text-xs">{namedGuardian.phone}</p>
          </>
        ) : null}
        {payer === "other" ? (
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <Input name="paidByName" placeholder="Who paid" maxLength={80} aria-label="Who paid" />
            <Input name="paidByPhone" placeholder="Phone" maxLength={20} aria-label="Payer phone" />
          </div>
        ) : null}
      </div>

      <Button type="submit" disabled={pending || invoiceId === ""} className="w-full">
        {pending ? "Recording…" : "Record payment"}
      </Button>
      </fieldset>
    </form>
  );
}
