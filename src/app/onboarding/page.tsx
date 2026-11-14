import { Suspense } from "react";
import { connection } from "next/server";
import { ForecastProvider } from "@/components/forecast-ui";
import { PAGE } from "@/components/solvo/ui";
import { getCalendarState } from "@/lib/calendar-source";
import { googleStatus } from "@/lib/google-calendar";
import { linkStatus } from "@/lib/ics-link";
import { inferProfile } from "@/lib/profile";
import { scheduleFor } from "@/lib/schedule-server";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { OnboardingClient } from "./onboarding-client";

export const metadata = { title: "Your plan · Solvo" };

// Runs on the server: the transactions never reach the phone, only the profile, the usual dates and a few
// monthly numbers.
export default function OnboardingPage({ searchParams }: { searchParams: Promise<{ calendar?: string }> }) {
  return (
    <Suspense fallback={<main className={PAGE} />}>
      <Onboarding searchParams={searchParams} />
    </Suspense>
  );
}

async function Onboarding({ searchParams }: { searchParams: Promise<{ calendar?: string }> }) {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { customer: c, local, mode, cookieBanks: banks, view } = await getEffective(await pageMode());
  const calendar = await getCalendarState();
  const { calendar: calendarNotice } = await searchParams;
  const profile = inferProfile(c);
  const schedule = scheduleFor(c);
  const base = {
    // Same inputs as the home page's safe-to-spend, so the plan and the headline number agree.
    incomeMonthly: Math.round(c.summary.salaryYear / 12),
    fixedRegularMonthly: Math.round(c.summary.basketYear[1] / 12),
    irregularMonthly: Math.round(c.summary.basketYear[2] / 12),
    everydayMonthly: Math.round(c.summary.basketYear[3] / 12),
    cashBalance: profile.cashBalance === null ? null : Math.round(profile.cashBalance),
    investsMonthlyToday: Math.round(profile.investsMonthly),
  };
  return (
    <ForecastProvider mode={calendar.mode} items={calendar.items} today={calendar.today} baselines={calendar.baselines}>
      <OnboardingClient profile={profile} base={base} schedule={schedule} local={local} askConnect={mode === "new"} banks={banks} view={view} calendar={{ google: googleStatus(), link: await linkStatus(), notice: calendarNotice ?? null }} />
    </ForecastProvider>
  );
}
