import { Skeleton } from "@/components/ui/skeleton";

export default function StudentsLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading students">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-14" /><Skeleton className="h-7 w-48" /></div>
        <div className="flex gap-2"><Skeleton className="h-8 w-28" /><Skeleton className="h-8 w-36" /></div>
      </div>
      <div className="border-line flex gap-1 border-b pb-0">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[34px] w-32 rounded-t-lg rounded-b-none" />)}</div>
      <div className="flex gap-2 py-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-8 w-32" /></div>
      <div className="border-line flex-1 space-y-px rounded-[10px] border p-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
    </div>
  );
}
