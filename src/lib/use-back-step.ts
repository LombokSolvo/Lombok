"use client";

import { useEffect, useRef } from "react";

/**
 * Screens inside one page (an open contract on Bills, a conversation in the chat, onboarding's steps, editing the
 * saving plan) are React state, not URLs. Without this, the iPhone's swipe back (the browser's Back) skipped them and
 * left the page, which usually meant landing on Home. This hook gives each level its own history entry on the same
 * URL, so Back closes the inner screen first, exactly like the on-screen back button.
 *
 * depth: how many levels deep the page is now (0 = the page itself). onDepth: called when Back (or Forward) moves
 * the history to another level of this page; set the page's state to that level. The on-screen back button keeps
 * changing state as before: when depth drops, the extra history entries are stepped back over too.
 */
type Step = { path: string; depth: number };

function entryDepth(state: unknown, path: string): number {
  const s = (state as { solvoStep?: Step } | null)?.solvoStep;
  return s && s.path === path ? s.depth : 0;
}

export function useBackStep(depth: number, onDepth: (depth: number) => void) {
  const cb = useRef(onDepth);
  useEffect(() => {
    cb.current = onDepth;
  });
  const path = useRef<string | null>(null);

  // Back or Forward between this page's own entries.
  useEffect(() => {
    path.current = window.location.pathname;
    const onPop = (e: PopStateEvent) => {
      if (window.location.pathname !== path.current) return;
      cb.current(entryDepth(e.state, path.current));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Keep the history in step with the screen: one entry per level.
  useEffect(() => {
    const here = window.location.pathname;
    if (path.current !== here) return;
    const current = entryDepth(window.history.state, here);
    if (depth > current) {
      // Keep Next's own entry data (its __NA and tree) so its router restores this page normally on Back.
      for (let d = current + 1; d <= depth; d++) {
        window.history.pushState({ ...(window.history.state ?? {}), solvoStep: { path: here, depth: d } }, "");
      }
    } else if (depth < current) {
      // Closed by the on-screen back button or by finishing the flow: step back over the entries it no longer needs.
      // The popstate that follows reports this same depth, so nothing changes twice.
      window.history.go(depth - current);
    }
  }, [depth]);
}
