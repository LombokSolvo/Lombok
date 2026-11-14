// LOCAL ONLY. The owner's own Google Calendar, read-only, so Solvo can see a trip or a dinner coming and budget for it.
// Switched on with SOLVO_GOOGLE=1 (npm run dev:google: 127.0.0.1 only, https) and never on Vercel: every function here refuses
// otherwise. Everything it stores lives in data/private/google/ (gitignored, files readable by the owner only).
//
// What it reads: the title and times of events in the next 45 days on the primary calendar (scope calendar.events.readonly).
// What leaves this file: forecast items only (kind, date, amount), made by src/lib/forecast.ts. Titles are never sent to a model,
// never shown on screen, never logged, never put in a URL. There is no write call anywhere.
//
// SET UP (once, about ten minutes; Google's labels move around a little):
//  1. console.cloud.google.com: project picker at the top, New project, name it Solvo, Create. Make sure it is the selected project.
//  2. Menu, APIs & Services, Library: search "Google Calendar API", open it, Enable.
//  3. Menu, APIs & Services, OAuth consent screen (Google Auth Platform): Get started. App name Solvo, your email as support
//     email. Audience: External. Contact email: yours. Agree, Create.
//  4. Data Access (Scopes), Add or remove scopes: search "calendar.events.readonly", tick the scope ending in
//     /auth/calendar.events.readonly (not ".../calendar.events", which can edit). Update, Save.
//  5. Audience, Test users, Add users: your own Google address, Save. Leave the publishing status on Testing.
//  6. Clients, Create client: Application type "Web application", name Solvo local. Under Authorized redirect URIs add exactly
//        https://localhost:3000/callback/google
//     Create. Copy the client ID and the client secret.
//  7. In .env.local (never in chat, never committed):
//        GOOGLE_CLIENT_ID=<the client id>
//        GOOGLE_CLIENT_SECRET=<the client secret>
//        SOLVO_GOOGLE=1                      (or start with npm run dev:google, which sets it)
//     GOOGLE_REDIRECT_URL overrides the redirect address if you serve the app somewhere else; it must match step 6 character for character.
//  8. npm run dev:google, open https://localhost:3000 (the address must be this one: the state cookie belongs to that host),
//     Profile, Calendar, Connect Google Calendar. Google warns "Google hasn't verified this app": that is expected in Testing
//     mode with your own account as a test user. Advanced, Go to Solvo (unsafe), Continue.
//  After the event: Profile, Calendar, Disconnect (revokes the token and deletes the files), then delete the OAuth client in the console.
//
// Limits to know (Google's docs, checked 14 Nov 2026):
//  - While the consent screen is in Testing, refresh tokens for apps with calendar scopes expire after 7 days. Solvo then says
//    "Reconnect" and you approve again. Moving to production removes that, but...
//  - ...calendar.events.readonly is a sensitive scope: for public use the app needs Google's verification (days to weeks), and
//    until then it is capped at 100 users and shows the unverified-app warning. That is why this stays a local, owner-only feature
//    and the public demo uses the simulated calendar instead.
//
// Flow (the routes are thin wrappers around these functions):
//   Profile "Connect Google Calendar" -> POST /api/google/start   random state token in an httpOnly cookie, returns Google's URL
//   Google, with your own login        -> GET /callback/google     checks the state, swaps the code for tokens, saves them, loads events
//   Profile "Refresh" / "Disconnect"   -> POST /api/google/sync, /api/google/disconnect
import "server-only";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  GoogleError,
  SCOPE,
  authUrl,
  configFromEnv,
  exchangeCode,
  listEvents,
  refreshAccessToken,
  revoke,
  type GoogleConfig,
} from "@/lib/google-calendar-core";
import type { CalendarEvent } from "@/lib/forecast";
import { isLoopbackRequest, isSameOriginPost } from "@/lib/loopback";

const dir = () => path.join(process.cwd(), "data/private/google");
const tokenFile = () => path.join(dir(), "token.json");
const eventsFile = () => path.join(dir(), "events.json");

export const GOOGLE_STATE_COOKIE = "solvo_google_state";
const DEFAULT_REDIRECT = "https://localhost:3000/callback/google";
const FRESH_MS = 30 * 60_000; // events younger than this are served from the saved copy

/** The master switch. Off on Vercel no matter what the environment says. */
export const googleEnabled = () => process.env.SOLVO_GOOGLE === "1" && !process.env.VERCEL;
export const googleRedirectUrl = () => process.env.GOOGLE_REDIRECT_URL ?? DEFAULT_REDIRECT;
const config = (): GoogleConfig | null => configFromEnv(process.env);

/** Null when the request may proceed; otherwise the refusal to send. A 404 when the feature is off, so it looks like it isn't there. */
export function googleGuard(req: Request, { post = false }: { post?: boolean } = {}): Response | null {
  if (!googleEnabled()) return new Response("Not found", { status: 404 });
  if (!isLoopbackRequest(req)) return Response.json({ error: "Google Calendar only works on this computer (localhost)." }, { status: 403 });
  if (post && !isSameOriginPost(req)) return Response.json({ error: "Refused: not sent from the app." }, { status: 403 });
  return null;
}

function writePrivate(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
  chmodSync(file, 0o600);
}
const readJson = <T>(file: string): T | null => {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
  } catch {
    return null;
  }
};

type Saved = { refreshToken: string; connectedAt: string };
type Cache = { syncedAt: string; events: CalendarEvent[]; reconnect?: boolean };

