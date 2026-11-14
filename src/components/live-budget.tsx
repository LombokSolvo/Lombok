"use client";

import Link from "next/link";
import { Check, TrendingUp } from "lucide-react";
import { useMonthReserve } from "@/components/forecast-ui";
import { useLearnProgress } from "@/lib/learn-store";
import { onboardingWeeklyDelta, useOnboarding } from "@/lib/onboarding-store";
import { WEEKS_PER_MONTH } from "@/lib/plan";
import { SUBSCRIPTIONS } from "@/data/subscriptions";
import { WEEKS_PER_YEAR, resetDemo, useBillActions, useCancelledSubs, useSavingsPlan, useSwitches, weeklyBoost } from "@/lib/switches";

// Small client islands for the server-rendered home page: they add the effect of approved switches
// to the safe-to-spend numbers without moving the page's layout into the client.

/** What the subscriptions stopped from the chat free up each week. */
export function useCancelledWeekly() {
  const cancelled = useCancelledSubs();
  return (SUBSCRIPTIONS.filter((x) => cancelled[x.id]).reduce((sum, x) => sum + x.monthly, 0) * 12) / WEEKS_PER_YEAR;
}

const eur = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** What the person's choices in this browser add to (or take off) this month's numbers, EUR. */
function useMonthlyDelta() {
  // Approved switches add money; the onboarding plan replaces the default savings goal the base numbers assume; what the person's
  // calendar expects (a trip, a dinner) before the month ends is set aside, so it comes off (see ForecastNote for why).
  // The first three are weekly figures made from monthly or yearly ones, so they turn back into a month exactly.
  const weekly = weeklyBoost(useSwitches(), useSavingsPlan()) + useCancelledWeekly() + onboardingWeeklyDelta(useOnboarding());
  return weekly * WEEKS_PER_MONTH - useMonthReserve();
}

/** A monthly amount (left or budget) plus what approved switches free up, minus what the calendar sets aside this month. */
export function LiveMonthEuro({ base, signed = false }: { base: number; signed?: boolean }) {
  const value = base + useMonthlyDelta();
  if (!signed) return <>{eur.format(value)}</>;
  return value < 0 ? <span className="text-[#ffb4a3]">−{eur.format(-value)}</span> : <>{eur.format(value)}</>;
}

/** The plain-words line under the number: what is left, spread over the days left in the month. */
export function LivePerDay({ remaining, daysLeft, month, className }: { remaining: number; daysLeft: number; month: string; className?: string }) {
  const left = remaining + useMonthlyDelta();
  const days = Math.max(1, daysLeft);
  return (
    <p className={className}>
      {left <= 0
        ? `Nothing left for ${month}. The budget starts again on the 1st.`
        : days === 1
          ? `${eur.format(left)} for today, the last day of ${month}`
          : `About ${eur.format(left / days)} a day for the next ${days} days`}
    </p>
  );
}

/**
 * On or over budget so far: spending compared with where an even pace through the month would be by the end of today.
 * Answers "am I doing OK?" without making the person do the maths.
 */
export function LiveBudgetStatus({ spent, budget, day, daysInMonth, className }: { spent: number; budget: number; day: number; daysInMonth: number; className?: string }) {
  const live = budget + useMonthlyDelta();
  const diff = (live * day) / daysInMonth - spent; // > 0: spent less than planned by today
  const on = diff >= 0;
  return (
    <p
      className={`${className ?? ""} num inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold ${
        on ? "bg-mint/15 text-mint" : "bg-[#ff9f87]/15 text-[#ffb4a3]"
      }`}
    >
      {on ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <TrendingUp className="size-3.5" strokeWidth={2.5} aria-hidden />}
      {on ? `On budget so far, ${eur.format(diff)} to spare` : `${eur.format(-diff)} over budget so far`}
    </p>
  );
}

/** The bar under safe-to-spend: how much of this month's (live) money is still left, with "X spent of Y" under it.
 * It follows the same live budget as the number, so an approved switch or a calendar item moves both. */
export function LiveMonthBar({ spent, budget }: { spent: number; budget: number }) {
  const live = budget + useMonthlyDelta();
  const over = spent > live;
  const left = live > 0 ? Math.min(1, Math.max(0, (live - spent) / live)) : 0;
  return (
    <div>
      <div className={`h-2 w-full overflow-hidden rounded-full ${over ? "bg-[#ff8a70]/35" : "bg-white/12"}`}>
        <div
          className="animate-fill h-full rounded-full bg-mint transition-[width] duration-500 ease-out"
          style={{ width: `${left * 100}%` }}
        />
      </div>
      <p className="num mt-2 text-[13px] text-white/60">
        {eur.format(spent)} spent of {eur.format(Math.max(0, live))}
      </p>
    </div>
  );
}

/** One line under the safe-to-spend number once a switch is approved. Renders nothing otherwise. */
export function SwitchBoostNote({ className }: { className?: string }) {
  const switches = useSwitches();
  const plan = useSavingsPlan();
  if (!Object.keys(switches).length) return null;
  const boost = weeklyBoost(switches, plan);
  const spendBoost = boost >= 0.5; // below 50 cents rounds to €0, so don't mention it
  const toFund = plan ? (plan.fromBills ?? plan.monthly) : 0;
  const names = Object.values(switches)
    .map((s) => s?.toSupplier)
    .filter(Boolean)
    .join(", ");
  return (
    <p className={className}>
      Cheaper bills ({names}): {spendBoost ? `+${eur.format(boost)}/week to spend` : ""}
      {spendBoost && toFund ? " and " : ""}
      {toFund ? `${eur.format(toFund)}/month into your fund` : ""}.{" "}
      {!toFund && (
        <Link href="/save" className="underline underline-offset-4">
          Save it instead
        </Link>
      )}
    </p>
  );
}

export function ResetDemoButton({ className }: { className?: string }) {
  const switches = useSwitches();
  const plan = useSavingsPlan();
  const bills = useBillActions();
  const onboarding = useOnboarding();
  const learned = Object.keys(useLearnProgress().done).length > 0;
  const cancelled = Object.keys(useCancelledSubs()).length > 0;
  if (!learned && !cancelled && !Object.keys(switches).length && !plan && !Object.keys(bills).length && !onboarding.completedAt && !onboarding.skipped) return null;
  return (
    <button type="button" className={className} onClick={resetDemo}>
      Reset demo
    </button>
  );
}
