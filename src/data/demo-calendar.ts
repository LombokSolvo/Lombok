// Aino's calendar in the demo: the spending events of public/demo/aino-calendar.ics (fictional, a test keeps the two the same).
// They are written against 15 Nov 2026 and moved to the real date, so the calendar always looks a few weeks ahead. Aino only; a real
// calendar (Google, link or a file the person chooses) replaces it, and Profile's "Remove the file" turns it off until Reset demo.
import type { CalendarEvent } from "@/lib/forecast";

export const DEMO_CALENDAR_ANCHOR = "2026-11-15";
export const DEMO_CALENDAR_NAME = "aino-calendar.ics";

export const DEMO_CALENDAR: CalendarEvent[] = [
  { id: "demo-dinner", title: "Dinner with friends", start: "2026-11-20T19:00:00", end: "2026-11-20T22:00:00", allDay: false },
  { id: "demo-birthday", title: "Mum's birthday", start: "2026-11-28", end: "2026-11-29", allDay: true },
  { id: "demo-lunch", title: "Lunch with Sanna", start: "2026-12-01T11:30:00", end: "2026-12-01T12:30:00", allDay: false },
  { id: "demo-trip", title: "Trip to Lapland", start: "2026-12-04", end: "2026-12-08", allDay: true },
  { id: "demo-movie", title: "Movie night with Emma", start: "2026-12-09T18:30:00", end: "2026-12-09T21:00:00", allDay: false },
  { id: "demo-xmasparty", title: "Office Christmas party", start: "2026-12-11T17:00:00", end: "2026-12-11T23:00:00", allDay: false },
  { id: "demo-wedding", title: "Juha and Liisa's wedding", start: "2026-12-12", end: "2026-12-13", allDay: true },
  { id: "demo-concert", title: "Concert with Mikko", start: "2026-12-16T19:00:00", end: "2026-12-16T21:30:00", allDay: false },
  { id: "demo-drinks", title: "After work drinks", start: "2026-12-18T16:30:00", end: "2026-12-18T19:00:00", allDay: false },
  { id: "demo-housewarming", title: "Housewarming at Tom's", start: "2026-12-19T17:00:00", end: "2026-12-19T22:00:00", allDay: false },
];

const DAY = 86_400_000;
const move = (s: string, days: number) => {
  const d = new Date(Date.parse(`${s.slice(0, 10)}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
  return d + s.slice(10);
};

/** The demo events moved by (today minus the anchor) days. `today` is the real date, YYYY-MM-DD. */
export function demoCalendarFor(today: string): CalendarEvent[] {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${DEMO_CALENDAR_ANCHOR}T00:00:00Z`)) / DAY);
  return DEMO_CALENDAR.map((e) => ({ ...e, start: move(e.start, days), end: move(e.end, days) }));
}
