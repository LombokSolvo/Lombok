// Where the app's data comes from.
//   always                   the synthetic S-Pankki demo customer (what the public app shows)
//   npm run dev:live         plus, once the owner has approved with Nordea ID, their REAL Nordea (data/private/nordea-customer.json).
//                            The app then merges it with the demo customer like any other connected bank (src/lib/combine.ts).
//                            Bound to 127.0.0.1 only, so other devices on the Wi-Fi cannot reach it (see src/lib/live-nordea.ts).
// The private file is gitignored and never exists on Vercel. As a second guard this throws on Vercel.
import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { MAIN_CUSTOMER, type DemoCustomer } from "@/lib/demo";

/** `customer` is always the synthetic base. `real` is the owner's real Nordea when connected, else null; `local` says real data is in play. */
export type Source = { customer: DemoCustomer; local: boolean; real: DemoCustomer | null };

let cached: { mtimeMs: number; customer: DemoCustomer } | null = null;

export function getSource(): Source {
  if (process.env.SOLVO_LIVE !== "1") return { customer: MAIN_CUSTOMER, local: false, real: null };
  if (process.env.VERCEL) throw new Error("SOLVO_LIVE=1 is local only and must not be set on Vercel");
  const file = path.join(process.cwd(), "data/private/nordea-customer.json");
  if (!existsSync(file)) {
    cached = null;
    return { customer: MAIN_CUSTOMER, local: false, real: null };
  }
  // The file is a few MB; parse it again only when a sync has rewritten it.
  const mtimeMs = statSync(file).mtimeMs;
  if (!cached || cached.mtimeMs !== mtimeMs) cached = { mtimeMs, customer: JSON.parse(readFileSync(file, "utf8")) as DemoCustomer };
  return { customer: MAIN_CUSTOMER, local: true, real: cached.customer };
}
