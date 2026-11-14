import { Suspense } from "react";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { learnContext } from "@/lib/learn-context";
import { pageMode } from "@/lib/source";
import { getEffective } from "@/lib/source-banks";
import { CoachClient } from "./coach-client";

export const metadata = { title: "Ask Solvo" };

export default function CoachPage() {
  return (
    <Screen>
      <Suspense fallback={<main className="flex min-h-dvh flex-1 flex-col" />}>
        <Coach />
      </Suspense>
    </Screen>
  );
}

async function Coach() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  const mode = await pageMode();
  const { customer } = await getEffective(mode);
  // Only the few numbers the learning packs show reach the browser, never transactions.
  return <CoachClient learn={learnContext(customer, mode)} mode={mode} />;
}
