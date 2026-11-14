// Smoke test: starts the built app (`next start`) and checks that the key pages and API routes respond.
// Runs in CI after `npm run build`. Locally: `npm run build && npm run smoke`.
// Needs no GEMINI_API_KEY: without it the API routes answer from saved readings and the offline coach.
import { spawn } from "node:child_process";

const PORT = process.env.SMOKE_PORT ?? "3123";
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", PORT, "-H", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
  // The checks describe the PUBLIC app, so anything a developer has switched on in .env.local (real Google, real Nordea) is forced off.
  env: { ...process.env, GEMINI_API_KEY: "", EXA_API_KEY: "", EXA_KEY: "", SOLVO_GOOGLE: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", SOLVO_LIVE: "" },
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(BASE);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Server did not start in 30 s");
}

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}

async function page(path) {
  const res = await fetch(BASE + path);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const html = await res.text();
  if (!html.includes("<html")) throw new Error("no HTML in response");
  if (html.includes("Application error")) throw new Error("page shows an application error");
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  return res.json();
}

try {
  await waitForServer();
  for (const path of ["/", "/bills", "/coach", "/manifest.webmanifest"]) {
    await check(`GET ${path}`, () => (path.endsWith(".webmanifest") ? fetch(BASE + path).then((r) => {
      if (r.status !== 200) throw new Error(`status ${r.status}`);
    }) : page(path)));
  }
  await check("POST /api/read-invoice (saved reading)", async () => {
    const data = await postJson("/api/read-invoice", { id: "electricity" });
    if (!data.reading) throw new Error("no reading in response");
  });
  await check("POST /api/market-agent (saved run without keys)", async () => {
    for (const agent of ["electricity", "telecom"]) {
      const res = await fetch(BASE + "/api/market-agent", { method: "POST", body: JSON.stringify({ agent }) });
      if (res.status !== 200) throw new Error(`${agent}: status ${res.status}`);
      const last = JSON.parse((await res.text()).trim().split("\n").pop());
      if (last.type !== "result" || !last.db?.offers?.length) throw new Error(`${agent}: unexpected last event: ${JSON.stringify(last).slice(0, 200)}`);
    }
  });
  // The public app must show nothing of the live Nordea connection: every route is a 404 unless SOLVO_LIVE=1 (local only).
  await check("live Nordea routes are off by default", async () => {
    // The connect page streams, so its status is already 200 when it decides to show "not found": check the content instead.
    const connect = await (await fetch(BASE + "/connect/nordea")).text();
    if (!connect.includes("could not be found") || connect.includes("Connecting Nordea")) throw new Error("/connect/nordea is not hidden");
    const post = (path) => fetch(BASE + path, { method: "POST", headers: { Origin: BASE } });
    const statuses = (await Promise.all(["/api/nordea/start", "/api/nordea/sync", "/api/nordea/disconnect"].map(post))).map((r) => r.status);
    if (statuses.some((s) => s !== 404)) throw new Error(`expected only 404, got ${statuses.join(", ")}`);
  });
  // The demo bank connection (Enable Banking sandbox) is also off until its test application is configured.
  await check("demo bank routes are off until configured", async () => {
    const list = await fetch(BASE + "/api/banks");
    const start = await fetch(BASE + "/api/banks/start", { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json" }, body: "{}" });
    if (list.status !== 404 || start.status !== 404) throw new Error(`expected 404, got ${list.status}, ${start.status}`);
  });
  // The shared bank callback with a state it never issued goes back to Profile and touches nothing.
  await check("bank callback refuses an unknown state", async () => {
    const res = await fetch(BASE + "/callback?code=x&state=y", { redirect: "manual" });
    const to = res.headers.get("location") ?? "";
    if (res.status !== 307 || !to.includes("/profile?bank=failed")) throw new Error(`got ${res.status} ${to}`);
  });
  // Real Google Calendar is local only (SOLVO_GOOGLE=1): on the public app every route is a 404 and Profile offers nothing of it.
  await check("real Google Calendar routes are off by default", async () => {
    const post = (path) => fetch(BASE + path, { method: "POST", headers: { Origin: BASE } });
    const statuses = (await Promise.all(["/api/google/start", "/api/google/sync", "/api/google/disconnect"].map(post))).map((r) => r.status);
    const callback = await fetch(BASE + "/callback/google?code=x&state=y", { redirect: "manual" });
    if (statuses.some((s) => s !== 404) || callback.status !== 404) throw new Error(`expected only 404, got ${statuses.join(", ")} and ${callback.status}`);
    const profile = await (await fetch(BASE + "/profile")).text();
    if (/Connect Google Calendar|GOOGLE_CLIENT/.test(profile)) throw new Error("Profile offers Google Calendar");
    if (!profile.includes("Connect calendar")) throw new Error("Profile has no calendar row");
  });
  // Solvo's call: without ElevenLabs keys the two-way call is off (404) and the screen offers the recorded message only.
  await check("Solvo's call works without ElevenLabs keys", async () => {
    const session = await fetch(BASE + "/api/call/session", { method: "POST", headers: { Origin: BASE } });
    if (!process.env.ELEVENLABS_API_KEY && session.status !== 404) throw new Error(`session answered ${session.status}`);
    const page = await (await fetch(BASE + "/call")).text();
    if (!page.includes("Answer")) throw new Error("call screen has no Answer button");
    if (/last Friday|Bill due Friday/.test(page)) throw new Error("call screen still has a fixed weekday");
  });
  // Nothing is shown from a calendar until a real one is connected: no simulated calendar, no cookie that fakes one.
  await check("no calendar is shown until a real one is connected", async () => {
    const home = await (await fetch(BASE + "/", { headers: { Cookie: "solvo_calendar=demo" } })).text();
    if (home.includes("set aside for your calendar")) throw new Error("Home shows a calendar that was never connected");
    if (!home.includes("Budget for what is coming")) throw new Error("Home has no way in to connect a calendar");
    const onboarding = await (await fetch(BASE + "/onboarding")).text();
    if (!onboarding.includes("Connect calendar")) throw new Error("First-run setup does not offer the calendar");
  });
  await check("POST /api/coach (offline answer)", async () => {
    const data = await postJson("/api/coach", { messages: [{ role: "user", text: "How much did I spend on restaurants?" }] });
    if (typeof data.answer !== "string" || !data.answer) throw new Error(`unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
  });
} catch (e) {
  failures.push(e.message);
  console.log(`FAIL  ${e.message}`);
} finally {
  server.kill();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed. Server log:\n${serverLog.slice(-3000)}`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
process.exit(0);
