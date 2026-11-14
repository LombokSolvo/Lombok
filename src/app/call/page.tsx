import { Suspense } from "react";
import { connection } from "next/server";
import { Screen } from "@/components/solvo/screen";
import { CallClient } from "./call-client";

export const metadata = { title: "Solvo is calling" };

export default function CallPage() {
  return (
    <Screen>
      <Suspense fallback={null}>
        <Call />
      </Suspense>
    </Screen>
  );
}

async function Call() {
  // Render per request: these pages show dates, and the demo clock reads the real date. See src/lib/demo-clock.ts.
  await connection();
  return <CallClient />;
}
