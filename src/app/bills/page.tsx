import { Suspense } from "react";
import { connection } from "next/server";
import { Reveal, Screen } from "@/components/solvo/screen";
import { PAGE } from "@/components/solvo/ui";
import { INVOICES } from "@/data/einvoices/CUST01787";
import { SAVED_READINGS } from "@/data/einvoices/saved-readings";
import { SUBSCRIPTIONS, subscriptionCharges } from "@/data/subscriptions";
import { namedBillsFor } from "@/lib/bill-names";
import type { DemoCustomer } from "@/lib/demo";
import { isPersonal } from "@/lib/personal";
import { billType, inferSchedule } from "@/lib/schedule";
import type { Subscription } from "@/data/subscriptions";
import { safeToSpend } from "@/lib/coach";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import type { PaidBill } from "./bill-history";
import { BillsClient } from "./bills-client";

export const metadata = { title: "Your bills · Solvo" };

export default function BillsPage() {
  return (
    <Screen>
      <Suspense fallback={<main className={PAGE} />}>
        <Reveal>
          <Bills />
        </Reveal>
      </Suspense>
    </Screen>
  );
}

async function Bills() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { customer: c, mode } = await getEffective(await pageMode());
  if (isPersonal()) {
    const s = safeToSpend(c);
    const { history, subscriptions } = ownBills(c);
    return <BillsClient asOf={c.asOf} invoices={[]} weeklyBudget={s.weeklyBudget} remaining={s.remaining} history={history} subscriptions={subscriptions} dentalBill={false} intro="From the payments in your bank." />;
  }
  // The synthetic e-invoices (and the dentist bill) belong to Aino's demo story. The new customer has none yet.
  const invoices = mode === "aino" ? INVOICES : [];
  const subscriptions = mode === "aino" ? SUBSCRIPTIONS : []; // demo data, see src/data/subscriptions.ts
  const s = safeToSpend(c);
  // Rent and utility payments in the last 12 months. A payment that matches an e-invoice Solvo has read gets the
  // supplier's name; the others have none, because utility payments in the data carry no merchant.
  const from = `${c.summary.last12Months[0]}-01`;
  const history: PaidBill[] = c.transactions
    .filter((t) => (t.type === "housing_payment" || t.type === "utilities_payment") && t.date >= from && t.amount < 0)
    .map((t) => {
      const inv = invoices.find((i) => i.payment.date === t.date && i.payment.amount === t.amount);
      return {
        date: t.date,
        kind: t.type === "housing_payment" ? "rent" : "utility",
        amount: -t.amount,
        supplier: inv ? SAVED_READINGS[inv.id]?.supplier : undefined,
      };
    });
  // Name the unnamed ones too: each month has one payment per e-invoiced contract, in the same order through the month
  // (grid fee, electricity, phone and internet), so the k-th utility payment of a month gets the k-th bill's name.
  const named = mode === "aino" ? namedBillsFor("CUST01787") : [];
  const byMonth = new Map<string, PaidBill[]>();
  for (const b of history) if (b.kind === "utility") byMonth.set(b.date.slice(0, 7), [...(byMonth.get(b.date.slice(0, 7)) ?? []), b]);
  for (const bills of byMonth.values()) {
    if (bills.length !== named.length) continue; // only when the month clearly has one payment per contract
    [...bills].sort((a, b) => a.date.localeCompare(b.date)).forEach((b, k) => (b.label = named[k].label));
  }
  for (const s of subscriptionCharges(subscriptions, from, c.asOf)) {
    history.push({ date: s.date, kind: "subscription", amount: s.amount, supplier: s.name });
  }
  return (
    <BillsClient
      asOf={c.asOf}
      invoices={invoices.map(({ id, payment }) => ({ id, payment }))}
      weeklyBudget={s.weeklyBudget}
      remaining={s.remaining}
      history={history}
      subscriptions={subscriptions}
      dentalBill={mode === "aino"}
    />
  );
}

// The private deployment: real payments have the payee's name, so bills are named from it. Fixed bills are rent, utilities,
// insurance and subscriptions; subscriptions are the payees charged the same amount about monthly (inferSchedule).
const FIXED = new Set(["Housing", "Utilities", "Insurance", "Subscriptions"]);

function ownBills(c: DemoCustomer): { history: PaidBill[]; subscriptions: Subscription[] } {
  const from = `${c.summary.last12Months[0] ?? c.asOf.slice(0, 7)}-01`;
  const subscriptions: Subscription[] = inferSchedule(c)
    .items.filter((i) => i.id.startsWith("sub-"))
    .map((i) => {
      const paid = c.transactions.filter((t) => t.merchant === i.label && t.amount < 0);
      const first = paid[0]?.date ?? c.asOf;
      // The latest charge to the cent (the schedule rounds to whole euros).
      const monthly = paid.length ? -paid[paid.length - 1].amount : i.amount;
      return { id: `own-${i.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: i.label, what: i.detail ?? "Monthly payment", monthly, day: i.day, since: first.slice(0, 7) };
    });
  const subNames = new Set(subscriptions.map((s) => s.name));
  const history: PaidBill[] = c.transactions
    .filter((t) => t.date >= from && t.amount < 0 && FIXED.has(t.category) && !(t.merchant && subNames.has(t.merchant)))
    .map((t) => {
      const name = t.merchant && t.merchant !== "Person" ? t.merchant : null;
      const type = name ? billType(name) : null;
      return {
        date: t.date,
        kind: t.category === "Housing" ? "rent" : "utility",
        amount: -t.amount,
        label: type && name ? `${type}, ${name}` : (name ?? t.category),
      };
    });
  // The subscriptions' own payments, as the bank booked them.
  for (const t of c.transactions) {
    if (t.date >= from && t.amount < 0 && t.merchant && subNames.has(t.merchant)) history.push({ date: t.date, kind: "subscription", amount: -t.amount, supplier: t.merchant });
  }
  return { history, subscriptions };
}
