// The whole in-app Google Calendar flow against a MOCK Google: start -> consent -> callback -> events -> forecast on Home -> sync ->
// disconnect (revoke + files gone), plus the refusals (wrong state, not localhost, not from the app). Needs a build first.
// Run: npm run build && npm run test:google-flow
// It writes to data/private/google/ like the real thing, so it refuses to run if you have a real connection there.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";
import { startMock } from "./google-mock-server.mjs";

if (existsSync("data/private/google")) {
  console.log("data/private/google exists (a real connection?). Disconnect it first; this test would delete it.");
  process.exit(2);
}
const PORT = process.env.GOOGLE_FLOW_PORT ?? "3124";
const BASE = `http://localhost:${PORT}`;
const mock = await startMock();
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", PORT, "-H", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    SOLVO_GOOGLE: "1",
    GOOGLE_CLIENT_ID: "mock-id",
    GOOGLE_CLIENT_SECRET: "mock-secret",
    GOOGLE_REDIRECT_URL: `${BASE}/callback/google`,
    GOOGLE_AUTH_URL: `${mock.url}/auth`,
    GOOGLE_TOKEN_URL: `${mock.url}/token`,
    GOOGLE_REVOKE_URL: `${mock.url}/revoke`,
    GOOGLE_API_URL: mock.url,
    GEMINI_API_KEY: "",
  },
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

// A tiny cookie jar, because Node's fetch has none.
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function go(path, init = {}) {
  const res = await fetch(path.startsWith("http") ? path : BASE + path, { redirect: "manual", ...init, headers: { ...init.headers, Cookie: cookie() } });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (/max-age=0|expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(pair.slice(0, i));
    else jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return res;
}
const post = (path) => go(path, { method: "POST", headers: { Origin: BASE } });

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}

try {
  for (let i = 0; ; i++) {
    try {
      await fetch(BASE);
      break;
    } catch {
      if (i > 60) throw new Error("server did not start");
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await check("refuses a POST that is not from the app, and a non-localhost host", async () => {
    assert.equal((await go("/api/google/start", { method: "POST" })).status, 403);
    assert.equal((await go("/api/google/start", { method: "POST", headers: { Origin: "http://evil.example", Host: "evil.example" } })).status, 403);
  });
  await check("callback with a state we never issued is refused and stores nothing", async () => {
    const r = await go("/callback/google?code=mock-code&state=nope");
    assert.match(r.headers.get("location") ?? "", /\/profile\?calendar=state/);
    assert.equal(existsSync("data/private/google"), false);
  });

  let consent;
  await check("start returns Google's consent URL with the read-only scope and a state", async () => {
    const r = await post("/api/google/start");
    assert.equal(r.status, 200);
    consent = new URL((await r.json()).url);
    assert.equal(consent.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events.readonly");
    assert.ok(consent.searchParams.get("state").length >= 24);
    assert.ok(jar.has("solvo_google_state"));
  });
  await check("a different state than the cookie's is refused", async () => {
    const saved = new Map(jar);
    const r = await go(`/callback/google?code=mock-code&state=${"x".repeat(32)}`);
    assert.match(r.headers.get("location") ?? "", /calendar=state/);
    assert.equal(existsSync("data/private/google"), false);
    saved.forEach((v, k) => jar.set(k, v)); // the failed attempt used up the cookie: start again for the real run
    const again = await post("/api/google/start");
    consent = new URL((await again.json()).url);
  });
  await check("consent -> callback saves a token (0600) and the events", async () => {
    const back = await fetch(consent, { redirect: "manual" }); // the mock's consent page says Allow at once
    const to = new URL(back.headers.get("location"));
    assert.equal(to.origin, BASE);
    const cb = await go(to.pathname + to.search);
    assert.match(cb.headers.get("location") ?? "", /\/profile\?calendar=connected/);
    for (const f of ["token.json", "events.json"]) assert.equal(statSync(`data/private/google/${f}`).mode & 0o777, 0o600, f);
    assert.equal(statSync("data/private/google").mode & 0o777, 0o700);
    assert.equal(JSON.parse(readFileSync("data/private/google/token.json", "utf8")).refreshToken, "mock-refresh");
    assert.equal(JSON.parse(readFileSync("data/private/google/events.json", "utf8")).events.length, 4);
  });
  await check("Home explains the effect, and no event title or location reaches the page", async () => {
    const html = await (await go("/")).text();
    assert.ok(html.includes("on your calendar") && html.includes("Your Google Calendar"), "forecast note");
    assert.ok(html.includes("Dinner out") && html.includes("Trip"), "generic labels");
    for (const secret of ["Dinner at the new place", "Trip to the lake", "Fictional Street", "Pat Example", "Standup", "Dentist"]) assert.ok(!html.includes(secret), `leaked: ${secret}`);
  });
  await check("Profile shows it connected, with a count and no titles", async () => {
    const html = await (await go("/profile?calendar=connected")).text();
    assert.ok(html.includes("Google Calendar connected") && html.includes("4 upcoming events"));
    assert.ok(!html.includes("Dinner at the new place"));
  });
  await check("the real calendar is never mixed with the demo one", async () => {
    jar.set("solvo_calendar", "demo");
    const html = await (await go("/")).text();
    jar.delete("solvo_calendar");
    assert.ok(html.includes("Your Google Calendar") && !html.includes("Demo: example calendar"));
  });
  await check("sync reads again; the mock saw only Bearer calls and a fields filter", async () => {
    const before = mock.log.eventRequests.length;
    // throttled within 30 s of the last read: still answers
    const r = await post("/api/google/sync");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).events, 4);
    assert.ok(mock.log.eventRequests.length >= before);
    assert.ok(mock.log.eventRequests.every((q) => q.auth?.startsWith("Bearer ") && !q.params.fields.includes("location")));
  });
  await check("disconnect revokes at Google and deletes the files", async () => {
    const r = await post("/api/google/disconnect");
    assert.equal(r.status, 200);
    assert.deepEqual(mock.log.revoked, ["mock-refresh"]);
    assert.equal(existsSync("data/private/google"), false);
    const html = await (await go("/")).text();
    assert.ok(!html.includes("on your calendar"));
  });
} catch (e) {
  failed++;
  console.log(`FAIL  ${e.message}\n${log.slice(-2000)}`);
} finally {
  server.kill();
  await mock.close();
}
if (failed) {
  console.log(`\n${failed} check(s) failed.\n${log.slice(-1500)}`);
  process.exit(1);
}
console.log("\nGoogle flow checks passed (against a mock Google).");
