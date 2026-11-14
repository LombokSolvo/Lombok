"use client";

import { useSyncExternalStore } from "react";
import type { Choices } from "@/lib/forecast";

// What the person decided about each forecast item: not counted at all, or their own amount. Keyed by the item's id, so it
// survives a reload and a refresh of the calendar. localStorage like the rest of the demo's state; "Reset demo" clears it.

const KEY = "solvo.forecast.v1";
const EMPTY: Choices = {};
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: Choices = EMPTY;

function snapshot(): Choices {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as Choices) : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function write(next: Choices | null) {
  try {
    if (next && Object.keys(next).length) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode etc.: nothing persists, but the page keeps working.
  }
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

export const useChoices = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

/** Changes one item. `amount: null` goes back to the estimate. */
export function setChoice(id: string, patch: { dismissed?: boolean; amount?: number | null }) {
  const now = { ...snapshot() };
  const next = { ...now[id] };
  if (patch.dismissed !== undefined) next.dismissed = patch.dismissed || undefined;
  if (patch.amount !== undefined) next.amount = patch.amount === null ? undefined : patch.amount;
  if (next.dismissed === undefined && next.amount === undefined) delete now[id];
  else now[id] = JSON.parse(JSON.stringify(next));
  write(now);
}

export const resetForecast = () => write(null);
