import Link from "next/link";
import { ArrowRight, BookOpen, House } from "lucide-react";

export default function NotFound() {
  return (
    <main className="bg-page flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <section aria-labelledby="not-found-title" className="bg-surface border-line w-full max-w-xl overflow-hidden rounded-2xl border shadow-panel">
        <div className="bg-brand-tint border-line relative overflow-hidden border-b px-6 py-10 text-center sm:py-12">
          <div aria-hidden="true" className="border-brand/10 absolute -right-12 -top-24 size-72 rounded-full border" />
          <div aria-hidden="true" className="border-brand/10 absolute -bottom-24 -left-12 size-56 rounded-full border" />
          <p className="text-brand-text relative font-display text-[96px] font-semibold leading-none tracking-tight sm:text-[120px]">404</p>
          <span className="bg-surface text-brand relative mx-auto mt-5 grid size-12 place-items-center rounded-xl shadow-panel">
            <BookOpen className="size-6" aria-hidden="true" />
          </span>
        </div>
        <div className="px-6 py-8 text-center sm:px-10 sm:py-10">
          <p className="text-brand-text text-[11px] font-semibold uppercase tracking-[0.16em]">A page out of place</p>
          <h1 id="not-found-title" className="mt-3">We couldn’t find this page.</h1>
          <p className="text-ink-3 mx-auto mt-3 max-w-sm text-sm leading-6">
            The link may be outdated, or the address may have been typed incorrectly. Let’s get you back to your school workspace.
          </p>
          <Link
            href="/"
            className="bg-brand text-brand-ink mt-6 inline-flex min-h-11 items-center justify-center gap-2.5 rounded-lg px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <House className="size-4" aria-hidden="true" />
            Back to home
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <p className="text-ink-3 mt-5 text-xs leading-5">If you followed a link from the school, let your administrator know.</p>
        </div>
      </section>
    </main>
  );
}
