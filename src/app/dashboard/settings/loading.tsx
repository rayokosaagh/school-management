import { Skeleton } from "@/components/ui/skeleton";

// Mirrors SettingsWorkspace: a rail of five group buttons (icon + label +
// description) beside the active group's cards (see settings-workspace.tsx).
export default function SettingsLoading() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 shell:flex-row shell:items-start shell:gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <div className="bg-surface border-line hidden shrink-0 space-y-1 rounded-[10px] border p-2 shadow-panel shell:block shell:w-72">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-surface border-line shell:hidden rounded-[10px] border p-2 shadow-panel">
        <Skeleton className="h-8 w-full" />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="bg-surface border-line space-y-3 rounded-[10px] border p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full max-w-md" />
            <div className="max-w-2xl space-y-3 pt-1">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
