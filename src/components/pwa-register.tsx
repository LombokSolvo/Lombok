"use client";

import { useEffect } from "react";

/** Registers the offline-page service worker (public/sw.js) on the live site and on `next start`; not in `next dev`, where it would only get in the way. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No service worker (private window, old browser): Solvo still works, it just has no offline page.
    });
  }, []);
  return null;
}
