import { Suspense } from "react";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { ForecastProvider } from "@/components/forecast-ui";
import { getCalendarState } from "@/lib/calendar-source";
import { safeToSpend } from "@/lib/coach";
import { pageMode } from "@/lib/source";
import { getDemoEffective } from "@/lib/source-banks";
import { CallClient } from "./call-client";

export const metadata = { title: "Solvo is calling" };

export default async function CallPage() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  return (
    <Suspense fallback={<main className="min-h-dvh bg-slab" />}>
      <CallScreen />
    </Suspense>
  );
}

async function CallScreen() {
  // Synthetic data only: the numbers on this page are spoken to the ElevenLabs agent, so they never come from a real bank
  // (getDemoEffective never merges the local real Nordea).
  const { customer } = await getDemoEffective(await pageMode());
  const s = safeToSpend(customer);
  const calendar = await getCalendarState();
  const twoWay = !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID);
  return (
    <Screen>
      <ForecastProvider mode={calendar.mode} items={calendar.items} today={calendar.today} baselines={calendar.baselines}>
        <CallClient
          twoWay={twoWay}
          remaining={s.remaining}
          weeklyBudget={s.weeklyBudget}
          irregularPerMonth={s.irregularSetAsidePerMonth}
          asOf={customer.asOf}
        />
      </ForecastProvider>
    </Screen>
  );
}
