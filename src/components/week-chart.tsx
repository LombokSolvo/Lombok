"use client";

import { useState } from "react";
import { useWeeklyDelta } from "@/components/live-budget";

// Home's safe-to-spend card, below the big number: the week as seven bars. Days that have passed show what was spent (mint up
// to an even pace, warm above it), the days left show what is still available each day as dashed "ghost" bars, and a dashed line
// marks the even pace (the weekly budget over seven days). Everything follows the live weekly budget, so an approved switch or a
// calendar item moves the bars along with the number. Tapping a day names it in the caption.

const eur = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const CHART_H = 96; // px

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

  // Bar heights share one scale: the tallest of a spent day, today's spent plus its allowance, and the pace line (with headroom).
  const top = Math.max(pace * 1.25, ...spentPerDay, (spentPerDay[today] ?? 0) + perDay, perDay, 1);
  const h = (v: number) => Math.round((Math.max(0, v) / top) * CHART_H);
  const paceY = h(pace);

  const caption =
    picked === null
      ? `${eur.format(spent)} spent of ${eur.format(Math.max(0, live))} this week`
      : picked < today
        ? `${dayLabels[picked]}: ${eur.format(spentPerDay[picked])} spent`
        : picked === today
          ? `Today: ${eur.format(spentPerDay[today])} spent${perDay > 0 ? `, about ${eur.format(perDay)} still free` : ""}`
          : perDay > 0
            ? `${dayLabels[picked]}: about ${eur.format(perDay)} free to spend`
            : `${dayLabels[picked]}: nothing left this week`;

  return (
    <div>
      <p className="mt-2 text-[15px] text-white/75">
        {left <= 0
          ? `${eur.format(-left)} over this week's budget. A new week starts ${daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}.`
          : daysLeft === 1
            ? `All of it for today, the last day of the week`
            : `About ${eur.format(perDay)} a day for the ${daysLeft} days left`}
      </p>

      <div className="relative mt-3" style={{ height: CHART_H + 18 }}>
        {/* Even pace: the weekly budget spread over seven days. */}
        {pace > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-white/35"
            style={{ bottom: paceY }}
          >
            <span className="num absolute -top-[18px] right-0 text-[11px] font-medium text-white/55">
              pace {eur.format(pace)}/day
            </span>
          </div>
        )}
        <div className="grid h-full grid-cols-7 items-end gap-1.5">
          {dayLetters.map((_, i) => {
            const isPast = i < today;
            const isToday = i === today;
            const isFuture = i > today;
            const spentH = isFuture ? 0 : h(spentPerDay[i]);
            const ghostH = isPast ? 0 : h(perDay);
            const overPace = !isFuture && spentPerDay[i] > pace;
            const dim = picked !== null && picked !== i;
            const on = picked === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicked(picked === i ? null : i)}
                aria-label={`${dayLabels[i]}: ${isFuture ? `about ${eur.format(perDay)} free` : `${eur.format(spentPerDay[i])} spent`}`}
                aria-pressed={picked === i}
                className={`flex h-full min-h-11 flex-col items-stretch justify-end transition-opacity duration-200 ${dim ? "opacity-45" : ""}`}
              >
                {/* The amount over each day that has passed (and today, once something is spent). */}
                {spentH > 0 && (
                  <span aria-hidden className={`num mb-1 text-center text-[10px] leading-none font-medium ${on ? "text-white" : "text-white/60"}`}>
                    {Math.round(spentPerDay[i])}
                  </span>
                )}
                {/* What is still free: dashed, on top of today's spending, alone on the days to come. */}
                {ghostH > 0 && (
                  <span
                    aria-hidden
                    className={`animate-grow block w-full border-[1.5px] border-dashed ${on ? "border-mint bg-mint/25" : "border-mint/60 bg-mint/10"} ${spentH > 0 ? "rounded-t-[6px] border-b-0" : "rounded-[6px]"}`}
                    style={{ height: ghostH, animationDelay: `${120 + i * 45}ms` }}
                  />
                )}
                {spentH > 0 && (
                  <span
                    aria-hidden
                    className={`animate-grow block w-full ${ghostH > 0 ? "rounded-b-[6px]" : "rounded-[6px]"} ${overPace ? "bg-[#ffb4a3]" : "bg-mint"} ${isToday ? "ring-2 ring-white/80" : ""}`}
                    style={{ height: Math.max(spentH, 3), animationDelay: `${i * 45}ms` }}
                  />
                )}
                {isPast && spentH === 0 && <span aria-hidden className="block h-[3px] w-full rounded-full bg-white/20" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium">
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
