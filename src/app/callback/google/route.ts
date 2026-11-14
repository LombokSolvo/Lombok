import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, connection } from "next/server";
import { GOOGLE_FROM_COOKIE, GOOGLE_STATE_COOKIE, completeGoogle, googleGuard } from "@/lib/google-calendar";
import { originOf } from "@/lib/loopback";

// Where Google sends the person back after they approve. LOCAL ONLY (SOLVO_GOOGLE=1). Its own route because /callback is shared by
// the two Enable Banking connections. Registered in the OAuth client as https://localhost:3000/callback/google.
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: Request) {
  await connection(); // always per request, never prerendered at build time
  const refused = googleGuard(req);
  if (refused) return refused;
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const page = jar.get(GOOGLE_FROM_COOKIE)?.value === "onboarding" ? "/onboarding" : "/profile"; // a fixed list, never a value from the URL
  jar.delete(GOOGLE_FROM_COOKIE);
  const back = (flag: string) => NextResponse.redirect(`${originOf(req)}${page}?calendar=${flag}`);
  const expected = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_STATE_COOKIE); // single use
  if (!expected || !same(expected, params.get("state") ?? "")) return back("state");
  if (params.get("error")) return back("declined");
  const code = params.get("code");
  if (!code) return back("failed");
  try {
    await completeGoogle(code);
  } catch {
    return back("failed");
  }
  return back("connected");
}
