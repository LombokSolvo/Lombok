import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { GOOGLE_STATE_COOKIE, beginGoogle, explainGoogle, googleGuard, googleRedirectUrl } from "@/lib/google-calendar";
import { originOf } from "@/lib/loopback";

// LOCAL ONLY (SOLVO_GOOGLE=1). Returns Google's approval page URL; the app then sends the person there. A random state token goes
// into a short-lived httpOnly cookie and is checked again in /callback/google, so a stranger cannot finish a consent on the owner's behalf.
export async function POST(req: Request) {
  const refused = googleGuard(req, { post: true });
  if (refused) return refused;

  // The state cookie belongs to one host. Google sends the person back to the registered address, so the app must have been
  // opened there too, or the cookie would not come along.
  const registered = new URL(googleRedirectUrl());
  if (new URL(originOf(req)).host !== registered.host) {
    return Response.json({ error: `Open the app at ${registered.origin} and try again: Google sends you back to that address.` }, { status: 409 });
  }

  const state = randomBytes(24).toString("base64url");
  try {
    const url = beginGoogle(state);
    (await cookies()).set(GOOGLE_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: registered.protocol === "https:", path: "/", maxAge: 600 });
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: explainGoogle(e) }, { status: 502 });
  }
}
