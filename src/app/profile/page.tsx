import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { ForecastProvider } from "@/components/forecast-ui";
import { linkStatus } from "@/lib/ics-link";
import { getCalendarState } from "@/lib/calendar-source";
import { DEFAULT_SAVINGS_GOAL_PER_MONTH } from "@/lib/coach";
import { googleStatus } from "@/lib/google-calendar";
import { MAIN_CUSTOMER } from "@/lib/demo";
import { currentLinked, sandboxEnabled } from "@/lib/linked-bank";
import { liveStatus } from "@/lib/live-nordea";
import { getEffective } from "@/lib/source-banks";
import { ProfileClient } from "./profile-client";

export const metadata = { title: "Profile · Solvo" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ bank?: string; calendar?: string }> }) {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const c = MAIN_CUSTOMER;
  const { banks, view, local } = await getEffective();
  const { bank, calendar: calendarNotice } = await searchParams;
  const calendar = await getCalendarState();
  const linked = await currentLinked();
  return (
    <Screen>
      <ForecastProvider mode={calendar.mode} items={calendar.items} today={calendar.today} baselines={calendar.baselines}>
      <ProfileClient
        name="Aino Esimerkki"
        id={c.id}
        age={c.age}
        postalCode={c.postalCode}
        savingsGoal={DEFAULT_SAVINGS_GOAL_PER_MONTH}
        banks={banks}
        view={view}
        showBanks={!local}
        live={liveStatus()}
        calendar={{ google: googleStatus(), link: await linkStatus(), notice: calendarNotice ?? null }}
        linkedBank={{ enabled: sandboxEnabled(), linked: linked && { bank: linked.bank, validUntil: linked.validUntil }, notice: bank ?? null }}
      />
      </ForecastProvider>
    </Screen>
  );
}
