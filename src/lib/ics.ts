// Reads an iCalendar (.ics) file into events, and checks calendar links. Pure, no imports except a type, so the browser (a file the
// person chooses is read on their own device and never uploaded), the server (a link, local only) and the tests all share it.
//
// What it understands: VEVENT with SUMMARY, DTSTART, DTEND, STATUS, RRULE and RECURRENCE-ID, folded lines, escaped text, all-day
// dates, UTC times, TZID times and floating times. Repeating events are only MARKED (`recurring`), never expanded: the forecast
// skips them anyway, because they are already part of the person's usual spending. Alarms and everything else are ignored.
import type { CalendarEvent } from "./forecast";

const unescapeText = (v: string) => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

// Finland: summer time from the last Sunday of March 01:00 UTC to the last Sunday of October 01:00 UTC. Done by hand because
// Intl is patched by the demo clock for dates in the demo's window (src/lib/demo-clock.ts), and these are real dates.
const lastSunday = (year: number, month0: number) => {
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  return Date.UTC(year, month0, last.getUTCDate() - last.getUTCDay(), 1);
};
const helsinkiOffsetMs = (utcMs: number) => {
  const y = new Date(utcMs).getUTCFullYear();
  return (utcMs >= lastSunday(y, 2) && utcMs < lastSunday(y, 9) ? 3 : 2) * 3_600_000;
};

const two = (n: number) => String(n).padStart(2, "0");

type When = { value: string; allDay: boolean };

/** One DTSTART or DTEND value as a local date (all-day) or local date and time (Finland's clock for UTC times). */
function when(value: string, params: Record<string, string>): When | null {
  const v = value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, se, z] = m;
  if (params.VALUE === "DATE" || h === undefined) return { value: `${y}-${mo}-${d}`, allDay: true };
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0)));
    const shifted = new Date(local.getTime() + helsinkiOffsetMs(local.getTime()));
    return { value: `${shifted.getUTCFullYear()}-${two(shifted.getUTCMonth() + 1)}-${two(shifted.getUTCDate())}T${two(shifted.getUTCHours())}:${two(shifted.getUTCMinutes())}:${two(shifted.getUTCSeconds())}`, allDay: false };
  }
  // A TZID or floating time is already the calendar's own local time.
  return { value: `${y}-${mo}-${d}T${h}:${mi}:${se ?? "00"}`, allDay: false };
}

const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
};
const addDay = (iso: string, n: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Every event in the text, in file order. Nothing is dropped except cancelled events and ones without a readable start. */
export function parseIcs(text: string): CalendarEvent[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: CalendarEvent[] = [];
  let cur: { props: Record<string, { value: string; params: Record<string, string> }>; recurring: boolean } | null = null;
  let alarm = 0;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { props: {}, recurring: false };
      alarm = 0;
      continue;
    }
    if (!cur) continue;
    if (line === "END:VEVENT") {
      const p = cur.props;
      cur = null;
      if (!p.DTSTART || /^CANCELLED$/i.test(p.STATUS?.value ?? "")) continue;
      const start = when(p.DTSTART.value, p.DTSTART.params);
      if (!start) continue;
      const end = p.DTEND ? when(p.DTEND.value, p.DTEND.params) : null;
      // No end: an all-day event lasts that day (the end is exclusive, as in Google's API), a timed one is a moment.
      const endValue = end?.value ?? (start.allDay ? addDay(start.value, 1) : start.value);
      const title = unescapeText(p.SUMMARY?.value ?? "");
      events.push({
        id: `i-${hash(`${p.UID?.value ?? title}|${start.value}`)}`,
        title,
        start: start.value,
        end: endValue,
        allDay: start.allDay,
        recurring: !!(p.RRULE || p["RECURRENCE-ID"]),
      });
      continue;
    }
    if (line === "BEGIN:VALARM") {
      alarm++;
      continue;
    }
    if (line === "END:VALARM") {
      alarm--;
      continue;
    }
    if (alarm > 0) continue;
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const [name, ...rawParams] = line.slice(0, colon).split(";");
    const params: Record<string, string> = {};
    for (const rp of rawParams) {
      const eq = rp.indexOf("=");
      if (eq > 0) params[rp.slice(0, eq).toUpperCase()] = rp.slice(eq + 1).replace(/^"|"$/g, "");
    }
    cur.props[name.toUpperCase()] = { value: line.slice(colon + 1), params };
  }
  return events;
}

// ---- Calendar links (local only, see src/lib/ics-link.ts) ----

/** Calendar services that publish a private .ics address. A link to anything else is refused: the server fetches it. */
const ALLOWED_HOSTS = ["calendar.google.com", "outlook.office365.com", "outlook.live.com"];
const ALLOWED_SUFFIXES = [".icloud.com"];

export type LinkCheck = { ok: true; url: string } | { ok: false; error: string };

export function checkCalendarUrl(raw: string, extraHosts: string[] = []): LinkCheck {
  const text = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, error: "That doesn't look like a calendar link. Paste the whole address." };
  }
  const host = u.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.includes(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s)) || extraHosts.includes(host);
  if (u.protocol !== "https:" && !(extraHosts.includes(host) && u.protocol === "http:")) return { ok: false, error: "The link must start with https:// or webcal://." };
  if (u.username || u.password) return { ok: false, error: "That link has a login in it. Use the calendar's secret address instead." };
  if (!allowed) return { ok: false, error: "Solvo only reads links from Google Calendar, iCloud and Outlook. For anything else, export a file and choose it instead." };
  return { ok: true, url: u.toString() };
}
