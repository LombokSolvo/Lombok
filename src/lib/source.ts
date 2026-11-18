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
import { cookies } from "next/headers";
import { cacheLife } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO_CUSTOMERS, MAIN_CUSTOMER, type DemoCustomer } from "@/lib/demo";
import { todayIso } from "@/lib/demo-clock";
import { DEMO_COOKIE, type DemoMode } from "@/lib/demo-mode";
import { LIVE_BANKS, LIVE_BANK_IDS, type RealBank } from "@/lib/live-bank-ids";
import { customerKeyOf } from "@/lib/live-banks";
import { isPersonal } from "@/lib/personal";
import { readStored } from "@/lib/private-store";

/** `customer` is the base customer: the synthetic demo account, or on the private deployment the person's own S-Pankki. `real` is the other real banks that are connected (none when empty); `local` says real data is in play. */
export type Source = { customer: DemoCustomer; local: boolean; mode: DemoMode; real: RealBank[] };

// On the private deployment the person is a "new" customer with their own data: none of Aino's demo extras apply.
const parse = (v: string | undefined): DemoMode => (isPersonal() || v === "new" ? "new" : "aino");

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

/** The person's own S-Pankki on the private deployment, with today as its "today". Null until it is connected. */
export async function personalBase(): Promise<DemoCustomer | null> {
  const c = await readStored<DemoCustomer>(customerKeyOf("spankki"));
  if (!c) return null;
  const today = todayIso();
  return c.asOf >= today ? c : { ...c, asOf: today };
}

export async function getSource(mode: DemoMode = "aino"): Promise<Source> {
  const personal = isPersonal();
  if (!personal && process.env.SOLVO_LIVE !== "1") return { customer: demoCustomerFor(mode), local: false, mode, real: [] };
  if (!personal && process.env.VERCEL) throw new Error("SOLVO_LIVE=1 is local only and must not be set on Vercel");
  let customer = demoCustomerFor(mode);
  if (personal) {
    const own = await personalBase();
    // Nothing to show before the first connection: the welcome screen connects S-Pankki.
    if (!own) redirect("/welcome");
    customer = own;
  }
  const real: RealBank[] = [];
  for (const id of LIVE_BANK_IDS) {
    if (personal && id === "spankki") continue; // it is the base
    const c = await readStored<DemoCustomer>(customerKeyOf(id));
    if (c) real.push({ id, name: LIVE_BANKS[id].name, customer: c });
  }
  return { customer, local: !personal && real.length > 0, mode, real };
}
