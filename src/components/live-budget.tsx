"use client";

import Link from "next/link";
import { useWeeklyReserve } from "@/components/forecast-ui";
import { budgetEditsMonthly, readBudgetEdits, useBudgetEdits, type BudgetEdits } from "@/lib/budget-edits-store";
import { useLearnProgress } from "@/lib/learn-store";
import { onboardingWeeklyDelta, readOnboarding, useOnboarding, type OnboardingState } from "@/lib/onboarding-store";
import { SUBSCRIPTIONS } from "@/data/subscriptions";
import {
  WEEKS_PER_YEAR,
  readCancelledSubs,
  readSavingsPlan,
  readSwitches,
  resetDemo,
  useBillActions,
  useCancelledSubs,
  useSavingsPlan,
  useSwitches,
  weeklyBoost,
  type SavingsPlan,
  type Switches,
} from "@/lib/switches";

// Small client islands for the server-rendered home page: they add the effect of approved switches
// to the safe-to-spend numbers without moving the page's layout into the client.

/** What the subscriptions stopped from the chat free up each week. */
const cancelledWeekly = (cancelled: Record<string, unknown>) =>
  (SUBSCRIPTIONS.filter((x) => cancelled[x.id]).reduce((sum, x) => sum + x.monthly, 0) * 12) / WEEKS_PER_YEAR;
export function useCancelledWeekly() {
  return cancelledWeekly(useCancelledSubs());
}

/** The person's choices in this browser, as EUR a week on top of the server's numbers (everything but the calendar). */
function choicesWeekly(sw: Switches, plan: SavingsPlan | null, cancelled: Record<string, unknown>, onboarding: OnboardingState, edits: BudgetEdits) {
  return weeklyBoost(sw, plan) + cancelledWeekly(cancelled) + onboardingWeeklyDelta(onboarding) + (budgetEditsMonthly(edits) * 12) / WEEKS_PER_YEAR;
}

/** The same, read once outside React: the chat sends it with each question, so its safe-to-spend matches Home. */
export function readWeeklyDelta() {
  return choicesWeekly(readSwitches(), readSavingsPlan(), readCancelledSubs(), readOnboarding(), readBudgetEdits());
}

const eur = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** What the person's choices in this browser add to (or take off) the weekly numbers, EUR a week. Home's slab uses it, and
 * so do the "Switch requested" screens, so the number they count up to is the one Home then shows. */
export function useWeeklyDelta() {
  // Approved switches add money; the onboarding plan replaces the default savings goal the base numbers assume; what the person's
  // calendar expects (a trip, a dinner) is set aside, so it comes off (see ForecastNote for why); the person's own corrections
  // on "Your money each month" (irregular set-aside, bills Solvo missed) move it too.
  return choicesWeekly(useSwitches(), useSavingsPlan(), useCancelledSubs(), useOnboarding(), useBudgetEdits()) - useWeeklyReserve();
}

/** A weekly amount (remaining or budget) plus what approved switches free up each week, minus what the calendar sets aside. */
export function LiveWeeklyEuro({ base, signed = false }: { base: number; signed?: boolean }) {
  const value = base + useWeeklyDelta();
  return <>{signed && value < 0 ? `−${eur.format(-value)}` : eur.format(value)}</>;
}

/** The bar under safe-to-spend: this week's spending as a share of the live weekly budget, so it moves with the number. */
export function LiveWeekBar({ spent, budget }: { spent: number; budget: number }) {
  const live = budget + useWeeklyDelta();
  const over = spent > live;
  const share = live > 0 ? Math.min(1, Math.max(0, spent / live)) : 1;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/12">
      <div
        className={`animate-fill h-full rounded-full transition-[width,background-color] duration-500 ease-out ${over ? "bg-[#ff8a70]" : "bg-mint"}`}
        style={{ width: `${share * 100}%` }}
      />
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
  const edits = useBudgetEdits();
  const edited = !!edits.irregular || edits.extras.length > 0;
  if (!learned && !cancelled && !edited && !Object.keys(switches).length && !plan && !Object.keys(bills).length && !onboarding.completedAt && !onboarding.skipped) return null;
  return (
    <button type="button" className={className} onClick={resetDemo}>
      Reset demo
    </button>
  );
}
