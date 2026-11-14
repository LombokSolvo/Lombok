import { Screen } from "@/components/solvo/screen";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, CalendarDays, MessageCircle } from "lucide-react";
import { LiveBudgetStatus, LiveMonthBar, LiveMonthEuro, LivePerDay, ResetDemoButton } from "@/components/live-budget";
import { AllBanksCard } from "@/components/all-banks-card";
import { LinkedBankCard } from "@/components/linked-bank-card";
import { OnboardingGate, PlanCard } from "@/components/onboarding-home";
import { OverdueBillCard } from "@/components/overdue-bill";
import { ConnectCalendarNudge, ForecastNote, ForecastProvider } from "@/components/forecast-ui";
import { UpcomingCard } from "@/components/upcoming-card";
import { CompareSummary } from "@/components/compare-card";
import { Group, IconTile, Logo, PAGE, Row, Slab, eur } from "@/components/solvo/ui";
import { compareAgainst, ownGroups } from "@/lib/cohorts";
import { monthSoFar, safeToSpend } from "@/lib/coach";
import type { Basket } from "@/lib/demo";
import { plainFormat, todayIso } from "@/lib/demo-clock";
import { getCalendarState } from "@/lib/calendar-source";
import { scheduleFor } from "@/lib/schedule-server";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

const BASKET_COLOR: Record<Basket, string> = { 1: "bg-chart-1", 2: "bg-chart-2", 3: "bg-chart-4" };
const SAVINGS_COLOR = "bg-sky-600"; // savings, its own colour so it reads apart from the three baskets

export default function Home() {
  return (
    <Suspense fallback={<main className={PAGE} />}>
      <HomeScreen />
    </Suspense>
  );
}

