import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the overview's real shape (see page.tsx): a welcome card, a KPI
// strip, roll call + attendance trend side by side, then needs-attention +
// quick actions — not a spinner, so the first paint already reads as "this
// page has a welcome card and four numbers coming."
export default function DashboardLoading() {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto" role="status" aria-busy="true" aria-label="Loading overview">
      <div className="bg-surface border-line rounded-[14px] border px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-16 w-full rounded-xl sm:max-w-sm" />
        </div>
        <div className="border-line mt-5 grid grid-cols-3 gap-3 pt-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-3.5" />
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-surface border-line space-y-2 rounded-[10px] border p-4">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bg-surface border-line space-y-3 rounded-[10px] border p-4 lg:col-span-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-5 w-16 rounded-md" />)}
          </div>
        </div>
        <div className="bg-surface border-line space-y-3 rounded-[10px] border p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <div className="flex h-12 items-end gap-1">
            {Array.from({ length: 14 }, (_, i) => <Skeleton key={i} className="h-full flex-1 rounded-sm" />)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-surface border-line space-y-2 rounded-[10px] border p-4">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
        <div className="bg-surface border-line space-y-2 rounded-[10px] border p-4">
          <Skeleton className="h-4 w-28" />
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        </div>
      </div>
    </div>
  );
}
