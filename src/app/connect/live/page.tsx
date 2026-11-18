import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { LIVE_BANKS, parseLiveBank } from "@/lib/live-bank-ids";
import { liveEnabled, liveStatus } from "@/lib/live-banks";
import { isPersonal } from "@/lib/personal";
import { ConnectClient } from "./connect-client";

export const metadata = { title: "Connect a bank · Solvo" };

// LOCAL ONLY (SOLVO_LIVE=1). Where /callback lands after the bank's own login: downloads the transactions with a visible progress state.
export default async function ConnectLivePage({ searchParams }: { searchParams: Promise<{ bank?: string; error?: string }> }) {
  await connection();
  if (!liveEnabled()) notFound();
  const { bank: asked, error } = await searchParams;
  const bank = parseLiveBank(asked);
  return (
    <Screen>
      <ConnectClient
        bank={bank}
        bankName={bank ? LIVE_BANKS[bank].name : "your bank"}
        error={error ?? null}
        // The private deployment's main bank is connected from the welcome screen, so a failed first connection goes back there.
        {...(bank === "spankki" && isPersonal() ? { backHref: "/welcome", backLabel: "Welcome" } : {})}
        hasSession={!!bank && ((await liveStatus()).banks.find((b) => b.id === bank)?.accounts ?? 0) > 0}
      />
    </Screen>
  );
}
