// Where the forecast items come from on the server: the demo calendar (cookie, public, fictional) or the person's own Google
// Calendar (local only, see google-calendar.ts). Pages call getCalendarState() and pass only the forecast items to the browser:
// kind, date and an amount, never the event titles of a real calendar.
import "server-only";
import { cookies } from "next/headers";
import { CALENDAR_COOKIE, demoEvents } from "@/lib/calendar-demo";
import { todayIso } from "@/lib/demo-clock";
import { baselinesFrom, forecast, type ForecastItem } from "@/lib/forecast";
import { loadGoogleEvents } from "@/lib/google-calendar";
import { getEffective } from "@/lib/source-banks";

export type CalendarState = {
  mode: "demo" | "google" | null;
  items: ForecastItem[];
  today: string; // the real date
};

export async function getCalendarState(): Promise<CalendarState> {
  const today = todayIso();
  // Real Google Calendar wins when it is connected (local only: loadGoogleEvents is null otherwise). It is never mixed with the demo.
  const google = await loadGoogleEvents();
  const demo = (await cookies()).get(CALENDAR_COOKIE)?.value === "demo";
  if (!google && !demo) return { mode: null, items: [], today };
  const { customer } = await getEffective();
  const baselines = baselinesFrom(customer.transactions);
  if (google) return { mode: "google", items: forecast(google, baselines, today, "google"), today };
  return { mode: "demo", items: forecast(demoEvents(today), baselines, today, "demo", { keepTitle: true }), today };
}
