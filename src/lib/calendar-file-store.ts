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
let cacheRaw: string | null = null;
let cache: CalendarFile | null = null;

function snapshot(): CalendarFile | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cache = raw ? (JSON.parse(raw) as CalendarFile) : null;
    } catch {
      cache = null;
    }
  }
  return cache;
}

function write(next: CalendarFile | null) {
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

export const useCalendarFile = () => useSyncExternalStore(subscribe, snapshot, () => null);
export const saveCalendarFile = (f: CalendarFile) => write(f);
export const clearCalendarFile = () => write(null);
