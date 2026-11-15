"use client";

import { useEffect, useRef, useState } from "react";
import "./intro-splash.css";

/**
 * The intro on first open: just the Solvo logo on the slab green, then the logo flies into its place in Home's header
 * while the green fades away. Shown once per browser session and only when the app is opened at Home ("/"), so a direct
 * link to /onboarding (the video) or any other page is never covered. The decision is made before the first paint by
 * INTRO_SCRIPT (src/lib/intro.ts, inlined in layout.tsx), which sets html[data-intro="off"] when it should not show.
 * It never blocks taps (pointer-events: none) and removes itself when done.
 */

// When the logo starts moving, counted from when the page started loading.
const HOLD_UNTIL_MS = 1150;
const EXIT_MS = 700;

export function IntroSplash() {
  const [done, setDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Not shown this time: the CSS already hides it (display: none).
    if (document.documentElement.dataset.intro === "off") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target: HTMLElement | null = null;
    let cancelled = false;

    const finish = () => {
      if (target) target.style.visibility = "";
      document.documentElement.dataset.intro = "off";
      if (!cancelled) setDone(true);
    };

    const exit = () => {
      const el = root.current;
      const img = logo.current;
      if (!el || !img) return finish();
      const bg = el.firstElementChild as HTMLElement;
      const ease = "cubic-bezier(0.65, 0, 0.35, 1)";

      // Home's own header logo, if it is on screen: the splash logo lands exactly on it.
      const header = document.querySelector<HTMLElement>("main header img[alt='Solvo']");
      const to = header?.getBoundingClientRect();
      const from = img.getBoundingClientRect();
      const canFly = !reduced && to && to.width > 0 && to.top >= 0 && to.bottom <= window.innerHeight;

      if (canFly && header && to) {
        target = header;
        header.style.visibility = "hidden";
        const scale = to.height / from.height;
        const dx = to.left - from.left;
        const dy = to.top - from.top;
        img.animate(
          [
            { transform: "translate(0, 0) scale(1)", filter: "brightness(0) invert(1)" },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, filter: "brightness(1) invert(0)" },
          ],
          { duration: EXIT_MS, easing: ease, fill: "forwards" },
        );
        bg.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: EXIT_MS * 0.8,
          delay: EXIT_MS * 0.15,
          easing: "ease-in-out",
          fill: "forwards",
        }).finished.then(() => setTimeout(finish, EXIT_MS * 0.1), finish);
      } else {
        el.animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: reduced ? "scale(1)" : "scale(1.04)" },
          ],
          { duration: reduced ? 300 : 450, easing: "ease-out", fill: "forwards" },
        ).finished.then(finish, finish);
      }
    };

    const wait = Math.max(150, HOLD_UNTIL_MS - performance.now());
    const t = setTimeout(exit, wait);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (target) target.style.visibility = "";
    };
  }, []);

  if (done) return null;
  return (
    <div ref={root} className="intro-splash" aria-hidden>
      <div className="intro-splash__bg" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={logo} src="/solvo-logo.png" alt="" className="intro-splash__logo" />
    </div>
  );
}
