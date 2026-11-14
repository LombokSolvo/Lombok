import { Suspense } from "react";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { PAGE } from "@/components/solvo/ui";
import { DEFAULT_SAVINGS_GOAL_PER_MONTH, safeToSpend } from "@/lib/coach";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { SaveClient } from "./save-client";

export const metadata = { title: "Save · Solvo" };

export default function SavePage() {
  return (
    <Screen>
      <Suspense fallback={<main className={PAGE} />}>
        <Save />
      </Suspense>
    </Screen>
  );
}

async function Save() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { base, customer: c, mode } = await getEffective(await pageMode());
  // The balance shown is S-Pankki's own, whichever other banks are merged in.
  const last = base.transactions[base.transactions.length - 1];
  // Fund deposits and withdrawals in the data (neither demo customer has any; Aino's holdings are demo data).
  const fundTx = c.transactions.filter((t) => t.category === "Invest Deposit" || t.category === "Invest Withdraw");
  const inFunds = -fundTx.reduce((sum, t) => sum + t.amount, 0);
  return (
    <SaveClient
      remaining={safeToSpend(c).remaining}
      asOf={c.asOf}
      balance={last?.balance ?? 0}
      inFunds={Math.max(0, inFunds)}
      fundDeposits={fundTx.filter((t) => t.amount < 0).length}
      savingsGoal={DEFAULT_SAVINGS_GOAL_PER_MONTH}
      hasFunds={mode === "aino"}
      mode={mode}
    />
  );
}
