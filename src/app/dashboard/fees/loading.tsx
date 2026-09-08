import { TranslatedText } from "@/components/i18n/language-provider";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the default "Balances" view in FeesWorkspace: breadcrumb, the
// header with its stat chips and view switch, the class tabs, the fee-type
// segmented strip, a search toolbar and the balances table inside
// `PageFrame.Body` (see fees-workspace.tsx, page-frame.tsx, register-tabs.tsx).
//
// Without this file the nearest boundary was `dashboard/loading.tsx`, so
// every navigation to Fees flashed the Overview skeleton — a hero banner and
// four Kpi cards that this page never renders.
//
// The sizes below are the measured ones from the running page at 1440px, so
// the swap to real content lands each block where the placeholder stood.
// Class and fee-type names differ per school, so those strips cycle plausible
// widths rather than pinning one school's; the tab strip overflows its
// scrollport exactly as `RegisterTabs` does.
const TAB_WIDTHS = ["w-[177px]", "w-[177px]", "w-[228px]", "w-[228px]", "w-[136px]", "w-[136px]", "w-[139px]", "w-[139px]", "w-[139px]"];
const FEE_TYPE_WIDTHS = ["w-[101px]", "w-[116px]", "w-[112px]", "w-[81px]", "w-[120px]", "w-[126px]"];
const CHIP_WIDTHS = ["w-[170px]", "w-[136px]", "w-[190px]", "w-[208px]"];

// Student, Class, Charged, Paid, Still owed — the balances table's columns.
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_140px_249px_120px_140px] items-center gap-4 px-3";

export default function FeesLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col" role="status" aria-busy="true" aria-label="Loading fees">
      <span className="sr-only"><TranslatedText>Loading fees…</TranslatedText></span>

      <div className="pb-2">
        <div className="flex h-[18px] items-center"><Skeleton className="h-3.5 w-24" /></div>
      </div>

      {/* The actions block is content-sized, so past ~1330px it wraps onto its
          own row at the left edge — where the real chips sit. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <div className="flex h-[29px] items-center gap-2.5"><Skeleton className="h-[22px] w-[72px]" /><Skeleton className="h-3.5 w-10" /></div>
            <div className="mt-1 flex h-6 items-center"><Skeleton className="h-4 w-[340px] max-w-full" /></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* `FeeStatChips` is `hidden lg:flex`; below that the same figures
              ride in the header's meta line, which is text, not a block. */}
          <div className="hidden items-center gap-2 lg:flex">
            {CHIP_WIDTHS.map(w => <Skeleton key={w} className={`h-[47px] rounded-xl ${w}`} />)}
          </div>
          <Skeleton className="h-8 w-[175px] rounded-lg" />
          <Skeleton className="h-8 w-[134px] rounded-lg" />
        </div>
      </div>

      {/* RegisterTabs: a scrollport of tabs sitting on one shared bottom rule,
          the selected one 4px taller than the rest. */}
      <div className="-mx-4 px-4 pt-1 shell:-mx-6 shell:px-6">
        <div className="border-line border-b">
          <div className="overflow-hidden">
            <div className="flex min-w-max items-end gap-0.5">
              <Skeleton className="h-[38px] w-[161px] rounded-t-lg rounded-b-none" />
              {TAB_WIDTHS.map((w, i) => <Skeleton key={i} className={`h-[34px] rounded-t-lg rounded-b-none ${w}`} />)}
            </div>
          </div>
        </div>
      </div>

      {/* One bordered segmented control, not six loose pills. */}
      {/* `flex`, not a bare block: an inline-flex strip sits on a text
          baseline, which adds 4px the real strip does not have. */}
      <div className="mt-3 flex">
        <div className="bg-surface-2 border-line inline-flex h-8 items-center gap-0.5 rounded-lg border p-0.5">
          {FEE_TYPE_WIDTHS.map(w => <Skeleton key={w} className={`h-7 rounded-[6px] ${w}`} />)}
        </div>
      </div>

      <div className="flex items-center gap-2 py-3">
        <Skeleton className="h-8 w-[240px] rounded-lg" />
        <Skeleton className="h-8 w-[176px] rounded-lg" />
        <span className="flex-1" />
        <Skeleton className="h-3.5 w-24" />
      </div>

      {/* PageFrame.Body: a surface panel the table sits flush inside, with a
          sticky header strip and hairline-separated 38px rows. */}
      <div className="bg-surface border-line flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border">
        <div className={`border-line bg-surface-2 h-9 shrink-0 border-b ${COLUMNS}`}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16 justify-self-end" />
          <Skeleton className="h-3 w-10 justify-self-end" />
          <Skeleton className="h-3 w-16 justify-self-end" />
        </div>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className={`border-line h-[38px] shrink-0 border-b last:border-b-0 ${COLUMNS}`}>
            <div className="flex flex-col gap-1"><Skeleton className="h-3 w-40 max-w-full" /><Skeleton className="h-2.5 w-8" /></div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24 justify-self-end" />
            <Skeleton className="h-3 w-12 justify-self-end" />
            <Skeleton className="h-3 w-20 justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}
