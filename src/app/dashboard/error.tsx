"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/// The boundary for every page under `/dashboard`.
///
/// It renders *inside* `dashboard/layout.tsx`, so the rail and the top bar
/// survive a failed page: somebody halfway through entering fees keeps their
/// navigation instead of being dropped onto Next's built-in error document.
/// `reset()` re-renders the segment, which is enough for the common case of
/// one query that failed once.
///
/// It cannot catch a throw from `dashboard/layout.tsx` itself — an error
/// boundary does not wrap the layout in its own segment — and that layout
/// reads the database on every navigation. `app/global-error.tsx` is the net
/// under that one.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The digest is all that reaches the browser in production; the message
  // itself stays on the server, so log it where a developer can still see it.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-surface border-line flex min-h-0 flex-1 items-center justify-center rounded-[10px] border">
        <div>
          <EmptyState
            icon={TriangleAlert}
            tint="rose"
            title="This page didn’t load"
            description="Something went wrong while fetching it. Nothing you saved has been lost — try again, or carry on somewhere else and come back to it."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={reset}>
                  <RotateCw data-icon="inline-start" aria-hidden="true" />
                  Try again
                </Button>
                <Button variant="outline" render={<Link href="/dashboard" />} nativeButton={false}>
                  Back to overview
                </Button>
              </div>
            }
          />
          {/* Quote this to whoever looks at the logs — in production it is the
              only part of the failure that reaches the screen. */}
          {error.digest ? (
            <p className="text-ink-3 mt-1 text-center font-mono text-xs">Reference {error.digest}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
