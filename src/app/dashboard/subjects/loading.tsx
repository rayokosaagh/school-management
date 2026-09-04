import { Skeleton } from "@/components/ui/skeleton";

// Mirrors SubjectsWorkspace's default "Subjects" view: a search toolbar over
// SubjectsView's RecordTable card list — a rounded row per subject, not a
// bordered grid table (see subjects-workspace.tsx / subjects-view.tsx /
// record-table.tsx).
export default function SubjectsLoading() {
  return (
    <div className="flex h-full flex-col" role="status" aria-busy="true" aria-label="Loading subjects">
      <div className="flex items-end justify-between pb-3">
        <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-7 w-32" /></div>
        <div className="flex gap-2"><Skeleton className="h-8 w-36" /><Skeleton className="h-8 w-20" /></div>
      </div>
      <div className="flex items-center gap-2 py-3">
        <Skeleton className="h-8 w-56" />
        <span className="flex-1" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="border-line bg-surface flex-1 space-y-2 overflow-hidden rounded-[10px] border p-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="bg-rail flex items-center gap-3 rounded-xl px-4 py-2.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="hidden h-3 w-40 md:block" />
            <span className="flex-1" />
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
