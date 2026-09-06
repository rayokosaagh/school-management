import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { Callout } from "@/components/ui/page-shell";
import { requirePage } from "@/lib/auth/guard";
import { BS_MONTHS, formatBs } from "@/lib/date/bs";
import { invoiceDocument, receiptDocument, statementDocument } from "@/lib/fees/documents";
import { money } from "@/lib/fees/money";
import { getLetterhead } from "@/lib/registry/school";
import { PrintButton } from "./_components/print-button";

/// The two things a parent goes home with: the bill, and the proof they paid.
///
/// One route for both, because they share a letterhead, a paper size and the
/// screen chrome around them — and because a clerk printing a receipt has just
/// come from printing the bill.
export default async function FeePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; receipt?: string }>;
}) {
  await requirePage("/dashboard/fees");

  const { invoice: invoiceNo, receipt: receiptParam } = await searchParams;
  if (!invoiceNo && !receiptParam) notFound();

  // `?receipt=A,B,C` is several receipts on one statement; a single number
  // stays the individual receipt it always was.
  const receiptNos = (receiptParam ?? "")
    .split(",")
    .map((no) => no.trim())
    .filter(Boolean);

  const [school, invoice, receipt, statement] = await Promise.all([
    getLetterhead(),
    invoiceNo ? invoiceDocument(invoiceNo).catch(() => null) : null,
    receiptNos.length === 1 ? receiptDocument(receiptNos[0]).catch(() => null) : null,
    receiptNos.length > 1 ? statementDocument(receiptNos).catch(() => null) : null,
  ]);
  if (!invoice && !receipt && !statement) notFound();

  const head = (
    <header className="sheet-head">
      <h1>{school.name}</h1>
      {school.nameNp ? <p className="np">{school.nameNp}</p> : null}
      <p className="meta">{[school.address, school.phone, school.email].filter(Boolean).join(" · ")}</p>
      <h2>{invoice ? "Fee invoice" : statement ? "Payment statement" : "Payment receipt"}</h2>
    </header>
  );

  return (
    <div className="print-root mx-auto max-w-3xl space-y-6">
      {/* Controls belong on screen only; the printed page starts at the sheet. */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/fees"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          Back to fees
        </Link>
        <PrintButton
          label={
            invoice
              ? "One invoice"
              : statement
                ? `${statement.rows.length} receipts on one sheet`
                : "One receipt"
          }
        />
      </div>

      {!school.configured ? (
        <Callout icon={Info} tint="amber">
          <span className="no-print">
            The school name and address are not set, so the letterhead below is a placeholder.
            Fill them in on the Settings page before printing for real.
          </span>
        </Callout>
      ) : null}

      {invoice ? (
        <article className="sheet">
          {head}

          {invoice.status === "CANCELLED" ? (
            <p className="my-4 border-2 border-current p-3 text-sm">
              <strong>CANCELLED — This invoice is retained for history only. No payment is due against it.</strong>
            </p>
          ) : null}

          <dl className="sheet-facts">
            <div>
              <dt>Invoice no.</dt>
              <dd>{invoice.number}</dd>
            </div>
            <div>
              <dt>Student</dt>
              <dd>{invoice.student.name}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>
                {invoice.student.section} · Roll {invoice.student.rollNo}
              </dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{formatBs(invoice.issuedOn, "YYYY-MM-DD")}</dd>
            </div>
            <div>
              <dt>Due by</dt>
              <dd>{invoice.dueOn ? formatBs(invoice.dueOn, "YYYY-MM-DD") : "—"}</dd>
            </div>
            <div>
              <dt>For</dt>
              <dd>
                {invoice.periodMonth > 0
                  ? `${BS_MONTHS[invoice.periodMonth - 1]} ${invoice.yearBS}`
                  : invoice.yearBS}
              </dd>
            </div>
          </dl>

          <table className="sheet-table">
            <thead>
              <tr>
                <th scope="col">Fee</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.description || line.feeType}</td>
                  <td>{money(line.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>{money(invoice.total)}</strong>
                </td>
              </tr>
              {invoice.paid > 0 && invoice.status !== "CANCELLED" ? (
                <>
                  <tr>
                    <td>Already paid</td>
                    <td>{money(invoice.paid)}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Still owed</strong>
                    </td>
                    <td>
                      <strong>{money(invoice.due)}</strong>
                    </td>
                  </tr>
                </>
              ) : null}
            </tbody>
          </table>

          {invoice.guardian ? (
            <p className="mt-4 text-sm">
              Guardian: {invoice.guardian.name} · {invoice.guardian.phone}
            </p>
          ) : null}

          <div className="sheet-signs">
            <span>Received by</span>
            <span>School stamp</span>
          </div>
        </article>
      ) : null}

      {statement ? (
        <article className="sheet">
          {head}

          <dl className="sheet-facts">
            <div>
              <dt>Student</dt>
              <dd>{statement.student.name}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{statement.student.section}</dd>
            </div>
            <div>
              <dt>Admission no.</dt>
              <dd>{statement.student.admissionNo}</dd>
            </div>
            <div>
              <dt>Year</dt>
              <dd>{statement.yearBS}</dd>
            </div>
            <div>
              <dt>Receipts</dt>
              <dd>{statement.rows.length}</dd>
            </div>
            <div>
              <dt>Printed</dt>
              <dd>{formatBs(new Date(), "YYYY-MM-DD")}</dd>
            </div>
          </dl>

          <table className="sheet-table">
            <thead>
              <tr>
                <th scope="col">Receipt</th>
                <th scope="col">Date</th>
                <th scope="col">Paid towards</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {statement.rows.map((row) => (
                <tr key={row.receiptNo}>
                  <td>{row.receiptNo}</td>
                  <td>{formatBs(row.paidOn, "YYYY-MM-DD")}</td>
                  <td>
                    {row.paidTowards}
                    {row.status !== "COMPLETED" ? " · reversed" : ""}
                  </td>
                  <td>{money(row.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <strong>Total received</strong>
                </td>
                <td>
                  <strong>{money(statement.total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          {/* A reversed payment stays listed so the history is not rewritten,
              but it must not be counted as money received. */}
          {statement.reversed > 0 ? (
            <p className="mt-4 text-sm">
              <strong>
                {statement.reversed} payment{statement.reversed === 1 ? " was" : "s were"} reversed
                and {statement.reversed === 1 ? "is" : "are"} not included in the total.
              </strong>
            </p>
          ) : null}

          <div className="sheet-signs">
            <span>Received by</span>
            <span>School stamp</span>
          </div>
        </article>
      ) : null}

      {receipt ? (
        <article className="sheet">
          {head}

          <dl className="sheet-facts">
            <div>
              <dt>Receipt no.</dt>
              <dd>{receipt.receiptNo}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatBs(receipt.paidOn, "YYYY-MM-DD")}</dd>
            </div>
            <div>
              <dt>Student</dt>
              <dd>{receipt.student.name}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{receipt.student.section}</dd>
            </div>
            <div>
              <dt>Against invoice</dt>
              <dd>{receipt.invoiceNumber}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>
                {receipt.method === "CASH" ? "Cash" : "Bank transfer"}
                {receipt.reference ? ` · ${receipt.reference}` : ""}
              </dd>
            </div>
          </dl>

          <table className="sheet-table">
            <thead>
              <tr>
                <th scope="col">Paid towards</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipt.settled.map((line, index) => (
                <tr key={index}>
                  <td>
                    {line.description || line.feeType}
                    {line.periodMonth > 0 ? ` · ${BS_MONTHS[line.periodMonth - 1]}` : ""}
                  </td>
                  <td>{money(line.amount)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Received</strong>
                </td>
                <td>
                  <strong>{money(receipt.amount)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          {/* A reversed payment must never read as valid proof of payment. */}
          {receipt.status !== "COMPLETED" ? (
            <p className="mt-4 text-sm">
              <strong>This payment was reversed and is not valid proof of payment.</strong>
            </p>
          ) : null}

          <p className="mt-4 text-sm">
            {receipt.paidBy.name
              ? `Paid by ${receipt.paidBy.name}${receipt.paidBy.phone ? ` · ${receipt.paidBy.phone}` : ""}`
              : "Payer not recorded."}
          </p>

          <div className="sheet-signs">
            <span>{receipt.receivedBy ? `Received by ${receipt.receivedBy}` : "Received by"}</span>
            <span>School stamp</span>
          </div>
        </article>
      ) : null}
    </div>
  );
}
