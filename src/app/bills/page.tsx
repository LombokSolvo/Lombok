import { Suspense } from "react";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { PAGE } from "@/components/solvo/ui";
import { INVOICES } from "@/data/einvoices/CUST01787";
import { SAVED_READINGS } from "@/data/einvoices/saved-readings";
import { SUBSCRIPTIONS, subscriptionCharges } from "@/data/subscriptions";
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
        <Bills />
      </Suspense>
    </Screen>
  );
}

async function Bills() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { customer: c, mode } = await getEffective(await pageMode());
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
