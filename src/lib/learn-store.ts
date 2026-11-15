"use client";

import { useSyncExternalStore } from "react";
import { demoHistory, streakDays, withPractice, type Done } from "@/lib/learn-game";
import type { DemoMode } from "@/lib/demo-mode";
import type { PackId } from "@/lib/learn";

// Which lessons and packs this person has finished, in this browser (a pack's id is its lesson id). Cleared by Reset demo.
export type LearnProgress = { done: Done };

const KEY = "solvo.learn.v1";
const EMPTY: LearnProgress = { done: {} };
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache = EMPTY;

function snapshot(): LearnProgress {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as LearnProgress) : EMPTY;
      if (!cache.done) cache = EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

function write(next: LearnProgress | null) {
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export const useLearnProgress = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

/** Marks a lesson (or a chat pack) as finished and today as a learning day, so playing again keeps the streak going. */
export function finishLesson(id: string, quizRight: boolean) {
  write({ done: withPractice(snapshot().done, id, quizRight) });
}
export const finishPack = (id: PackId, quizRight: boolean) => finishLesson(id, quizRight);

export function resetLearn() {
  write(null);
}

/** What Home's learning game shows: the demo customer's earlier days (Aino only), under what the person has finished themselves. */
export function useLearnDone(mode: DemoMode): Done {
  const stored = useLearnProgress().done;
  // The demo days keep their dates even when the person plays those lessons again (today then counts as a day of its own).
  return mode === "aino" ? { ...stored, ...demoHistory() } : stored;
}

/** Days in a row with a finished lesson; alive until a whole day passes without one. */
export const learnStreak = (p: LearnProgress, now = new Date()) => streakDays(p.done, now);