async function HomeScreen() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { base, customer: c, local, real, banks, view, bankName, mode } = await getEffective(await pageMode());
  const calendar = await getCalendarState();
  const s = safeToSpend(c);
  const schedule = scheduleFor(c);
  const compareGroup = local ? null : compareAgainst(c, ownGroups(c).age ?? "all");
  // How the monthly salary is split, for the bar and the shares on "Your money each month".
  const split = [
    { color: BASKET_COLOR[1], amount: s.fixedRegularPerMonth },
    { color: BASKET_COLOR[2], amount: s.irregularSetAsidePerMonth },
    { color: SAVINGS_COLOR, amount: s.savingsGoalPerMonth },
    { color: BASKET_COLOR[3], amount: Math.max(0, s.everydayBudgetPerMonth) },
  ];
  const splitTotal = split.reduce((sum, x) => sum + x.amount, 0) || 1;
  const share = (v: number) => `${Math.round((Math.max(0, v) / Math.max(s.incomePerMonth, 1)) * 100)}% of salary`;
  // Safe to spend is counted for the REAL month (the demo clock shows real dates): its days so far map onto the data's last days.
  const realToday = todayIso();
  const month = monthSoFar(c, realToday, s.everydayBudgetPerMonth);
  const monthName = plainFormat({ month: "long" })(realToday);

  return (
    <Screen>
      <ForecastProvider mode={calendar.mode} items={calendar.items} today={calendar.today} baselines={calendar.baselines}>
      <main className={PAGE}>
        <OnboardingGate />
        {local && (
          <p className="mb-2 rounded-xl bg-[#5a1a12] px-3 py-2 text-center text-[12px] font-medium text-white">
            Your real bank data, local only. Do not share or record this screen.
          </p>
        )}
        <header className="flex h-11 items-center justify-between">
          <Logo />
          <span className="text-[13px] text-muted-foreground">{fmtDate(c.asOf)}</span>
        </header>

        {/* The one number: what is left of this month's everyday money, in plain words, and whether that is on track. */}
        <Slab className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15px] text-white/70">Left to spend in {monthName}</p>
            <Link
              href="/calendar"
              className="-mt-1 -mr-1 flex h-11 items-center gap-1.5 rounded-full bg-white/12 px-3.5 text-[14px] font-medium text-white active:bg-white/20"
            >
              <CalendarDays className="size-[18px]" aria-hidden />
              Calendar
            </Link>
          </div>
          <p className="num animate-rise mt-1 font-display text-[64px] leading-none font-semibold tracking-[-0.035em]">
            <LiveMonthEuro base={month.remaining} signed />
          </p>
          <LivePerDay remaining={month.remaining} daysLeft={month.daysLeft} month={monthName} className="mt-2 text-[15px] text-white/75" />
          <LiveBudgetStatus spent={month.spent} budget={month.budget} day={month.day} daysInMonth={month.daysInMonth} className="mt-3" />

          <div className="mt-5">
            <LiveMonthBar spent={month.spent} budget={month.budget} />
          </div>
          <ForecastNote className="mt-2" />
        </Slab>

        <PlanCard />

        <AllBanksCard base={base} banks={banks} view={view} bankName={bankName} real={real} />

        <Suspense fallback={null}>
          <LinkedBankCard />
        </Suspense>

        {/* The dentist e-invoice and its call are part of Aino's demo story only. A compact row, below the plan and banks. */}
        {mode === "aino" && <OverdueBillCard asOf={c.asOf} />}

        <UpcomingCard items={schedule.items} today={realToday} />

        <ConnectCalendarNudge />

        {/* Where the salary goes: the budget and the three baskets in one card */}
        <Group
          title="Your money each month"
          aside="last 12 months"
        >
          {/* The salary split: bills, irregular set-aside, savings goal, and what is left for everyday */}
          <div className="px-4 pt-4 pb-1">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {split.map((x) => (
                <div key={x.color} className={x.color} style={{ width: `${(x.amount / splitTotal) * 100}%` }} />
              ))}
            </div>
          </div>
          <Row title="Salary" value={eur.format(s.incomePerMonth)} />
          <Row
            icon={<span className={`size-2.5 shrink-0 rounded-full ${BASKET_COLOR[1]}`} aria-hidden />}
            title="Fixed and regular bills"
            value={`−${eur.format(s.fixedRegularPerMonth)}`}
            valueSub={share(s.fixedRegularPerMonth)}
          />
          <Row
            icon={<span className={`size-2.5 shrink-0 rounded-full ${BASKET_COLOR[2]}`} aria-hidden />}
            title="Set aside for irregular costs"
            value={`−${eur.format(s.irregularSetAsidePerMonth)}`}
            valueSub={share(s.irregularSetAsidePerMonth)}
          />
          <Row
            icon={<span className={`size-2.5 shrink-0 rounded-full ${SAVINGS_COLOR}`} aria-hidden />}
            title="Savings goal"
            value={`−${eur.format(s.savingsGoalPerMonth)}`}
            valueSub={share(s.savingsGoalPerMonth)}
          />
          <Row
            icon={<span className={`size-2.5 shrink-0 rounded-full ${BASKET_COLOR[3]}`} aria-hidden />}
            title={<span className="font-semibold">Everyday budget</span>}
            value={<span className="font-semibold">{eur.format(s.everydayBudgetPerMonth)}</span>}
            valueSub={share(s.everydayBudgetPerMonth)}
          />
          <Link
            href="/costs"
            transitionTypes={["nav-forward"]}
            className="flex min-h-12 items-center justify-between border-t px-4 text-[15px] font-semibold text-primary active:bg-muted"
          >
            See every cost in detail
            <ArrowRight className="size-[18px]" aria-hidden />
          </Link>
        </Group>

        {/* Coach chat entry */}
        <section className="mt-4">
          <Link
            href="/coach"
            transitionTypes={["nav-forward"]}
            className="flex h-14 items-center gap-3 rounded-2xl bg-card px-4 shadow-[0_1px_3px_rgba(15,42,31,0.06)] active:bg-muted"
          >
            <IconTile>
              <MessageCircle />
            </IconTile>
            <span className="flex-1 text-[15px] text-muted-foreground">Ask Solvo about your money</span>
          </Link>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {[
              "How much did I spend on taxis?",
              "Can I afford an €80 dinner this week?",
              "Where could I save the most?",
            ].map((q) => (
              <Link
                key={q}
                href={`/coach?q=${encodeURIComponent(q)}`}
                transitionTypes={["nav-forward"]}
                className="flex h-11 shrink-0 items-center rounded-full border border-border bg-card/60 px-3.5 text-[13px] font-medium whitespace-nowrap text-foreground/80 active:bg-muted"
              >
                {q}
              </Link>
            ))}
          </div>
        </section>

        {/* Group statistics only, and only for the synthetic customers (a private local customer has no age). */}
        {!local && compareGroup && <CompareSummary group={compareGroup} />}

        <footer className="mt-6 px-1 text-[13px]">
          <ResetDemoButton className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4" />
        </footer>
      </main>
      </ForecastProvider>
    </Screen>
  );
}
