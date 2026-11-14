"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Pencil, Repeat, Trash2 } from "lucide-react";
import { CategoryIcon, ForecastEditSheet, useForecast } from "@/components/forecast-ui";
import type { DayResult } from "@/app/api/day/route";
import { NumberField } from "@/components/solvo/fields";
import { MoneyBadge, SignedAmount } from "@/components/solvo/money-badge";
import { Sheet } from "@/components/solvo/sheet";
import { BackLink, Group, PAGE, PageTitle, Row, TopBar, eur } from "@/components/solvo/ui";
import { addCustomEvent, removeCustomEvent, useCustomEvents } from "@/lib/calendar-store";
import { plainFormat, shiftIso } from "@/lib/demo-clock";
import type { CountedItem } from "@/lib/forecast";
import { useOnboarding } from "@/lib/onboarding-store";
import { daysIn, eventsForMonth, isoDay, ordinal, type CustomEvent, type DayEvent, type Item } from "@/lib/schedule";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
// These show REAL calendar dates, so they must not go through the demo clock's shift (see src/lib/demo-clock.ts).
const real = (o: Intl.DateTimeFormatOptions) => {
  const f = plainFormat(o);
  return { format: (d: Date) => f(d.toISOString().slice(0, 10)) };
};
const monthName = real({ month: "long", year: "numeric" });
const dayName = real({ weekday: "long", day: "numeric", month: "long" });
const shortDay = real({ weekday: "short", day: "numeric", month: "short" });
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);

