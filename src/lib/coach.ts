import type { Basket, DemoCustomer } from "@/lib/demo";

// Pure money-coach maths. Everything is derived from the customer's last 12 months,
// so the numbers in the UI can always be explained line by line.

// Assumption shown to the user ("you set this"). Not in the data.
export const DEFAULT_SAVINGS_GOAL_PER_MONTH = 200;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_PER_MONTH = 52 / 12;

export type SafeToSpend = {
  incomePerMonth: number;
  fixedRegularPerMonth: number;
  irregularSetAsidePerMonth: number;
  savingsGoalPerMonth: number;
  everydayBudgetPerMonth: number;
  weeklyBudget: number;
  weekStart: string; // Monday, YYYY-MM-DD
  spentThisWeek: number;
  daysLeft: number; // including today
  remaining: number; // can be negative
  usualWeeklyEveryday: number; // what this customer actually spends per week on average
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function weekStartOf(asOf: string): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return isoDate(new Date(d.getTime() - offset * DAY_MS));
}

export function safeToSpend(c: DemoCustomer, savingsGoalPerMonth = DEFAULT_SAVINGS_GOAL_PER_MONTH): SafeToSpend {
  const incomePerMonth = c.summary.salaryYear / 12;
  const fixedRegularPerMonth = c.summary.basketYear[1] / 12;
  const irregularSetAsidePerMonth = c.summary.basketYear[2] / 12;
  const everydayBudgetPerMonth = incomePerMonth - fixedRegularPerMonth - irregularSetAsidePerMonth - savingsGoalPerMonth;
  const weeklyBudget = everydayBudgetPerMonth / WEEKS_PER_MONTH;

  const weekStart = weekStartOf(c.asOf);
  const spentThisWeek = c.transactions
    .filter((t) => t.date >= weekStart && t.date <= c.asOf && c.basketOf[t.category] === 3)
    .reduce((s, t) => s - t.amount, 0);

  const daysElapsed = Math.round((Date.parse(`${c.asOf}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / DAY_MS);

  return {
    incomePerMonth,
    fixedRegularPerMonth,
    irregularSetAsidePerMonth,
    savingsGoalPerMonth,
    everydayBudgetPerMonth,
    weeklyBudget,
    weekStart,
    spentThisWeek,
    daysLeft: 7 - daysElapsed,
    remaining: weeklyBudget - spentThisWeek,
    usualWeeklyEveryday: c.summary.basketYear[3] / 52,
  };
}

/** Everyday (basket 3) spending in the current month so far, for Home's safe-to-spend card. */
export type MonthSoFar = {
  day: number; // day of the month today, 1-based
  daysInMonth: number;
  daysLeft: number; // including today
  spent: number;
  budget: number; // the everyday budget for a month
  remaining: number; // can be negative
};

/**
 * The month is the REAL one, because the demo clock shows real dates (src/lib/demo-clock.ts): the data's last day (asOf) is shown as
 * today, so day d of the real month sits d - 1 days before asOf in the data. `realToday` is YYYY-MM-DD.
 */
export function monthSoFar(c: DemoCustomer, realToday: string, budget: number): MonthSoFar {
  const day = Number(realToday.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(realToday.slice(0, 4)), Number(realToday.slice(5, 7)), 0)).getUTCDate();
  const start = isoDate(new Date(Date.parse(`${c.asOf}T00:00:00Z`) - (day - 1) * DAY_MS));
  const spent = c.transactions
    .filter((t) => t.date >= start && t.date <= c.asOf && c.basketOf[t.category] === 3)
    .reduce((s, t) => s - t.amount, 0);
  return { day, daysInMonth, daysLeft: daysInMonth - day + 1, spent, budget, remaining: budget - spent };
}

export type CategoryShare = { category: string; perYear: number };

export function topCategories(c: DemoCustomer, basket: Basket, n = 3): CategoryShare[] {
  return Object.entries(c.summary.categoryYear)
    .filter(([cat]) => c.basketOf[cat] === basket)
    .map(([category, perYear]) => ({ category, perYear }))
    .sort((a, b) => b.perYear - a.perYear)
    .slice(0, n);
}

export type UnknownBills = {
  perYear: number;
  paymentsPerMonth: number;
  withoutMerchant: number; // share of utility payments with no merchant id
};

// The bank-side blind spot: utility payments carry an amount but no merchant or contract.
export function unknownBills(c: DemoCustomer): UnknownBills {
  const months = new Set(c.summary.last12Months);
  const rows = c.transactions.filter((t) => t.category === "Utilities" && months.has(t.date.slice(0, 7)));
  return {
    perYear: c.summary.categoryYear.Utilities ?? 0,
    paymentsPerMonth: rows.length / Math.max(months.size, 1),
    withoutMerchant: rows.length ? rows.filter((t) => !t.merchant).length / rows.length : 0,
  };
}
