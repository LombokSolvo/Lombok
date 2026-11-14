// Aino's fund holdings. DEMO DATA: the S-Pankki dataset has no fund holdings, and Aino has no fund deposits in its
// two years (Oct 2024 to Sept 2026). The story: she bought two S-Pankki funds in 2021 to 2023 and has a monthly
// saving plan into the same two funds (AINO_PLAN, starting on the next 2nd). Fund names are real S-Pankki funds; the
// values, monthly returns and the plan are synthetic, not the funds' real performance.

import type { SavingsGoal } from "@/lib/goals-store";
import type { SavingsPlan } from "@/lib/switches";

export type Holding = { fundId: string; invested: number; since: string; monthlyReturnsPct: number[] };

// End-of-month values, Oct 2024 to Sept 2026 (24 months).
export const PORTFOLIO_MONTHS = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(Date.UTC(2024, 9 + i, 1));
  return d.toISOString().slice(0, 7);
});

const EQUITY = [-1.0, 4.5, -0.8, 2.6, -1.7, -6.0, -4.2, 5.8, 3.9, 2.4, 1.8, 0.9, 2.1, 1.2, -0.6, 1.9, -2.4, 3.1, 0.8, 2.2, 1.5, -1.1, 2.0, 1.4];
const BALANCED = EQUITY.map((r) => Math.round((r * 0.5 + 0.2) * 100) / 100);

export const HOLDINGS: (Holding & { startValue: number })[] = [
  { fundId: "passiivinen-usa-esg", invested: 2400, since: "2021", startValue: 2950, monthlyReturnsPct: EQUITY },
  { fundId: "varainhoito-50", invested: 1800, since: "2022", startValue: 1880, monthlyReturnsPct: BALANCED },
];

/** Aino's saving plan, already set up: her EUR 200 monthly savings goal split between her two funds and her savings
 * account, which holds her goals (AINO_GOALS). DEMO DATA. */
export const AINO_PLAN: SavingsPlan = {
  monthly: 200,
  fromGoal: 200,
  fromBills: 0,
  fromBudget: 0,
  funds: [
    { fundId: "passiivinen-usa-esg", monthly: 100 },
    { fundId: "varainhoito-50", monthly: 40 },
    { fundId: "savings-account", monthly: 60 },
  ],
  fundId: "passiivinen-usa-esg",
  fundName: "2 funds and savings account",
  dayOfMonth: 2,
  approvedAt: "2026-09-01T09:00:00.000Z",
};

/** Aino's savings goals, kept in her savings account; their monthly amounts add up to the plan's 60 € into it. DEMO DATA:
 * the dataset has no savings account. */
export const AINO_GOALS: SavingsGoal[] = [
  { id: "aino-buffer", kind: "buffer", label: "Emergency buffer", target: 3000, saved: 2100, monthly: 40 },
  { id: "aino-japan", kind: "trip", label: "Trip to Japan", target: 2000, saved: 1100, monthly: 20 },
];

/** What is in Aino's savings account: the money her goals have saved so far. DEMO DATA. */
export const AINO_SAVINGS_BALANCE = AINO_GOALS.reduce((s, g) => s + g.saved, 0);

/** Value of each holding at the end of every month in PORTFOLIO_MONTHS. */
export function holdingSeries(h: (typeof HOLDINGS)[number]) {
  let v = h.startValue;
  return h.monthlyReturnsPct.map((r) => (v = v * (1 + r / 100)));
}

export function portfolio() {
  const series = HOLDINGS.map(holdingSeries);
  const total = PORTFOLIO_MONTHS.map((_, i) => series.reduce((sum, s) => sum + s[i], 0));
  const invested = HOLDINGS.reduce((sum, h) => sum + h.invested, 0);
  const value = total[total.length - 1];
  const yearAgo = total[total.length - 13];
  return {
    invested,
    value,
    gain: value - invested,
    gainPct: ((value - invested) / invested) * 100,
    yearChangePct: ((value - yearAgo) / yearAgo) * 100,
    total,
    holdings: HOLDINGS.map((h, i) => {
      const s = series[i];
      const v = s[s.length - 1];
      return { ...h, value: v, gain: v - h.invested, yearChangePct: ((v - s[s.length - 13]) / s[s.length - 13]) * 100 };
    }),
  };
}

// Daily and intraday values for the chart's Today / Week / Month / Year / All time views. DEMO DATA as well: the month-end
// values above are kept exactly, and the days between them are a seeded random walk pinned to both ends (a Brownian
// bridge), so every view agrees with the monthly numbers and the server and browser draw the same line.
export type Point = { t: number; value: number }; // t = UTC milliseconds

const DAY_MS = 86_400_000;
const PORTFOLIO_END = Date.UTC(2026, 8, 30); // the dataset's last day, "today" in the demo

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n steps from a to b: a random walk with daily volatility `vol`, bent so it ends exactly on b. */
function bridge(a: number, b: number, n: number, vol: number, rnd: () => number) {
  const walk = [0];
  for (let k = 1; k <= n; k++) walk.push(walk[k - 1] + (rnd() + rnd() + rnd() - 1.5) * vol * 2);
  const end = walk[n];
  return walk.map((w, k) => a * Math.pow(b / a, k / n) * Math.exp(w - (k / n) * end));
}

/** One value per day, from the day before the first month ends to the dataset's last day. */
export function portfolioDaily(): Point[] {
  const { total } = portfolio();
  const start = HOLDINGS.reduce((sum, h) => sum + h.startValue, 0);
  const rnd = seeded(20260930);
  const points: Point[] = [{ t: Date.UTC(2024, 8, 30), value: start }];
  let prev = start;
  PORTFOLIO_MONTHS.forEach((ym, i) => {
    const [y, m] = ym.split("-").map(Number);
    const from = points[points.length - 1].t;
    const to = Date.UTC(y, m, 0); // last day of that month
    const n = Math.round((to - from) / DAY_MS);
    const seg = bridge(prev, total[i], n, 0.004, rnd);
    for (let k = 1; k <= n; k++) points.push({ t: from + k * DAY_MS, value: seg[k] });
    prev = total[i];
  });
  return points;
}

/** Today's indicative values, hourly from 9:00 to 17:00, from yesterday's value to today's. */
export function portfolioToday(daily: Point[]): Point[] {
  const [y, t] = daily.slice(-2);
  const seg = bridge(y.value, t.value, 8, 0.0018, seeded(1409));
  return seg.map((value, k) => ({ t: PORTFOLIO_END + (9 + k) * 3_600_000, value }));
}