// `today` is the real date. `offset` is how many days the demo data lags behind it, to find what happened on a past day.
export function CalendarClient({ items: detected, today: asOf, offset }: { items: Item[]; today: string; offset: number }) {
  // Items the person confirmed in onboarding win over the guesses.
  const confirmed = useOnboarding().items;
  const items = confirmed ?? detected;
  const custom = useCustomEvents();

  const today = parse(asOf);
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth());
  const [openDay, setOpenDay] = useState<string | null>(null);

  const { items: forecast, mode, reserve } = useForecast();
  const countedForecast = forecast.filter((f) => f.counted && f.date >= asOf);
  const events = eventsForMonth(items, custom, year, month, forecast);
  const byDate = new Map<string, DayEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  // Calendar items the person switched off stay visible (so they can be switched back on) but are not counted.
  const counted = events.filter((e) => e.counted !== false);
  const totalIn = counted.filter((e) => e.kind === "in").reduce((s, e) => s + e.amount, 0);
  const totalOut = counted.filter((e) => e.kind === "out").reduce((s, e) => s + e.amount, 0);

  const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday first
  const cells = [...Array.from({ length: first }, () => 0), ...Array.from({ length: daysIn(year, month) }, (_, i) => i + 1)];
  const shift = (by: number) => {
    const d = new Date(Date.UTC(year, month + by, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  };
  const nav = "flex size-11 items-center justify-center rounded-full active:bg-muted";
  const heading = monthName.format(new Date(Date.UTC(year, month, 1)));

  return (
    <main className={PAGE}>
      <TopBar back={<BackLink href="/" label="Home" />} />
      <PageTitle title="Calendar">Tap any day to see what is expected and what you spent. Add your own dates there.</PageTitle>
      {mode && (
        <p className="-mt-2 mb-4 rounded-xl bg-accent px-3 py-2.5 text-[13px] leading-snug text-accent-foreground">
          <span className="flex items-center gap-2 font-medium">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            {`From ${mode === "google" ? "your Google Calendar" : mode === "link" ? "your calendar link" : "your calendar file"}`}
          </span>
          <span className="mt-1 block">
            {countedForecast.length
              ? `Icons mark trips, dinners and events. Solvo sets aside ${eur.format(Math.round(reserve))} a week for them, as estimates. Tap a day to change one.`
              : "Nothing in the next 45 days looks like spending."}
          </span>
        </p>
      )}

      <section className="rounded-2xl bg-card p-3 shadow-[0_1px_3px_rgba(15,42,31,0.06)]" aria-label={heading}>
        <div className="flex items-center justify-between">
          <button type="button" className={nav} onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em]">{heading}</h2>
          <button type="button" className={nav} onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 text-center text-[12px] font-medium text-muted-foreground" aria-hidden>
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const iso = isoDay(year, month, d);
            const evs = byDate.get(iso) ?? [];
            const isToday = iso === asOf;
            // A trip of several days is one long line from its first day to its last, with the icon at the right end, in its own lane below the markers. The line is
            // drawn per day cell: from the middle of the first day, across the full width of the days between, to the icon in the
            // middle of the last day, and it carries on at the start of the next week if the trip wraps.
            const span = countedForecast.find((f) => f.endDate && f.date <= iso && iso <= f.endDate);
            const spanStart = !!span && span.date === iso;
            const spanEnd = !!span && span.endDate === iso;
            const singles = evs.filter((e) => e.forecast && e.counted !== false && !e.forecast.endDate);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setOpenDay(iso)}
                aria-label={`${dayName.format(parse(iso))}${evs.length ? `, ${evs.length} ${evs.length === 1 ? "event" : "events"}` : ""}${span && !spanStart ? `, ${span.label} continues` : ""}`}
                className={`group relative flex w-full flex-col items-center justify-start gap-0.5 pt-1.5 text-[15px] ${span ? "h-[80px]" : "h-[60px]"}`}
              >
                <span aria-hidden className={`absolute inset-y-0 left-1/2 w-12 -translate-x-1/2 rounded-xl group-active:bg-muted ${isToday ? "bg-accent ring-1 ring-primary/40" : ""}`} />
                <span className={`num relative ${isToday ? "font-semibold" : ""}`}>{d}</span>
                <span className="relative flex h-[22px] w-full items-center justify-center gap-0.5">
                  {evs.some((e) => e.kind === "in") && <MoneyBadge kind="in" size="sm" />}
                  {evs.some((e) => e.kind === "out" && !e.forecast && e.counted !== false) && <MoneyBadge kind="out" size="sm" />}
                  {[...new Set(singles.map((e) => (e.forecast as CountedItem).category))].slice(0, 2).map((c) => (
                    <CategoryIcon key={c} category={c} size="sm" />
                  ))}
                </span>
                {/* The trip has its own lane under the day's markers, so a bill on the same day never sits on the line. */}
                {span && (
                  <span className="relative flex h-[22px] w-full items-center justify-center">
                    <span
                      aria-hidden
                      className={`absolute inset-y-[8px] bg-warn/35 ${spanStart ? "left-1/2 rounded-l-full" : "left-0"} ${spanEnd ? "right-1/2 rounded-r-full" : "right-0"}`}
                    />
                    {spanEnd && <CategoryIcon category={span.category} size="sm" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between border-t px-1 pt-3 text-[14px]">
          <span className="text-muted-foreground">This month</span>
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <MoneyBadge kind="in" size="sm" />
              <SignedAmount kind="in" value={totalIn} />
            </span>
            <span className="flex items-center gap-1.5">
              <MoneyBadge kind="out" size="sm" />
              <SignedAmount kind="out" value={totalOut} />
            </span>
          </span>
        </div>
      </section>

      <Group title="This month" footer="Tap a line or any day to open it.">
        {events.length ? (
          events.map((e) => (
            <button key={e.id + e.date} type="button" onClick={() => setOpenDay(e.date)} className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left [&+&]:border-t ${e.counted === false ? "opacity-55" : ""}`}>
              {e.forecast ? <CategoryIcon category={e.forecast.category} /> : <MoneyBadge kind={e.kind} />}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-medium">{e.forecast?.detail ?? e.label}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {e.forecast?.detail ? `${e.label} · ` : ""}
                  {shortDay.format(parse(e.date))}
                  {e.forecast?.endDate ? ` to ${shortDay.format(parse(e.forecast.endDate))}` : ""}
                  {e.forecast && (e.counted === false ? " · not counted" : " · estimate")}
                </span>
              </span>
              <SignedAmount kind={e.kind} value={e.amount} />
            </button>
          ))
        ) : (
          <p className="px-4 py-4 text-[14px] text-muted-foreground">Nothing expected this month. Tap a day to add something.</p>
        )}
      </Group>

      {openDay && <DaySheet key={openDay} date={openDay} asOf={asOf} offset={offset} events={byDate.get(openDay) ?? []} custom={custom} onClose={() => setOpenDay(null)} />}
    </main>
  );
}

/** One day: what is expected (money in and out), what really happened if the day has passed, and a way to add a date. */
function DaySheet({ date, asOf, offset, events, custom, onClose }: { date: string; asOf: string; offset: number; events: DayEvent[]; custom: CustomEvent[]; onClose: () => void }) {
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CountedItem | null>(null);
  // A trip that started on an earlier day and is still on.
  const through = useForecast().items.filter((f) => f.counted && f.endDate && f.date < date && date <= f.endDate);
  const past = date <= asOf;
  const [actual, setActual] = useState<DayResult | "loading" | "error">("loading");

  useEffect(() => {
    if (!past) return;
    const ac = new AbortController();
    fetch(`/api/day?date=${shiftIso(date, -offset)}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<DayResult>) : Promise.reject(new Error("bad response"))))
      .then(setActual)
      .catch(() => {
        if (!ac.signal.aborted) setActual("error");
      });
    return () => ac.abort();
  }, [date, past, offset]);

  if (adding) return <AddSheet date={date} onClose={() => setAdding(false)} />;
  if (editing) return <ForecastEditSheet item={editing} onClose={() => setEditing(null)} />;

  const label = dayName.format(parse(date));
  const box = "overflow-hidden rounded-2xl bg-muted/50";
  const h3 = "mb-1.5 text-[13px] font-medium text-muted-foreground";

  return (
    <Sheet title={label} onClose={onClose} doneLabel="Add to this day" onDone={() => setAdding(true)}>
      <div className="flex flex-col gap-5">
        <section aria-label={past ? "Usual for this day" : "Expected"}>
          <h3 className={h3}>{past ? "Usual for this day" : "Expected"}</h3>
          <div className={box}>
            {through.map((f) => (
              <div key={`through-${f.id}`} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4 [&+&]:border-t">
                <CategoryIcon category={f.category} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-snug font-medium">{f.detail ?? f.label}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">
                    {f.detail ? `${f.label} · ` : ""}Continues, started {shortDay.format(parse(f.date))}, ends {shortDay.format(parse(f.endDate as string))}
                  </div>
                </div>
              </div>
            ))}
            {events.length ? (
              events.map((e) => {
                if (e.forecast) {
                  const f = e.forecast;
                  return (
                    <div key={e.id} className={`flex min-h-14 items-center gap-3 py-2 pr-2 pl-4 [&+&]:border-t ${f.counted ? "" : "opacity-60"}`}>
                      <CategoryIcon category={f.category} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] leading-snug font-medium">{f.detail ?? e.label}</div>
                        <div className="mt-0.5 text-[13px] text-muted-foreground">
                          {f.detail ? `${e.label} · ` : ""}
                          {f.counted ? "From your calendar · estimate" : "Not counted"}
                          {f.endDate ? ` · to ${shortDay.format(parse(f.endDate))}` : ""}
                        </div>
                      </div>
                      <SignedAmount kind="out" value={e.amount} />
                      <button type="button" aria-label={`Change ${e.label}`} onClick={() => setEditing(f)} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted">
                        <Pencil className="size-4" aria-hidden />
                      </button>
                    </div>
                  );
                }
                const mine = e.source === "you";
                const repeats = mine && custom.find((c) => c.id === e.id)?.monthly;
                return (
                  <div key={e.id} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4 [&+&]:border-t">
                    <MoneyBadge kind={e.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] leading-snug font-medium">{e.label}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                        {repeats && <Repeat className="size-3" aria-hidden />}
                        {mine ? "Added by you" : (e.detail ?? "Usual date")}
                      </div>
                    </div>
                    <SignedAmount kind={e.kind} value={e.amount} />
                    {mine ? (
                      <button
                        type="button"
                        aria-label={confirmId === e.id ? `Tap again to remove ${e.label}` : `Remove ${e.label}`}
                        onClick={() => (confirmId === e.id ? removeCustomEvent(e.id) : setConfirmId(e.id))}
                        className={`flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-[12px] font-medium active:scale-95 ${confirmId === e.id ? "bg-warn-soft text-warn" : "text-muted-foreground"}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {confirmId === e.id && "Remove?"}
                      </button>
                    ) : (
                      <span className="w-2 shrink-0" aria-hidden />
                    )}
                  </div>
                );
              })
            ) : through.length ? null : (
              <p className="px-4 py-4 text-[14px] text-muted-foreground">Nothing expected on this day.</p>
            )}
          </div>
        </section>

        {past ? (
          <section aria-label="What happened">
            <h3 className={h3}>What happened</h3>
            <div className={box}>
              {actual === "loading" ? (
                <p className="px-4 py-4 text-[14px] text-muted-foreground">Loading…</p>
              ) : actual === "error" ? (
                <p className="px-4 py-4 text-[14px] text-muted-foreground">Couldn&apos;t load this day. Close it and open it again.</p>
              ) : actual.rows.length ? (
                <>
                  <div className="flex items-baseline justify-between px-4 pt-3 pb-1">
                    <span className="text-[14px] text-muted-foreground">Spent</span>
                    <span className="num font-display text-[24px] font-semibold tracking-[-0.02em]">{eur.format(actual.spent)}</span>
                  </div>
                  {actual.rows.map((r, i) => (
                    <Row
                      key={`${r.title}-${i}`}
                      icon={<MoneyBadge kind={r.amount > 0 ? "in" : "out"} />}
                      title={r.title}
                      subtitle={r.subtitle ?? undefined}
                      value={<SignedAmount kind={r.amount > 0 ? "in" : "out"} value={Math.abs(r.amount)} />}
                    />
                  ))}
                </>
              ) : (
                <p className="px-4 py-4 text-[14px] text-muted-foreground">No spending recorded on this day.</p>
              )}
            </div>
          </section>
        ) : (
          <p className="text-[13px] leading-snug text-muted-foreground">What you spend shows here once the day has passed.</p>
        )}
      </div>
    </Sheet>
  );
}

function AddSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const [kind, setKind] = useState<"in" | "out">("out");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [monthly, setMonthly] = useState(false);
  const valid = label.trim().length > 0 && amount > 0;
  const seg = (k: "in" | "out") => `flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold ${kind === k ? "bg-primary text-primary-foreground" : "bg-muted"}`;

  return (
    <Sheet
      title={`Add to ${shortDay.format(parse(date))}`}
      onClose={onClose}
      doneLabel="Add to calendar"
      doneDisabled={!valid}
      onDone={() => {
        addCustomEvent({ id: `c-${Date.now()}`, kind, label: label.trim(), amount, date, monthly });
        onClose();
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2" role="group" aria-label="Money in or out">
          <button type="button" className={seg("out")} aria-pressed={kind === "out"} onClick={() => setKind("out")}>
            <MoneyBadge kind="out" size="sm" className="bg-white" />
            Money out
          </button>
          <button type="button" className={seg("in")} aria-pressed={kind === "in"} onClick={() => setKind("in")}>
            <MoneyBadge kind="in" size="sm" className="bg-white" />
            Money in
          </button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">What is it</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === "out" ? "Insurance, gym, holiday…" : "Bonus, tax refund…"}
            autoComplete="off"
            enterKeyHint="next"
            className="h-11 rounded-xl bg-muted px-3 outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <NumberField label="Amount" value={amount} onChange={setAmount} suffix="€" />
        <button type="button" role="switch" aria-checked={monthly} onClick={() => setMonthly((m) => !m)} className="flex min-h-11 items-center justify-between gap-3 text-left">
          <span>
            <span className="block text-[15px] font-medium">Repeats every month</span>
            <span className="block text-[13px] text-muted-foreground">On the {ordinal(Number(date.slice(8, 10)) || 1)} each month from then on</span>
          </span>
          <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${monthly ? "bg-primary" : "bg-border"}`} aria-hidden>
            <span className={`size-6 rounded-full bg-white shadow transition-transform ${monthly ? "translate-x-5" : ""}`} />
          </span>
        </button>
      </div>
    </Sheet>
  );
}
