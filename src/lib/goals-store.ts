"use client";

import { useSyncExternalStore } from "react";
import { AINO_GOALS } from "@/data/portfolio";
import { DEFAULT_SAVINGS_GOAL_PER_MONTH } from "@/lib/coach";
import { todayIso } from "@/lib/demo-clock";
import type { DemoMode } from "@/lib/demo-mode";
import { SAVINGS_ACCOUNT_ID, fundById } from "@/lib/funds";
import { planFunds, type PlanFund, type SavingsPlan } from "@/lib/switches";

// Savings goals (a trip, a buffer, a home) kept in the person's savings account. Added on the Invest page or from a card
// in the coach chat. The demo has no backend, so they live in localStorage; until the person changes anything, Aino
// shows her demo goals (AINO_GOALS). Reset demo clears them (resetGoals, called from resetDemo in switches.ts).

export type SavingsGoal = {
  id: string;
  kind: "trip" | "buffer" | "property" | "other";
  label: string;
  target: number; // EUR
  saved: number; // EUR already in the savings account for it
  monthly: number; // EUR a month moved to the savings account for it
};

const KEY = "solvo.goals.v1";
const listeners = new Set<() => void>();
let cacheRaw: string | null | undefined;
let cache: SavingsGoal[] | null = null;

function snapshot(): SavingsGoal[] | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      cache = Array.isArray(parsed) ? parsed : null;
    } catch {
      cache = null;
    }
  }
  return cache;
}

function write(next: SavingsGoal[] | null) {
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
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

const forMode = (stored: SavingsGoal[] | null, mode: DemoMode) => stored ?? (mode === "aino" ? AINO_GOALS : []);

export const readGoals = (mode: DemoMode) => forMode(snapshot(), mode);
export function useGoals(mode: DemoMode) {
  return forMode(
    useSyncExternalStore(subscribe, snapshot, () => null),
    mode,
  );
}

export function addGoal(mode: DemoMode, goal: Omit<SavingsGoal, "id">): SavingsGoal {
  const g = { ...goal, id: `goal-${Date.now().toString(36)}` };
  write([...readGoals(mode), g]);
  return g;
}
export function updateGoal(mode: DemoMode, id: string, patch: Partial<SavingsGoal>) {
  write(readGoals(mode).map((g) => (g.id === id ? { ...g, ...patch, id } : g)));
}
export function removeGoal(mode: DemoMode, id: string) {
  write(readGoals(mode).filter((g) => g.id !== id));
}
export const resetGoals = () => write(null);

/** Months left at the goal's monthly amount, or null when nothing goes to it. */
export function monthsLeft(g: SavingsGoal) {
  const toGo = Math.max(0, g.target - g.saved);
  if (toGo === 0) return 0;
  // A monthly amount rounded down by a few cents (from the chat) should not push the goal a month later.
  return g.monthly > 0 ? Math.ceil(toGo / g.monthly - 0.05) : null;
}

/** The real month the goal is reached at its pace, as YYYY-MM-DD (the 1st), for plainFormat. */
export function reachedBy(g: SavingsGoal) {
  const m = monthsLeft(g);
  if (m === null) return null;
  const [y, mo] = todayIso().split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + m, 1)).toISOString().slice(0, 10);
}

/**
 * The saving plan with `delta` EUR a month more (or less) into the savings account, the monthly total split like the
 * Invest page does: the savings goal first, then money cheaper bills free up, then the weekly budget. With no plan yet,
 * a plan that only moves money to the savings account. Null when nothing is left in it.
 */
export function withSavingsAccount(plan: SavingsPlan | null, delta: number, freed: number): SavingsPlan | null {
  const funds = plan ? planFunds(plan) : [];
  const was = funds.find((f) => f.fundId === SAVINGS_ACCOUNT_ID)?.monthly ?? 0;
  const now = Math.max(0, Math.round(was + delta));
  const next = funds.filter((f) => f.fundId !== SAVINGS_ACCOUNT_ID);
  if (now > 0) next.push({ fundId: SAVINGS_ACCOUNT_ID, monthly: now });
  if (!next.length) return null;
  const monthly = next.reduce((s, f) => s + f.monthly, 0);
  const fromGoal = Math.min(monthly, DEFAULT_SAVINGS_GOAL_PER_MONTH);
  const fromBills = Math.min(Math.max(0, freed), monthly - fromGoal);
  return {
    monthly,
    fromGoal,
    fromBills,
    fromBudget: monthly - fromGoal - fromBills,
    funds: next,
    fundId: next[0].fundId,
    fundName: planLabel(next),
    dayOfMonth: plan?.dayOfMonth ?? 2,
    approvedAt: new Date().toISOString(),
  };
}

/** A plan's name in a list: "S-Pankki Passiivinen USA ESG Osake A", "Savings account", "2 funds and savings account". */
export function planLabel(funds: PlanFund[]) {
  const n = funds.filter((f) => f.fundId !== SAVINGS_ACCOUNT_ID).length;
  const account = funds.length > n;
  if (funds.length === 1) return fundById(funds[0].fundId).name;
  const fundsText = n === 1 ? fundById(funds.find((f) => f.fundId !== SAVINGS_ACCOUNT_ID)!.fundId).name : `${n} funds`;
  return account ? `${fundsText} and savings account` : fundsText;
}
