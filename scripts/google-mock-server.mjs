// A mock of the three Google endpoints Solvo uses (consent page, token, events.list, revoke), for tests and for trying the in-app flow
// without a Google account. Fictional events only. Run it on its own:
//   node scripts/google-mock-server.mjs            (listens on 127.0.0.1:4455)
// then start the app with
//   SOLVO_GOOGLE=1 GOOGLE_CLIENT_ID=mock GOOGLE_CLIENT_SECRET=mock GOOGLE_REDIRECT_URL=http://localhost:3000/callback/google \
//   GOOGLE_AUTH_URL=http://127.0.0.1:4455/auth GOOGLE_TOKEN_URL=http://127.0.0.1:4455/token \
//   GOOGLE_REVOKE_URL=http://127.0.0.1:4455/revoke GOOGLE_API_URL=http://127.0.0.1:4455 npx next dev -H 127.0.0.1 -p 3000
import http from "node:http";

const DAY = 86_400_000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const at = (offsetDays, time) => `${iso(offsetDays)}T${time}:00+02:00`;

/** A fictional .ics file with dates relative to today: four things that look like spending, a repeating one and a meeting. */
export function fixtureIcs(today) {
  const d = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10).replace(/-/g, "");
  const ev = (uid, title, lines) => ["BEGIN:VEVENT", `UID:fixture-${uid}`, `SUMMARY:${title}`, ...lines, "END:VEVENT"];
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Solvo test fixture//EN",
    ...ev("lunch", "Lunch with Eero", [`DTSTART;TZID=Europe/Helsinki:${d(3)}T120000`, `DTEND;TZID=Europe/Helsinki:${d(3)}T133000`]),
    ...ev("gym", "Gym", [`DTSTART;TZID=Europe/Helsinki:${d(1)}T180000`, "RRULE:FREQ=WEEKLY;BYDAY=MO"]),
    ...ev("dinner", "Illallinen Lauran kanssa", [`DTSTART;TZID=Europe/Helsinki:${d(8)}T190000`, `DTEND;TZID=Europe/Helsinki:${d(8)}T223000`]),
    ...ev("party", "Housewarming party", [`DTSTART;TZID=Europe/Helsinki:${d(13)}T180000`, `DTEND;TZID=Europe/Helsinki:${d(13)}T230000`]),
    ...ev("trip", "Flight to Lisbon", [`DTSTART;VALUE=DATE:${d(24)}`, `DTEND;VALUE=DATE:${d(29)}`]),
    ...ev("review", "Quarterly review", [`DTSTART;TZID=Europe/Helsinki:${d(5)}T100000`, `DTEND;TZID=Europe/Helsinki:${d(5)}T110000`]),
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Events relative to now. The location and attendee names are there to prove they never get through. */
export function mockEvents() {
  const timed = (id, summary, n, a, b, extra = {}) => ({ id, summary, status: "confirmed", start: { dateTime: at(n, a) }, end: { dateTime: at(n, b) }, location: "Fictional Street 1, Nowhere", attendees: [{ displayName: "Pat Example", self: false }, { self: true, responseStatus: "accepted" }], ...extra });
  return [
    timed("e1", "Dinner at the new place", 4, "19:00", "21:30"),
    timed("e2", "Standup", 1, "09:00", "09:15", { recurringEventId: "standup" }),
    timed("e3", "Cancelled concert", 5, "20:00", "23:00", { status: "cancelled" }),
    timed("e4", "Declined party", 6, "20:00", "23:00", { attendees: [{ self: true, responseStatus: "declined" }] }),
    { id: "e5", summary: "Trip to the lake", status: "confirmed", start: { date: iso(15) }, end: { date: iso(18) } },
    timed("e6", "Dentist", 2, "10:00", "10:30"),
  ];
}

export function startMock({ port = 0, pageSize = 4 } = {}) {
  const log = { revoked: [], eventRequests: [], tokenRequests: [] };
  let live = true; // false after a revoke
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const json = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const form = async () => new URLSearchParams(await new Promise((r) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => r(b)); }));

    if (url.pathname === "/cal.ics") {
      // A published calendar link (Google "secret address", iCloud, Outlook), with fictional events relative to today.
      res.writeHead(200, { "Content-Type": "text/calendar" });
      return res.end(fixtureIcs(new Date().toISOString().slice(0, 10)));
    }
    if (url.pathname === "/auth") {
      // The consent page, collapsed to an instant "Allow": straight back to the app with a code and the state we were given.
      const back = new URL(url.searchParams.get("redirect_uri"));
      if (url.searchParams.get("mock_deny")) back.searchParams.set("error", "access_denied");
      else back.searchParams.set("code", "mock-code");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/token") {
      const f = await form();
      log.tokenRequests.push(Object.fromEntries(f));
      if (f.get("client_secret") !== "mock-secret" && f.get("client_secret") !== "mock") return json(401, { error: "invalid_client" });
      if (f.get("grant_type") === "authorization_code") {
        if (f.get("code") !== "mock-code") return json(400, { error: "invalid_grant" });
        live = true;
        return json(200, { access_token: "mock-access-1", refresh_token: "mock-refresh", expires_in: 3599, scope: "https://www.googleapis.com/auth/calendar.events.readonly", token_type: "Bearer" });
      }
      if (f.get("grant_type") === "refresh_token") {
        if (f.get("refresh_token") !== "mock-refresh" || !live) return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        return json(200, { access_token: "mock-access-2", expires_in: 3599, scope: "https://www.googleapis.com/auth/calendar.events.readonly", token_type: "Bearer" });
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (url.pathname === "/revoke") {
      const f = await form();
      log.revoked.push(f.get("token"));
      live = false;
      return json(200, {});
    }
    if (url.pathname === "/calendar/v3/calendars/primary/events") {
      log.eventRequests.push({ params: Object.fromEntries(url.searchParams), auth: req.headers.authorization });
      if (!/^Bearer mock-access-\d$/.test(req.headers.authorization ?? "")) return json(401, { error: { status: "UNAUTHENTICATED" } });
      const all = mockEvents();
      const from = Number(url.searchParams.get("pageToken") ?? 0);
      const page = all.slice(from, from + pageSize);
      return json(200, { items: page, ...(from + pageSize < all.length ? { nextPageToken: String(from + pageSize) } : {}) });
    }
    json(404, { error: "not found" });
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve({ server, log, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = await startMock({ port: 4455 });
  console.log(`Mock Google on ${m.url}. Client secret: mock. Ctrl-C to stop.`);
}
