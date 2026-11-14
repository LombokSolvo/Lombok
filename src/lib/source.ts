// Where the app's data comes from.
//   always                   the synthetic S-Pankki demo customer (what the public app shows). Profile's "Demo account" switch
//                            picks Aino (CUST01787) or a new customer (CUST01590); the choice travels in the solvo-demo cookie
//                            so the server can read it.
//   npm run dev:live         plus, once the owner has approved at each bank, their REAL Nordea, Trade Republic and Revolut (files under
//                            data/private/, see src/lib/live-banks.ts). The app merges them with the demo customer like any other
//                            connected bank (src/lib/combine.ts).
//                            Bound to 127.0.0.1 only, so other devices on the Wi-Fi cannot reach it (see src/lib/live-banks.ts).
// The private file is gitignored and never exists on Vercel. As a second guard this throws on Vercel.
import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import { cookies } from "next/headers";
import { cacheLife } from "next/cache";
import { DEMO_CUSTOMERS, MAIN_CUSTOMER, type DemoCustomer } from "@/lib/demo";
import { DEMO_COOKIE, type DemoMode } from "@/lib/demo-mode";
import { LIVE_BANKS, LIVE_BANK_IDS, type LiveBankId, type RealBank } from "@/lib/live-bank-ids";
import { customerFileOf } from "@/lib/live-banks";

/** `customer` is always the synthetic base for the chosen demo account. `real` is the owner's real banks that are connected (none when empty); `local` says real data is in play. */
export type Source = { customer: DemoCustomer; local: boolean; mode: DemoMode; real: RealBank[] };

// The demo starts as the new customer, who goes through onboarding. Only an explicit "aino" shows the finished account.
const parse = (v: string | undefined): DemoMode => (v === "aino" ? "aino" : "new");

/** The demo account for a page. Private cache: the client router keeps it, so tab switches stay instant. */
export async function pageMode(): Promise<DemoMode> {
  "use cache: private";
  cacheLife({ stale: 300 });
  return parse((await cookies()).get(DEMO_COOKIE)?.value);
}

/** The demo account for a route handler. */
export async function requestMode(): Promise<DemoMode> {
  return parse((await cookies()).get(DEMO_COOKIE)?.value);
}

/** The synthetic customer for a demo account. */
export const demoCustomerFor = (mode: DemoMode): DemoCustomer => (mode === "new" ? DEMO_CUSTOMERS.CUST01590 : MAIN_CUSTOMER);

// Each file is a few MB; parse it again only when a sync has rewritten it.
const cached = new Map<LiveBankId, { mtimeMs: number; customer: DemoCustomer }>();

export function getSource(mode: DemoMode = "new"): Source {
  const customer = demoCustomerFor(mode);
  if (process.env.SOLVO_LIVE !== "1") return { customer, local: false, mode, real: [] };
  if (process.env.VERCEL) throw new Error("SOLVO_LIVE=1 is local only and must not be set on Vercel");
  const real: RealBank[] = [];
  for (const id of LIVE_BANK_IDS) {
    const file = customerFileOf(id);
    if (!existsSync(file)) {
      cached.delete(id);
      continue;
    }
    const mtimeMs = statSync(file).mtimeMs;
    let hit = cached.get(id);
    if (!hit || hit.mtimeMs !== mtimeMs) {
      hit = { mtimeMs, customer: JSON.parse(readFileSync(file, "utf8")) as DemoCustomer };
      cached.set(id, hit);
    }
    real.push({ id, name: LIVE_BANKS[id].name, customer: hit.customer });
  }
  return { customer, local: real.length > 0, mode, real };
}
