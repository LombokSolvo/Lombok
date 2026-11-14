// Server only: the demo JSON holds every transaction (~190 KB per customer). Importing this file
// from a client component fails the build, so the data never reaches the phone. Pass props instead.
import "server-only";
import cust01787 from "@/data/demo/CUST01787.json";
import cust01590 from "@/data/demo/CUST01590.json";

// Built by scripts/build-demo-data.mjs from the S-Pankki dataset.
export type Basket = 1 | 2 | 3;

export type Tx = {
  date: string;
  ts: string;
  account: string;
  category: string;
  amount: number; // signed EUR, debits negative
  balance: number;
  type: string;
  merchant: string | null;
  mcc: string | null;
};

export type DemoCustomer = {
  id: string;
  postalCode: string;
  age: number;
  asOf: string; // the demo treats this date as "today"
  accounts: string[];
  basketOf: Record<string, Basket>;
  summary: {
    last12Months: string[];
    basketYear: Record<Basket, number>;
    categoryYear: Record<string, number>;
    salaryYear: number;
  };
  monthly: Record<string, Record<string, number>>;
  transactions: Tx[];
  /** Real bank data only: the current balance per account id (A, B, ...), from the bank's balances call. */
  balances?: Record<string, number>;
};

// DEMO DATA: Aino's home insurance. The dataset has no insurance payments, so a monthly one is added here (contents
// insurance for her rented flat, a typical Finnish price). It is carved out of her own irregular (basket 2) payments, so
// her total spending, balances and safe-to-spend stay exactly as in the dataset: the money only moves from "fixed and
// irregular" to "fixed and regular", where an insurance bill belongs.
export const HOME_INSURANCE = { monthly: 19.9, day: 15, label: "Home insurance" };

function withHomeInsurance(c: DemoCustomer): DemoCustomer {
  const amount = HOME_INSURANCE.monthly;
  const tx = c.transactions.map((t) => ({ ...t }));
  const months = [...new Set(tx.map((t) => t.date.slice(0, 7)))].sort();
  // Each month's insurance comes off the biggest irregular payment that month, or the next month that has one.
  let owed = 0;
  for (const m of months) {
    owed += amount;
    const from = tx
      .filter((t) => t.date.startsWith(m) && t.amount < 0 && c.basketOf[t.category] === 2)
      .sort((a, b) => a.amount - b.amount)[0];
    if (from && -from.amount > owed + 1) {
      from.amount = Math.round((from.amount + owed) * 100) / 100;
      owed = 0;
    }
  }
  const added: Tx[] = months.map((m) => {
    const date = `${m}-${String(HOME_INSURANCE.day).padStart(2, "0")}`;
    const before = tx.filter((t) => t.date <= date).at(-1);
    const d = new Date(`${date}T00:00:00Z`);
    const ts = `${date.slice(8)}${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}${date.slice(2, 4)}:06:00:00`;
    return { date, ts, account: c.accounts[0], category: "Insurance", amount: -amount, balance: before?.balance ?? 0, type: "direct_debit", merchant: HOME_INSURANCE.label, mcc: "6300" };
  });
  const transactions = [...tx, ...added].sort((a, b) => a.date.localeCompare(b.date));
  const basketOf: Record<string, Basket> = { ...c.basketOf, Insurance: 1 };
  const monthly: DemoCustomer["monthly"] = {};
  for (const t of transactions) {
    const m = (monthly[t.date.slice(0, 7)] ??= {});
    m[t.category] = Math.round(((m[t.category] ?? 0) + t.amount) * 100) / 100;
  }
  const basketYear: Record<Basket, number> = { 1: 0, 2: 0, 3: 0 };
  const categoryYear: Record<string, number> = {};
  for (const m of c.summary.last12Months)
    for (const [cat, sum] of Object.entries(monthly[m] ?? {}))
      if (basketOf[cat]) {
        basketYear[basketOf[cat]] = Math.round((basketYear[basketOf[cat]] - sum) * 100) / 100;
        categoryYear[cat] = Math.round(((categoryYear[cat] ?? 0) - sum) * 100) / 100;
      }
  return { ...c, basketOf, monthly, transactions, summary: { ...c.summary, basketYear, categoryYear } };
}

export const DEMO_CUSTOMERS = {
  CUST01787: withHomeInsurance(cust01787 as unknown as DemoCustomer), // main persona: 34, Espoo
  CUST01590: cust01590 as unknown as DemoCustomer,
};

export const MAIN_CUSTOMER = DEMO_CUSTOMERS.CUST01787;

export const BASKET_LABELS: Record<Basket, { title: string; blurb: string }> = {
  1: { title: "Fixed and regular", blurb: "Rent, electricity, phone and internet, insurance" },
  2: { title: "Fixed and irregular", blurb: "Health, travel, home and tech" },
  3: { title: "Everyday leakage", blurb: "Food, taxis, entertainment, lifestyle" },
};
