import { Suspense } from "react";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { ForecastProvider } from "@/components/forecast-ui";
import { PAGE } from "@/components/solvo/ui";
import { getCalendarState } from "@/lib/calendar-source";
import { googleStatus } from "@/lib/google-calendar";
import { linkStatus } from "@/lib/ics-link";
import { DEFAULT_SAVINGS_GOAL_PER_MONTH } from "@/lib/coach";
import { currentLinked, sandboxEnabled } from "@/lib/linked-bank";
import { liveStatus } from "@/lib/live-nordea";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { ProfileClient } from "./profile-client";

export const metadata = { title: "Profile · Solvo" };

export default function ProfilePage({ searchParams }: { searchParams: Promise<{ bank?: string; calendar?: string }> }) {
  return (
    <Screen>
      <Suspense fallback={<main className={PAGE} />}>
        <Profile searchParams={searchParams} />
      </Suspense>
    </Screen>
  );
}

async function Profile({ searchParams }: { searchParams: Promise<{ bank?: string; calendar?: string }> }) {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { customer: c, cookieBanks, view } = await getEffective(await pageMode());
  const { bank, calendar: calendarNotice } = await searchParams;
  const calendar = await getCalendarState();
  const linked = await currentLinked();
  return (
    <ForecastProvider mode={calendar.mode} items={calendar.items} today={calendar.today} baselines={calendar.baselines}>
    <ProfileClient
      name="Aino Esimerkki"
      id={c.id}
      age={c.age}
      postalCode={c.postalCode}
      savingsGoal={DEFAULT_SAVINGS_GOAL_PER_MONTH}
      banks={cookieBanks}
      view={view}
      showBanks
      live={liveStatus()}
      calendar={{ google: googleStatus(), link: await linkStatus(), notice: calendarNotice ?? null }}
      linkedBank={{ enabled: sandboxEnabled(), linked: linked && { bank: linked.bank, validUntil: linked.validUntil }, notice: bank ?? null }}
    />
    </ForecastProvider>
  );
}
