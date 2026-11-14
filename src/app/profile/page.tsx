import { Suspense } from "react";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { PAGE } from "@/components/solvo/ui";
import { DEFAULT_SAVINGS_GOAL_PER_MONTH } from "@/lib/coach";
import { currentLinked, sandboxEnabled } from "@/lib/linked-bank";
import { liveStatus } from "@/lib/live-nordea";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { ProfileClient } from "./profile-client";

export const metadata = { title: "Profile · Solvo" };

export default function ProfilePage({ searchParams }: { searchParams: Promise<{ bank?: string }> }) {
  return (
    <Screen>
      <Suspense fallback={<main className={PAGE} />}>
        <Profile searchParams={searchParams} />
      </Suspense>
    </Screen>
  );
}

async function Profile({ searchParams }: { searchParams: Promise<{ bank?: string }> }) {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const { customer: c, cookieBanks, view } = await getEffective(await pageMode());
  const { bank } = await searchParams;
  const linked = await currentLinked();
  return (
    <ProfileClient
      name="Aino Esimerkki"
      id={c.id}
      age={c.age}
      postalCode={c.postalCode}
      savingsGoal={DEFAULT_SAVINGS_GOAL_PER_MONTH}
      banks={cookieBanks}
      view={view}
      showBanks
      live={liveStatus()}
      linkedBank={{ enabled: sandboxEnabled(), linked: linked && { bank: linked.bank, validUntil: linked.validUntil }, notice: bank ?? null }}
    />
  );
}
