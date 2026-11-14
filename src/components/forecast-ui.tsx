"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NumberField } from "@/components/solvo/fields";
import { Sheet } from "@/components/solvo/sheet";
import { eur, secondaryButton } from "@/components/solvo/ui";
import { plainFormat } from "@/lib/demo-clock";
import { applyChoices, weeklyReserve, type CountedItem, type ForecastItem } from "@/lib/forecast";
import { setChoice, useChoices } from "@/lib/forecast-store";

// What the person's calendar adds to the budget, on every screen that shows it. The server page hands over the forecast items
// (kind, date, amount: never event titles of a real calendar); the person's own edits and "don't count" choices are applied here,
// in the browser. Dates are REAL dates, so they use plainFormat (never shifted by the demo clock).

const dayFmt = plainFormat({ weekday: "short", day: "numeric", month: "short" });
const shortFmt = plainFormat({ day: "numeric", month: "short" });

type State = { mode: "demo" | "google" | null; today: string; items: CountedItem[]; reserve: number };
const EMPTY: State = { mode: null, today: "", items: [], reserve: 0 };
const Ctx = createContext<State>(EMPTY);

export function ForecastProvider({ mode, items, today, children }: { mode: "demo" | "google" | null; items: ForecastItem[]; today: string; children: ReactNode }) {
  const choices = useChoices();
  const value = useMemo<State>(() => {
    const counted = applyChoices(items, choices);
    return { mode, today, items: counted, reserve: weeklyReserve(counted, today) };
  }, [mode, items, today, choices]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useForecast = () => useContext(Ctx);
/** EUR a week the calendar takes out of the weekly budget. */
export const useWeeklyReserve = () => useContext(Ctx).reserve;

const sourceNote = (mode: State["mode"]) => (mode === "demo" ? "Demo: example calendar" : "Your Google Calendar");

/** Under the safe-to-spend number: why it is lower, in plain words, with a tap to change each item. */
export function ForecastNote({ className }: { className?: string }) {
  const { mode, items, reserve, today } = useForecast();
  const [open, setOpen] = useState<CountedItem | null>(null);
  const counted = items.filter((i) => i.counted && i.date >= today);
  if (!mode || !counted.length) return null;
  return (
    <div className={className}>
      <p className="text-[13px] font-semibold text-white/80">
        {eur.format(Math.round(reserve))} a week is set aside for what is on your calendar
        <span className="block text-[12px] font-normal text-white/50">{sourceNote(mode)}</span>
      </p>
      <ul className="mt-1">
        {counted.slice(0, 3).map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => setOpen(i)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[13px] text-white/70 active:text-white">
              <span>
                {i.label} on {shortFmt(i.date)}: about {eur.format(i.amount)} <span className="text-white/45">(estimate)</span>
              </span>
              <span className="shrink-0 text-white/50 underline underline-offset-4">Change</span>
            </button>
          </li>
        ))}
      </ul>
      {counted.length > 3 && (
        <Link href="/calendar" className="flex min-h-11 items-center text-[13px] text-white/60 underline underline-offset-4">
          and {counted.length - 3} more on the calendar
        </Link>
      )}
      {open && <ForecastEditSheet item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One forecast item: where the number comes from, change the amount, or stop counting it. */
export function ForecastEditSheet({ item, onClose }: { item: CountedItem; onClose: () => void }) {
  const { today, mode } = useForecast();
  const [amount, setAmount] = useState(item.amount);
  const perWeek = weeklyReserve([{ ...item, amount, counted: true }], today);
  const when = item.endDate ? `${dayFmt(item.date)} to ${dayFmt(item.endDate)}` : dayFmt(item.date);
  // In a portal: the Home note sits inside the dark slab, and a sheet drawn there would inherit its white text.
  return createPortal(
    <Sheet
      title={item.label}
      onClose={onClose}
      doneLabel="Save amount"
      doneDisabled={amount <= 0}
      onDone={() => {
        // Writing the estimate back is the same as never having edited it.
        setChoice(item.id, { amount: amount === item.estimate ? null : amount, dismissed: false });
        onClose();
      }}
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[15px] font-medium">{when}</p>
          {item.detail && <p className="text-[13px] text-muted-foreground">{item.detail}</p>}
          <p className="mt-1 text-[12px] font-medium text-muted-foreground">{sourceNote(mode)}</p>
        </div>
        <div className="rounded-2xl bg-muted/50 p-4">
          <p className="text-[13px] font-medium text-muted-foreground">Estimate: {eur.format(item.estimate)}</p>
          <p className="mt-1 text-[14px] leading-snug">{item.basisNote}</p>
        </div>
        <NumberField label="What you expect to spend" value={amount} onChange={setAmount} suffix="€" />
        {amount !== item.estimate && (
          <button type="button" onClick={() => setAmount(item.estimate)} className="-mt-2 flex min-h-11 items-center self-start text-[14px] font-medium text-primary underline underline-offset-4">
            Use the estimate again
          </button>
        )}
        <p className="text-[13px] leading-snug text-muted-foreground">
          {item.counted
            ? `Solvo sets aside about ${eur.format(Math.round(perWeek))} a week until then, on top of your usual spending. It is a guess, not a bill.`
            : "Not counted right now."}
        </p>
        {item.counted ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setChoice(item.id, { dismissed: true });
              onClose();
            }}
          >
            Don&apos;t count this
          </button>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setChoice(item.id, { dismissed: false });
              onClose();
            }}
          >
            Count it again
          </button>
        )}
      </div>
    </Sheet>,
    document.body,
  );
}
