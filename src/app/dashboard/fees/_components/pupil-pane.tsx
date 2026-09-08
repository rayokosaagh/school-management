"use client";

import { TranslatedText } from "@/components/i18n/language-provider";

import { Printer, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DetailPane } from "@/components/ui/detail-pane";
import { Input } from "@/components/ui/input";
import { initialsOf } from "@/components/ui/student-avatar";
import { useToastedActionState } from "@/components/ui/toast";
import { BS_MONTHS, BS_MONTHS_SHORT, formatBs } from "@/lib/date/bs";
import type { pupilFees } from "@/lib/fees/fees";
import { money } from "@/lib/fees/money";
import { saveFeeNote, type FeeActionState } from "../actions";

export type PupilFees = Awaited<ReturnType<typeof pupilFees>>;

const EMPTY: FeeActionState = {};

/// One vocabulary of colour for every fee state, used by the summary, the
/// per-type rows and the month strip alike. Tint tokens rather than raw green
/// and red, so the pane stays legible in dark mode.
const TONE = {
  paid: { chip: "bg-tint-green text-tint-green-fg", label: "Paid" },
  part: { chip: "bg-tint-amber text-tint-amber-fg", label: "Part paid" },
  unpaid: { chip: "bg-tint-rose text-tint-rose-fg", label: "Unpaid" },
  notBilled: { chip: "bg-surface-2 text-ink-3", label: "Not billed" },
} as const;

