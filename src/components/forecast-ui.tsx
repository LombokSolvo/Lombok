"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Gift, Plane, Ticket, Utensils } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { NumberField } from "@/components/solvo/fields";
import { Sheet } from "@/components/solvo/sheet";
import { eur, secondaryButton } from "@/components/solvo/ui";
import { plainFormat } from "@/lib/demo-clock";
import { useCalendarFile } from "@/lib/calendar-file-store";
import { applyChoices, forecast, weeklyReserve, type Baselines, type CalendarMode, type CountedItem, type ForecastCategory, type ForecastItem } from "@/lib/forecast";
import { setChoice, useChoices } from "@/lib/forecast-store";

// What the person's calendar adds to the budget, on every screen that shows it. The server page hands over the forecast items
// (kind, date, amount: never event titles of a real calendar); the person's own edits and "don't count" choices are applied here,
// in the browser. Dates are REAL dates, so they use plainFormat (never shifted by the demo clock).

const dayFmt = plainFormat({ weekday: "short", day: "numeric", month: "short" });

type State = { mode: CalendarMode | null; today: string; items: CountedItem[]; reserve: number; baselines: Baselines };
const EMPTY: State = { mode: null, today: "", items: [], reserve: 0, baselines: { dining: null, entertainment: null, trip: null } };
const Ctx = createContext<State>(EMPTY);

/**
 * `items` and `mode` come from the server (demo, Google, link). A calendar FILE lives only in this browser, so when there is one and
 * no real calendar on the server, the items are made here from the person's baselines (numbers the server sends for exactly this).
 */
export function ForecastProvider({ mode, items, today, baselines, children }: { mode: Exclude<CalendarMode, "file"> | null; items: ForecastItem[]; today: string; baselines: Baselines; children: ReactNode }) {
  const choices = useChoices();
  const file = useCalendarFile();
  const value = useMemo<State>(() => {
    const useFile = !!file && mode !== "google" && mode !== "link";
    const raw = useFile ? forecast(file.events, baselines, today, "file", { keepTitle: true }) : items;
    const counted = applyChoices(raw, choices);
    return { mode: useFile ? "file" : mode, today, items: counted, reserve: weeklyReserve(counted, today), baselines };
  }, [mode, items, today, baselines, choices, file]);
  return (
    <Ctx.Provider value={value}>
      <CalendarAutoSync mode={mode} />
      {children}
    </Ctx.Provider>
  );
}

const SYNC_EVERY_MS = 15 * 60_000;
const SYNC_PATH = { google: "/api/google/sync", link: "/api/calendar/link/sync" } as const;

/**
 * Keeps a connected Google calendar or calendar link up to date while the app is open: reads it again when the app opens, when the
 * person comes back to it, and every 15 minutes, and refreshes the screen only when something new was read. The server throttles to
 * one read per 30 seconds, so extra calls cost nothing. A calendar file has nothing to sync. Errors stay silent: the saved copy
 * keeps working, and Profile says when a sign-in has expired.
 */
function CalendarAutoSync({ mode }: { mode: "google" | "link" | null }) {
  const router = useRouter();
  const lastRead = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "google" && mode !== "link") return;
    let stopped = false;
    const sync = async () => {
      try {
        const res = await fetch(SYNC_PATH[mode], { method: "POST" });
        if (!res.ok || stopped) return;
        const { syncedAt } = (await res.json()) as { syncedAt?: string };
        if (syncedAt && lastRead.current !== null && syncedAt !== lastRead.current) router.refresh();
        if (syncedAt) lastRead.current = syncedAt;
      } catch {
        // Offline or the server is busy: try again at the next tick.
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), SYNC_EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode, router]);
  return null;
}

export const useForecast = () => useContext(Ctx);
/** EUR a week the calendar takes out of the weekly budget. */
export const useWeeklyReserve = () => useContext(Ctx).reserve;

export const SOURCE_NOTE: Record<CalendarMode, string> = {
  google: "Your Google Calendar",
  link: "Your calendar link",
  file: "Your calendar file, kept on this phone",
};
const sourceNote = (mode: State["mode"]) => (mode ? SOURCE_NOTE[mode] : "");

const ICONS: Record<ForecastCategory, { icon: typeof Plane; name: string }> = {
  travel: { icon: Plane, name: "Trip" },
  dining: { icon: Utensils, name: "Eating out" },
  entertainment: { icon: Ticket, name: "Event" },
  gift: { icon: Gift, name: "Gift or party" },
};

/** What a calendar item is, as a small icon in the warm "money out" circle: a plane for trips, a fork for dinners. Used on the calendar. */
export function CategoryIcon({ category, size = "md" }: { category: ForecastCategory; size?: "sm" | "md" }) {
  const { icon: Icon, name } = ICONS[category];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn ${size === "sm" ? "size-[22px]" : "size-7"}`}>
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** Under the safe-to-spend number: one line saying why it is lower. The items themselves are on the calendar, as icons. */
export function ForecastNote({ className }: { className?: string }) {
  const { mode, items, reserve, today } = useForecast();
  if (!mode || !items.some((i) => i.counted && i.date >= today)) return null;
  return (
    <Link href="/calendar" className={`${className ?? ""} flex min-h-11 items-center justify-between gap-2 text-[13px] text-white/70 active:text-white`}>
      <span>
        Includes {eur.format(Math.round(reserve))} a week set aside for your calendar
      </span>
      <ChevronRight className="size-4 shrink-0 text-white/50" aria-hidden />
    </Link>
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

/** On Home while no calendar is connected: a way in, so the feature is found without going looking for it. */
export function ConnectCalendarNudge() {
  const { mode } = useForecast();
  if (mode) return null;
  return (
    <Link
      href="/profile#calendar"
      className="mt-4 flex min-h-16 items-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-accent/50 px-4 py-3 active:bg-accent"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
        <CalendarClock className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-semibold">Budget for what is coming</span>
        <span className="block text-[13px] leading-snug text-muted-foreground">Connect your calendar. Solvo sets money aside for trips and dinners.</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
