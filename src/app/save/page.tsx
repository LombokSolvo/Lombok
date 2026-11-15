import { Suspense } from "react";
import { connection } from "next/server";
import { Reveal, Screen } from "@/components/solvo/screen";
import { PAGE } from "@/components/solvo/ui";
import { DEFAULT_SAVINGS_GOAL_PER_MONTH, safeToSpend } from "@/lib/coach";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { bankFacts } from "@/lib/combine";
import { SaveClient } from "./save-client";

export const metadata = { title: "Invest · Solvo" };

export default function SavePage() {
  return (
    <Screen>
      <Suspense fallback={<main className={PAGE} />}>
        <Reveal>
          <Save />
        </Reveal>
      </Suspense>
    </Screen>
  );
}

async function Save() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { base, customer: c, mode, banks, real } = await getEffective(await pageMode());
  // A connected Trade Republic: its cash waits to be invested, next to the S-Pankki funds.
  const tradeRepublic = banks.includes("traderepublic") ? bankFacts(base, banks, real).traderepublic : null;
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
      tradeRepublic={tradeRepublic}
    />
  );
}
