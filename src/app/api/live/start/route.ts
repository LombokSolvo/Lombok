import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { STATE_COOKIE, beginConsent, explain, guard, redirectUrl } from "@/lib/live-banks";
import { parseLiveBank } from "@/lib/live-bank-ids";
import { originOf } from "@/lib/loopback";

// LOCAL ONLY (SOLVO_LIVE=1). Asks Enable Banking for the chosen bank's approval page and returns its URL; the app then sends the
// person there. A random state token (with the bank's id) goes into a short-lived httpOnly cookie and is checked again in /callback,
// so a stranger cannot finish a consent on the owner's behalf. POST { bank: "nordea" | "traderepublic" | "revolut" }.
export async function POST(req: Request) {
  const refused = guard(req, { post: true });
  if (refused) return refused;

  const bank = parseLiveBank(((await req.json().catch(() => ({}))) as { bank?: unknown }).bank);
  if (!bank) return Response.json({ error: "Choose a bank." }, { status: 400 });

  // The state cookie belongs to one host. The bank sends the person back to the registered address, so the app must have been
  // opened there too, or the cookie would not come along.
  const registered = new URL(redirectUrl());
  const opened = new URL(originOf(req));
  if (opened.host !== registered.host) {
    return Response.json({ error: `Open the app at ${registered.origin} and try again: the bank sends you back to that address.` }, { status: 409 });
  }

  const state = randomBytes(24).toString("base64url");
  try {
    const url = await beginConsent(bank, state);
    (await cookies()).set(STATE_COOKIE, `${bank}.${state}`, { httpOnly: true, sameSite: "lax", secure: registered.protocol === "https:", path: "/", maxAge: 600 });
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: explain(e) }, { status: 502 });
  }
}
