// The DEMO calendar: a few fictional events placed relative to the real date, so the forecast has something to work on without
// anyone connecting a Google account. Nothing here is real or personal. It is opt-in (Profile > Calendar) and always labelled "Demo".
// The choice lives in a cookie because the pages render on the server and need to know (same pattern as the simulated banks).
import type { CalendarEvent } from "@/lib/forecast";

export const CALENDAR_COOKIE = "solvo_calendar"; // "demo" when the person connected the demo calendar

const DAY = 86_400_000;
const plus = (today: string, n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const at = (today: string, n: number, time: string) => `${plus(today, n)}T${time}:00+02:00`;

/** Fictional events, spread over the coming month. Two of them are on purpose not spending, to show the filter. */
export function demoEvents(today: string): CalendarEvent[] {
  const timed = (id: string, title: string, n: number, from: string, to: string): CalendarEvent => ({ id: `demo-${id}`, title, start: at(today, n, from), end: at(today, n, to), allDay: false });
  return [
    timed("lunch", "Team lunch", 2, "12:00", "13:00"),
    timed("dentist", "Dentist check-up", 3, "09:00", "09:45"),
    timed("birthday", "Birthday dinner for Mia", 6, "19:00", "22:00"),
    timed("concert", "Concert: Aurora Nights", 11, "20:00", "23:00"),
    timed("planning", "Planning meeting", 12, "10:00", "11:00"),
    { id: "demo-trip", title: "Weekend trip to Tallinn", start: plus(today, 19), end: plus(today, 22), allDay: true },
  ];
}

/** Browser only. */
export const writeCalendarCookie = (on: boolean) => {
  document.cookie = on ? `${CALENDAR_COOKIE}=demo; path=/; max-age=31536000; samesite=lax` : `${CALENDAR_COOKIE}=; path=/; max-age=0`;
};
export const readCalendarCookie = () => document.cookie.split("; ").some((c) => c === `${CALENDAR_COOKIE}=demo`);
