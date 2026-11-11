"use client";

import { useSyncExternalStore } from "react";

// `?debug=1` turns on developer-only UI (score bars on recommendation cards, the try-on debug
// panel). Read from window.location once via useSyncExternalStore (server snapshot false) instead
// of useSearchParams(), which would need a Suspense boundary on every page that uses it (e.g.
// /face-analysis has none).
function subscribe(): () => void {
  return () => {};
}

function getDebugSnapshot(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function getDebugServerSnapshot(): boolean {
  return false;
}

export function useDebugFlag(): boolean {
  return useSyncExternalStore(subscribe, getDebugSnapshot, getDebugServerSnapshot);
}
