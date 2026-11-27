"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to — the value only flips once, after hydration. */
const subscribe = () => () => {};

/**
 * `false` during SSR and the hydration render, `true` from the first render
 * after it.
 *
 * Full-page skeletons are gated on client-only state (the session token in
 * localStorage, the term picked in the browser, React Query results), so the
 * server always renders the skeleton. Without this gate the first client
 * render can already have the loaded desk — React then compares a loaded page
 * against the SSR'd skeleton and reports a hydration mismatch. Gate the
 * skeleton on `useHydrated()` so both sides start on the same branch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
