"use client";

import { ViewTransition, type ReactNode } from "react";

// Page transitions. Every page wraps its content in <Screen>.
//   nav-forward  deeper into a flow (Home -> Bills, open a contract): new screen slides in from the right
//   nav-back     back links: the screen slides back out to the right
//   anything else (tab bar, plain links): a quick fade and lift, because tabs are siblings, not depth
// Links pass these with transitionTypes={["nav-forward"]} or {["nav-back"]}.

const enter = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "screen-in" };
const exit = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "screen-out" };

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ViewTransition default="none" enter={enter} exit={exit}>
      {children}
    </ViewTransition>
  );
}

/**
 * Goes INSIDE a page's <Suspense>, around the part that waits for data. These pages render per request, so a navigation first
 * shows the page's empty fallback: the old page fades out and the new one would fade in empty, then the content would pop in with
 * no motion. This fades and lifts the content in when it arrives. When the content is ready at once (it was cached), the page's
 * <Screen> animates it as one unit and this stays still, so nothing animates twice.
 */
export function Reveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition default="none" enter="screen-in" exit="none">
      {children}
    </ViewTransition>
  );
}

/** Swaps between views inside one page (bill list and a contract) with the same motion as a route change. */
export function SubScreen({ id, children }: { id: string; children: ReactNode }) {
  return (
    <ViewTransition key={id} default="none" enter={enter} exit={exit}>
      {children}
    </ViewTransition>
  );
}
