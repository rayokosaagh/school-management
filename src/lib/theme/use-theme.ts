import { useSyncExternalStore } from "react";
import { THEME_EVENT, currentTheme, type Theme } from "./theme";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

/// The theme the document is actually wearing. The class is the store: the
/// no-flash script sets it before the first paint, `applyTheme` changes it and
/// announces the change, so a control never has to keep its own copy.
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}
