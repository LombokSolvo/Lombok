// When money usually moves: payday, rent, utility bills. Worked out from the last 12 complete months of
// transactions, shown as an assumption the person can correct, and used for the calendar and the payday plan.
// Pure, no imports except a type, so the server computes it and the browser only formats it.
import type { DemoCustomer } from "@/lib/demo";
import type { CountedItem } from "@/lib/forecast";

export type Item = {
  id: string;
  label: string;
  kind: "in" | "out";
  day: number; // typical day of month, 1 to 31
  amount: number; // EUR, always positive
  source: "detected" | "you";
  detail?: string;
};

/** A bill whose supplier is known, for example from an e-invoice. Used in place of the bank's unnamed utility payments. */
export type NamedBill = { label: string; supplier: string; day: number; amount: number };

export type Schedule = {
  payday: { day: number; amount: number } | null;
  items: Item[]; // income and recurring bills, payday first
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const monthOf = (iso: string) => iso.slice(0, 7);

export function ordinal(n: number) {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

/** What kind of bill a company name suggests, so the calendar can say "Electricity bill" instead of a company name alone. */
export function billType(name: string): string | null {
  if (/sähköverkko|verkko|siirto|grid|elenia/i.test(name)) return "Grid fee";
  if (/energia|energy|helen|fortum|vattenfall|sähkö/i.test(name)) return "Electricity bill";
  if (/elisa|\bdna\b|telia|sonera|saunalahti|kaista|telecom|puhelin/i.test(name)) return "Phone and internet";
  if (/vakuutus|insurance|\bif\b|tapiola|fennia|pohjola|turva/i.test(name)) return "Insurance";
  if (/vesi|water/i.test(name)) return "Water bill";
  return null;
}

const isGrant = (type: string, merchant: string | null) => /opintotuki/i.test(type) || /kansaneläke|\bkela\b/i.test(merchant ?? "");

export function inferSchedule(c: DemoCustomer, named: NamedBill[] = []): Schedule {
  const window = new Set(c.summary.last12Months);
  const rows = c.transactions.filter((t) => window.has(monthOf(t.date)));
  const items: Item[] = [];

  // Income: salary and a study grant, each with its own typical day.
  const salary = rows.filter((t) => t.category === "Salary" && t.amount > 0 && !isGrant(t.type, t.merchant));
  const grant = rows.filter((t) => t.category === "Salary" && t.amount > 0 && isGrant(t.type, t.merchant));
  const monthlySums = (rs: typeof rows) => {
    const by: Record<string, number> = {};
    for (const t of rs) by[monthOf(t.date)] = (by[monthOf(t.date)] ?? 0) + t.amount;
    return Object.values(by);
  };
  let payday: Schedule["payday"] = null;
  if (salary.length >= 3) {
    payday = { day: Math.round(median(salary.map((t) => dayOf(t.date)))), amount: Math.round(median(monthlySums(salary))) };
    items.push({ id: "salary", label: "Salary", kind: "in", day: payday.day, amount: payday.amount, source: "detected" });
  }
  if (grant.length >= 3) {
    items.push({
      id: "grant",
      label: "Study grant (Kela)",
      kind: "in",
      day: Math.round(median(grant.map((t) => dayOf(t.date)))),
      amount: Math.round(median(monthlySums(grant))),
      source: "detected",
    });
  }

  // Rent and housing: one monthly total on its usual day.
  const housing = rows.filter((t) => t.category === "Housing" && t.amount < 0);
  if (housing.length >= 3) {
    items.push({
      id: "rent",
      label: "Rent",
      kind: "out",
      day: Math.round(median(housing.map((t) => dayOf(t.date)))),
      amount: Math.round(median(monthlySums(housing).map((v) => -v))),
      source: "detected",
    });
  }

  // Utility bills. With merchant names (real bank data) each company is its own item. Without them (the synthetic
  // bank data) bills are grouped by their order in the month: first bill, second bill, and so on.
  const utilities = rows.filter((t) => t.category === "Utilities" && t.amount < 0);
  const withMerchant = utilities.filter((t) => t.merchant);
  if (named.length) {
    // The e-invoices say what each bill is, so use them: a name, the company, the usual day and the amount.
    named.forEach((b, i) => items.push({ id: `bill-${i}`, label: b.label, kind: "out", day: b.day, amount: b.amount, source: "detected", detail: b.supplier }));
  } else if (withMerchant.length >= utilities.length / 2 && withMerchant.length) {
    const byMerchant: Record<string, typeof rows> = {};
    for (const t of withMerchant) (byMerchant[t.merchant as string] ??= []).push(t);
    Object.entries(byMerchant)
      .filter(([, rs]) => new Set(rs.map((t) => monthOf(t.date))).size >= 4)
      .forEach(([m, rs], i) => {
        const type = billType(m);
        items.push({
          id: `util-${i}`,
          label: type ?? m,
          kind: "out",
          day: Math.round(median(rs.map((t) => dayOf(t.date)))),
          amount: Math.round(median(rs.map((t) => -t.amount))),
          source: "detected",
          detail: type ? m : undefined,
        });
      });
  } else if (utilities.length) {
    const byMonth: Record<string, number[]> = {};
    const amountsByMonth: Record<string, number[]> = {};
    for (const t of [...utilities].sort((a, b) => a.date.localeCompare(b.date))) {
      (byMonth[monthOf(t.date)] ??= []).push(dayOf(t.date));
      (amountsByMonth[monthOf(t.date)] ??= []).push(-t.amount);
    }
    const months = Object.keys(byMonth);
    for (let k = 0; k < 3; k++) {
      const days = months.filter((m) => byMonth[m][k] !== undefined).map((m) => byMonth[m][k]);
      if (days.length < months.length / 2) continue;
      const amounts = months.filter((m) => amountsByMonth[m][k] !== undefined).map((m) => amountsByMonth[m][k]);
      items.push({
        id: `util-${k}`,
        label: "Utility bill",
        kind: "out",
        day: Math.round(median(days)),
        amount: Math.round(median(amounts)),
        source: "detected",
        detail: "Bank data doesn't name the company. Solvo reads the e-invoice to find out.",
      });
    }
  }

  // Insurance is not a utility in the bank's categories, but a payee that is clearly an insurer and recurs is a fixed bill.
  const insurers: Record<string, typeof rows> = {};
  for (const t of rows) if (t.amount < 0 && t.merchant && billType(t.merchant) === "Insurance") (insurers[t.merchant] ??= []).push(t);
  Object.entries(insurers)
    .filter(([, rs]) => new Set(rs.map((t) => monthOf(t.date))).size >= 3)
    .forEach(([m, rs], i) =>
      items.push({ id: `ins-${i}`, label: "Insurance", kind: "out", day: Math.round(median(rs.map((t) => dayOf(t.date)))), amount: Math.round(median(rs.map((t) => -t.amount))), source: "detected", detail: m }),
    );

  // A side income that lands at another bank: a recurring "Side income" payment.
  const side = rows.filter((t) => t.category === "Side income" && t.amount > 0);
  if (new Set(side.map((t) => monthOf(t.date))).size >= 3) {
    items.push({ id: "side-income", label: "Side income", kind: "in", day: Math.round(median(side.map((t) => dayOf(t.date)))), amount: Math.round(median(monthlySums(side))), source: "detected", detail: side[0].merchant ?? undefined });
  }

  // Subscriptions and memberships: a named payee charged the same amount about once a month for at least six months.
  const SKIP = new Set(["Utilities", "Housing", "Groceries", "Restaurants", "Transfer", "Invest Deposit", "Salary", "Side income"]);
  const payees: Record<string, typeof rows> = {};
  for (const t of rows) if (t.amount < 0 && t.merchant && t.merchant !== "Person" && !SKIP.has(t.category) && !billType(t.merchant)) (payees[t.merchant] ??= []).push(t);
  Object.entries(payees).forEach(([m, rs], i) => {
    const months = new Set(rs.map((t) => monthOf(t.date))).size;
    const amounts = rs.map((t) => -t.amount);
    const steady = Math.max(...amounts) - Math.min(...amounts) <= Math.max(...amounts) * 0.02;
    if (months >= 6 && rs.length <= months * 1.2 && steady) {
      items.push({ id: `sub-${i}`, label: m, kind: "out", day: Math.round(median(rs.map((t) => dayOf(t.date)))), amount: Math.round(median(amounts)), source: "detected", detail: rs[0].category });
    }
  });

  items.sort((a, b) => (a.kind === b.kind ? a.day - b.day : a.kind === "in" ? -1 : 1));
  return { payday, items };
}

// ---- Calendar helpers, shared by the server and the browser ----

export type CustomEvent = {
  id: string;
  kind: "in" | "out";
  label: string;
  amount: number;
  date: string; // YYYY-MM-DD, the first time it happens
  monthly: boolean; // repeats on the same day every month after that
};

export type DayEvent = {
  id: string;
  date: string;
  label: string;
  kind: "in" | "out";
  amount: number;
  source: "detected" | "you" | "calendar";
  detail?: string;
  /** A forecast from the person's calendar. Always shown, but only counted in totals and markers while `counted` is true. */
  forecast?: CountedItem;
  counted?: boolean;
};

/** Forecast items as calendar events: money out on the day the event starts. Real dates, never shifted. */
export function forecastEvents(items: CountedItem[]): DayEvent[] {
  return items.map((f) => ({ id: f.id, date: f.date, label: f.label, kind: "out", amount: f.amount, source: "calendar", detail: "From your calendar", forecast: f, counted: f.counted }));
}

export const daysIn = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
export const isoDay = (year: number, month0: number, day: number) =>
  `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// ---- Paydays: when a payment day is not a banking day, the money arrives the banking day before ----

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (y: number, m0: number, d: number) => Date.UTC(y, m0, d);

/** Easter Sunday (the Gregorian computus), as a UTC timestamp. */
function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month - 1, day);
}

/** Days Finnish banks are closed besides Saturdays and Sundays: public holidays, plus Christmas Eve and Midsummer Eve. */
const finnishBankHolidays = (year: number): Set<string> => {
  const easter = easterSunday(year);
  const day = 86_400_000;
  const midsummerEve = (() => {
    for (let d = 19; d <= 25; d++) if (new Date(utc(year, 5, d)).getUTCDay() === 5) return utc(year, 5, d);
    return 0;
  })();
  return new Set([
    iso(utc(year, 0, 1)), // New Year's Day
    iso(utc(year, 0, 6)), // Epiphany
    iso(easter - 2 * day), // Good Friday
    iso(easter + day), // Easter Monday
    iso(utc(year, 4, 1)), // May Day
    iso(easter + 39 * day), // Ascension Day
    iso(midsummerEve),
    iso(utc(year, 11, 6)), // Independence Day
    iso(utc(year, 11, 24)), // Christmas Eve
    iso(utc(year, 11, 25)),
    iso(utc(year, 11, 26)),
  ]);
};

export function isBankingDay(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !finnishBankHolidays(Number(date.slice(0, 4))).has(date);
}

/** The banking day on or before `date`. A payday on Sunday 15 Nov comes in on Friday 13 Nov. */
export function previousBankingDay(date: string): string {
  let d = date;
  while (!isBankingDay(d)) d = iso(Date.parse(`${d}T00:00:00Z`) - 86_400_000);
  return d;
}

// Salary, the study grant and a side income are paid in by banks, so they follow banking days. Bills and the person's own added
// dates stay on the day they name.
const PAID_ON_BANKING_DAY = new Set(["salary", "grant", "side-income"]);

/** Every expected or added event in one month, sorted by date. A day past the end of the month falls on its last day. */
export function eventsForMonth(items: Item[], custom: CustomEvent[], year: number, month0: number, calendar: CountedItem[] = []): DayEvent[] {
  const out: DayEvent[] = [];
  const here = isoDay(year, month0, 1).slice(0, 7);
  for (const it of items) {
    // A payday early in the month can move back into the month before, so look at next month's too and keep what lands here.
    const spans = PAID_ON_BANKING_DAY.has(it.id) && it.kind === "in" ? [0, 1] : [0];
    for (const add of spans) {
      const d = new Date(Date.UTC(year, month0 + add, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const nominal = isoDay(y, m, Math.min(it.day, daysIn(y, m)));
      const date = spans.length > 1 ? previousBankingDay(nominal) : nominal;
      if (date.slice(0, 7) === here) out.push({ id: it.id, date, label: it.label, kind: it.kind, amount: it.amount, source: it.source, detail: it.detail });
    }
  }
  const last = daysIn(year, month0);
  for (const e of custom) {
    const start = e.date.slice(0, 7);
    const day = Number(e.date.slice(8, 10));
    const applies = e.monthly ? here >= start : here === start;
    if (applies) out.push({ id: e.id, date: isoDay(year, month0, Math.min(day, last)), label: e.label, kind: e.kind, amount: e.amount, source: "you" });
  }
  out.push(...forecastEvents(calendar.filter((f) => f.date.startsWith(here))));
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "in" ? -1 : 1));
}

/** What is coming up in the next `days` days, today included, soonest first. Looks across a month boundary. */
export function upcomingEvents(items: Item[], custom: CustomEvent[], asOf: string, days = 14, limit = 4, calendar: CountedItem[] = []): DayEvent[] {
  const start = new Date(`${asOf}T00:00:00Z`);
  const end = new Date(start.getTime() + days * 86400000).toISOString().slice(0, 10);
  const months = new Set<string>();
  for (let t = start.getTime(); t <= start.getTime() + days * 86400000; t += 86400000) months.add(new Date(t).toISOString().slice(0, 7));
  const out: DayEvent[] = [];
  for (const m of months) out.push(...eventsForMonth(items, custom, Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, calendar));
  // What the person switched off is not "coming up": it stays on the calendar day, where it can be switched back on.
  return out.filter((e) => e.date >= asOf && e.date <= end && e.counted !== false).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
