import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the default "Structure" view in ClassesWorkspace: grade tabs, a
// search + grade-actions toolbar, then the DataTable of sections (see
// classes-workspace.tsx / classes-view.tsx).
export default function ClassesLoading() {
  return (
    <div className="flex h-full flex-col" role="status" aria-busy="true" aria-label="Loading classes">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-7 w-36" /></div>
        <div className="flex gap-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-8 w-20" /></div>
      </div>
      <div className="border-line flex gap-1 border-b pb-0">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[34px] w-20 rounded-t-lg rounded-b-none" />)}</div>
      <div className="flex items-center gap-2 py-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="border-line flex-1 space-y-px rounded-[10px] border p-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
    </div>
  );
}
