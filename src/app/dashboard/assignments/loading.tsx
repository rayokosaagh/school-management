import { Skeleton } from "@/components/ui/skeleton";

// Mirrors TeachingWorkspace: section tabs, a search + class-teacher toolbar,
// then the DataTable of subject rows (see teaching-workspace.tsx).
export default function AssignmentsLoading() {
  return (
    <div className="flex h-full flex-col" role="status" aria-busy="true" aria-label="Loading teaching assignments">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-7 w-40" /></div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="border-line flex gap-1 border-b pb-0">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[34px] w-24 rounded-t-lg rounded-b-none" />)}</div>
      <div className="flex items-center gap-2 py-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="border-line flex-1 space-y-px rounded-[10px] border p-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
    </div>
  );
}
