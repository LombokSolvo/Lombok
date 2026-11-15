import { Suspense } from "react";
import { connection } from "next/server";
import { ForecastProvider } from "@/components/forecast-ui";
import { PAGE } from "@/components/solvo/ui";
import { getCalendarState } from "@/lib/calendar-source";
import { offsetDays, todayIso } from "@/lib/demo-clock";
import { scheduleFor } from "@/lib/schedule-server";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { CalendarClient } from "./calendar-client";

export const metadata = { title: "Calendar · Solvo" };

// The server works out the usual dates from the transactions; only the dates and amounts reach the phone.
export default function CalendarPage() {
  return (
    <Suspense fallback={<main className={PAGE} />}>
      <Calendar />
    </Suspense>
  );
}

async function Calendar() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { customer: c } = await getEffective(await pageMode());
  const calendar = await getCalendarState();
  return (
    <ForecastProvider mode={calendar.mode} items={calendar.items} today={calendar.today} baselines={calendar.baselines} demoFile={calendar.demoFile}>
      <CalendarClient items={scheduleFor(c).items} today={todayIso()} offset={offsetDays()} />
    </ForecastProvider>
  );
}