function Tone({ status, label }: { status: keyof typeof TONE; label?: string }) {
  const tone = TONE[status];
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone.chip}`}>
      {label ?? tone.label}
    </span>
  );
}

/// Twelve cells, one per Nepali month.
///
/// A month before the pupil joined is struck through rather than hidden: the
/// strip keeps its shape across a class, so two pupils' rows line up even when
/// one arrived in Bhadra.
function MonthStrip({ months }: { months: PupilFees["months"] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {months.map((cell) => {
        const label = BS_MONTHS[cell.month - 1];
        const short = BS_MONTHS_SHORT[cell.month - 1];
        const base =
          "grid h-7 min-w-9 place-items-center rounded-md px-1.5 text-xs font-medium tabular-nums";

        if (cell.state === "beforeJoining") {
          return (
            <span
              key={cell.month}
              title={`${label}: before joining`}
              className={`${base} text-ink-3 line-through opacity-50`}
            >
              {short}
            </span>
          );
        }
        if (cell.state === "future") {
          return (
            <span
              key={cell.month}
              title={`${label}: not started`}
              className={`${base} text-ink-3 border-line border border-dashed`}
            >
              {short}
            </span>
          );
        }
        return (
          <span
            key={cell.month}
            title={`${label}: ${TONE[cell.state].label}${cell.charged > 0 ? ` · ${money(cell.paid)} of ${money(cell.charged)}` : ""}`}
            className={`${base} ${TONE[cell.state].chip}`}
          >
            {short}
          </span>
        );
      })}
    </div>
  );
}

function NoteForm({ enrollmentId, note }: { enrollmentId: number; note: string | null }) {
  const [, action, pending] = useToastedActionState(saveFeeNote, EMPTY);
  const id = useId();

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <label htmlFor={`${id}-note`} className="sr-only"><TranslatedText>
        Office note
      </TranslatedText></label>
      <Input
        id={`${id}-note`}
        name="body"
        defaultValue={note ?? ""}
        maxLength={300}
        placeholder="Family asked to pay in two parts…"
      />
      <div className="flex justify-end">
        <Button type="submit" variant="outline" size="xs" disabled={pending}>
          <TranslatedText>{pending ? "Saving…" : note ? "Update note" : "Add note"}</TranslatedText>
        </Button>
      </div>
    </form>
  );
}

export function PupilPane({
  enrollmentId,
  fees,
  onCollect,
  onClose,
  canCollect,
  feeType,
}: {
  enrollmentId: number;
  fees: PupilFees;
  /// Opens the payment sheet. An invoice id takes it straight to that bill;
  /// `null` lets the sheet fall back to this pupil's oldest open one.
  onCollect: (invoiceId: number | null) => void;
  onClose?: () => void;
  canCollect: boolean;
  /// The fee type the list's strip has selected, or null for all of them.
  /// The pane opens from a filtered list, so it answers the same question the
  /// list was asked: pick Admission and these are the admission bills.
  feeType: string | null;
}) {
  const { student, summary, byFeeType, months, bills, payments, note } = fees;

  // Only the bills narrow. "Where they stand" and "What they were charged" are
  // already a per-type breakdown, and the month strip belongs to the monthly
  // fee — filtering that by Admission would empty it for nothing.
  const shownBills = feeType === null ? bills : bills.filter((bill) => bill.feeTypes.includes(feeType));
  const hiddenBills = bills.length - shownBills.length;

  // Which receipts go on a combined statement. Kept here rather than in the
  // URL: it is a scratch selection, not a place worth linking to.
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (receiptNo: string) =>
    setPicked((current) =>
      current.includes(receiptNo)
        ? current.filter((no) => no !== receiptNo)
        : [...current, receiptNo],
    );
  const toggleAll = () =>
    setPicked((current) =>
      current.length === payments.length ? [] : payments.map((p) => p.receiptNo),
    );

  return (
    // The house pane shell rather than a bare div: it owns the identity
    // header and the padding every section needs. Hand-rolling it left the
    // content flush against the divider.
    <DetailPane
      title={student.name}
      subtitle={
        <>
          {student.nameNp ? (
            <span className="font-devanagari text-ink-2">{student.nameNp} · </span>
          ) : null}
          {student.section} · <span className="font-mono">{student.admissionNo}</span>
        </>
      }
      initials={initialsOf(student.name)}
      actions={
        <>
          {canCollect ? (
            <Button size="sm" onClick={() => onCollect(null)}>
              <WalletCards data-icon="inline-start" aria-hidden="true" /><TranslatedText>
              Record payment
            </TranslatedText></Button>
          ) : null}
          {onClose ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              aria-label="Close fee details"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </>
      }
    >
      <DetailPane.Section label="Where they stand">
        <div className="flex items-center justify-between gap-3">
          <Tone status={summary.status} />
          <span className="text-lg font-semibold tabular-nums">
            {money(summary.owed > 0 ? summary.owed : 0)}
          </span>
        </div>
        <p className="text-ink-3 mt-1.5 text-xs">
          <TranslatedText>{summary.charged === 0
            ? "Nothing has been charged yet. Set amounts under Setup."
            : summary.owed > 0
              ? `${money(summary.paid)} paid of ${money(summary.charged)} charged.`
              : `All ${money(summary.charged)} collected.`}</TranslatedText>
        </p>
      </DetailPane.Section>

      {byFeeType.length > 0 ? (
        <DetailPane.Section label="What they were charged">
          <ul className="divide-line divide-y">
            {byFeeType.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-ink-3 text-xs tabular-nums">
                    {money(row.paid)}<TranslatedText> of </TranslatedText>{money(row.charged)}
                  </p>
                </div>
                <Tone status={row.status} />
              </li>
            ))}
          </ul>
        </DetailPane.Section>
      ) : null}

      {months.length > 0 ? (
        <DetailPane.Section label="Month by month">
          <MonthStrip months={months} />
        </DetailPane.Section>
      ) : null}

      {/* The only list of a pupil's bills there is: the page-wide Invoices tab
          was dropped because it repeated the balances list one row per
          invoice, and everything that tab alone could do — print a bill, see
          its due date, take money against that one bill — lives here now,
          behind the pupil it belongs to. */}
      {bills.length > 0 ? (
        <DetailPane.Section label={feeType === null ? "Bills" : `Bills · ${feeType}`}>
          {shownBills.length === 0 ? (
            <p className="text-ink-3 text-sm"><TranslatedText>Nothing billed for </TranslatedText>{feeType}<TranslatedText> yet.</TranslatedText></p>
          ) : (
          <ul className="divide-line divide-y">
            {shownBills.map((bill) => (
              <li key={bill.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  {/* The number is the thing a parent quotes back, so it is
                      also the handle for printing the bill. */}
                  <Link
                    href={`/dashboard/fees/print?invoice=${encodeURIComponent(bill.number)}`}
                    className="hover:text-brand font-mono text-[12.5px] underline-offset-2 hover:underline"
                  >
                    {bill.number}
                  </Link>
                  <p className="text-ink-3 mt-0.5 truncate text-xs">
                    {bill.periodMonth > 0
                      ? BS_MONTHS[bill.periodMonth - 1]
                      : bill.feeTypes.join(" + ") || "One-off charge"}
                    <TranslatedText>{bill.dueOn ? ` · due ${formatBs(bill.dueOn, "YYYY-MM-DD")}` : ""}</TranslatedText>
                  </p>
                  <p className="text-ink-3 text-xs tabular-nums">
                    {money(bill.paid)}<TranslatedText> of </TranslatedText>{money(bill.charged)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {/* Overdue is a state of its own, not a redder "unpaid": a
                      part-paid bill can be late too, and the date is what
                      makes it worth chasing today. */}
                  {bill.overdue ? (
                    <Tone status="unpaid" label="Overdue" />
                  ) : (
                    <Tone status={bill.status} />
                  )}
                  {bill.owed > 0 ? (
                    <Button size="xs" variant="outline" onClick={() => onCollect(bill.id)}><TranslatedText>
                      Collect
                    </TranslatedText></Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          )}
          {/* The strip that hid them is the way to get them back, so this
              says what happened rather than offering a second control that
              could disagree with it. */}
          {hiddenBills > 0 ? (
            <p className="text-ink-3 mt-3 text-xs leading-5">
              {hiddenBills}<TranslatedText> other </TranslatedText><TranslatedText>{hiddenBills === 1 ? "bill is" : "bills are"}</TranslatedText><TranslatedText> hidden by the</TranslatedText><TranslatedText>{" "}</TranslatedText>
              {feeType}<TranslatedText> filter. Choose </TranslatedText><span className="font-medium"><TranslatedText>All fees</TranslatedText></span><TranslatedText> above the list
              to see </TranslatedText><TranslatedText>{hiddenBills === 1 ? "it" : "them"}</TranslatedText>.
            </p>
          ) : null}
        </DetailPane.Section>
      ) : null}

      <DetailPane.Section label="Office note">
        <NoteForm enrollmentId={enrollmentId} note={note} />
      </DetailPane.Section>

      <DetailPane.Section label="Payments">
        {payments.length === 0 ? (
          <p className="text-ink-3 text-sm"><TranslatedText>Nothing received yet.</TranslatedText></p>
        ) : (
          <>
            <ul className="divide-line divide-y">
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                  {/* Ticking receipts builds one statement sheet. Only shown
                      when there is more than one to combine. */}
                  {payments.length > 1 ? (
                    <Checkbox
                      className="mt-1"
                      checked={picked.includes(payment.receiptNo)}
                      onCheckedChange={() => toggle(payment.receiptNo)}
                      aria-label={`Include receipt ${payment.receiptNo} in a statement`}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/dashboard/fees/print?receipt=${encodeURIComponent(payment.receiptNo)}`}
                        className="hover:text-brand font-mono text-[12.5px] underline-offset-2 hover:underline"
                      >
                        {payment.receiptNo}
                      </Link>
                      <span className="font-semibold tabular-nums">{money(payment.amount)}</span>
                    </div>
                    <p className="text-ink-3 text-xs">
                      {formatBs(payment.paidOn, "YYYY-MM-DD")} ·<TranslatedText>{" "}</TranslatedText>
                      <TranslatedText>{payment.method === "CASH" ? "Cash" : "Bank transfer"}</TranslatedText>
                      <TranslatedText>{payment.paidByName ? ` · from ${payment.paidByName}` : ""}</TranslatedText>
                      <TranslatedText>{payment.paidByPhone ? ` ${payment.paidByPhone}` : ""}</TranslatedText>
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {payments.length > 1 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="xs" onClick={toggleAll}>
                  <TranslatedText>{picked.length === payments.length ? "Clear all" : "Select all"}</TranslatedText>
                </Button>
                {/* A real <button> while there is nothing to combine. Rendered
                    as a disabled link it kept its href, and `aria-disabled`
                    does not stop a browser navigating — the control looked
                    dead but would have gone to an empty statement. */}
                {picked.length < 2 ? (
                  <Button size="xs" variant="outline" disabled>
                    <Printer data-icon="inline-start" aria-hidden="true" /><TranslatedText>
                    Pick 2 to combine
                  </TranslatedText></Button>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    nativeButton={false}
                    render={
                      <Link
                        href={`/dashboard/fees/print?receipt=${picked.map(encodeURIComponent).join(",")}`}
                      />
                    }
                  >
                    <Printer data-icon="inline-start" aria-hidden="true" /><TranslatedText>
                    Print </TranslatedText>{picked.length}<TranslatedText> as one sheet
                  </TranslatedText></Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </DetailPane.Section>
    </DetailPane>
  );
}
