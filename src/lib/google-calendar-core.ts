// Google Calendar, READ ONLY, for the OWNER's own calendar, run locally. No dependency on the app (only an erased type), so the
// in-app flow (src/lib/google-calendar.ts) and scripts/google-calendar.test.mjs share it.
//
// The flow (OAuth 2.0 for a web server application, docs: developers.google.com/identity/protocols/oauth2/web-server):
//   authUrl()      -> the person opens it and approves on Google's own page
//   Google         -> redirects to our callback with ?code=&state=
//   exchangeCode() -> the single-use code becomes a refresh token (kept on this machine) and an access token
//   listEvents()   -> events.list on the primary calendar, next 45 days, singleEvents=true
//   revoke()       -> ends the consent at Google
//
// The scope is calendar.events.readonly: view events on all calendars the person can access. It is the narrowest read scope that
// events.list accepts (the other one is calendar.readonly, which also lists calendars and settings). There is no write call here.
//
// Every endpoint can be changed by environment variable, so scripts/google-calendar.test.mjs can run the whole thing against a
// mock server (like ENABLE_API_URL in enable-banking-core.ts).
import type { CalendarEvent } from "./forecast";

export const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

export type GoogleConfig = { clientId: string; clientSecret: string; authUrl: string; tokenUrl: string; revokeUrl: string; eventsUrl: string };

export class GoogleError extends Error {
  status: number;
  /** Google's own error code when it sent one, for example "invalid_grant" (the refresh token was revoked or has expired). */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** The credentials come from .env.local (gitignored). Never log them. */
export function configFromEnv(env: Record<string, string | undefined>): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const api = env.GOOGLE_API_URL ?? "https://www.googleapis.com";
  return {
    clientId,
    clientSecret,
    authUrl: env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
    revokeUrl: env.GOOGLE_REVOKE_URL ?? "https://oauth2.googleapis.com/revoke",
    eventsUrl: `${api}/calendar/v3/calendars/primary/events`,
  };
}

/** The page the person opens to approve. `state` is a random token that comes back unchanged and is checked in the callback. */
export function authUrl(cfg: GoogleConfig, o: { state: string; redirectUrl: string }): string {
  const u = new URL(cfg.authUrl);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", o.redirectUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("state", o.state);
  u.searchParams.set("access_type", "offline"); // so Google also returns a refresh token
  u.searchParams.set("prompt", "consent"); // and returns it every time, not only the first
  return u.toString();
}

async function parse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Error bodies name the problem (an error code and a sentence). They do not contain calendar data or tokens.
function fail(what: string, res: Response, body: Record<string, unknown>): never {
  const err = body.error;
  const code = typeof err === "string" ? err : typeof (err as { status?: string } | undefined)?.status === "string" ? (err as { status: string }).status : undefined;
  throw new GoogleError(`${what} -> ${res.status}${code ? ` ${code}` : ""}`, res.status, code);
}

export type Tokens = { accessToken: string; refreshToken?: string; expiresIn: number; scope: string };

async function tokenCall(cfg: GoogleConfig, what: string, params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
  });
  const body = await parse(res);
  if (!res.ok || typeof body.access_token !== "string") fail(what, res, body);
  return {
    accessToken: body.access_token as string,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expiresIn: Number(body.expires_in ?? 3600),
    scope: typeof body.scope === "string" ? body.scope : "",
  };
}

/** The code is single-use and short-lived: exchange it straight away. */
export const exchangeCode = (cfg: GoogleConfig, code: string, redirectUrl: string) =>
  tokenCall(cfg, "token exchange", { grant_type: "authorization_code", code, redirect_uri: redirectUrl });

/** A fresh access token from the refresh token. Fails with code "invalid_grant" once the refresh token is revoked or expired. */
export const refreshAccessToken = (cfg: GoogleConfig, refreshToken: string) => tokenCall(cfg, "token refresh", { grant_type: "refresh_token", refresh_token: refreshToken });

/** Ends the consent at Google. Revoking a refresh token also ends its access tokens. */
export async function revoke(cfg: GoogleConfig, token: string): Promise<void> {
  const res = await fetch(cfg.revokeUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  if (!res.ok) fail("revoke", res, await parse(res));
}

type RawEvent = {
  id?: string;
  summary?: string;
  status?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/** Google's event, as far as the forecast needs it. Only the title, times, and whether it repeats are kept: no location, no attendees. */
export function toCalendarEvent(e: RawEvent): CalendarEvent | null {
  if (!e.id || e.status === "cancelled") return null;
  if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) return null; // the person said no, so it costs nothing
  const start = e.start?.dateTime ?? e.start?.date;
  const end = e.end?.dateTime ?? e.end?.date ?? start;
  if (!start || !end) return null;
  return { id: `g-${e.id}`, title: e.summary ?? "", start, end, allDay: !e.start?.dateTime, recurring: !!e.recurringEventId };
}

/** Upcoming events on the primary calendar: from `now` for `days` days, repeating events expanded into single ones. */
export async function listEvents(cfg: GoogleConfig, accessToken: string, { now = Date.now(), days = 45 }: { now?: number; days?: number } = {}): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const u = new URL(cfg.eventsUrl);
    u.searchParams.set("singleEvents", "true");
    u.searchParams.set("orderBy", "startTime");
    // RFC 3339 with an offset: the ISO string ends in Z, which is the offset +00:00.
    u.searchParams.set("timeMin", new Date(now).toISOString());
    u.searchParams.set("timeMax", new Date(now + days * 86_400_000).toISOString());
    u.searchParams.set("maxResults", "250");
    // Ask only for what the forecast reads. Locations, descriptions and attendee names never leave Google.
    u.searchParams.set("fields", "nextPageToken,items(id,summary,status,recurringEventId,start,end,attendees(self,responseStatus))");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await parse(res);
    if (!res.ok) fail("events.list", res, body);
    for (const raw of (body.items as RawEvent[] | undefined) ?? []) {
      const e = toCalendarEvent(raw);
      if (e) out.push(e);
    }
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : undefined;
    if (!pageToken) break;
  }
  return out;
}
