import { Landmark, PiggyBank, Repeat, TrendingUp } from "lucide-react";
import { ViewToggle } from "@/components/view-toggle";
import { MoneyBadge, SignedAmount } from "@/components/solvo/money-badge";
import { Group, IconTile, Row, eur } from "@/components/solvo/ui";
import { bankFacts } from "@/lib/combine";
import type { BankId, View } from "@/lib/banks";
import type { DemoCustomer } from "@/lib/demo";
import type { RealBank } from "@/lib/live-bank-ids";
import { portfolio } from "@/data/portfolio";

/**
 * Home, only once another bank is connected: the whole money picture across banks, and what the other bank adds that S-Pankki
 * alone cannot see. DEMO data for the second bank when none is real (src/lib/second-bank.ts).
 */
/** funds: show the S-Pankki fund holdings row (Aino's demo holdings; a new customer has none). */
export function AllBanksCard({ base, banks, view, bankName = "Nordea", real = [], funds: hasFunds = false }: { base: DemoCustomer; banks: BankId[]; view: View; bankName?: string; real?: RealBank[]; funds?: boolean }) {
  if (!banks.length) return null;
  const f = bankFacts(base, banks, real);
  const funds = hasFunds ? Math.round(portfolio().value) : 0;
  const cash = f.spankki.cash + (f.nordea ? f.nordea.everyday + f.nordea.savings : 0);
  const subs = f.nordea?.bills.find((b) => b.label === "Subscriptions");
  const insurance = f.nordea?.bills.find((b) => b.label === "Insurance");

  return (
    <Group title="All your banks" className="mt-4">
      <div className="p-3">
        <ViewToggle banks={banks} view={view} />
      </div>
      {view === "all" ? (
        <>
          <Row
            icon={<IconTile><Landmark /></IconTile>}
            title="Cash and savings"
            subtitle={`S-Pankki ${eur.format(f.spankki.cash)}${f.nordea ? f.nordea.perBank.map((b) => ` · ${b.name || bankName} ${eur.format(b.cash)}`).join("") : ""}`}
            value={eur.format(cash)}
          />
          {funds > 0 && (
            <Row
              icon={<IconTile><TrendingUp /></IconTile>}
              title="Investments"
              subtitle={`S-Pankki funds ${eur.format(funds)}`}
              value={eur.format(funds)}
            />
          )}
          {f.nordea && f.nordea.sideIncomeMonthly > 0 && (
            <Row icon={<MoneyBadge kind="in" />} title={real.length ? "Income at your other banks" : `Income at ${bankName}`} subtitle="S-Pankki can't see this" value={<SignedAmount kind="in" value={f.nordea.sideIncomeMonthly} />} valueSub="a month" />
          )}
          {subs && (
            <Row icon={<IconTile><Repeat /></IconTile>} title="Subscriptions" subtitle={subs.names} value={<SignedAmount kind="out" value={subs.monthly} />} valueSub="a month" />
          )}
          {insurance && (
            <Row icon={<MoneyBadge kind="out" />} title="Insurance" subtitle={insurance.names} value={<SignedAmount kind="out" value={insurance.monthly} />} valueSub="a month" />
          )}
          {f.nordea && f.nordea.movedBetweenAccountsMonthly > 0 && (
            <Row
              icon={<IconTile tone="grey"><PiggyBank /></IconTile>}
              title="Moved between your accounts"
              subtitle="To savings and investing. Saving, not spending."
              value={eur.format(f.nordea.movedBetweenAccountsMonthly)}
              valueSub="a month"
            />
          )}
        </>
      ) : (
        <p className="px-4 pb-4 text-[14px] leading-snug text-muted-foreground">Showing S-Pankki only.</p>
      )}
    </Group>
  );
}
