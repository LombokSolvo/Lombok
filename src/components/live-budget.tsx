"use client";

import Link from "next/link";
import { useLearnProgress } from "@/lib/learn-store";
import { onboardingWeeklyDelta, useOnboarding } from "@/lib/onboarding-store";
import { resetDemo, useBillActions, useSavingsPlan, useSwitches, weeklyBoost } from "@/lib/switches";

// Small client islands for the server-rendered home page: they add the effect of approved switches
// to the safe-to-spend numbers without moving the page's layout into the client.

const eur = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** A weekly amount (remaining or budget) plus what approved switches free up each week. */
export function LiveWeeklyEuro({ base, signed = false }: { base: number; signed?: boolean }) {
  // Approved switches add money; the onboarding plan replaces the default savings goal the base numbers assume.
  const value = base + weeklyBoost(useSwitches(), useSavingsPlan()) + onboardingWeeklyDelta(useOnboarding());
  return <>{signed && value < 0 ? `−${eur.format(-value)}` : eur.format(value)}</>;
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
  if (!learned && !Object.keys(switches).length && !plan && !Object.keys(bills).length && !onboarding.completedAt && !onboarding.skipped) return null;
  return (
    <button type="button" className={className} onClick={resetDemo}>
      Reset demo
    </button>
  );
}

/**
 * The "How your budget is built" rows on Home. The server's numbers assume the default savings goal; once the
 * person approves their own plan (onboarding) or a cheaper bill, these rows follow it, so they add up to the same
 * weekly budget the slab at the top shows.
 */
export function LiveBudgetRows(props: { income: number; fixed: number; irregular: number; defaultGoal: number }) {
  const onboarding = useOnboarding();
  const switches = useSwitches();
  const plan = useSavingsPlan();
  const ownPlan = !!onboarding.completedAt;
  const goal = ownPlan ? (onboarding.savingsMonthly ?? 0) + (onboarding.investMonthly ?? 0) : props.defaultGoal;
  const corrections = ownPlan ? (onboarding.monthlyAdjust ?? 0) : 0;
  const cheaperBills = (weeklyBoost(switches, plan) * 52) / 12;
  const everyday = props.income - props.fixed - props.irregular - goal + corrections + cheaperBills;
  const rows: [string, number][] = [
    ["Fixed and regular bills", -props.fixed],
    ["Set aside for irregular costs", -props.irregular],
    [ownPlan ? "Savings and investing (your plan)" : "Savings goal (you set this)", -goal],
  ];
  if (Math.round(corrections) !== 0) rows.push(["Your corrections to income and bills", corrections]);
  if (Math.round(cheaperBills) !== 0) rows.push(["Cheaper bills", cheaperBills]);
  const signed = (v: number) => (Math.round(v) < 0 ? `−${eur.format(-v)}` : Math.round(v) > 0 ? `+${eur.format(v)}` : eur.format(0));
  return (
    <dl className="num px-4 py-1 text-[15px]">
      <div className="flex justify-between py-2.5">
        <dt>Salary</dt>
        <dd className="font-medium">{eur.format(props.income)}</dd>
      </div>
      {rows.map(([label, v]) => (
        <div key={label} className="flex justify-between py-2.5 text-muted-foreground">
          <dt>{label}</dt>
          <dd>{signed(v)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t py-3 font-semibold">
        <dt>Everyday budget</dt>
        <dd>{eur.format(everyday)}</dd>
      </div>
    </dl>
  );
}

/** "You usually spend X a week…": compared with the live weekly budget, so it agrees with the slab. */
export function LiveBudgetGap({ usualWeekly, baseWeekly }: { usualWeekly: number; baseWeekly: number }) {
  const budget = baseWeekly + weeklyBoost(useSwitches(), useSavingsPlan()) + onboardingWeeklyDelta(useOnboarding());
  const gap = Math.round(usualWeekly) - Math.round(budget);
  return (
    <>
      You usually spend {eur.format(usualWeekly)} a week on everyday things.
      {gap > 0 ? ` That's ${eur.format(gap)} more than your budget allows.` : " That fits your budget."}
    </>
  );
}
