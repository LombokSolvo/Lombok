// Where the app's data comes from.
//   always                   the synthetic S-Pankki demo customer (what the public app shows). Profile's "Demo account" switch
//                            picks Aino (CUST01787) or a new customer (CUST01590); the choice travels in the solvo-demo cookie
//                            so the server can read it.
//   npm run dev:live         plus, once the owner has approved with Nordea ID, their REAL Nordea (data/private/nordea-customer.json).
//                            The app then merges it with the demo customer like any other connected bank (src/lib/combine.ts).
//                            Bound to 127.0.0.1 only, so other devices on the Wi-Fi cannot reach it (see src/lib/live-nordea.ts).
// The private file is gitignored and never exists on Vercel. As a second guard this throws on Vercel.
import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { cacheLife } from "next/cache";
import { DEMO_CUSTOMERS, MAIN_CUSTOMER, type DemoCustomer } from "@/lib/demo";
import { DEMO_COOKIE, type DemoMode } from "@/lib/demo-mode";

/** `customer` is always the synthetic base for the chosen demo account. `real` is the owner's real Nordea when connected, else null; `local` says real data is in play. */
export type Source = { customer: DemoCustomer; local: boolean; mode: DemoMode; real: DemoCustomer | null };

const parse = (v: string | undefined): DemoMode => (v === "new" ? "new" : "aino");

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

let cached: { mtimeMs: number; customer: DemoCustomer } | null = null;

export function getSource(mode: DemoMode = "aino"): Source {
  const customer = demoCustomerFor(mode);
  if (process.env.SOLVO_LIVE !== "1") return { customer, local: false, mode, real: null };
  if (process.env.VERCEL) throw new Error("SOLVO_LIVE=1 is local only and must not be set on Vercel");
  const file = path.join(process.cwd(), "data/private/nordea-customer.json");
  if (!existsSync(file)) {
    cached = null;
    return { customer, local: false, mode, real: null };
  }
  // The file is a few MB; parse it again only when a sync has rewritten it.
  const mtimeMs = statSync(file).mtimeMs;
  if (!cached || cached.mtimeMs !== mtimeMs) cached = { mtimeMs, customer: JSON.parse(readFileSync(file, "utf8")) as DemoCustomer };
  return { customer, local: true, mode, real: cached.customer };
}
