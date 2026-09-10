"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/// Fades at the edges of a horizontal scroller, shown only while there is
/// more in that direction.
///
/// The toolbars and tables hide their scrollbars, so on a phone a row of
/// controls or a wide table simply stopped at the screen edge with nothing to
/// say it went on. This is the cue `RegisterTabs` already draws for its strip,
/// pulled out so the other scrollers can share it. It does not scroll anything
/// itself: give it the ref of the element that scrolls and render it as a
/// sibling inside a `relative` parent.
export function ScrollEdges({ scrollerRef }: { scrollerRef: RefObject<HTMLElement | null> }) {
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const box = scrollerRef.current;
    if (!box) return;
    const max = box.scrollWidth - box.clientWidth;
    setEdges({ left: box.scrollLeft > 1, right: box.scrollLeft < max - 1 });
  }, [scrollerRef]);

  // Re-measure on scroll and whenever the scroller or its content changes
  // size — a table that grows a column has to grow a fade with it.
  useEffect(() => {
    const box = scrollerRef.current;
    if (!box) return;
    measure();
    box.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    return () => {
      box.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, scrollerRef]);

  return (
    <>
      {edges.left ? (
        <span
          aria-hidden="true"
          className="from-page pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r to-transparent"
        />
      ) : null}
      {edges.right ? (
        <span
          aria-hidden="true"
          className="from-page pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l to-transparent"
        />
      ) : null}
    </>
  );
}
