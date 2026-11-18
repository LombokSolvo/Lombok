import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, validToken } from "@/lib/auth-token";

// The private deployment's lock (SOLVO_PERSONAL=1): every page and API answers only to the logged-in owner. On the public demo
// this does nothing. Open without logging in: the login itself, the daily sync (it has its own secret, sent by Vercel Cron), and
// what the phone needs to show the app icon and the offline page.
const OPEN = ["/login", "/api/login", "/api/cron/", "/offline", "/manifest.webmanifest", "/sw.js", "/icons/", "/icon.png", "/apple-icon.png", "/favicon.ico"];

export async function proxy(req: NextRequest) {
  if (process.env.SOLVO_PERSONAL !== "1") return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (OPEN.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p))) return NextResponse.next();
  if (await validToken(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const login = new URL("/login", req.url);
  if (path !== "/") login.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own static files.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
