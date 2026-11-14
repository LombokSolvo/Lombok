"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Group, Row, eur } from "@/components/solvo/ui";
import { budgetEditsMonthly, extrasMonthly, useBudgetEdits } from "@/lib/budget-edits-store";
import { useOnboarding } from "@/lib/onboarding-store";
import { SUBSCRIPTIONS } from "@/data/subscriptions";
import { monthlyFreed, useCancelledSubs, useSavingsPlan, useSwitches } from "@/lib/switches";

// Home's "Your money each month": how the salary splits into bills, irregular costs, savings and the everyday budget.
// The numbers come from the server (last 12 months) and follow the person's own corrections, which they make inside the
// baskets on /costs (budget-edit.tsx); the weekly numbers above follow too (useWeeklyDelta).

const COLOR = {
  fixed: "bg-chart-1",
  irregular: "bg-chart-2",
  savings: "bg-sky-600",
  everyday: "bg-chart-4",
};
const dot = (color: string) => <span className={`size-2.5 shrink-0 rounded-full ${color}`} aria-hidden />;

export function MoneyMonthCard({
  income,
  fixed,
  irregular,
  savings,
  everyday,
  className,
}: {
  income: number;
  fixed: number;
  irregular: number;
  savings: number;
  everyday: number;
  className?: string;
}) {
  const edits = useBudgetEdits();
  const added = extrasMonthly(edits);
  // The same choices that move the weekly numbers above (useWeeklyDelta in live-budget.tsx), as EUR a month, so the
  // card and the slab always tell one story: a cheaper bill or a cancelled subscription makes the bills smaller, the
  // saving plan (or the plan from onboarding) is the savings row, and whatever is left is the everyday budget.
  const switches = useSwitches();
  const plan = useSavingsPlan();
  const cancelledSubs = useCancelledSubs();
  const onboarding = useOnboarding();
  const freed = monthlyFreed(switches);
  const cancelled = SUBSCRIPTIONS.filter((x) => cancelledSubs[x.id]).reduce((sum, x) => sum + x.monthly, 0);
  const fromBills = plan ? Math.min(freed, plan.fromBills ?? plan.monthly) : 0;
  const onboardingSavings = onboarding.completedAt ? (onboarding.savingsMonthly ?? 0) + (onboarding.investMonthly ?? 0) : null;
  const savingsNow = onboardingSavings ?? savings + fromBills + (plan?.fromBudget ?? 0);
  const fixedNow = fixed + added - freed - cancelled;
  const irregularNow = edits.irregular ? edits.irregular.monthly : irregular;
  const everydayNow =
    everyday + budgetEditsMonthly(edits) + freed + cancelled - (savingsNow - savings) + (onboarding.completedAt ? (onboarding.monthlyAdjust ?? 0) : 0);
  const split = [
    { color: COLOR.fixed, amount: fixedNow },
    { color: COLOR.irregular, amount: irregularNow },
    { color: COLOR.savings, amount: savingsNow },
    { color: COLOR.everyday, amount: Math.max(0, everydayNow) },
  ];
  const splitTotal = split.reduce((sum, x) => sum + x.amount, 0) || 1;
  const share = (v: number) => `${Math.round((Math.max(0, v) / Math.max(income, 1)) * 100)}% of salary`;
  const minus = (v: number) => (Math.round(v) === 0 ? eur.format(0) : `−${eur.format(v)}`);

  return (
    <Group className={className} title="Your money each month" aside="last 12 months">
      <div className="px-4 pt-4 pb-1">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {split.map((x) => (
            <div
              key={x.color}
              className={`${x.color} transition-[width] duration-500 ease-out`}
              style={{ width: `${(x.amount / splitTotal) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <Row title="Salary" value={eur.format(income)} />
      <Row
        icon={dot(COLOR.fixed)}
        title="Fixed and regular bills"
        subtitle={added > 0 ? `Includes ${eur.format(added)} you added` : undefined}
        value={minus(fixedNow)}
        valueSub={share(fixedNow)}
      />
      <Row
        className="border-t"
        icon={dot(COLOR.irregular)}
        title="Irregular costs"
        subtitle={edits.irregular ? `Your amount. Solvo's estimate ${eur.format(irregular)}` : "Dentist, repairs, trips, yearly fees"}
        value={minus(irregularNow)}
        valueSub={share(irregularNow)}
      />
      <Row className="border-t" icon={dot(COLOR.savings)} title="Savings goal" value={minus(savingsNow)} valueSub={share(savingsNow)} />
      <Row
        icon={dot(COLOR.everyday)}
        title={<span className="font-semibold">Everyday budget</span>}
        value={<span className="font-semibold">{everydayNow < -0.5 ? `−${eur.format(-everydayNow)}` : eur.format(Math.max(0, everydayNow))}</span>}
        valueSub={share(everydayNow)}
      />
      <Link
        href="/costs"
        transitionTypes={["nav-forward"]}
        className="flex min-h-12 items-center justify-between border-t px-4 text-[15px] font-semibold text-primary active:bg-muted"
      >
        See and change every cost
        <ArrowRight className="size-[18px]" aria-hidden />
      </Link>
    </Group>
  );
}
