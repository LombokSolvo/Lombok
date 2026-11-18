import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-token";
import { isSameOriginPost, originOf } from "@/lib/loopback";
import { isPersonal } from "@/lib/personal";

/** Logs this device out of the private deployment. */
export async function POST(req: Request) {
  if (!isPersonal()) return new Response("Not found", { status: 404 });
  if (!isSameOriginPost(req)) return new Response("Refused", { status: 403 });
  const res = NextResponse.redirect(`${originOf(req)}/login`, 303);
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
