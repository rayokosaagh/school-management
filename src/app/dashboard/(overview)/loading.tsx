import { TranslatedText } from "@/components/i18n/language-provider";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-5" role="status" aria-busy="true" aria-label="Loading your overview">
      <span className="sr-only"><TranslatedText>Loading your overview…</TranslatedText></span>
      <div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-7 w-36" /></div>
      <div className="bg-brand-deep flex flex-wrap items-center justify-between gap-6 rounded-2xl p-6 sm:p-8">
        <div className="w-full max-w-xl space-y-4">
          <Skeleton className="h-3 w-40 bg-white/15" />
          <Skeleton className="h-9 w-full max-w-sm bg-white/15" />
          <Skeleton className="h-4 w-full bg-white/15" />
          <Skeleton className="h-10 w-40 bg-white/15" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl bg-white/10 lg:w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-surface border-line space-y-4 rounded-xl border p-5">
            <Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-36 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {[0, 1].map(i => (
          <div key={i} className="bg-surface border-line space-y-5 rounded-xl border p-5">
            <Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48 max-w-full" />
            {[0, 1, 2].map(row => <Skeleton key={row} className="h-16 w-full rounded-lg" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
