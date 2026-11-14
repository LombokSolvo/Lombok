// LOCAL ONLY. A calendar link the person pasted (Google Calendar's "secret address in iCal format", an iCloud public calendar, an
// Outlook published calendar): no OAuth, no app registration, no keys. The server fetches the .ics, keeps only the events that look
// like spending, and the forecast does the rest, like every other source.
//
// Why local only: the link is a secret (anyone holding it can read the calendar), and a server that fetches a visitor's URL is an
// SSRF risk on a public host. So: never on Vercel, only when the request is addressed to this machine, only hosts of known
// calendar services (checkCalendarUrl), https only, redirects re-checked, 5 MB cap, 10 s timeout. The link and the kept events live
// in data/private/calendar/ (gitignored, files 0600). Nothing is logged. The public app offers the file option instead, which is
// read on the person's own device and never uploaded.
import "server-only";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { headers } from "next/headers";
import { todayIso } from "@/lib/demo-clock";
import { eventDays, spendingEvents, type CalendarEvent } from "@/lib/forecast";
import { SECRET_ADDRESS_HELP, checkCalendarUrl, parseIcs } from "@/lib/ics";
import { isLoopbackHost, isLoopbackRequest, isSameOriginPost } from "@/lib/loopback";

const dir = () => path.join(process.cwd(), "data/private/calendar");
const file = () => path.join(dir(), "link.json");
const MAX_BYTES = 5_000_000;
const FRESH_MS = 15 * 60_000;

type Saved = { url: string; syncedAt: string; found: number; events: CalendarEvent[] };

// Tests only: hosts that may be fetched over plain http (a local mock calendar server). Never set in real use.
const testHosts = () => (process.env.SOLVO_ICS_TEST_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);

/** Whether this visit may use a calendar link: not on Vercel, and the page was opened on this computer. */
export async function linkAvailable(): Promise<boolean> {
  if (process.env.VERCEL) return false;
  return isLoopbackHost((await headers()).get("host") ?? "");
}

/** Null when the request may proceed; otherwise the refusal. A 404 on Vercel, so it looks like it isn't there. */
export function linkGuard(req: Request, { post = false }: { post?: boolean } = {}): Response | null {
  if (process.env.VERCEL) return new Response("Not found", { status: 404 });
  if (!isLoopbackRequest(req)) return Response.json({ error: "A calendar link only works on this computer (localhost)." }, { status: 403 });
  if (post && !isSameOriginPost(req)) return Response.json({ error: "Refused: not sent from the app." }, { status: 403 });
  return null;
}

const readSaved = (): Saved | null => {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), "utf8")) as Saved) : null;
  } catch {
    return null;
  }
};
function write(s: Saved) {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  writeFileSync(file(), JSON.stringify(s), { mode: 0o600 });
  chmodSync(file(), 0o600);
}

export class LinkError extends Error {}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new LinkError("That calendar is too big to read (over 5 MB). Export a file for the next 45 days instead.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Downloads the .ics. Each redirect is checked against the same host rules, so a link cannot bounce the server elsewhere. */
async function download(start: string): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const check = checkCalendarUrl(url, testHosts());
    // After a redirect, a refusal almost always means a sign-in page: the person pasted a page address, not the private link.
    if (!check.ok) throw new LinkError(hop > 0 ? SECRET_ADDRESS_HELP : check.error);
    let res: Response;
    try {
      res = await fetch(check.url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { Accept: "text/calendar, text/plain;q=0.5" } });
    } catch {
      throw new LinkError("Couldn't reach that calendar. Check the link and try again.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location") as string, check.url).toString();
      continue;
    }
    if (res.status === 404 || res.status === 403 || res.status === 401) throw new LinkError("The calendar refused the link. It may have been reset: copy the secret address again.");
    if (!res.ok) throw new LinkError(`The calendar answered with an error (${res.status}).`);
    const text = await readCapped(res);
    if (!/BEGIN:VCALENDAR/.test(text)) throw new LinkError("That link isn't a calendar. Use the secret address in iCal format (it ends in .ics).");
    return text;
  }
  throw new LinkError("The link redirected too many times.");
}

export type LinkSummary = { found: number; kept: CalendarEvent[]; syncedAt: string };

/** Reads the calendar behind a link, keeps the spending events, saves them. The link is only saved once it has been read. */
export async function connectLink(raw: string): Promise<LinkSummary> {
  const check = checkCalendarUrl(raw, testHosts());
  if (!check.ok) throw new LinkError(check.error);
  return ingest(check.url);
}

async function ingest(url: string): Promise<LinkSummary> {
  const today = todayIso();
  const events = parseIcs(await download(url));
  const found = events.filter((e) => {
    const { first } = eventDays(e);
    return first >= today && first <= new Date(Date.parse(`${today}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10);
  }).length;
  const kept = spendingEvents(events, today);
  const syncedAt = new Date().toISOString();
  write({ url, syncedAt, found, events: kept });
  return { found, kept, syncedAt };
}

let inFlight: Promise<LinkSummary> | null = null;
/** Reads the saved link again. Throttled to one run per 30 s; a failure keeps the saved events. */
export function syncLink(): Promise<LinkSummary> {
  if (inFlight) return inFlight;
  const saved = readSaved();
  if (!saved) return Promise.reject(new LinkError("No calendar link is connected."));
  if (Date.now() - statSync(file()).mtimeMs < 30_000) return Promise.resolve({ found: saved.found, kept: saved.events, syncedAt: saved.syncedAt });
  inFlight = ingest(saved.url).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Events for the forecast, or null when no link is connected here. Served from the saved copy, refreshed when older than 30 minutes. */
export async function loadLinkEvents(): Promise<CalendarEvent[] | null> {
  if (process.env.VERCEL || !existsSync(file())) return null;
  if (!(await linkAvailable())) return null; // opened from a phone or another host: never shown there
  if (Date.now() - statSync(file()).mtimeMs > FRESH_MS) {
    try {
      await syncLink();
    } catch {
      // Keep what was saved.
    }
  }
  return readSaved()?.events ?? null;
}

export type LinkStatus = { available: boolean; connected: boolean; syncedAt: string | null; found: number; kept: number };
export async function linkStatus(): Promise<LinkStatus> {
  const available = await linkAvailable();
  const saved = available ? readSaved() : null;
  return { available, connected: !!saved, syncedAt: saved?.syncedAt ?? null, found: saved?.found ?? 0, kept: saved?.events.length ?? 0 };
}

export function disconnectLink() {
  rmSync(dir(), { recursive: true, force: true });
}
