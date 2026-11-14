"use client";

import { useSyncExternalStore } from "react";

// The person's own corrections to Home's "Your money each month": a different monthly set-aside for irregular costs, and
// fixed bills or subscriptions Solvo did not find in the bank data (paid in cash, from another account, or yearly). The
// demo has no backend, so they live in localStorage; Reset demo and switching the demo account clear them (resetDemo in
// switches.ts). The weekly numbers on Home follow through useWeeklyDelta in live-budget.tsx.

export type ExtraCost = {
  id: string;
  name: string;
  monthly: number; // EUR a month
  kind: "bill" | "subscription";
};

export type BudgetEdits = {
  // The set-aside the person chose, and Solvo's estimate when they chose it: the difference is what moves the budget,
  // so a later change in the estimate (another bank connected) does not silently change their choice into a bigger cut.
  irregular?: { monthly: number; base: number };
  extras: ExtraCost[];
};

const KEY = "solvo.budget-edits.v1";
const EMPTY: BudgetEdits = { extras: [] };
const listeners = new Set<() => void>();
let cacheRaw: string | null | undefined;
let cache: BudgetEdits = EMPTY;

function clean(v: unknown): BudgetEdits {
  if (!v || typeof v !== "object") return EMPTY;
  const o = v as Partial<BudgetEdits>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
  const irregular =
    o.irregular && n(o.irregular.monthly) !== null && n(o.irregular.base) !== null
      ? { monthly: o.irregular.monthly, base: o.irregular.base }
      : undefined;
  const extras = Array.isArray(o.extras)
    ? o.extras.filter((x): x is ExtraCost => !!x && typeof x.id === "string" && typeof x.name === "string" && n(x.monthly) !== null)
    : [];
  return { irregular, extras };
}

function snapshot(): BudgetEdits {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? clean(JSON.parse(raw)) : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function write(next: BudgetEdits | null) {
  try {
    if (next && (next.irregular || next.extras.length)) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const readBudgetEdits = snapshot;
export const useBudgetEdits = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

/** A new monthly set-aside for irregular costs; `base` is Solvo's estimate. Back to the estimate clears it. */
export function setIrregular(monthly: number, base: number) {
  const s = snapshot();
  const same = Math.round(monthly) === Math.round(base);
  write({ ...s, irregular: same ? undefined : { monthly: Math.max(0, Math.round(monthly)), base } });
}

export function addExtra(cost: Omit<ExtraCost, "id">) {
  const s = snapshot();
  write({ ...s, extras: [...s.extras, { ...cost, id: `cost-${Date.now().toString(36)}` }] });
}

export function updateExtra(id: string, patch: Partial<Omit<ExtraCost, "id">>) {
  const s = snapshot();
  write({ ...s, extras: s.extras.map((x) => (x.id === id ? { ...x, ...patch, id } : x)) });
}

export function removeExtra(id: string) {
  const s = snapshot();
  write({ ...s, extras: s.extras.filter((x) => x.id !== id) });
}

export const resetBudgetEdits = () => write(null);

export const extrasMonthly = (e: BudgetEdits) => e.extras.reduce((sum, x) => sum + x.monthly, 0);

/** What the edits add to (or take off) the everyday budget each month, EUR. A smaller set-aside adds, extra bills take off. */
export const budgetEditsMonthly = (e: BudgetEdits) => (e.irregular ? e.irregular.base - e.irregular.monthly : 0) - extrasMonthly(e);
