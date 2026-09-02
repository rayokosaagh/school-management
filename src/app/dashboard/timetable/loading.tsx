import { Skeleton } from "@/components/ui/skeleton";

export default function TimetableLoading() {
  return (
    <div className="flex h-full flex-col" role="status" aria-busy="true" aria-label="Loading timetable">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-7 w-44" /></div>
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="border-line flex gap-1 border-b pb-0">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[34px] w-24 rounded-t-lg rounded-b-none" />)}</div>
      <div className="flex gap-2 py-3"><Skeleton className="h-8 w-40" /></div>
      <div className="border-line flex-1 space-y-px rounded-[10px] border p-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
    </div>
  );
}
