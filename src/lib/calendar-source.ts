// Where the forecast items come from on the server: the person's own Google Calendar or a calendar link (both local only, never
// on Vercel). There is no simulated calendar: nothing is shown until the person connects a real one. A calendar FILE is read in the browser and never reaches the server
// (see calendar-file-store.ts), which is why the state also carries the person's baselines: the browser needs them to estimate.
// Pages call getCalendarState() and pass only forecast items and numbers to the browser: kind, date, an amount and the event title,
// which is shown on this computer's own screen (the calendar says "Dinner @ Cella", like the person's own calendar does). Titles
// never go to the coach or any model, and are never logged.
import "server-only";
import { DEMO_CALENDAR_NAME, demoCalendarFor } from "@/data/demo-calendar";
import type { CalendarFile } from "@/lib/calendar-file-store";
import { todayIso } from "@/lib/demo-clock";
import { baselinesFrom, forecast, type Baselines, type ForecastItem } from "@/lib/forecast";
import { loadGoogleEvents } from "@/lib/google-calendar";
import { loadLinkEvents } from "@/lib/ics-link";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";

export type CalendarState = {
  mode: "google" | "link" | null;
  items: ForecastItem[];
  today: string; // the real date
  baselines: Baselines; // numbers from the person's own payments
  /** Aino's demo calendar, used in the browser like a chosen file when the person has not chosen or removed one. Aino only. */
  demoFile: CalendarFile | null;
};

/** What the person's own payments say about restaurants, tickets and trips. Numbers only. */
export async function baselinesFor(): Promise<Baselines> {
  const { customer } = await getEffective(await pageMode());
  return baselinesFrom(customer.transactions);
}

export async function getCalendarState(): Promise<CalendarState> {
  const today = todayIso();
  // Google wins over a link. Both loaders return null unless they are local and connected.
  const google = await loadGoogleEvents();
  const link = google ? null : await loadLinkEvents();
  const baselines = await baselinesFor();
  const demoFile = (await pageMode()) === "aino" ? demoFileFor(today) : null;
  if (google) return { mode: "google", items: forecast(google, baselines, today, "google", { keepTitle: true }), today, baselines, demoFile };
  if (link) return { mode: "link", items: forecast(link, baselines, today, "link", { keepTitle: true }), today, baselines, demoFile };
  return { mode: null, items: [], today, baselines, demoFile };
}

function demoFileFor(today: string): CalendarFile {
  const events = demoCalendarFor(today);
  return { name: DEMO_CALENDAR_NAME, importedAt: `${today}T08:00:00.000Z`, found: events.length + 4, events };
}
