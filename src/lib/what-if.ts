// "What if" simulations for the coach chat: save a target, change a kind of spending, how long until a sum.
// Pure: the only runtime import is the plan maths (src/lib/plan.ts), so scripts/what-if.test.mjs can import it.
// The coach route builds the base from the demo customer (same inputs as Home and onboarding), runs the `spending`
// tool for the current monthly amount, and maps dates through the demo clock. Every number here can be traced:
// safe-to-save is buildPlan()'s room for saving, minus the starter buffer and any saving plan already running.

import { WEEKS_PER_MONTH, buildPlan, type PlanBase } from "./plan.ts";


export type WhatIfBase = Omit<PlanBase, "status" | "oneOffMonthly"> & {
  status?: PlanBase["status"];
  planMonthly: number | null; // a saving plan already running (EUR a month), from the chat state
  weeklyBudget: number; // Home's weekly everyday budget (src/lib/coach.ts safeToSpend)
  today: string; // YYYY-MM-DD, in the demo's own dates
};

export type WhatIfInput =
  | { kind: "save_target"; target: number; deadline?: string; months?: number; alreadySaved?: number }
  | { kind: "change_spending"; label: string; basket: 1 | 2 | 3; currentMonthly: number; percent?: number; newMonthly?: number }
  | { kind: "how_long"; target: number; monthly?: number; alreadySaved?: number };

type Common = { safeToSaveMonthly: number; assumptions: string[] };

export type WhatIfResult =
  | (Common & {
      kind: "save_target";
      target: number;
      toGo: number;
      months: number;
      deadline: string;
      neededMonthly: number;
      fits: boolean;
      gapMonthly: number;
      cutWeekly: number; // euros a week off everyday spending that closes the gap (0 when it fits)
      monthsIfCurrentPace: number | null; // at safe-to-save, null when there is nothing to save
      dateIfCurrentPace: string | null;
    })
  | (Common & {
      kind: "change_spending";
      label: string;
      currentMonthly: number;
      newMonthly: number;
      freedMonthly: number;
      freedYearly: number;
      safeToSpendWeeklyBefore: number;
      safeToSpendWeeklyAfter: number;
      safeToSaveMonthlyAfter: number;
    })
  | (Common & {
      kind: "how_long";
      target: number;
      toGo: number;
      monthly: number;
      months: number | null;
      date: string | null;
    })
  | { kind: "error"; error: string };

const r0 = (n: number) => Math.round(n);
const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const isoDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
// Same look as the app's amounts (src/components/solvo/ui.tsx), so the small print matches the card.
const EUR = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur = (n: number) => EUR.format(r0(n));

/** Whole calendar months from one day to another (30 Sept to 31 March is 6, 14 Nov to 1 June is 6). */
export function wholeMonths(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

export function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out.toISOString().slice(0, 10);
}

/** Room for saving from the plan maths: no goals, no investing, minus the starter buffer and a running saving plan. */
export function safeToSave(base: WhatIfBase, everydayMonthly = base.everydayMonthly) {
  const plan = buildPlan({ ...base, everydayMonthly, status: base.status ?? "worker" }, { investsNow: false, investInterest: "no", goals: [] });
  return { plan, monthly: r0(Math.max(0, plan.room - plan.buffer.monthly - (base.planMonthly ?? 0))) };
}

function baseAssumptions(base: WhatIfBase, plan: ReturnType<typeof safeToSave>["plan"]) {
  const out = [
    "Based on your last 12 months",
    `Everyday spending kept at ${eur(plan.everydayFloor)} a month, 85% of your usual ${eur(base.everydayMonthly)}`,
  ];
  if (plan.buffer.monthly > 0) out.push(`${eur(plan.buffer.monthly)} a month first builds a starter buffer`);
  if (base.planMonthly) out.push(`Your saving plan of ${eur(base.planMonthly)} a month keeps running`);
  out.push("No interest or returns counted");
  return out;
}

