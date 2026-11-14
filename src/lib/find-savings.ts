// "Help me save €100 more a month": picks concrete changes from the person's own numbers until they add up to the target.
// Pure, no runtime imports, so scripts/find-savings.test.mjs can import it. The coach route builds the candidates (bill
// switches from the e-invoice comparisons, card subscriptions, everyday spending from the last 12 months) and the chat
// shows the result as a plan card with a button per change.
//
// Order: switching a bill first (same service, lower price, nothing to give up), then the biggest subscription (one tap,
// every month), then trimming everyday spending, then the other subscriptions only if still short. A trim is sized to the
// gap it closes and never asks for more than MAX_CUT of a category, so every line is something a person could really do.

export const MAX_CUT = 0.25; // trim at most a quarter of a kind of spending
const MIN_LINE = 5; // EUR a month: smaller trims aren't worth a line

export type SavingsCandidate =
  | { kind: "switch"; id: "electricity" | "telecom"; label: string; monthly: number; supplier?: string; yearly: number }
  | { kind: "trim"; id: string; label: string; currentMonthly: number } // a category or merchant type
  | { kind: "cancel"; id: string; label: string; monthly: number }; // a card subscription

export type SavingsLine =
  | { kind: "switch"; id: "electricity" | "telecom"; label: string; monthly: number; supplier?: string; yearly: number }
  | { kind: "trim"; id: string; label: string; monthly: number; currentMonthly: number; newMonthly: number; weeklyNow: number; weeklyNew: number; pct: number }
  | { kind: "cancel"; id: string; label: string; monthly: number };

export type SavingsPlanResult = {
  target: number;
  found: number; // EUR a month, the sum of the lines
  reached: boolean;
  lines: SavingsLine[];
  yearly: number;
};

const r0 = (n: number) => Math.round(n);
const WEEKS_PER_MONTH = 52 / 12;

export function findSavings(target: number, candidates: SavingsCandidate[]): SavingsPlanResult | { error: string } {
  if (!Number.isFinite(target) || target < 5 || target > 5000) return { error: "The target must be between €5 and €5,000 a month." };
  const lines: SavingsLine[] = [];
  let left = target;
  const take = (l: SavingsLine) => {
    lines.push(l);
    left -= l.monthly;
  };

  // 1. Bill switches, biggest first. Whole amounts: a switch can't be done by halves.
  for (const c of candidates.filter((c) => c.kind === "switch").sort((a, b) => b.monthly - a.monthly)) {
    if (left <= 0) break;
    if (c.monthly >= 1) take({ ...c, monthly: r0(c.monthly) });
  }

  // 2. The biggest subscription, if there is still a gap.
  const subs = candidates.filter((c) => c.kind === "cancel").sort((a, b) => b.monthly - a.monthly);
  if (left > 0 && subs.length) take({ ...subs[0], monthly: Math.round(subs[0].monthly * 100) / 100 });

  // 3. Trims, biggest category first, each sized to what is still missing (up to MAX_CUT of it).
  for (const c of candidates.filter((c) => c.kind === "trim").sort((a, b) => b.currentMonthly - a.currentMonthly)) {
    if (left < MIN_LINE / 2) break;
    const cut = Math.min(c.currentMonthly * MAX_CUT, left);
    const monthly = Math.ceil(cut / 5) * 5; // round up to 5 euros, so the plan reaches the target
    if (monthly < MIN_LINE || monthly > c.currentMonthly * MAX_CUT + 5) continue;
    const newMonthly = c.currentMonthly - monthly;
    take({
      kind: "trim",
      id: c.id,
      label: c.label,
      monthly,
      currentMonthly: r0(c.currentMonthly),
      newMonthly: r0(newMonthly),
      weeklyNow: r0(c.currentMonthly / WEEKS_PER_MONTH),
      weeklyNew: r0(newMonthly / WEEKS_PER_MONTH),
      pct: r0((monthly / c.currentMonthly) * 100),
    });
  }

  // 4. The other subscriptions, only if still short.
  for (const c of subs.slice(1)) {
    if (left <= 0) break;
    take({ ...c, monthly: Math.round(c.monthly * 100) / 100 });
  }

  const found = r0(lines.reduce((s, l) => s + l.monthly, 0));
  return { target: r0(target), found, reached: found >= target, lines, yearly: r0(found * 12) };
}
