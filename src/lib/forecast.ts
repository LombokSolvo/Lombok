// Calendar forecast: turns upcoming calendar events into estimated one-off spending, so the budget can make room for them.
// Pure, with no runtime imports, so the server, the browser and scripts/forecast.test.mjs all share it.
//
// Rules this file keeps (one home for each):
//  - What counts as spending: KINDS below. Keyword matching only, Finnish and English, no model, so calendar text never leaves
//    this process. Repeating events and work trips are skipped.
//  - What an estimate is: the person's own history where there is enough of it (median or 75th percentile of their own payments,
//    their usual trip cost), otherwise a small default table. Every item says which one it used (`basis`) and is editable.
//  - What reaches the budget: only ForecastItem (kind, date, amount), never the event title. Titles are kept for the demo
//    calendar's fictional events only (`detail`).
//  - How the budget uses it: weeklyReserve() and monthTotal() at the bottom.

export type CalendarEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD for an all-day event, otherwise RFC 3339 with offset (the calendar's own time zone). */
  start: string;
  /** Same format. For an all-day event Google's end is the day AFTER the last day. */
  end: string;
  allDay: boolean;
  location?: string;
  /** An instance of a repeating event: skipped, it is already part of the person's usual spending. */
  recurring?: boolean;
};

export type ForecastCategory = "travel" | "dining" | "entertainment" | "gift";
export type KindId = "trip" | "dinner" | "lunch" | "drinks" | "concert" | "cinema" | "birthday" | "wedding" | "party";

type Kind = { id: KindId; category: ForecastCategory; label: string; words: RegExp; fallback: number };

// A word starts at a word boundary and may be followed by Finnish endings. Order matters: the first group that matches wins, so
// "concert weekend in Berlin" is a trip and "birthday dinner" is a birthday (with the dinner added on top, see estimate()).
// Whole words only (Finnish endings are listed), so "public holiday" is not a pub and "stay" or "showroom" match nothing.
const W = (s: string) => new RegExp(`(^|[^\\p{L}])(${s})(?![\\p{L}])`, "iu");
export const KINDS: Kind[] = [
  { id: "trip", category: "travel", label: "Trip", fallback: 0, words: W("trips?|flights?|hotel|hotels|hotelli|holiday|vacation|city break|weekend away|road trip|cruise|risteily|airbnb|matka|matkalle|matkalla|matkan|matkaan|reissu|reissulle|reissulla|lento|lennot|lennolle|lennon|loma|lomalle|lomalla|loman|lomamatka|mökkireissu|mökille|viikonloppumatka|ulkomaille") },
  { id: "concert", category: "entertainment", label: "Concert or show", fallback: 70, words: W("concerts?|gig|festival|festivals|festivaali|theatre|theater|musical|teatteri|teatteriin|konsertti|konserttiin|keikka|keikalle|oopperaan|ooppera|tickets?|liput") },
  { id: "cinema", category: "entertainment", label: "Cinema", fallback: 15, words: W("cinema|movie|movies|elokuva|elokuviin|leffa|leffaan") },
  { id: "wedding", category: "gift", label: "Wedding", fallback: 100, words: W("wedding|häät|hääjuhla|häihin|kihlajaiset") },
  { id: "birthday", category: "gift", label: "Birthday", fallback: 50, words: W("birthday|bday|b-day|synttärit|synttäri|synttäreille|synttäreillä|syntymäpäivä|syntymäpäivät|nimipäivä|valmistujaiset|graduation") },
  { id: "party", category: "gift", label: "Party", fallback: 30, words: W("party|bachelor|bachelorette|housewarming|juhlat|juhlaan|polttarit|läksiäiset|kotijuhlat") },
  { id: "dinner", category: "dining", label: "Dinner out", fallback: 60, words: W("dinner|dinners|illallinen|illallisella|illalliselle|illallista|date night|supper") },
  { id: "lunch", category: "dining", label: "Lunch out", fallback: 25, words: W("lunch|lounas|lounaalle|lounaalla|lounasta|brunch") },
  { id: "drinks", category: "dining", label: "Drinks", fallback: 30, words: W("drinks|drinkit|drinkeille|beer|beers|oluet|oluella|olut|after work|afterwork|pub|baari|cocktail|cocktails") },
];

// Costs somebody else pays or that are not personal spending.
const NOT_PERSONAL = W("business trip|work trip|business travel|työmatka|työmatkalla|työreissu|commute|sick leave|sairasloma|conference|konferenssi|public holiday|bank holiday|school holiday|arkipyhä|koululoma");

