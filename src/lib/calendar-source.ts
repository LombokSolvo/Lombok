// Where the forecast items come from on the server: the person's own Google Calendar or a calendar link (both local only, never
// on Vercel). There is no simulated calendar: nothing is shown until the person connects a real one. A calendar FILE is read in the browser and never reaches the server
// (see calendar-file-store.ts), which is why the state also carries the person's baselines: the browser needs them to estimate.
// Pages call getCalendarState() and pass only forecast items and numbers to the browser: kind, date and an amount, never the event
// titles of a real calendar.
import "server-only";
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
  if (google) return { mode: "google", items: forecast(google, baselines, today, "google"), today, baselines };
  if (link) return { mode: "link", items: forecast(link, baselines, today, "link"), today, baselines };
  return { mode: null, items: [], today, baselines };
}
