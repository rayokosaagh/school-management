import { Skeleton } from "@/components/ui/skeleton";

// Mirrors RolloverWorkspace's step 1 (YearStep): the 3-step toolbar, a
// target-year field, three "what to copy" checkboxes, a roll-order field and
// the plan callout (see rollover-workspace.tsx / year-step.tsx).
export default function RolloverLoading() {
  return (
    <div className="flex h-full flex-col" role="status" aria-busy="true" aria-label="Loading rollover">
      <div className="space-y-1.5 pb-3">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-7 w-32" />
      </div>
      <Skeleton className="h-8 w-64 rounded-lg" />
      <div className="max-w-2xl flex-1 space-y-6 py-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  );
}
