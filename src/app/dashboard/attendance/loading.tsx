import { Skeleton } from "@/components/ui/skeleton";

// Mirrors RollCallWorkspace + AttendanceSheet: section tabs, a date-nav
// toolbar, then a roll of checkbox + roll-no + name + four status pills per
// student (see rollcall-workspace.tsx and attendance-sheet.tsx).
export default function AttendanceLoading() {
  return (
    <div className="flex h-full flex-col" role="status" aria-busy="true" aria-label="Loading roll call">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-12" /><Skeleton className="h-7 w-32" /></div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="border-line flex gap-1 border-b pb-0">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[34px] w-24 rounded-t-lg rounded-b-none" />)}</div>
      <div className="flex items-center gap-1 py-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
        <span className="flex-1" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="border-line flex-1 space-y-1 overflow-hidden rounded-[10px] border p-2">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3.5 flex-1 max-w-48" />
            <div className="flex gap-1">
              {Array.from({ length: 4 }, (_, j) => <Skeleton key={j} className="size-7 rounded-md" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
