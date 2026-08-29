import { useCallback, useSyncExternalStore } from "react";

/// Matches a CSS media query in JavaScript so a component can render *either*
/// branch rather than rendering both and hiding one with a class — which would
/// duplicate the children in the DOM.
///
/// The server snapshot is `true` on purpose: the wide, inline branch is the one
/// that belongs in the HTML, and an overlay (Sheet, Dialog) must not mount
/// during SSR.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  );
}
