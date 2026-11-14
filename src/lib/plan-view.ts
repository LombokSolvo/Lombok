import type { CompareGroup } from "@/lib/cohorts";
import type { DemoCustomer } from "@/lib/demo";

// Pure maths for the plan overview on the Save page: what a normal month leaves over, how that compares with the saving
// plan, and which everyday categories could free the difference. Everything comes from the last 12 months, so each
// number can be explained line by line.

/** What a usual month leaves after fixed costs, irregular bills and everyday spending, before any saving. Can be negative. */
export function leftoverPerMonth(c: Pick<DemoCustomer, "summary">): number {
  const { salaryYear, basketYear } = c.summary;
  return (salaryYear - basketYear[1] - basketYear[2] - basketYear[3]) / 12;
}

export type PlanStatus = "covered" | "stretch" | "short";

/**
 * How the plan sits against the usual leftover. `gap` is what has to be found each month: covered (nothing to find),
 * stretch (a gap that cuts can plausibly close, up to one more plan of the same size) or short (the leftover is
 * negative, so first the spending itself has to come down).
 */
export function planGap(leftover: number, planMonthly: number): { gap: number; status: PlanStatus } {
  const gap = Math.max(0, Math.round(planMonthly - leftover));
  if (gap === 0) return { gap, status: "covered" };
  return { gap, status: leftover < 0 ? "short" : "stretch" };
}

export type Trim = {
  id: string;
  label: string;
  you: number; // EUR a month
  typical: number; // EUR a month, the group's median
  saving: number; // EUR a month freed: halfway to typical, but at most 15 % of what the person spends
};

const TRIM_METRICS: Record<string, string> = { restaurants: "Restaurants", groceries: "Groceries", transport: "Transport" };
const MIN_SAVING = 10;
const MAX_CUT = 0.15; // a habit is cut by at most this share of what is spent on it

/**
 * Categories where the person spends well above their group's typical, with the saving from going halfway there, and
 * never more than 15 % of what they spend on it (rounded to €5). Halfway, not all the way, and capped: matching the
 * median exactly, or halving a grocery bill, is not realistic, and a number the person can reach is more useful.
 * Largest saving first. Utilities and rent are left out: they change by switching or moving, not by spending less.
 */
export function trimsFrom(group: CompareGroup | null): Trim[] {
  if (!group) return [];
  return group.metrics
    .filter((m) => m.id in TRIM_METRICS)
    .map((m) => ({
      id: m.id,
      label: TRIM_METRICS[m.id],
      you: m.you,
      typical: m.median,
      saving: Math.round(Math.min((m.you - m.median) / 2, m.you * MAX_CUT) / 5) * 5,
    }))
    .filter((t) => t.saving >= MIN_SAVING)
    .sort((a, b) => b.saving - a.saving);
}

/** Share of the gap already found, 0–100, for a progress bar. A gap of 0 is complete. */
export function foundShare(found: number, gap: number): number {
  if (gap <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((found / gap) * 100)));
}
