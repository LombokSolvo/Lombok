import { Suspense } from "react";
import { Screen } from "@/components/solvo/screen";
import { BackLink, PAGE, PageTitle, TopBar } from "@/components/solvo/ui";
import { CompareExplorer } from "@/components/compare-card";
import { compareAll, ownGroups } from "@/lib/cohorts";
import { getSource, pageMode } from "@/lib/source";

export const metadata = { title: "How you compare · Solvo" };

export default function ComparePage() {
  return (
    <Screen>
      <Suspense fallback={<main className={PAGE} />}>
        <Compare />
      </Suspense>
    </Screen>
  );
}

// Server side: the person's own monthly figures against every group's statistics. Only these numbers reach the phone.
async function Compare() {
  const { customer: c } = getSource(await pageMode());
  const own = ownGroups(c);
  return (
    <main className={PAGE}>
      <TopBar back={<BackLink href="/" label="Home" />} />
      <PageTitle title="How you compare">
        Your last 12 months next to other people. Pick a group: by age, city or income.
      </PageTitle>
      <CompareExplorer groups={compareAll(c)} own={[own.age, own.area, own.income].filter((k): k is string => !!k)} />
    </main>
  );
}