export function whatIf(base: WhatIfBase, input: WhatIfInput): WhatIfResult {
  if (!base || !fin(base.incomeMonthly) || !isoDay(base.today)) return { kind: "error", error: "No customer data." };
  const { plan, monthly: safe } = safeToSave(base);
  const assumptions = baseAssumptions(base, plan);

  switch (input?.kind) {
    case "save_target": {
      const { target } = input;
      const saved = fin(input.alreadySaved) ? Math.max(0, input.alreadySaved) : 0;
      if (!fin(target) || target <= 0 || target > 10_000_000) return { kind: "error", error: "The target must be a positive amount in euros." };
      let months: number;
      let deadline: string;
      if (isoDay(input.deadline)) {
        if (input.deadline <= base.today) return { kind: "error", error: "The deadline must be after today." };
        months = Math.max(1, wholeMonths(base.today, input.deadline)); // whole months, so the monthly amount errs on the safe side
        deadline = input.deadline;
      } else if (fin(input.months) && input.months >= 1 && input.months <= 600) {
        months = Math.round(input.months);
        deadline = addMonths(base.today, months);
      } else return { kind: "error", error: "Give a deadline (YYYY-MM-DD) or a number of months." };
      const toGo = Math.max(0, target - saved);
      const neededMonthly = r0(toGo / months);
      const fits = neededMonthly <= safe;
      const gapMonthly = fits ? 0 : neededMonthly - safe;
      const paceMonths = safe > 0 ? Math.ceil(toGo / safe) : null;
      return {
        kind: "save_target",
        target: r0(target),
        toGo: r0(toGo),
        months,
        deadline,
        neededMonthly,
        fits,
        gapMonthly,
        cutWeekly: r0(gapMonthly / WEEKS_PER_MONTH),
        monthsIfCurrentPace: paceMonths,
        dateIfCurrentPace: paceMonths === null ? null : addMonths(base.today, paceMonths),
        safeToSaveMonthly: safe,
        assumptions: saved ? [`${eur(saved)} already saved`, ...assumptions] : assumptions,
      };
    }
    case "change_spending": {
      const { currentMonthly, basket } = input;
      if (!fin(currentMonthly) || currentMonthly < 0) return { kind: "error", error: "No current amount for that spending." };
      let newMonthly: number;
      if (fin(input.newMonthly)) newMonthly = input.newMonthly;
      else if (fin(input.percent)) newMonthly = currentMonthly * (1 + input.percent / 100);
      else return { kind: "error", error: "Give a change in percent (e.g. -50) or a new monthly amount." };
      if (newMonthly < 0 || newMonthly > currentMonthly * 10 + 10_000) return { kind: "error", error: "The new amount is out of range." };
      const freed = currentMonthly - newMonthly; // negative when spending goes up
      // Safe to spend: what is freed is a week's worth more for everything else. Safe to save: the plan maths again with the
      // lower amount (everyday spending for basket 3, bills or irregular costs for baskets 1 and 2).
      const everydayAfter = basket === 3 ? Math.max(0, base.everydayMonthly - freed) : base.everydayMonthly;
      const after = safeToSave(
        basket === 3
          ? base
          : { ...base, [basket === 1 ? "fixedRegularMonthly" : "irregularMonthly"]: (basket === 1 ? base.fixedRegularMonthly : base.irregularMonthly) - freed },
        everydayAfter,
      );
      return {
        kind: "change_spending",
        label: input.label,
        currentMonthly: r0(currentMonthly),
        newMonthly: r0(newMonthly),
        freedMonthly: r0(freed),
        freedYearly: r0(freed * 12),
        safeToSpendWeeklyBefore: r0(base.weeklyBudget),
        safeToSpendWeeklyAfter: r0(base.weeklyBudget + freed / WEEKS_PER_MONTH),
        safeToSaveMonthly: safe,
        safeToSaveMonthlyAfter: after.monthly,
        assumptions: [...assumptions, "The money freed can go to other spending or to saving, not both"],
      };
    }
    case "how_long": {
      const { target } = input;
      if (!fin(target) || target <= 0 || target > 10_000_000) return { kind: "error", error: "The target must be a positive amount in euros." };
      const saved = fin(input.alreadySaved) ? Math.max(0, input.alreadySaved) : 0;
      const monthly = fin(input.monthly) && input.monthly > 0 ? r0(input.monthly) : safe;
      const toGo = Math.max(0, target - saved);
      const months = toGo === 0 ? 0 : monthly > 0 ? Math.ceil(toGo / monthly) : null;
      return {
        kind: "how_long",
        target: r0(target),
        toGo: r0(toGo),
        monthly,
        months,
        date: months === null ? null : addMonths(base.today, months),
        safeToSaveMonthly: safe,
        assumptions: [saved ? `${eur(saved)} already saved` : "Counting from zero saved", ...(fin(input.monthly) ? ["No interest or returns counted"] : assumptions)],
      };
    }
    default:
      return { kind: "error", error: "Unknown question type." };
  }
}
