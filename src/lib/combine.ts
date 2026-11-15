// One customer made of several banks. Merges Aino's S-Pankki data with the demo Nordea accounts and recomputes the sums the
// rest of the app reads (baskets, income, monthly totals), so Home, the plan, the calendar and the coach all see the full picture.
// Transfers between her own accounts and deposits to an investment account are not spending, so they stay out of every basket.
import type { DemoCustomer, Tx } from "@/lib/demo";
import type { RealBank } from "@/lib/live-bank-ids";
import { BANK_INFO, type BankId } from "@/lib/banks";
import { daysBetween, shiftIso, todayIso } from "@/lib/demo-clock";
import { syntheticBanks, type BankAccount, type SecondBanks } from "@/lib/second-bank";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The second bank(s) the person has: their REAL connected banks (Nordea, Trade Republic, Revolut) when there are any, else the
 * simulated Nordea. Real transactions carry real dates, so they are moved onto the demo timeline (back by the days between the demo
 * data's last day and today); the demo clock shifts every date forward again when it is shown, so each transaction appears on its
 * true day. Each bank's accounts get ids of their own and carry the bank's name.
 */
function realBanksAsSecond(base: DemoCustomer, real: RealBank[]): SecondBanks["nordea"] {
  const offset = Math.max(0, daysBetween(base.asOf, todayIso()));
  const accounts: BankAccount[] = [];
  const transactions: Tx[] = [];
  for (const bank of real) {
    const c = bank.customer;
    const ids = new Map(c.accounts.map((a, i) => [a, `${bank.id}-${i + 1}`] as const));
    const own = c.transactions
      .map((t) => ({ ...t, date: shiftIso(t.date, -offset), ts: shiftIso(t.date, -offset), account: ids.get(t.account) ?? t.account }))
      .filter((t) => t.date <= base.asOf);
    transactions.push(...own);
    // The account with the most activity is the everyday account; the others count as savings.
    const count = (id: string) => own.filter((t) => t.account === id).length;
    const ordered = c.accounts.map((a) => ({ letter: a, id: ids.get(a) as string })).sort((x, y) => count(y.id) - count(x.id));
    const lastBalance = (id: string) => [...own].reverse().find((t) => t.account === id)?.balance ?? 0;
    ordered.forEach((a, i) =>
      accounts.push({ id: a.id, bank: bank.name, label: i === 0 ? `${bank.name}` : `${bank.name}, other`, balance: c.balances?.[a.letter] ?? lastBalance(a.id) }),
    );
  }
  if (real.length > 1) matchOwnTransfers(transactions);
  return { accounts, transactions: transactions.sort((x, y) => x.date.localeCompare(y.date)) };
}

/**
 * Money a person moves between their own banks shows up twice: out of one bank, into another. Left alone, the "out" would count as
 * spending and the spending at the other end would count again. Pair each outgoing payment with an incoming one of the same amount in
 * a different bank within three days and mark both as a transfer. A deposit to an investing platform stays saving at the sending end,
 * and pay is never paired.
 */
function matchOwnTransfers(rows: Tx[]) {
  const bankOf = (t: Tx) => t.account.split("-")[0];
  const cents = (t: Tx) => Math.round(Math.abs(t.amount) * 100);
  const credits = new Map<number, Tx[]>();
  for (const t of rows) {
    if (t.amount > 0 && t.category !== "Salary" && t.category !== "Transfer") (credits.get(cents(t)) ?? credits.set(cents(t), []).get(cents(t))!).push(t);
  }
  const used = new Set<Tx>();
  for (const out of rows) {
    if (out.amount >= 0 || out.category === "Transfer") continue;
    const match = credits.get(cents(out))?.find((c) => !used.has(c) && bankOf(c) !== bankOf(out) && Math.abs(daysBetween(out.date, c.date)) <= 3);
    if (!match) continue;
    used.add(match);
    // A deposit to an investing platform stays saving at the sending end; what arrives at the other end is just the same money.
    if (out.category !== "Invest Deposit") out.category = "Transfer";
    match.category = "Transfer";
  }
}

/** The second bank(s): the real banks, or the simulated Nordea when there are none. */
export function secondBanksFor(base: DemoCustomer, real: RealBank[] = []): SecondBanks {
  const synthetic = syntheticBanks(base.asOf);
  return real.length ? { ...synthetic, nordea: realBanksAsSecond(base, real) } : synthetic;
}

export function combinedCustomer(base: DemoCustomer, banks: BankId[], real: RealBank[] = []): DemoCustomer {
  if (!banks.length) return base;
  const sb = secondBanksFor(base, real);
  const parts = banks.map((id) => sb[id]);
  const transactions = [...base.transactions, ...parts.flatMap((p) => p.transactions)].sort((a, b) => a.date.localeCompare(b.date));
  // Insurance, subscriptions (Netflix, Spotify, a gym) and pay-later instalments are fixed, regular costs: basket 1.
  const basketOf: DemoCustomer["basketOf"] = { ...Object.assign({}, ...real.map((r) => r.customer.basketOf)), ...base.basketOf, Insurance: 1, Subscriptions: 1, "Pay later": 1 };

  const monthly: DemoCustomer["monthly"] = {};
  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    monthly[m] ??= {};
    monthly[m][t.category] = round2((monthly[m][t.category] ?? 0) + t.amount);
  }
  const months = base.summary.last12Months;
  const basketYear = { 1: 0, 2: 0, 3: 0 } as DemoCustomer["summary"]["basketYear"];
  const categoryYear: Record<string, number> = {};
  let salaryYear = 0;
  for (const m of months) {
    for (const [cat, sum] of Object.entries(monthly[m] ?? {})) {
      if (basketOf[cat]) {
        basketYear[basketOf[cat]] = round2(basketYear[basketOf[cat]] - sum);
        categoryYear[cat] = round2((categoryYear[cat] ?? 0) - sum);
      }
      if (cat === "Salary" || cat === "Side income") salaryYear = round2(salaryYear + sum);
    }
  }
  return {
    ...base,
    accounts: [...base.accounts, ...parts.flatMap((p) => p.accounts.map((a) => a.id))],
    basketOf,
    summary: { ...base.summary, basketYear, categoryYear, salaryYear },
    monthly,
    transactions,
  };
}

