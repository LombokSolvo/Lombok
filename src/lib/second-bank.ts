// DEMO DATA for the multi-bank view: what Aino's Nordea accounts would add to her S-Pankki picture.
// Everything here is made up by a seeded generator (the same output every time). It uses the same kinds of payments a real
// export has, but contains no real rows and nothing from any real account.
//
// The story it tells: S-Pankki alone doesn't see (1) a side income that lands at Nordea, (2) bills paid from Nordea (insurance,
// gym, streaming), (3) money moved between her own accounts and to an investment account, which is saving and not spending, and
// (4) savings held elsewhere. Connecting the banks changes her safe-to-spend and her coach's answers.
import type { Tx } from "@/lib/demo";

export type BankAccount = { id: string; label: string; balance: number; bank?: string };
export type SecondBanks = {
  nordea: { accounts: BankAccount[]; transactions: Tx[] };
  klarna: { accounts: BankAccount[]; transactions: Tx[] }; // pay-later instalments, no cash
  traderepublic: { accounts: BankAccount[]; transactions: Tx[] }; // cash that waits to be invested, and an ETF savings plan
};

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

type Event = Omit<Tx, "balance" | "ts" | "mcc">;

/** 24 months of Nordea activity ending on `endIso` (the demo data's last day). */
export function syntheticBanks(endIso: string): SecondBanks {
  const rand = rng(20261114);
  const [ey, em] = endIso.split("-").map(Number);
  const endMonthIndex = ey * 12 + (em - 1);
  const events: Event[] = [];

  for (let k = 23; k >= 0; k--) {
    const idx = endMonthIndex - k;
    const y = Math.floor(idx / 12);
    const m0 = idx % 12;
    const last = daysIn(y, m0);
    const at = (day: number) => `${y}-${pad(m0 + 1)}-${pad(Math.min(day, last))}`;
    const e = (day: number, account: string, category: string, amount: number, type: string, merchant: string | null) => {
      const date = at(day);
      if (date <= endIso) events.push({ date, account, category, amount: Math.round(amount * 100) / 100, type, merchant });
    };

    e(1, "N1", "Subscriptions", -33.9, "direct_debit", "Gym membership");
    e(3, "N1", "Insurance", -47, "direct_debit", "Car insurance"); // her home insurance is paid from S-Pankki (src/lib/demo.ts)
    e(7, "N1", "Subscriptions", -11.99, "direct_debit", "Spotify");
    e(12, "N1", "Subscriptions", -13.99, "direct_debit", "Netflix");
    e(20, "N1", "Side income", 590 + Math.round(rand() * 40), "income", "Freelance client");
    e(21, "N1", "Transfer", -200, "own_transfer", "To savings account");
    e(21, "N2", "Transfer", 200, "own_transfer", "From everyday account");
    e(22, "N1", "Invest Deposit", -100, "own_transfer", "Investment account");
    for (let i = 0; i < 6; i++) e(1 + Math.floor(rand() * 28), "N1", "Groceries", -(14 + rand() * 28), "card_payment", "Grocery shop");
    for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) e(1 + Math.floor(rand() * 28), "N1", "Restaurants", -(11 + rand() * 25), "card_payment", "Restaurant");
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  const balance: Record<string, number> = { N1: 2500, N2: 5200 };
  const transactions: Tx[] = events.map((ev) => {
    balance[ev.account] = Math.round((balance[ev.account] + ev.amount) * 100) / 100;
    return { ...ev, ts: ev.date, balance: balance[ev.account], mcc: null };
  });

  // Klarna: two pay-later purchases paid in monthly instalments; they show up as fixed monthly costs and upcoming payments.
  const klarna: Event[] = [];
  const traderepublic: Event[] = [];
  for (let k = 23; k >= 0; k--) {
    const idx = endMonthIndex - k;
    const y = Math.floor(idx / 12);
    const m0 = idx % 12;
    const at = (day: number) => `${y}-${pad(m0 + 1)}-${pad(Math.min(day, daysIn(y, m0)))}`;
    const push = (list: Event[], day: number, account: string, category: string, amount: number, type: string, merchant: string) => {
      const date = at(day);
      if (date <= endIso) list.push({ date, account, category, amount, type, merchant });
    };
    if (k < 9) push(klarna, 18, "K1", "Pay later", -64.9, "direct_debit", "Klarna: sofa, 12 payments");
    if (k < 7) push(klarna, 26, "K1", "Pay later", -29.9, "direct_debit", "Klarna: phone, 24 payments");
    push(traderepublic, 1, "T1", "Transfer", 150, "own_transfer", "From your everyday account");
    push(traderepublic, 2, "T1", "Invest Deposit", -150, "own_transfer", "ETF savings plan");
    push(traderepublic, 28, "T1", "Other Income", 5.1, "income", "Interest on cash");
  }
  const run = (list: Event[], start: number): Tx[] => {
    let b = start;
    return list.sort((a, b2) => a.date.localeCompare(b2.date)).map((ev) => ({ ...ev, ts: ev.date, balance: (b = Math.round((b + ev.amount) * 100) / 100), mcc: null }));
  };
  const klarnaTx = run(klarna, 0);
  const trTx = run(traderepublic, 1720);

  return {
    klarna: { accounts: [], transactions: klarnaTx },
    traderepublic: { accounts: [{ id: "T1", label: "Cash, not invested yet", balance: trTx[trTx.length - 1]?.balance ?? 1720, bank: "Trade Republic" }], transactions: trTx },
    nordea: {
      accounts: [
        { id: "N1", label: "Everyday account", balance: balance.N1 },
        { id: "N2", label: "Savings account", balance: balance.N2 },
      ],
      transactions,
    },
  };
}
