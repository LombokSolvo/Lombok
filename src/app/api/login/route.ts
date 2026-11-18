import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_DAYS, makeToken, passwordMatches } from "@/lib/auth-token";
import { isSameOriginPost, originOf } from "@/lib/loopback";
import { isPersonal } from "@/lib/personal";

// The private deployment's login form posts here. A wrong password waits a moment, and after 8 wrong tries from one address in
// 15 minutes the form stops answering for the rest of that time, so the password can't be guessed by trying many.
const tries = new Map<string, { n: number; since: number }>();
const WINDOW = 15 * 60_000;

const back = (req: Request, query: string) => NextResponse.redirect(`${originOf(req)}/login${query}`, 303);
const safeNext = (v: FormDataEntryValue | null) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/");

export async function POST(req: Request) {
  if (!isPersonal()) return new Response("Not found", { status: 404 });
  if (!isSameOriginPost(req)) return new Response("Refused", { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const t = tries.get(ip);
  if (t && now - t.since < WINDOW && t.n >= 8) return back(req, "?error=wait");

  const form = await req.formData().catch(() => null);
  const next = safeNext(form?.get("next") ?? null);
  const typed = form?.get("password");
  if (typeof typed !== "string" || !(await passwordMatches(typed))) {
    tries.set(ip, t && now - t.since < WINDOW ? { n: t.n + 1, since: t.since } : { n: 1, since: now });
    await new Promise((r) => setTimeout(r, 600));
    return back(req, `?error=wrong${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  tries.delete(ip);
  const token = await makeToken();
  if (!token) return back(req, "?error=setup");
  const res = NextResponse.redirect(`${originOf(req)}${next}`, 303);
  res.cookies.set(AUTH_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: AUTH_DAYS * 86400 });
  return res;
}
