// The Google Calendar client (src/lib/google-calendar-core.ts) against a MOCK Google: consent URL, code exchange, refresh, events.list
// (paging, filtering, what is kept), revoke, a dead refresh token. The real approval needs the owner's own Google login.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { GoogleError, SCOPE, authUrl, configFromEnv, exchangeCode, listEvents, refreshAccessToken, revoke } from "../src/lib/google-calendar-core.ts";
import { baselinesFrom, forecast } from "../src/lib/forecast.ts";
import { startMock } from "./google-mock-server.mjs";

let mock;
let cfg;
before(async () => {
  mock = await startMock();
  cfg = configFromEnv({
    GOOGLE_CLIENT_ID: "mock-id",
    GOOGLE_CLIENT_SECRET: "mock-secret",
    GOOGLE_AUTH_URL: `${mock.url}/auth`,
    GOOGLE_TOKEN_URL: `${mock.url}/token`,
    GOOGLE_REVOKE_URL: `${mock.url}/revoke`,
    GOOGLE_API_URL: mock.url,
  });
});
after(() => mock.close());

test("not configured without both credentials", () => {
  assert.equal(configFromEnv({ GOOGLE_CLIENT_ID: "x" }), null);
  assert.equal(configFromEnv({}), null);
});

test("the consent URL asks for the one read-only scope, offline, with our state", () => {
  const u = new URL(authUrl(cfg, { state: "abc", redirectUrl: "https://localhost:3000/callback/google" }));
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events.readonly");
  assert.equal(u.searchParams.get("scope"), SCOPE);
  assert.equal(u.searchParams.get("state"), "abc");
  assert.equal(u.searchParams.get("redirect_uri"), "https://localhost:3000/callback/google");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("access_type"), "offline");
});

test("code exchange, refresh, events (paged), revoke, and a dead refresh token", async () => {
  const t = await exchangeCode(cfg, "mock-code", "https://localhost:3000/callback/google");
  assert.equal(t.refreshToken, "mock-refresh");
  assert.equal(t.scope, SCOPE);
  assert.equal(mock.log.tokenRequests[0].redirect_uri, "https://localhost:3000/callback/google");

  const fresh = await refreshAccessToken(cfg, t.refreshToken);
  assert.equal(fresh.accessToken, "mock-access-2");

  const now = Date.now();
  const events = await listEvents(cfg, fresh.accessToken, { now });
  assert.ok(mock.log.eventRequests.length >= 2, "followed nextPageToken");
  const p = mock.log.eventRequests[0].params;
  assert.equal(p.singleEvents, "true");
  assert.equal(p.timeMin, new Date(now).toISOString());
  assert.equal(p.timeMax, new Date(now + 45 * 86_400_000).toISOString());
  assert.match(p.timeMin, /Z$/, "RFC 3339 with an offset");
  assert.ok(!/location|attendees\(displayName|description/.test(p.fields), "asks Google only for what the forecast reads");
  assert.equal(mock.log.eventRequests[0].auth, "Bearer mock-access-2");

  // cancelled and declined events are dropped; a repeating one is kept but marked
  assert.deepEqual(events.map((e) => e.id).sort(), ["g-e1", "g-e2", "g-e5", "g-e6"]);
  assert.equal(events.find((e) => e.id === "g-e2").recurring, true);
  assert.equal(events.find((e) => e.id === "g-e5").allDay, true);
  for (const e of events) assert.deepEqual(Object.keys(e).sort(), ["allDay", "end", "id", "recurring", "start", "title"], "no location, no attendees");

  // and the forecast makes of them: the dinner and the trip, nothing else (the standup repeats, the dentist costs nothing here)
  const today = new Date(now).toISOString().slice(0, 10);
  const items = forecast(events, baselinesFrom([]), today, "google");
  assert.deepEqual(items.map((i) => i.kind), ["dinner", "trip"]);
  assert.ok(items.every((i) => i.detail === undefined && i.source === "google"), "titles never leave");

  await revoke(cfg, t.refreshToken);
  assert.deepEqual(mock.log.revoked, ["mock-refresh"]);
  await assert.rejects(refreshAccessToken(cfg, t.refreshToken), (e) => e instanceof GoogleError && e.code === "invalid_grant" && e.status === 400);
});

test("a bad client secret is reported as invalid_client without echoing anything", async () => {
  const bad = { ...cfg, clientSecret: "wrong" };
  await assert.rejects(exchangeCode(bad, "mock-code", "x"), (e) => e instanceof GoogleError && e.code === "invalid_client" && !e.message.includes("wrong"));
});
