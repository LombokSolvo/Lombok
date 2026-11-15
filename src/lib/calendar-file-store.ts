"use client";

import { useSyncExternalStore } from "react";
import type { CalendarEvent } from "@/lib/forecast";

// A calendar file the person chose (.ics). It is read in the browser and never uploaded: this store is the only place it lives, on
// their own device. Only the events that look like spending are kept (the rest of the file is dropped at once), with their titles
// so the person recognises them. "Reset demo" and "Remove" clear it.

export type CalendarFile = {
  name: string; // the file's name, for the status line
  importedAt: string; // ISO timestamp
  found: number; // events in the window, for "found 14 events"
  events: CalendarEvent[]; // only those that look like spending
};

const KEY = "solvo.calfile.v1";
const listeners = new Set<() => void>();
// "Remove the file" stores this marker instead of nothing, so Aino's demo calendar stays off until Reset demo clears the key.
type Stored = { file: CalendarFile | null; removed: boolean };
const NONE: Stored = { file: null, removed: false };
let cacheRaw: string | null = null;
let cache: Stored = NONE;

function snapshot(): Stored {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const v = raw ? JSON.parse(raw) : null;
      cache = !v ? NONE : v.removed ? { file: null, removed: true } : { file: v as CalendarFile, removed: false };
    } catch {
      cache = NONE;
    }
  }
  return cache;
}

function write(next: CalendarFile | { removed: true } | null) {
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode etc.: nothing persists, but the page keeps working for this visit.
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

export const useCalendarFile = () => useSyncExternalStore(subscribe, snapshot, () => NONE).file;
/** The chosen file, else the demo calendar unless the person removed it. */
export const useCalendarFileOr = (demo: CalendarFile | null) => {
  const s = useSyncExternalStore(subscribe, snapshot, () => NONE);
  return s.file ?? (s.removed ? null : demo);
};
export const saveCalendarFile = (f: CalendarFile) => write(f);
/** "Remove the file": also keeps the demo calendar off. */
export const removeCalendarFile = () => write({ removed: true });
/** Reset demo: back to the start, demo calendar included. */
export const clearCalendarFile = () => write(null);