export const CATEGORY_LABEL: Record<ForecastCategory, string> = { travel: "Travel", dining: "Eating out", entertainment: "Entertainment", gift: "Gifts and parties" };

// Defaults for a trip, by length. Used only when the person has fewer than two trips in their own history.
const TRIP_DEFAULTS: { maxDays: number; amount: number }[] = [
  { maxDays: 3, amount: 250 },
  { maxDays: 7, amount: 600 },
  { maxDays: Infinity, amount: 900 },
];

/** What the person's own payments say. Computed once on the server from their transactions: numbers only. */
export type Baselines = {
  dining: { median: number; p75: number; n: number } | null; // restaurant payments
  entertainment: { p75: number; n: number } | null; // entertainment payments of EUR 15 or more (subscriptions and small stuff are not tickets)
  trip: { median: number; n: number } | null; // a trip is travel payments close together in time
};

export type TxLike = { date: string; category: string; amount: number };

const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo);
};
const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000;
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

const MIN_PAYMENTS = 5; // fewer than this and a median says nothing
const MIN_TICKETS = 3;

export function baselinesFrom(transactions: TxLike[]): Baselines {
  const spend = (cat: string) => transactions.filter((t) => t.category === cat && t.amount < 0);
  const dining = spend("Restaurants").map((t) => -t.amount);
  const tickets = spend("Entertainment").map((t) => -t.amount).filter((a) => a >= 15);

  // Travel payments within 7 days of each other are one trip.
  const travel = spend("Travel").sort((a, b) => a.date.localeCompare(b.date));
  const trips: number[] = [];
  let lastDay = -Infinity;
  for (const t of travel) {
    if (day(t.date) - lastDay > 7) trips.push(0);
    trips[trips.length - 1] += -t.amount;
    lastDay = day(t.date);
  }

  return {
    dining: dining.length >= MIN_PAYMENTS ? { median: percentile(dining, 0.5), p75: percentile(dining, 0.75), n: dining.length } : null,
    entertainment: tickets.length >= MIN_TICKETS ? { p75: percentile(tickets, 0.75), n: tickets.length } : null,
    trip: trips.length >= 2 ? { median: percentile(trips, 0.5), n: trips.length } : null,
  };
}

export type ForecastItem = {
  id: string; // stable for one event, used to remember a dismissal or an edited amount
  kind: KindId;
  category: ForecastCategory;
  label: string; // "Trip", "Dinner out": generic, never the event title
  date: string; // YYYY-MM-DD, the first day. The cost is placed here.
  endDate: string | null; // last day of a multi-day event
  amount: number; // EUR, the estimate
  basis: "history" | "default";
  basisNote: string; // one plain sentence saying where the number comes from
  source: "demo" | "google";
  detail?: string; // the event title. Set for the demo calendar's fictional events only.
};

const isoOf = (s: string) => s.slice(0, 10);
const addDay = (iso: string, n: number) => new Date(day(iso) * 86_400_000 + n * 86_400_000).toISOString().slice(0, 10);

/** First day and last day (inclusive) of an event. */
export function eventDays(e: CalendarEvent): { first: string; last: string } {
  const first = isoOf(e.start);
  const endDay = isoOf(e.end);
  // Google's all-day end is exclusive. A timed event that ends exactly at midnight belongs to the day before as well.
  const last = e.allDay || /T00:00(:00)?/.test(e.end.slice(10, 19)) ? addDay(endDay, -1) : endDay;
  return { first, last: last < first ? first : last };
}

type Estimate = { amount: number; basis: ForecastItem["basis"]; note: string };

