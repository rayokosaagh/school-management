import { Skeleton } from "@/components/ui/skeleton";

// Mirrors ExamsWorkspace's default "Marks" view: exam-term tabs, a
// section/subject toolbar, then MarksGrid's roll/name/theory/practical/total/
// grade/absent table (see exams-workspace.tsx / marks-grid.tsx).
export default function ExamsLoading() {
  return (
    <div className="flex h-full flex-col" role="status" aria-busy="true" aria-label="Loading exams">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-28" /></div>
        <div className="flex gap-2"><Skeleton className="h-8 w-44" /><Skeleton className="h-8 w-28" /></div>
      </div>
      <div className="border-line flex gap-1 border-b pb-0">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[34px] w-28 rounded-t-lg rounded-b-none" />)}</div>
      <div className="flex items-center gap-2 py-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-52" />
        <span className="flex-1" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="border-line flex-1 space-y-3 overflow-hidden rounded-[10px] border p-4">
        <Skeleton className="h-3 w-64" />
        <div className="space-y-2">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-3.5 flex-1 max-w-40" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="size-4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
