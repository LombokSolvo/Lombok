"use client";

import { useState } from "react";
import { Group } from "@/components/solvo/ui";
import { NumberField } from "@/components/solvo/fields";
import stats from "@/data/mortgage-stats.json";
import { useOnboarding } from "@/lib/onboarding-store";

// "Saving for a home". Takes the price of a home (or a cabin) and shows the equity S-Pankki's own mortgage applications had, how long
// that takes to save at the person's monthly saving, and what the 200 applications in the dataset say about approvals. Numbers come
// from src/data/mortgage-stats.json (scripts/build-mortgage-stats.mjs). Descriptive only: not a loan decision, not advice, and the
// data is the synthetic challenge dataset.

const REASONS: Record<string, string> = {
  insufficient_collateral: "Not enough collateral",
  insufficient_income: "Income too low",
  insufficient_equity: "Not enough equity",
  existing_debt: "Existing debt",
};
const eur = (n: number) => `€${Math.round(n).toLocaleString("fi-FI")}`;
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`.replace(".0%", "%");

function duration(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ") || "now";
}

export function HomeEquityCard({ defaultMonthly }: { defaultMonthly: number }) {
  const plan = useOnboarding();
  const planned = (plan.savingsMonthly ?? 0) + (plan.investMonthly ?? 0);
  const [price, setPrice] = useState(stats.medianPriceEur);
  const [monthly, setMonthly] = useState<number | null>(null);
  const saving = monthly ?? (planned > 0 ? planned : defaultMonthly);
  const equity = Math.round((price * stats.approvedEquityShare) / 100) * 100;
  const months = saving > 0 ? Math.ceil(equity / saving) : null;

  return (
    <Group title="Saving for a home" footer={`${stats.source}. It describes past applications. It isn't a loan decision or advice.`}>
      <div className="flex gap-3 px-4 pt-4">
        <NumberField label="Home price" value={price} onChange={setPrice} suffix="€" />
        <NumberField label="You save a month" value={saving} onChange={setMonthly} suffix="€" />
      </div>
      <div className="px-4 pt-4 pb-4">
        <p className="text-[13px] text-muted-foreground">Equity in the approved applications, about {pct(stats.approvedEquityShare)} of the price</p>
        <p className="num font-display text-[32px] leading-tight font-semibold tracking-[-0.02em]">{eur(equity)}</p>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
          {months === null ? "Add a monthly amount to see how long it takes." : `At ${eur(saving)} a month that is ${duration(months)} of saving.`}
        </p>
      </div>
      <div className="border-t px-4 py-3">
        <p className="text-[13px] text-muted-foreground">Applications in S-Pankki&apos;s data</p>
        <p className="mt-0.5 text-[15px] leading-snug font-medium">
          {stats.approved} of {stats.applications} approved. Equity was about {pct(stats.approvedEquityShare)} of the price in approved ones and {pct(stats.rejectedEquityShare)} in rejected ones.
        </p>
      </div>
      <div className="border-t px-4 py-3">
        <p className="text-[13px] text-muted-foreground">Why {stats.rejected} were rejected</p>
        <ul className="mt-1 flex flex-col gap-1">
          {Object.entries(stats.rejectionReasons).map(([reason, n]) => (
            <li key={reason} className="flex justify-between text-[15px] leading-snug">
              <span>{REASONS[reason] ?? reason}</span>
              <span className="num font-medium">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </Group>
  );
}
