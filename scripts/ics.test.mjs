// Runnable check for the .ics reader and the calendar-link check (src/lib/ics.ts). Fictional events only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCalendarUrl, parseIcs } from "../src/lib/ics.ts";
import { baselinesFrom, forecast, spendingEvents } from "../src/lib/forecast.ts";

const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "UID:a1", "SUMMARY:Weekend trip to Tallinn", "DTSTART;VALUE=DATE:20261204", "DTEND;VALUE=DATE:20261207", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a2", "SUMMARY:Dinner with Mia\\, at the harbour", "DTSTART;TZID=Europe/Helsinki:20261120T190000", "DTEND;TZID=Europe/Helsinki:20261120T220000",
  "BEGIN:VALARM", "TRIGGER:-PT15M", "SUMMARY:Alarm that must not become the title", "END:VALARM", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a3", "SUMMARY:Concert", " : Aurora Nights", "DTSTART:20261125T180000Z", "DTEND:20261125T210000Z", "END:VEVENT", // folded line, UTC, winter (+2)
  "BEGIN:VEVENT", "UID:a4", "SUMMARY:Standup", "DTSTART:20261116T070000Z", "RRULE:FREQ=WEEKLY", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a5", "SUMMARY:Cancelled dinner", "DTSTART:20261121T170000Z", "STATUS:CANCELLED", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a6", "SUMMARY:Summer gig", "DTSTART:20270715T170000Z", "END:VEVENT", // summer time (+3)
  "BEGIN:VEVENT", "UID:a7", "DTSTART:20261122", "END:VEVENT", // no title: kept, matches nothing
  "END:VCALENDAR",
].join("\r\n");

test("reads all-day, TZID, UTC (Finland time), folded and escaped text; skips alarms and cancelled", () => {
  const ev = parseIcs(ICS);
  assert.deepEqual(ev.map((e) => e.title), ["Weekend trip to Tallinn", "Dinner with Mia, at the harbour", "Concert: Aurora Nights", "Standup", "Summer gig", ""]);
  assert.deepEqual([ev[0].start, ev[0].end, ev[0].allDay], ["2026-12-04", "2026-12-07", true]);
  assert.deepEqual([ev[1].start, ev[1].end, ev[1].allDay], ["2026-11-20T19:00:00", "2026-11-20T22:00:00", false]);
  assert.equal(ev[2].start, "2026-11-25T20:00:00"); // 18:00 UTC in November is 20:00 in Finland
  assert.equal(ev[4].start, "2027-07-15T20:00:00"); // 17:00 UTC in July is 20:00 (summer time, +3)
  assert.equal(ev[3].recurring, true);
  assert.equal(ev[0].recurring, false);
  assert.equal(ev[5].end, "2026-11-23", "all-day without an end lasts that day");
});
test("a UTC evening that is already the next day in Finland lands on that day", () => {
  const [e] = parseIcs("BEGIN:VEVENT\nSUMMARY:Dinner\nDTSTART:20261120T223000Z\nEND:VEVENT");
  assert.equal(e.start, "2026-11-21T00:30:00");
});
test("ids are stable and do not contain the title", () => {
  const a = parseIcs(ICS);
  const b = parseIcs(ICS);
  assert.deepEqual(a.map((e) => e.id), b.map((e) => e.id));
  assert.ok(a.every((e) => /^i-[0-9a-f]{8}$/.test(e.id)));
});
test("through the forecast: trip, dinner and concert, nothing else, and only those are kept", () => {
  const today = "2026-11-14";
  const events = parseIcs(ICS);
  const kept = spendingEvents(events, today);
  assert.deepEqual(kept.map((e) => e.title), ["Weekend trip to Tallinn", "Dinner with Mia, at the harbour", "Concert: Aurora Nights"]);
  const items = forecast(kept, baselinesFrom([]), today, "file");
  assert.deepEqual(items.map((i) => i.kind), ["dinner", "concert", "trip"]);
  assert.ok(items.every((i) => i.source === "file"));
});
test("an empty or broken file gives no events and does not throw", () => {
  assert.deepEqual(parseIcs(""), []);
  assert.deepEqual(parseIcs("this is not a calendar"), []);
  assert.deepEqual(parseIcs("BEGIN:VEVENT\nSUMMARY:No start\nEND:VEVENT"), []);
});
test("calendar links: Google, iCloud (webcal) and Outlook pass; anything else is refused", () => {
  assert.equal(checkCalendarUrl("https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics").ok, true);
  const ic = checkCalendarUrl("webcal://p12-caldav.icloud.com/published/2/abc");
  assert.ok(ic.ok && ic.url.startsWith("https://p12-caldav.icloud.com/"));
  assert.equal(checkCalendarUrl("https://outlook.office365.com/owa/calendar/x/y/calendar.ics").ok, true);
  for (const bad of ["", "not a url", "http://calendar.google.com/x.ics", "https://evil.example/x.ics", "https://calendar.google.com.evil.example/x", "https://169.254.169.254/latest/meta-data", "https://localhost:3000/x", "https://user:pw@calendar.google.com/x"]) {
    assert.equal(checkCalendarUrl(bad).ok, false, bad);
  }
});
