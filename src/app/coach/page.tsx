import { Suspense } from "react";
import { connection } from "next/server";
import { ForecastProvider } from "@/components/forecast-ui";
import { safeToSpend } from "@/lib/coach";
import { Screen } from "@/components/solvo/screen";
import { getCalendarState } from "@/lib/calendar-source";
import { learnContext } from "@/lib/learn-context";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { CoachClient } from "./coach-client";

export const metadata = { title: "Ask Solvo" };

export default function CoachPage() {
  return (
    <Screen>
      <Suspense fallback={<main className="flex min-h-dvh flex-1 flex-col" />}>
        <Coach />
      </Suspense>
    </Screen>
  );
}

async function Coach() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const mode = await pageMode();
  const { customer } = await getEffective(mode);
  // The calendar set-aside, so the chat's safe-to-spend matches Home's. Only its weekly total is sent with a question, never
  // the events.
  const calendar = await getCalendarState();
  // Only the few numbers the learning packs show reach the browser, never transactions.
  // The base safe-to-spend, so a stopped subscription can show the weekly number going up (the browser adds its own choices).
  return (
    <ForecastProvider mode={calendar.mode} items={calendar.items} today={calendar.today} baselines={calendar.baselines} demoFile={calendar.demoFile}>
      <CoachClient learn={learnContext(customer, mode)} mode={mode} remaining={safeToSpend(customer).remaining} />
    </ForecastProvider>
  );
}
