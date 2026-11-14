"use client";

import { useState } from "react";
import { useWeeklyDelta } from "@/components/live-budget";

// Home's safe-to-spend card, below the big number: the week, Monday to Sunday, as seven slim bars. Days that have passed show what
// was spent (mint up to an even pace, warm above it), the days left are empty tracks (tap one for what is free a day), and a dotted line
// marks the even pace (the weekly budget over seven days). Everything follows the live weekly budget, so an approved switch or a
// calendar item moves the bars along with the number. Tapping a day names it in the caption.

const eur = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const CHART_H = 88; // px

export function WeekChart({
  daily,
  budget,
  dayLabels,
  dayLetters,
}: {
  /** Everyday spending per day, from the week's first day to today (so its length is the days so far + 1). */
  daily: number[];
  /** The weekly budget before this browser's changes. */
  budget: number;
  /** Seven short real dates, the budget week's first day to its last, e.g. "Thu 12 Nov". */
  dayLabels: string[];
  /** Seven one-letter weekdays for the same days. */
  dayLetters: string[];
}) {
  const live = budget + useWeeklyDelta();
  const [picked, setPicked] = useState<number | null>(null);

  const today = daily.length - 1;
  const spentPerDay = daily.map((v) => Math.max(0, v));
  const spent = daily.reduce((a, b) => a + b, 0);
  const left = live - spent;
  const daysLeft = 7 - today; // today counts
  const perDay = left > 0 ? left / daysLeft : 0;
  const pace = Math.max(0, live) / 7;

  // One scale for every bar: the biggest day, or the pace line with some headroom.
  const top = Math.max(pace * 1.6, Math.max(...spentPerDay) * 1.2, 1);
  const pct = (v: number) => `${Math.min(100, (Math.max(0, v) / top) * 100)}%`;

  const caption =
    picked === null
      ? `${eur.format(spent)} spent of ${eur.format(Math.max(0, live))} this week`
      : picked < today
        ? `${dayLabels[picked]}: ${eur.format(spentPerDay[picked])} spent`
        : picked === today
          ? `Today: ${eur.format(spentPerDay[today])} spent`
          : perDay > 0
            ? `${dayLabels[picked]}: about ${eur.format(perDay)} free to spend`
            : `${dayLabels[picked]}: nothing left this week`;

  return (
    <div className="mt-5">
      <div className="relative" style={{ height: CHART_H }}>
        {/* Even pace: the weekly budget spread over seven days. */}
        {pace > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dotted border-white/30"
            style={{ bottom: pct(pace) }}
          />
        )}
        <div className="grid h-full grid-cols-7">
          {dayLetters.map((_, i) => {
            const isFuture = i > today;
            const isToday = i === today;
            const on = picked === i;
            const value = isFuture ? 0 : spentPerDay[i];
            const overPace = !isFuture && spentPerDay[i] > pace;
            const fill = overPace ? "bg-[#ffb4a3]" : "bg-mint";
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicked(on ? null : i)}
                aria-label={`${dayLabels[i]}: ${isFuture ? `about ${eur.format(perDay)} free` : `${eur.format(spentPerDay[i])} spent`}`}
                aria-pressed={on}
                className="group relative flex h-full min-h-11 justify-center"
              >
                {/* The track: the whole height, so empty days still read as days. */}
                <span
                  aria-hidden
                  className={`relative block h-full w-[14px] overflow-hidden rounded-full transition-colors ${
                    on ? "bg-white/20" : isToday ? "bg-white/14" : "bg-white/[0.07]"
                  }`}
                >
                  <span
                    className={`animate-grow absolute inset-x-0 bottom-0 rounded-full ${fill}`}
                    style={{ height: value > 0 ? `max(14px, ${pct(value)})` : 0, animationDelay: `${i * 50}ms` }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-7 text-center text-[11px] font-medium">
        {dayLetters.map((d, i) => (
          <span
            key={i}
            className={
              i === today
                ? "mx-auto flex size-5 items-center justify-center rounded-full bg-white text-slab"
                : picked === i
                  ? "leading-5 text-white"
                  : i < today
                    ? "leading-5 text-white/55"
                    : "leading-5 text-white/30"
            }
          >
            {d}
          </span>
        ))}
      </div>

      <p aria-live="polite" className="num mt-4 border-t border-white/10 pt-3 text-[13px] text-white/60">
        {caption}
      </p>
    </div>
  );
}
