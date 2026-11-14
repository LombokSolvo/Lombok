// "What kind of spender am I?" The brief asks for it, and the transactions already hold the answer: when in the week and the day the
// money goes, and whether it goes in many small purchases or a few large ones. Pure: no file access, no imports from the app but a
// type, so the card and the unit test both use it. Descriptive only: it says what the pattern is, never what the person should do.
//
// Everyday spending means groceries, restaurants, transport, entertainment and lifestyle, in the last 12 complete months. The type
// is chosen by how far the person's weekend leisure share (restaurants, entertainment, lifestyle) and evening share (after 17:00)
// sit above the S-Pankki sample's own averages (about 40% and 38%, from the first 800,000 transactions); within 15% of both is
// "balanced". Time of day exists only in the bank's own data: a connected bank that gives dates alone has no evening figure.
import type { DemoCustomer } from "./demo";

const EVERYDAY = new Set(["Groceries", "Restaurants", "Transportation", "Entertainment", "Lifestyle"]);
const LEISURE = new Set(["Restaurants", "Entertainment", "Lifestyle"]);
const SAMPLE_WEEKEND_LEISURE = 0.4;
const SAMPLE_EVENING = 0.38;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type SpenderType = "Weekend spender" | "Evening spender" | "Balanced spender";
export type SpenderProfile = {
  type: SpenderType;
  summary: string;
  facts: { label: string; value: string }[];
  /** Share of everyday spending on Monday to Sunday, 0 to 1. */
  byWeekday: number[];
  busiestDay: string;
};

const hourOf = (ts: string) => {
  const m = /^\d{2}[A-Z]{3}\d{2}:(\d{2}):/.exec(ts);
  return m ? Number(m[1]) : null;
};
const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
const pct = (x: number) => `${Math.round(x * 100)}%`;
const eur = (n: number) => `€${Math.round(n)}`;

export function spenderProfile(c: Pick<DemoCustomer, "transactions" | "summary">): SpenderProfile | null {
  const months = new Set(c.summary.last12Months);
  const rows = c.transactions.filter((t) => t.amount < 0 && EVERYDAY.has(t.category) && months.has(t.date.slice(0, 7)));
  const total = rows.reduce((s, t) => s - t.amount, 0);
  if (rows.length < 30 || total <= 0) return null; // too little to say anything true

  const byDay = Array<number>(7).fill(0);
  let leisure = 0;
  let leisureWeekend = 0;
  let timed = 0;
  let evening = 0;
  for (const t of rows) {
    const spent = -t.amount;
    const day = weekdayOf(t.date);
    byDay[day] += spent;
    if (LEISURE.has(t.category)) {
      leisure += spent;
      if (day >= 5) leisureWeekend += spent;
    }
    const h = hourOf(t.ts);
    if (h !== null) {
      timed += spent;
      if (h >= 17) evening += spent;
    }
  }
  const weekendIdx = leisure > 0 ? leisureWeekend / leisure / SAMPLE_WEEKEND_LEISURE : 0;
  const hasTimes = timed >= total * 0.5;
  const eveningIdx = hasTimes ? evening / timed / SAMPLE_EVENING : 0;

  const type: SpenderType =
    Math.max(weekendIdx, eveningIdx) < 1.15 ? "Balanced spender" : weekendIdx >= eveningIdx ? "Weekend spender" : "Evening spender";
  const summary =
    type === "Weekend spender"
      ? "Your fun spending leans to the weekend, more than the average customer's."
      : type === "Evening spender"
        ? "Your spending leans to the evening, more than the average customer's."
        : "Your spending is spread about like the average customer's.";

  const amounts = rows.map((t) => -t.amount).sort((a, b) => b - a);
  const typical = amounts[amounts.length >> 1];
  const top = amounts.slice(0, Math.max(1, Math.round(amounts.length * 0.1))).reduce((s, x) => s + x, 0);
  const busiest = byDay.indexOf(Math.max(...byDay));

  const facts: SpenderProfile["facts"] = [];
  if (leisure > 0) facts.push({ label: "Restaurants, entertainment and lifestyle on weekends", value: `${pct(leisureWeekend / leisure)}, average customer about ${pct(SAMPLE_WEEKEND_LEISURE)}` });
  if (hasTimes) facts.push({ label: "Everyday spending after 17:00", value: `${pct(evening / timed)}, average customer about ${pct(SAMPLE_EVENING)}` });
  facts.push({ label: "Busiest day", value: DAYS[busiest] });
  facts.push({ label: "Typical purchase", value: `${eur(typical)}, and the largest 10% make up ${pct(top / total)} of the total` });

  return { type, summary, facts, byWeekday: byDay.map((x) => x / total), busiestDay: DAYS[busiest] };
}