export type GoogleStatus = {
  enabled: boolean;
  /** GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in .env.local. */
  configured: boolean;
  connected: boolean;
  /** The refresh token stopped working (Testing mode expires it after 7 days): the person must approve again. */
  reconnect: boolean;
  syncedAt: string | null;
  events: number; // how many upcoming events were read (a count only)
  redirectUrl: string;
};

export function googleStatus(): GoogleStatus {
  const enabled = googleEnabled();
  const saved = enabled ? readJson<Saved>(tokenFile()) : null;
  const cache = saved ? readJson<Cache>(eventsFile()) : null;
  return {
    enabled,
    configured: !!config(),
    connected: !!saved,
    reconnect: !!cache?.reconnect,
    syncedAt: cache?.syncedAt ?? null,
    events: cache?.events.length ?? 0,
    redirectUrl: googleRedirectUrl(),
  };
}

/** What went wrong, said so a person can act on it. Never includes calendar data or a token. */
export function explainGoogle(e: unknown): string {
  if (e instanceof GoogleError) {
    if (e.code === "invalid_grant") return "Google no longer accepts the saved approval (in Testing mode it lasts 7 days). Connect again.";
    if (e.code === "redirect_uri_mismatch" || e.code === "invalid_request") return "Google rejected the redirect address. It must match the one in the OAuth client exactly.";
    if (e.code === "invalid_client" || e.status === 401) return "Google refused the client. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.";
    if (e.status === 403) return "Google refused access. Check that the Google Calendar API is enabled and that your account is a test user.";
    if (e.status === 429) return "Too many requests. Wait a minute and try again.";
    return `Google answered with an error (${e.status}).`;
  }
  return e instanceof Error ? e.message.slice(0, 200) : "Something went wrong.";
}

/** Step 1: the page the person opens to approve. `state` is checked again in the callback. */
export function beginGoogle(state: string): string {
  const cfg = config();
  if (!cfg) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local, then restart npm run dev:google.");
  return authUrl(cfg, { state, redirectUrl: googleRedirectUrl() });
}

/** Step 2: Google sent the person back with a code. Swap it for tokens, keep the refresh token, load the events. */
export async function completeGoogle(code: string): Promise<void> {
  const cfg = config();
  if (!cfg) throw new Error("Google is not configured.");
  const t = await exchangeCode(cfg, code, googleRedirectUrl());
  if (!t.refreshToken) throw new Error("Google returned no refresh token. Remove Solvo under your Google account's third-party access and connect again.");
  // The person could untick the permission on Google's page. Without it there is nothing to read.
  if (!t.scope.split(" ").includes(SCOPE)) throw new Error("The calendar permission was not granted.");
  writePrivate(tokenFile(), { refreshToken: t.refreshToken, connectedAt: new Date().toISOString() } satisfies Saved);
  lastFinished = 0;
  await syncGoogle();
}

let inFlight: Promise<Cache> | null = null;
let lastFinished = 0;

/** Reads the upcoming events again. Throttled to one run per 30 s. The refresh token yields a new access token each time; none is saved. */
export function syncGoogle(): Promise<Cache> {
  if (inFlight) return inFlight;
  const cached = readJson<Cache>(eventsFile());
  if (cached && !cached.reconnect && Date.now() - lastFinished < 30_000) return Promise.resolve(cached);
  inFlight = (async () => {
    const cfg = config();
    const saved = readJson<Saved>(tokenFile());
    if (!cfg || !saved) throw new Error("Not connected yet.");
    try {
      const t = await refreshAccessToken(cfg, saved.refreshToken);
      const cache: Cache = { syncedAt: new Date().toISOString(), events: await listEvents(cfg, t.accessToken) };
      writePrivate(eventsFile(), cache);
      return cache;
    } catch (e) {
      // A dead refresh token is remembered, so Profile can say "Connect again" instead of showing stale events as current.
      if (e instanceof GoogleError && e.code === "invalid_grant") writePrivate(eventsFile(), { syncedAt: cached?.syncedAt ?? new Date(0).toISOString(), events: [], reconnect: true } satisfies Cache);
      throw e;
    }
  })().finally(() => {
    inFlight = null;
    lastFinished = Date.now();
  });
  return inFlight;
}

/**
 * The upcoming events for the forecast, or null when Google Calendar is off, not connected or needs reconnecting. Served from the
 * saved copy, refreshed when it is older than 30 minutes (a failed refresh keeps the saved copy).
 */
export async function loadGoogleEvents(): Promise<CalendarEvent[] | null> {
  if (!googleEnabled() || !existsSync(tokenFile())) return null;
  let cache = readJson<Cache>(eventsFile());
  if (cache?.reconnect) return null;
  const age = cache ? Date.now() - statSync(eventsFile()).mtimeMs : Infinity;
  if (!cache || age > FRESH_MS) {
    try {
      cache = await syncGoogle();
    } catch {
      cache = readJson<Cache>(eventsFile());
    }
  }
  return cache && !cache.reconnect ? cache.events : null;
}

/** Ends the consent at Google (best effort) and deletes everything stored here. */
export async function disconnectGoogle(): Promise<void> {
  const cfg = config();
  const saved = readJson<Saved>(tokenFile());
  if (cfg && saved?.refreshToken) {
    try {
      await revoke(cfg, saved.refreshToken);
    } catch {
      // Already revoked or expired: the local copy still goes.
    }
  }
  rmSync(dir(), { recursive: true, force: true });
  lastFinished = 0;
}
