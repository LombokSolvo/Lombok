import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { Screen } from "@/components/solvo/screen";
import { BackLink, Chip, Group, PAGE, PageTitle, Row, TopBar, eur, eur2 } from "@/components/solvo/ui";
import { SAVED_READINGS } from "@/data/einvoices/saved-readings";
import { SUBSCRIPTIONS, subscriptionsMonthly } from "@/data/subscriptions";
import { BASKET_LABELS, type Basket } from "@/lib/demo";
import { getSource, pageMode } from "@/lib/source";

export const metadata = { title: "Your costs · Solvo" };

const BASKET_COLOR: Record<Basket, string> = { 1: "bg-chart-1", 2: "bg-chart-2", 3: "bg-chart-4" };
const KIND_LABEL: Record<string, string> = {
  electricity_energy: "Electricity",
  electricity_transmission: "Electricity transmission",
  telecom: "Phone and internet",
};

export default function CostsPage() {
  return (
    <Screen>
      <Suspense fallback={<main className={PAGE} />}>
        <Costs />
      </Suspense>
    </Screen>
  );
}

// Every spending category, by basket, from the last 12 months. For Aino it also opens up the utility payments with
// what Solvo read from her e-invoices (electricity, transmission, phone and internet) and her card subscriptions.
async function Costs() {
  const { customer: c, mode } = getSource(await pageMode());
  const aino = mode === "aino";
  const total = ([1, 2, 3] as Basket[]).reduce((s, b) => s + c.summary.basketYear[b], 0) / 12;
  const lastMonth = c.summary.last12Months.at(-1)!;
  const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

  const categories = (b: Basket) =>
    Object.entries(c.summary.categoryYear)
      .filter(([cat]) => c.basketOf[cat] === b)
      .sort((x, y) => y[1] - x[1]);

  return (
    <main className={PAGE}>
      <TopBar back={<BackLink href="/" label="Home" />} />
      <PageTitle title="Your costs">
        {eur.format(total)} a month on average over the last 12 months, in S-Pankki&apos;s three baskets.
      </PageTitle>

      {([1, 2, 3] as Basket[]).map((b, i) => (
        <Group
          key={b}
          className={i ? "mt-6" : "mt-0"}
          title={
            <span className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${BASKET_COLOR[b]}`} aria-hidden />
              {BASKET_LABELS[b].title}
            </span>
          }
          aside={<span className="num">{eur.format(c.summary.basketYear[b] / 12)}/mo</span>}
        >
          {categories(b).map(([cat, perYear]) => {
            const last = -(c.monthly[lastMonth]?.[cat] ?? 0);
            return (
              <div key={cat} className="[&+&]:border-t">
                <Row
                  title={cat === "Housing" ? "Rent" : cat}
                  subtitle={`${monthFmt.format(new Date(`${lastMonth}-01T00:00:00Z`))}: ${eur.format(last)}`}
                  value={`${eur.format(perYear / 12)}/mo`}
                  valueSub={`${eur.format(perYear)} a year`}
                />
                {aino && cat === "Utilities" && <UtilityBreakdown />}
                {aino && cat === "Entertainment" && (
                  <Link
                    href="/bills"
                    transitionTypes={["nav-forward"]}
                    className="flex min-h-12 items-center gap-3 bg-muted/40 py-2 pr-4 pl-8 active:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">Subscriptions</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {SUBSCRIPTIONS.map((x) => x.name).join(", ")} <Chip>Demo data</Chip>
                      </span>
                    </span>
                    <span className="num text-[14px]">{eur2.format(subscriptionsMonthly(SUBSCRIPTIONS))}/mo</span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                )}
              </div>
            );
          })}
        </Group>
      ))}

      <p className="mt-6 px-1 text-[13px] leading-snug text-muted-foreground">
        From your account in S-Pankki&apos;s synthetic Junction dataset. Utility payments in the data don&apos;t name the
        company{aino ? ", so the split comes from the e-invoices Solvo read" : ""}.
      </p>
    </main>
  );
}

/** Aino's utility payments, opened up by the e-invoices Solvo read. Tapping goes to Bills. */
function UtilityBreakdown() {
  return (
    <>
      {Object.values(SAVED_READINGS).map((r) => (
        <Link
          key={r.kind}
          href="/bills"
          transitionTypes={["nav-forward"]}
          className="flex min-h-12 items-center gap-3 bg-muted/40 py-2 pr-4 pl-8 active:bg-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">{KIND_LABEL[r.kind] ?? r.kind}</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {r.supplier}, {r.product}
            </span>
          </span>
          <span className="num text-right text-[14px]">
            {eur2.format(r.monthlyCost)}
            <span className="block text-[11px] text-muted-foreground">last bill</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ))}
    </>
  );
}
