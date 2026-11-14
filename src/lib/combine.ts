// One customer made of several banks. Merges Aino's S-Pankki data with the demo Nordea accounts and recomputes the sums the
// rest of the app reads (baskets, income, monthly totals), so Home, the plan, the calendar and the coach all see the full picture.
// Transfers between her own accounts and deposits to Nordnet are not spending, so they stay out of every basket.
import type { DemoCustomer, Tx } from "@/lib/demo";
import type { RealBank } from "@/lib/live-bank-ids";
import type { BankId, Platform } from "@/lib/banks";
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
 * a different bank within three days and mark both as a transfer. Saving (deposits to an investing platform) and pay are left as they are.
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
    if (out.amount >= 0 || out.category === "Transfer" || out.category === "Invest Deposit") continue;
    const match = credits.get(cents(out))?.find((c) => !used.has(c) && bankOf(c) !== bankOf(out) && Math.abs(daysBetween(out.date, c.date)) <= 3);
    if (!match) continue;
    used.add(match);
    out.category = "Transfer";
    match.category = "Transfer";
  }
}

/** Both second-bank kinds in one place: the real banks (or the simulated Nordea) and the separate investing platform (always simulated). */
export function secondBanksFor(base: DemoCustomer, real: RealBank[] = []): SecondBanks {
  const synthetic = syntheticBanks(base.asOf);
  return real.length ? { ...synthetic, nordea: realBanksAsSecond(base, real) } : synthetic;
}

export function combinedCustomer(base: DemoCustomer, banks: BankId[], real: RealBank[] = []): DemoCustomer {
  if (!banks.includes("nordea")) return base;
  const nordea = secondBanksFor(base, real).nordea;
  const transactions = [...base.transactions, ...nordea.transactions].sort((a, b) => a.date.localeCompare(b.date));
  // Insurance and subscriptions (Netflix, Spotify, a gym) are fixed, regular costs: basket 1.
  const basketOf: DemoCustomer["basketOf"] = { ...Object.assign({}, ...real.map((r) => r.customer.basketOf)), ...base.basketOf, Insurance: 1, Subscriptions: 1 };

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
    accounts: [...base.accounts, ...nordea.accounts.map((a) => a.id)],
    basketOf,
    summary: { ...base.summary, basketYear, categoryYear, salaryYear },
    monthly,
    transactions,
  };
}

/** What the connected banks add, in numbers a card or the coach can state. Based on the last 12 complete months. */
export function bankFacts(base: DemoCustomer, banks: BankId[], real: RealBank[] = []) {
  const sb = secondBanksFor(base, real);
  const months = new Set(base.summary.last12Months);
  const rows = sb.nordea.transactions.filter((t) => months.has(t.date.slice(0, 7)));
  const per = (pred: (t: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((s, t) => s + t.amount, 0) / 12;
  const lastBalance = base.transactions[base.transactions.length - 1]?.balance ?? 0;
  const bills = ["Insurance", "Subscriptions"]
    .map((cat) => ({ cat, monthly: -per((t) => t.category === cat), names: [...new Set(rows.filter((t) => t.category === cat).map((t) => t.merchant))].join(", ") }))
    .filter((b) => b.monthly > 0);
  return {
    spankki: { cash: Math.round(lastBalance) },
    nordea: banks.includes("nordea")
      ? {
          // Cash per bank, for the card's subtitle. The simulated Nordea has no bank name on its accounts, so it is one entry.
          perBank: [...sb.nordea.accounts.reduce((m, a) => m.set(a.bank ?? "", (m.get(a.bank ?? "") ?? 0) + a.balance), new Map<string, number>())].map(([name, cash]) => ({ name, cash: Math.round(cash) })),
          everyday: Math.round(sb.nordea.accounts[0].balance),
          savings: Math.round(sb.nordea.accounts.slice(1).reduce((s, a) => s + a.balance, 0)),
          // Income that lands here and that S-Pankki cannot see: a side income in the demo, pay and other income when it is real.
          sideIncomeMonthly: Math.round(per((t) => t.category === "Side income" || (real.length > 0 && (t.category === "Salary" || t.category === "Other Income")))),
          billsMonthly: Math.round(bills.reduce((s, b) => s + b.monthly, 0)),
          bills: bills.map((b) => ({ label: b.cat, monthly: Math.round(b.monthly), names: b.names })),
          movedBetweenAccountsMonthly: Math.round(-per((t) => t.category === "Transfer" && t.amount < 0) - per((t) => t.category === "Invest Deposit")),
        }
      : null,
    nordnet: banks.includes("nordnet") ? sb.nordnet : null,
  };
}

/** A paragraph for the coach when other banks are connected: what they add and that the numbers already include them. */
export function banksNoteFor(base: DemoCustomer, banks: BankId[], platform: Platform = "Nordnet", bankName = "Nordea"): string {
  const f = bankFacts(base, banks);
  const parts: string[] = [];
  if (f.nordea) {
    const bills = f.nordea.bills.map((b) => `${b.label} ${f.nordea ? "€" + b.monthly : ""}/month (${b.names})`).join("; ");
    parts.push(
      `${bankName} (demo data): everyday account €${f.nordea.everyday}, savings account €${f.nordea.savings}; side income €${f.nordea.sideIncomeMonthly}/month that S-Pankki cannot see; bills paid from ${bankName}: ${bills}; about €${f.nordea.movedBetweenAccountsMonthly}/month moves between her own accounts and to her investing platform (${platform}), which is saving, not spending.`,
    );
  }
  if (f.nordnet) parts.push(`Separate investing platform, ${platform} (demo data): invested €${f.nordnet.invested}, worth €${f.nordnet.value}, €${f.nordnet.monthlyDeposit}/month deposits.`);
  return `\n\nOther banks the customer connected: ${parts.join(" ")} The safe-to-spend, budgets and spending figures above ALREADY include these banks. When it helps, say that an answer covers all her banks, and mention what S-Pankki alone would not show.`;
}
