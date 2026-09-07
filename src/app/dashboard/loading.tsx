import { Skeleton } from "@/components/ui/skeleton";

// The fallback for the whole `dashboard` segment, and deliberately generic.
//
// Next reveals *this* boundary rather than a child's whenever a route that has
// already been visited is opened again — verified by walking the rail twice:
// first visits show `students/loading.tsx`, `classes/loading.tsx` and so on,
// every revisit shows this file. It therefore sits on top of Students,
// Classes, Fees and the rest, and must not draw any one page's furniture.
// The Overview hero and Kpi cards it used to hold now live in
// `(overview)/loading.tsx`, which wraps only the Overview page.
//
// What is left is the shape every register shares: a PageFrame header, a tab
// strip, a toolbar and the `PageFrame.Body` panel (see page-frame.tsx).
const TAB_WIDTHS = ["w-[152px]", "w-[152px]", "w-[188px]", "w-[188px]", "w-[124px]", "w-[124px]", "w-[136px]", "w-[136px]", "w-[136px]"];

export default function DashboardLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col" role="status" aria-busy="true" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div>
            <Skeleton className="h-3 w-16" />
            <div className="mt-1.5 flex h-[29px] items-center gap-2.5"><Skeleton className="h-[22px] w-[128px]" /><Skeleton className="h-3.5 w-24" /></div>
          </div>
        </div>
        <div className="flex items-center gap-2"><Skeleton className="h-8 w-[132px] rounded-lg" /><Skeleton className="h-8 w-[148px] rounded-lg" /></div>
      </div>

      <div className="-mx-4 px-4 pt-1 shell:-mx-6 shell:px-6">
        <div className="border-line border-b">
          <div className="overflow-hidden">
            <div className="flex min-w-max items-end gap-0.5">
              <Skeleton className="h-[38px] w-[148px] rounded-t-lg rounded-b-none" />
              {TAB_WIDTHS.map((w, i) => <Skeleton key={i} className={`h-[34px] rounded-t-lg rounded-b-none ${w}`} />)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 py-3">
        <Skeleton className="h-8 w-[240px] rounded-lg" />
        <Skeleton className="h-8 w-[176px] rounded-lg" />
        <span className="flex-1" />
        <Skeleton className="h-3.5 w-24" />
      </div>

      <div className="bg-surface border-line flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border">
        <div className="border-line bg-surface-2 flex h-9 shrink-0 items-center gap-4 border-b px-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <span className="flex-1" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className="border-line flex h-[38px] shrink-0 items-center gap-4 border-b px-3 last:border-b-0">
            <Skeleton className="h-3 w-44 max-w-full" />
            <Skeleton className="h-3 w-20" />
            <span className="flex-1" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