/** What the connected banks and apps add, in numbers a card or the coach can state. Based on the last 12 complete months. */
export function bankFacts(base: DemoCustomer, banks: BankId[], real: RealBank[] = [], bankName = "Nordea") {
  const sb = secondBanksFor(base, real);
  const months = new Set(base.summary.last12Months);
  const inYear = <T extends { date: string }>(txs: T[]) => txs.filter((t) => months.has(t.date.slice(0, 7)));
  const rows = inYear(sb.nordea.transactions);
  const per = (list: typeof rows, pred: (t: (typeof rows)[number]) => boolean) => list.filter(pred).reduce((s, t) => s + t.amount, 0) / 12;
  const lastBalance = base.transactions[base.transactions.length - 1]?.balance ?? 0;
  const bills = ["Insurance", "Subscriptions"]
    .map((cat) => ({ cat, monthly: -per(rows, (t) => t.category === cat), names: [...new Set(rows.filter((t) => t.category === cat).map((t) => t.merchant))].join(", ") }))
    .filter((b) => b.monthly > 0);
  const klarnaRows = sb.klarna.transactions.slice(-12);
  const trRows = inYear(sb.traderepublic.transactions);
  // Cash per bank or app, for the card's subtitle. The simulated bank has no bank name on its accounts, so it uses the picked name.
  const perBank = banks.flatMap((id) =>
    [...sb[id].accounts.reduce((m, a) => m.set(a.bank || (id === "nordea" ? "" : BANK_INFO[id].name), (m.get(a.bank ?? "") ?? 0) + a.balance), new Map<string, number>())].map(
      ([name, cash]) => ({ name: name || bankName, cash: Math.round(cash) }),
    ),
  );
  const lastMonth = (list: typeof klarnaRows) => list.filter((t) => t.date.slice(0, 7) === list[list.length - 1]?.date.slice(0, 7));
  return {
    spankki: { cash: Math.round(lastBalance) },
    perBank,
    nordea: banks.includes("nordea")
      ? {
          everyday: Math.round(sb.nordea.accounts[0].balance),
          savings: Math.round(sb.nordea.accounts.slice(1).reduce((s, a) => s + a.balance, 0)),
          // Income that lands here and that S-Pankki cannot see: a side income in the demo, pay and other income when it is real.
          sideIncomeMonthly: Math.round(per(rows, (t) => t.category === "Side income" || (real.length > 0 && (t.category === "Salary" || t.category === "Other Income")))),
          billsMonthly: Math.round(bills.reduce((s, b) => s + b.monthly, 0)),
          bills: bills.map((b) => ({ label: b.cat, monthly: Math.round(b.monthly), names: b.names })),
          movedBetweenAccountsMonthly: Math.round(-per(rows, (t) => t.category === "Transfer" && t.amount < 0) - per(rows, (t) => t.category === "Invest Deposit")),
        }
      : null,
    // Pay later: what this month's instalments add up to, and for what.
    klarna: banks.includes("klarna")
      ? { monthly: Math.round(-lastMonth(klarnaRows).reduce((s, t) => s + t.amount, 0)), names: [...new Set(lastMonth(klarnaRows).map((t) => (t.merchant ?? "").replace(/^Klarna: /, "").split(",")[0]))].join(" and ") }
      : null,
    // Trade Republic: cash that is not invested yet, and the ETF savings plan that runs there.
    traderepublic: banks.includes("traderepublic")
      ? { cash: Math.round(sb.traderepublic.accounts[0]?.balance ?? 0), planMonthly: Math.round(-per(trRows, (t) => t.category === "Invest Deposit")) }
      : null,
  };
}

/** A paragraph for the coach when other banks are connected: what they add and that the numbers already include them. */
export function banksNoteFor(base: DemoCustomer, banks: BankId[], bankName = "Nordea"): string {
  const f = bankFacts(base, banks);
  const parts: string[] = [];
  if (f.nordea) {
    const bills = f.nordea.bills.map((b) => `${b.label} ${f.nordea ? "€" + b.monthly : ""}/month (${b.names})`).join("; ");
    parts.push(
      `${bankName} (demo data): everyday account €${f.nordea.everyday}, savings account €${f.nordea.savings}; side income €${f.nordea.sideIncomeMonthly}/month that S-Pankki cannot see; bills paid from ${bankName}: ${bills}; about €${f.nordea.movedBetweenAccountsMonthly}/month moves between her own accounts and to an investment account, which is saving, not spending.`,
    );
  }
  if (f.klarna) parts.push(`Klarna (demo data): pay-later instalments of about €${f.klarna.monthly}/month (${f.klarna.names}), a fixed monthly cost until they are paid off.`);
  if (f.traderepublic) parts.push(`Trade Republic (demo data): €${f.traderepublic.cash} cash not invested yet, and an ETF savings plan of €${f.traderepublic.planMonthly}/month there.`);
  return `\n\nOther banks the customer connected: ${parts.join(" ")} The safe-to-spend, budgets and spending figures above ALREADY include these banks. When it helps, say that an answer covers all her banks, and mention what S-Pankki alone would not show.`;
}
