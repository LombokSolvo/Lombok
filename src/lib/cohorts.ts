// "How you compare": the person's last 12 months against groups of S-Pankki customers.
// The groups come from scripts/build-cohorts.mjs, which keeps only group statistics (count and deciles, at least
// 100 people per group), never one customer's data. Groups are by age band, city and income band: never the
// exact postcode, and the dataset has no field for life situation (everyone in it has a salary).
import data from "@/data/cohorts.json";
import type { DemoCustomer } from "@/lib/demo";

type Cohort = { label: string; n: number; deciles: Record<string, number[]> };
const COHORTS = data.cohorts as Record<string, Cohort>;

const METRICS = [
  { id: "everyday", label: "Everyday spending", cats: ["Groceries", "Restaurants", "Transportation", "Entertainment", "Lifestyle"] },
  { id: "restaurants", label: "Restaurants", cats: ["Restaurants"] },
  { id: "groceries", label: "Groceries", cats: ["Groceries"] },
  { id: "transport", label: "Transport", cats: ["Transportation"] },
  { id: "bills", label: "Utilities", cats: ["Utilities"] },
  { id: "rent", label: "Rent", cats: ["Housing"] },
] as const;

export type CompareMetric = { id: string; label: string; you: number; median: number; pct: number; deciles: number[] };
export type CompareGroup = {
  key: string; // e.g. "age:25–34"
  dim: "age" | "area" | "income" | "all";
  label: string; // "Aged 25–34"
  short: string; // "25–34", for a picker chip
  n: number;
  metrics: CompareMetric[];
};

const AGE_BANDS: [number, number, string][] = [[18, 24, "18–24"], [25, 34, "25–34"], [35, 44, "35–44"], [45, 54, "45–54"], [55, 64, "55–64"], [65, 200, "65+"]];
const INCOME_BANDS: [number, number, string][] = [[0, 2000, "0–2000"], [2000, 3000, "2000–3000"], [3000, 4000, "3000–4000"], [4000, 5000, "4000–5000"], [5000, Infinity, "5000+"]];
const AREA: Record<string, string> = { "00": "Helsinki", "01": "Vantaa", "02": "Espoo" };

/** Roughly what share of the group (0–100) spends less than `x`, read off the deciles. */
export function percentile(x: number, d: number[]) {
  if (x <= d[0]) return Math.max(1, Math.round((x / Math.max(d[0], 1)) * 10));
  for (let i = 1; i < d.length; i++) {
    if (x <= d[i]) return Math.round(10 * i + (10 * (x - d[i - 1])) / Math.max(d[i] - d[i - 1], 1));
  }
  return 95; // above the 90th percentile: the deciles can't say more
}

const DIM_OF = (key: string): CompareGroup["dim"] => (key.split(":")[0] as CompareGroup["dim"]) ?? "all";
const prettyLabel = (label: string) => label.replace(/(\d{4})/g, (n) => Number(n).toLocaleString("fi-FI"));

/** The person's own group in each dimension: their age band, city and income band. */
export function ownGroups(c: DemoCustomer): Record<"age" | "area" | "income", string | undefined> {
  const income = c.summary.salaryYear / 12;
  const age = AGE_BANDS.find(([lo, hi]) => c.age >= lo && c.age <= hi);
  const inc = INCOME_BANDS.find(([lo, hi]) => income >= lo && income <= hi);
  const area = AREA[c.postalCode.slice(0, 2)];
  const has = (k: string | undefined) => (k && COHORTS[k] ? k : undefined);
  return {
    age: has(age && `age:${age[2]}`),
    area: has(area && `area:${area}`),
    income: has(inc && `income:${inc[2]}`),
  };
}

/** The person against one group (any key in cohorts.json). */
export function compareAgainst(c: DemoCustomer, key: string): CompareGroup | null {
  const g = COHORTS[key];
  if (!g) return null;
  const monthly = (cats: readonly string[]) => cats.reduce((s, k) => s + (c.summary.categoryYear[k] ?? 0), 0) / 12;
  return {
    key,
    dim: DIM_OF(key),
    label: prettyLabel(g.label),
    short: prettyLabel(key === "all" ? "Everyone" : key.split(":")[1]),
    n: g.n,
    metrics: METRICS.map((m) => {
      const d = g.deciles[m.id];
      const you = Math.round(monthly(m.cats));
      return { id: m.id, label: m.label, you, median: d[4], pct: percentile(you, d), deciles: d };
    }),
  };
}

/** Every group, in the order the picker shows them. */
export function compareAll(c: DemoCustomer): CompareGroup[] {
  const order = (k: string) => ["age", "area", "income", "all"].indexOf(DIM_OF(k));
  return Object.keys(COHORTS)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b, "en", { numeric: true }))
    .flatMap((k) => compareAgainst(c, k) ?? []);
}

export const COHORT_WINDOW = data.window;
