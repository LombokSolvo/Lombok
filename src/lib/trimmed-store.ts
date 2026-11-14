"use client";

import { useSyncExternalStore } from "react";

// Everyday spending the person has already turned into saving: "Cutting groceries by about €120 a month goes into the plan",
// approved from the chat's comparison card. Kept so the coach doesn't suggest the same cut again and the Save tab can tick it as
// done. Maps the line's id (restaurants, groceries, transport) to the euros a month that went into the plan. Lives in
// localStorage like the other demo stores; Reset demo clears it (resetDemo in switches.ts).

const KEY = "solvo.trimmed.v1";
const NONE: Record<string, number> = {};
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: Record<string, number> = NONE;

export function readTrimmed(): Record<string, number> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      cache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : NONE;
    } catch {
      cache = NONE;
    }
  }
  return cache;
}

function write(next: Record<string, number> | null) {
  try {
    if (next && Object.keys(next).length) window.localStorage.setItem(KEY, JSON.stringify(next));
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

export const useTrimmed = () => useSyncExternalStore(subscribe, readTrimmed, () => NONE);
export const addTrimmed = (id: string, monthly: number) => write({ ...readTrimmed(), [id]: monthly });
export function removeTrimmed(id: string) {
  const next = { ...readTrimmed() };
  delete next[id];
  write(next);
}
export const resetTrimmed = () => write(null);