function estimate(kind: Kind, nights: number, b: Baselines, alsoDining: boolean): Estimate {
  const days = nights + 1;
  const eur = (n: number) => `EUR ${Math.round(n)}`;
  switch (kind.id) {
    case "trip": {
      if (b.trip) return { amount: round5(b.trip.median), basis: "history", note: `Your usual trip: ${b.trip.n} past trips in your payments, median ${eur(b.trip.median)}.` };
      const d = TRIP_DEFAULTS.find((x) => days <= x.maxDays) as { amount: number };
      return { amount: d.amount, basis: "default", note: `A typical amount for ${days <= 3 ? "a weekend" : days <= 7 ? "a week" : "a long trip"}, not from your history.` };
    }
    case "dinner":
    case "lunch":
    case "drinks": {
      if (b.dining) {
        const v = kind.id === "dinner" ? b.dining.p75 : b.dining.median;
        return { amount: round5(v), basis: "history", note: `${kind.id === "dinner" ? "Your bigger restaurant payments" : "Your usual restaurant payment"}: ${b.dining.n} payments, ${kind.id === "dinner" ? "75th percentile" : "median"} ${eur(v)}.` };
      }
      return { amount: kind.fallback, basis: "default", note: "A typical amount, not from your history." };
    }
    case "concert":
      if (b.entertainment) return { amount: round5(b.entertainment.p75), basis: "history", note: `Your bigger entertainment payments: ${b.entertainment.n} payments, 75th percentile ${eur(b.entertainment.p75)}.` };
      return { amount: kind.fallback, basis: "default", note: "A typical ticket price, not from your history." };
    default: {
      // Gifts and parties have no matching spending in the bank data, so they always use the default. A birthday dinner adds the dinner.
      if (alsoDining) {
        const dinner = estimate(KINDS.find((k) => k.id === "dinner") as Kind, nights, b, false);
        return { amount: kind.fallback + dinner.amount, basis: "default", note: `A typical gift (${eur(kind.fallback)}) plus a dinner (${eur(dinner.amount)}), not fully from your history.` };
      }
      return { amount: kind.fallback, basis: "default", note: "A typical amount, not from your history." };
    }
  }
}

/** The kind of spending an event title implies, or null. */
export function classify(title: string): { kind: Kind; alsoDining: boolean } | null {
  if (!title || NOT_PERSONAL.test(title)) return null;
  const kind = KINDS.find((k) => k.words.test(title));
  if (!kind) return null;
  const dining = KINDS.filter((k) => k.category === "dining").some((k) => k.words.test(title));
  return { kind, alsoDining: kind.category === "gift" && dining };
}

/**
 * Upcoming events in, forecast items out, soonest first. `today` is the real date. Events before today or after `horizonDays`
 * are ignored. `keepTitle` is for fictional demo events only.
 */
export function forecast(events: CalendarEvent[], baselines: Baselines, today: string, source: ForecastItem["source"], { horizonDays = 45, keepTitle = false } = {}): ForecastItem[] {
  const until = addDay(today, horizonDays);
  const out: ForecastItem[] = [];
  for (const e of events) {
    if (e.recurring) continue;
    const hit = classify(e.title);
    if (!hit) continue;
    const { first, last } = eventDays(e);
    // An event that is on now (a trip that started yesterday) has already been paid for. Only starts from today on are forecast.
    if (first < today || first > until) continue;
    const nights = Math.round(day(last) - day(first));
    const est = estimate(hit.kind, nights, baselines, hit.alsoDining);
    out.push({
      id: e.id,
      kind: hit.kind.id,
      category: hit.kind.category,
      label: hit.kind.label,
      date: first,
      endDate: last > first ? last : null,
      amount: est.amount,
      basis: est.basis,
      basisNote: est.note,
      source,
      ...(keepTitle ? { detail: e.title } : {}),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// ---- What the person changed, and what that does to the budget ----

/** The person's choices per item id: not counted at all, or their own amount. Stored in the browser. */
export type Choices = Record<string, { dismissed?: boolean; amount?: number }>;

export type CountedItem = ForecastItem & { estimate: number; edited: boolean; counted: boolean };

/** Applies the person's choices. `estimate` keeps the original, `amount` is what the budget uses. */
export function applyChoices(items: ForecastItem[], choices: Choices): CountedItem[] {
  return items.map((i) => {
    const c = choices[i.id];
    const edited = typeof c?.amount === "number";
    return { ...i, estimate: i.amount, amount: edited ? (c.amount as number) : i.amount, edited, counted: !c?.dismissed };
  });
}

/**
 * Money to set aside this week for what is coming: each counted item is spread over the weeks left until it happens, so a dinner
 * tomorrow takes its whole amount from this week and a trip in five weeks takes a fifth. Items already past are not counted.
 */
export function weeklyReserve(items: CountedItem[], today: string): number {
  let sum = 0;
  for (const i of items) {
    if (!i.counted || i.date < today) continue;
    const weeks = Math.max(1, Math.ceil((day(i.date) - day(today) + 1) / 7));
    sum += i.amount / weeks;
  }
  return sum;
}

/** Counted spending in the next `days` days, for the monthly plan (room to save and invest). */
export function totalWithin(items: CountedItem[], today: string, days = 30): number {
  const until = addDay(today, days);
  return items.filter((i) => i.counted && i.date >= today && i.date <= until).reduce((s, i) => s + i.amount, 0);
}

/** Counted spending that falls in one calendar month (YYYY-MM). */
export const monthTotal = (items: CountedItem[], month: string) => items.filter((i) => i.counted && i.date.startsWith(month)).reduce((s, i) => s + i.amount, 0);
