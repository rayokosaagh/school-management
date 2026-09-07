"use client";

import { useEffect } from "react";

/// The last net, for a failure that takes the root layout with it.
///
/// `dashboard/error.tsx` handles a page that throws, but an error boundary
/// does not wrap the layout in its own segment — and `dashboard/layout.tsx`
/// reads the database on every navigation (the guard, the grants, the year
/// list, the letterhead, the overview). If Postgres is unreachable, that
/// layout throws and this file is what renders.
///
/// It replaces the root layout, so it owns its own `<html>` and `<body>`, and
/// the app's global stylesheet never reaches it — hence the inline styles and
/// the one `<style>` block for the dark scheme. Keep it dependency-free: this
/// is the screen that has to work when nothing else does.
const PALETTE = `
  :root { color-scheme: light dark; --g-page: #f6f4f0; --g-surface: #fdfcfb; --g-line: #e2ded7; --g-ink: #22262c; --g-ink-3: #7b7f87; --g-brand: #1f6072; --g-brand-ink: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --g-page: #14171b; --g-surface: #1e2227; --g-line: #363b42; --g-ink: #f0f1f3; --g-ink-3: #9aa0a8; --g-brand: #64b6cd; --g-brand-ink: #10242b; }
  }
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "var(--g-page)",
          color: "var(--g-ink)",
          font: "16px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        {/* No metadata export is allowed in a client error boundary, so the
            tab title is set the React way. */}
        <title>Something went wrong</title>
        <style>{PALETTE}</style>
        <main
          style={{
            width: "100%",
            maxWidth: "460px",
            background: "var(--g-surface)",
            border: "1px solid var(--g-line)",
            borderRadius: "16px",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "grid",
              placeItems: "center",
              width: "44px",
              height: "44px",
              margin: "0 auto",
              borderRadius: "12px",
              background: "var(--g-brand)",
              color: "var(--g-brand-ink)",
              fontSize: "22px",
              fontWeight: 700,
            }}
          >
            !
          </span>
          <h1 style={{ margin: "20px 0 0", fontSize: "20px", fontWeight: 600 }}>The school workspace didn’t load</h1>
          <p style={{ margin: "12px 0 0", fontSize: "14px", lineHeight: 1.6, color: "var(--g-ink-3)" }}>
            This usually means the school database could not be reached. Nothing you saved has been lost. Try again in a
            moment, and tell your administrator if it keeps happening.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              minHeight: "44px",
              padding: "0 20px",
              border: 0,
              borderRadius: "8px",
              background: "var(--g-brand)",
              color: "var(--g-brand-ink)",
              font: "inherit",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ margin: "20px 0 0", fontSize: "12px", fontFamily: "ui-monospace, monospace", color: "var(--g-ink-3)" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
