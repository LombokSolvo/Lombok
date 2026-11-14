import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { Screen } from "@/components/solvo/screen";
import { BackLink, Group, PAGE, PageTitle, Row, TopBar, eur, eur2 } from "@/components/solvo/ui";
import { SAVED_READINGS } from "@/data/einvoices/saved-readings";
import { HOBBIES, SUBSCRIPTIONS, subscriptionsMonthly, type Subscription } from "@/data/subscriptions";
import { BASKET_LABELS, type Basket } from "@/lib/demo";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";

export const metadata = { title: "Your costs · Solvo" };

const BASKET_COLOR: Record<Basket, string> = { 1: "bg-chart-1", 2: "bg-chart-2", 3: "bg-chart-4" };
// What a category holds, from the merchant category codes (MCC, a card-payment standard) of the person's own payments.
const MCC_LABEL: Record<string, string> = {
  "5200": "home supplies",
  "5211": "building materials",
  "5251": "hardware",
  "5712": "furniture",
  "5722": "home appliances",
  "5732": "electronics",
  "5734": "software",
  "5912": "pharmacy",
  "8011": "doctor",
  "8021": "dentist",
  "8099": "health services",
  "8062": "hospital",
  "4511": "flights",
  "4722": "travel agencies",
  "7011": "hotels",
  "7512": "car rental",
  "4411": "cruises",
  "7922": "concerts and theatre",
  "7832": "cinema",
  "7991": "attractions",
  "7996": "amusement parks",
  "7999": "recreation",
  "7997": "sports clubs",
  "5651": "clothing",
  "5942": "books",
  "5941": "sports gear",
  "5945": "toys and games",
  "5999": "shops",
  "5977": "cosmetics",
  "4111": "public transport",
  "4121": "taxis",
  "5541": "fuel",
  "5542": "fuel",
  "7523": "parking",
  "6300": "home insurance",
};
// Only the categories whose name doesn't already say what is in them get a line.
const EXPLAIN = new Set(["Insurance", "Home & Tech", "Health", "Travel", "Entertainment", "Lifestyle", "Transportation"]);

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
  // The merged customer, so the costs agree with Home when other banks are connected.
  const { customer: c, mode } = await getEffective(await pageMode());
  const aino = mode === "aino";
  const total = ([1, 2, 3] as Basket[]).reduce((s, b) => s + c.summary.basketYear[b], 0) / 12;
  const window = new Set(c.summary.last12Months);

  // What each category holds: its three biggest kinds of merchant over the last 12 months.
  const spendByMcc: Record<string, Record<string, number>> = {};
  for (const t of c.transactions) {
    // Named insurance payments from another bank say what they are (car insurance, travel insurance).
    const label = (t.mcc ? MCC_LABEL[t.mcc] : undefined) ?? (t.category === "Insurance" && t.merchant ? t.merchant.toLowerCase() : undefined);
    if (t.amount >= 0 || !label || !window.has(t.date.slice(0, 7))) continue;
    const m = (spendByMcc[t.category] ??= {});
    m[label] = (m[label] ?? 0) - t.amount;
  }
  const contents = (cat: string) => {
    const top = Object.entries(spendByMcc[cat] ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([l]) => l);
    return top.length ? top.join(", ").replace(/^./, (ch) => ch.toUpperCase()) : undefined;
  };

  // Aino's card subscriptions and gym (demo data) are fixed monthly costs: shown in the fixed basket, carved out of
  // Entertainment, so the totals stay the same.
  const fixedExtras = aino ? subscriptionsMonthly(SUBSCRIPTIONS) + subscriptionsMonthly(HOBBIES) : 0;
  const basketMonthly = (b: Basket) =>
    c.summary.basketYear[b] / 12 + (b === 1 ? fixedExtras : b === c.basketOf.Entertainment ? -fixedExtras : 0);

  const categories = (b: Basket) =>
    Object.entries(c.summary.categoryYear)
      .filter(([cat]) => c.basketOf[cat] === b)
      .map(([cat, perYear]): [string, number] => [cat, cat === "Entertainment" ? perYear - fixedExtras * 12 : perYear])
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
          aside={<span className="num">{eur.format(basketMonthly(b))}/mo</span>}
        >
          {categories(b).map(([cat, perYear]) => (
            <div key={cat} className="[&+&]:border-t">
              <Row
                title={cat === "Housing" ? "Rent" : cat}
                subtitle={EXPLAIN.has(cat) ? contents(cat) : undefined}
                value={`${eur.format(perYear / 12)}/mo`}
                valueSub={`${eur.format(perYear)} a year`}
              />
              {aino && cat === "Utilities" && <UtilityBreakdown />}
            </div>
          ))}
          {aino && b === 1 && (
            <>
              <FixedRow title="Subscriptions" subs={SUBSCRIPTIONS} />
              <FixedRow title="Hobbies" subs={HOBBIES} />
            </>
          )}
        </Group>
      ))}
    </main>
  );
}

/** A fixed monthly cost made of card payments (Aino's demo data): subscriptions, a gym membership. Tapping goes to Bills. */
function FixedRow({ title, subs }: { title: string; subs: Subscription[] }) {
  const monthly = subscriptionsMonthly(subs);
  return (
    <Link href="/bills" transitionTypes={["nav-forward"]} className="flex min-h-14 items-center gap-3 border-t px-4 py-3 active:bg-muted">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{subs.map((x) => x.name).join(", ")}</span>
      </span>
      <span className="num text-right text-[15px] font-medium">
        {eur.format(monthly)}/mo
        <span className="block text-[13px] font-normal text-muted-foreground">{eur.format(monthly * 12)} a year</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
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
              {r.supplier}
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
