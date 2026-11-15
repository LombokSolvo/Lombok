import type { CompareGroup, CompareMetric } from "@/lib/cohorts";

// What the chat shows for "how do I compare" and "where could I save": the person's monthly spending lines against a group of
// S-Pankki customers. Pure and type-only imports, so scripts/peer-compare.test.mjs can import it. The statistics come from
// src/lib/cohorts.ts (group deciles only, never one customer's data).

export type PeerFocus = "all" | "above";
export type PeerCompare = {
  label: string; // "Aged 25–34"
  n: number; // customers in the group
  focus: PeerFocus;
  metrics: CompareMetric[];
};

// Spending someone could actually trim or switch. Rent is left out (it changes by moving), and so is the everyday total
// (it only repeats restaurants, groceries and transport).
const SAVABLE = ["restaurants", "groceries", "transport", "bills"];
const MIN_GAP = 15; // EUR a month above the group's typical before a line counts as "more than others"
const MIN_RATIO = 1.15;

/** The lines to show: all of them, or only the savable ones where the person spends clearly more than typical, biggest gap first. */
export function peerCompare(group: CompareGroup, focus: PeerFocus): PeerCompare {
  const metrics =
    focus === "all"
      ? group.metrics
      : group.metrics
          .filter((m) => SAVABLE.includes(m.id) && m.you - m.median >= MIN_GAP && m.you >= m.median * MIN_RATIO)
          .sort((a, b) => b.you - b.median - (a.you - a.median));
  return { label: group.label, n: group.n, focus, metrics };
}
