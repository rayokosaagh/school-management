"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ReceiptText } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type ColumnMeta } from "@/components/ui/data-table";
import type { feeWorkspace } from "@/lib/fees/fees";
import { Amount, Owed } from "./money-cells";

type FeesData = Awaited<ReturnType<typeof feeWorkspace>>;
export type BalanceRow = FeesData["balances"][number];

/// What one row owes, narrowed to the fee type in view.
///
/// With no type picked this is the pupil's whole year. With one picked it is
/// that type alone, so the Charged column answers the question the strip
/// asked: "Admission" must not keep reporting Rs. 16,500 of admission and
/// monthly fees together.
export function scopeToFeeType(row: BalanceRow, feeType: string | null) {
  if (feeType === null) {
    return { billed: row.billed, paid: row.paid, due: row.due, label: row.feeTypes.join(" + "), hasBill: row.hasBill };
  }
  const found = row.byType.find((entry) => entry.name === feeType);
  return {
    billed: found?.billed ?? 0,
    paid: found?.paid ?? 0,
    due: found?.due ?? 0,
    label: feeType,
    // Not billed for *this* fee, whatever else they have been charged.
    hasBill: found !== undefined,
  };
}

export function BalancesTab({
  id,
  rows,
  anyBalances,
  selectedId,
  feeType,
  onSelect,
}: {
  id: string;
  rows: BalanceRow[];
  /// Which pupil's pane is open, so the row reads as selected.
  selectedId?: number | null;
  /// Whether the school has anyone on the roll at all, as opposed to this
  /// tab and search finding nobody. The two need different empty states.
  anyBalances: boolean;
  /// The fee type the strip has selected, or null for all of them.
  feeType: string | null;
  onSelect: (row: BalanceRow) => void;
}) {
  const columns = useMemo<ColumnDef<BalanceRow, unknown>[]>(
    () => [
      {
        id: "student",
        accessorKey: "name",
        header: "Student",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="text-ink-3 truncate text-xs">{row.original.admissionNo}</p>
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
      // The money columns sort on the same figures they show, so ordering by
      // "Still owed" under a fee type orders by what is owed on that fee.
      {
        id: "billed",
        accessorFn: (row) => scopeToFeeType(row, feeType).billed,
        header: "Charged",
        meta: { numeric: true, width: "120px" } satisfies ColumnMeta,
        cell: ({ row }) => {
          const scoped = scopeToFeeType(row.original, feeType);
          return scoped.hasBill ? (
            <div className="min-w-0">
              <Amount value={scoped.billed} />
              {/* What the money was for, beside the figure rather than in a
                  column of its own: the amount is meaningless without it. */}
              <p className="text-ink-3 truncate text-xs">{scoped.label}</p>
            </div>
          ) : (
            <Badge variant="outline">Not billed</Badge>
          );
        },
      },
      {
        id: "paid",
        accessorFn: (row) => scopeToFeeType(row, feeType).paid,
        header: "Paid",
        meta: { numeric: true, width: "120px" } satisfies ColumnMeta,
        cell: ({ row }) => {
          const scoped = scopeToFeeType(row.original, feeType);
          return scoped.hasBill ? (
            <Amount value={scoped.paid} />
          ) : (
            <span className="text-ink-3 tabular-nums">—</span>
          );
        },
      },
      {
        id: "due",
        accessorFn: (row) => scopeToFeeType(row, feeType).due,
        header: "Still owed",
        meta: { numeric: true, width: "140px" } satisfies ColumnMeta,
        cell: ({ row }) => <Owed value={scopeToFeeType(row.original, feeType).due} />,
      },
    ],
    [feeType],
  );

  return (
    <DataTable<BalanceRow>
      key="balances"
      id={id}
      columns={columns}
      rows={rows}
      getRowId={(row) => String(row.enrollmentId)}
      selectedId={selectedId == null ? null : String(selectedId)}
      onSelect={onSelect}
      // Debt first: the point of this list is who has not paid.
      initialSort={[{ id: "due", desc: true }]}
      empty={{
        icon: ReceiptText,
        tint: "rose",
        title: anyBalances ? "No students match" : "Nobody is enrolled this year",
        description: anyBalances
          ? "Try another name, admission number or class."
          : "Admit students for this year before charging any fees.",
      }}
    />
  );
}
