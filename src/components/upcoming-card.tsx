"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { CategoryIcon, ForecastEditSheet, useForecast } from "@/components/forecast-ui";
import type { CountedItem } from "@/lib/forecast";
import { Group, Row } from "@/components/solvo/ui";
import { MoneyBadge, SignedAmount } from "@/components/solvo/money-badge";
import { useCustomEvents } from "@/lib/calendar-store";
import { useOnboarding } from "@/lib/onboarding-store";
import { plainFormat } from "@/lib/demo-clock";
import { upcomingEvents, type Item } from "@/lib/schedule";

// Real calendar dates: formatted without the demo shift.
const dayLabel = plainFormat({ weekday: "short", day: "numeric", month: "short" });

/** On Home, always: the next money in and out, with a way into the full calendar. Not part of onboarding. */
export function UpcomingCard({ items, today }: { items: Item[]; today: string }) {
  // The dates the person confirmed in onboarding win over the guesses; their own added dates are always included.
  const confirmed = useOnboarding().items;
  const custom = useCustomEvents();
  // What the person's calendar expects (trips, dinners) is part of what is coming up, as an estimate.
  const { items: calendar, mode } = useForecast();
  const [open, setOpen] = useState<CountedItem | null>(null);
  const events = upcomingEvents(confirmed ?? items, custom, today, 21, mode ? 5 : 4, calendar);

  return (
    <Group
      title="Coming up"
      className="mt-4"
      aside={
        <Link href="/calendar" className="flex min-h-11 items-center gap-0.5 font-medium text-primary">
          Calendar
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      }
    >
      {events.length ? (
        events.map((e, idx) => {
          const when = e.date === today ? "Today" : dayLabel(e.date);
          // A calendar item is an estimate the person can change: tap it.
          if (e.forecast) {
            const f = e.forecast;
            return (
              <button key={e.id} type="button" onClick={() => setOpen(f)} className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-muted/60 ${idx ? "border-t" : ""}`}>
                <CategoryIcon category={f.category} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug font-medium">{f.detail ?? e.label}</span>
                  <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
                    <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                    {when}{f.detail ? ` · ${e.label}` : ""} · estimate
                  </span>
                </span>
                <SignedAmount kind="out" value={e.amount} />
              </button>
            );
          }
          return <Row key={e.id + e.date} className={idx ? "border-t" : ""} icon={<MoneyBadge kind={e.kind} />} title={e.label} subtitle={when} value={<SignedAmount kind={e.kind} value={e.amount} />} />;
        })
      ) : (
        <p className="px-4 py-4 text-[14px] text-muted-foreground">Nothing expected in the next three weeks. Open the calendar to add a date.</p>
      )}
      {open && <ForecastEditSheet item={open} onClose={() => setOpen(null)} />}
    </Group>
  );
}
