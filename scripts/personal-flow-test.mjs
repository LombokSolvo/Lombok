// The private deployment (SOLVO_PERSONAL=1) end to end, against made-up stand-ins: no real bank, no real database.
//
//   SOLVO_PERSONAL=1 npm run build && npm run test:personal
//
// It starts a stand-in for Enable Banking (an S-Pankki with two accounts and invented payments) and for the Upstash database
// (an in-memory store that records what it was sent), runs the built app with the private-deployment settings, and checks:
// every page asks for the password; a wrong password is refused; after logging in the person lands on the welcome screen, connects
// S-Pankki and syncs; Home and Bills show their own payments and nothing of Aino; the database only ever holds sealed data; the
// daily sync refuses without its secret and works with it; logging out locks the app again.
import { generateKeyPairSync } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const APP = 3210;
const EB = 4210;
const KV = 4211;
const PASSWORD = "correct horse battery staple";
const CRON = "test-cron-secret";
const base = `http://localhost:${APP}`;

const iso = (d) => d.toISOString().slice(0, 10);
function transactions(account) {
  const out = [];
  for (let k = 0; k < 400; k++) {
    const d = new Date(Date.now() - k * 864e5);
    const date = iso(d);
    const dom = d.getUTCDate();
    const add = (name, amount, debit = true, info = []) =>
      out.push({
        booking_date: date,
        credit_debit_indicator: debit ? "DBIT" : "CRDT",
        transaction_amount: { amount: String(amount), currency: "EUR" },
        [debit ? "creditor" : "debtor"]: { name },
        remittance_information: info,
        status: "BOOK",
      });
    if (account === "acc-1") {
      if (dom === 15) add("Työnantaja Oy", 2650, false, ["PALKKA"]);
      if (dom === 2) add("Kiinteistö Oy Testitalo", 720);
      if (dom === 5) add("Helen Oy", 61.2);
      if (dom === 9) add("Elisa Oyj", 29.9);
      if (dom === 11) add("SPOTIFY", 11.99);
      if (dom === 20) add("Oma säästötili", 200); // to the savings account below
      if (k % 2 === 0) add("S-MARKET TESTI", (14 + (k % 13)).toFixed(2));
      if (k % 7 === 0) add("WOLT", (22 + (k % 9)).toFixed(2));
    } else if (dom === 20) add("Oma käyttötili", 200, false);
  }
  return out;
}

function ebMock() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${EB}`);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = (code, obj) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const b = body ? JSON.parse(body) : {};
      const p = url.pathname;
      if (p === "/aspsps") return json(200, { aspsps: [{ name: "S-Pankki", country: "FI", maximum_consent_validity: 180 * 86400 }] });
      if (p === "/auth" && req.method === "POST") {
        assert.equal(b.aspsp?.name, "S-Pankki");
        return json(200, { url: `${b.redirect_url}?code=MOCKCODE&state=${encodeURIComponent(b.state)}` });
      }
      if (p === "/sessions" && req.method === "POST")
        return json(200, { session_id: "mock-session", accounts: [{ uid: "acc-1" }, { uid: "acc-2" }], access: { valid_until: new Date(Date.now() + 180 * 864e5).toISOString() } });
      if (p.startsWith("/sessions/") && req.method === "DELETE") return json(200, {});
      const bal = /^\/accounts\/([\w-]+)\/balances$/.exec(p);
      if (bal) return json(200, { balances: [{ balance_type: "CLAV", balance_amount: { currency: "EUR", amount: bal[1] === "acc-1" ? "1840.25" : "5200.00" } }] });
      const tx = /^\/accounts\/([\w-]+)\/transactions$/.exec(p);
      if (tx) return json(200, { transactions: transactions(tx[1]) });
      json(404, { error: "not found", path: p });
    });
  });
}

const store = new Map();
const sent = []; // every value the app wrote to the database
function kvMock() {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      assert.equal(req.headers.authorization, "Bearer kv-token");
      const [cmd, key, value] = JSON.parse(body);
      let result = null;
      if (cmd === "GET") result = store.get(key) ?? null;
      else if (cmd === "SET") {
        store.set(key, value);
        sent.push(value);
        result = "OK";
      } else if (cmd === "DEL") result = JSON.parse(body).slice(1).filter((k) => store.delete(k)).length;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result }));
    });
  });
}

const jar = new Map();
async function go(path, init = {}) {
  const res = await fetch(path.startsWith("http") ? path : base + path, {
    redirect: "manual",
    ...init,
    headers: { ...(init.headers ?? {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...(init.method === "POST" ? { origin: base } : {}) },
  });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const v = pair.slice(i + 1);
    if (!v || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) jar.delete(pair.slice(0, i));
    else jar.set(pair.slice(0, i), v);
  }
  return res;
}
const loc = (res) => new URL(res.headers.get("location") ?? "", base).pathname;

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const servers = [ebMock().listen(EB, "127.0.0.1"), kvMock().listen(KV, "127.0.0.1")];
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP), "-H", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "inherit"],
  env: {
    ...process.env,
    SOLVO_PERSONAL: "1",
    SOLVO_PASSWORD: PASSWORD,
    SOLVO_DATA_KEY: "a-test-key-that-is-long-enough-1234567890",
    CRON_SECRET: CRON,
    KV_REST_API_URL: `http://127.0.0.1:${KV}`,
    KV_REST_API_TOKEN: "kv-token",
    ENABLE_APP_ID: "mock-app",
    ENABLE_KEY: privateKey.replace(/\n/g, "\\n"),
    ENABLE_API_URL: `http://127.0.0.1:${EB}`,
    ENABLE_REDIRECT_URL: `${base}/callback`,
    SOLVO_LIVE: "",
  },
});
const stop = () => {
  app.kill();
  servers.forEach((s) => s.close());
};

let ok = 0;
const step = async (name, fn) => {
  await fn();
  ok++;
  console.log(`ok ${ok} - ${name}`);
};

try {
  for (let i = 0; ; i++) {
    try {
      await fetch(`${base}/login`);
      break;
    } catch {
      if (i > 60) throw new Error("The app did not start");
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await step("pages and APIs are locked", async () => {
    const home = await go("/");
    assert.equal(home.status, 307);
    assert.equal(loc(home), "/login");
    const bills = await go("/bills");
    assert.equal(loc(bills), "/login");
    assert.equal((await go("/api/day?date=2026-01-01")).status, 401);
    assert.equal((await go("/api/live/sync", { method: "POST", body: "{}" })).status, 401);
  });

  await step("a wrong password is refused", async () => {
    const res = await go("/api/login", { method: "POST", body: new URLSearchParams({ password: "nope", next: "/" }) });
    assert.equal(res.status, 303);
    assert.match(res.headers.get("location") ?? "", /error=wrong/);
    assert.ok(!jar.has("solvo_auth"));
  });

  await step("a login form from another site is refused", async () => {
    const res = await fetch(`${base}/api/login`, { method: "POST", body: new URLSearchParams({ password: PASSWORD }), headers: { origin: "https://evil.example" }, redirect: "manual" });
    assert.equal(res.status, 403);
  });

  await step("the right password logs in, and Home sends a new person to connect S-Pankki", async () => {
    const res = await go("/api/login", { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/" }) });
    assert.equal(res.status, 303);
    assert.ok(jar.has("solvo_auth"));
    // Home streams, so the redirect arrives inside the page (Next's streamed redirect), which the browser follows at once.
    const home = await go("/");
    if (home.status === 307) assert.equal(loc(home), "/welcome");
    else assert.match(await home.text(), /NEXT_REDIRECT[^"]*\/welcome|http-equiv="refresh" content="[^"]*\/welcome/);
    const welcome = await go("/welcome");
    assert.equal(welcome.status, 200);
    assert.match(await welcome.text(), /Connect your S-Pankki/);
  });

  await step("connecting S-Pankki: start, the bank, the callback, the download", async () => {
    const start = await go("/api/live/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank: "spankki" }) });
    assert.equal(start.status, 200, await start.clone().text());
    const { url } = await start.json();
    const back = await go(url);
    assert.equal(loc(back), "/connect/live");
    assert.equal(new URL(back.headers.get("location"), base).searchParams.get("bank"), "spankki");
    const sync = await go("/api/live/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank: "spankki" }) });
    const data = await sync.json();
    assert.equal(sync.status, 200, JSON.stringify(data));
    assert.ok(data.transactions > 300);
    assert.equal(data.accounts, 2);
  });

  await step("the database holds only sealed data", async () => {
    assert.ok(sent.length >= 3);
    for (const v of sent) {
      assert.match(v, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
      assert.ok(!/SPOTIFY|Helen|mock-session|acc-1/.test(v));
    }
  });

  await step("Home shows the person's own money and nothing of Aino", async () => {
    const home = await go("/");
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Safe to spend this week/);
    const demo = html.match(/Aino|Reset demo|Play the demo call/i);
    assert.ok(!demo, `demo content on Home: ${demo?.[0]} … ${html.slice(Math.max(0, (demo?.index ?? 0) - 150), (demo?.index ?? 0) + 80)}`);
  });

  await step("Bills names the person's bills from their payments", async () => {
    const html = await (await go("/bills")).text();
    assert.match(html, /From the payments in your bank/);
    assert.match(html, /SPOTIFY/);
    assert.match(html, /Electricity bill, Helen Oy|Phone and internet, Elisa Oyj/);
    assert.ok(!/Oomi|Tinder|Netflix/.test(html), "demo bills on Bills");
  });

  await step("the coach answers from the person's own payments", async () => {
    // No Gemini key in the test, so this is the offline answer, computed from the same data.
    const res = await go("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", text: "How much did I spend on restaurants?" }] }) });
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.ok(typeof data.answer === "string" && data.answer.length > 0);
    assert.ok(!/Aino|dentist/i.test(data.answer));
  });

  await step("the daily sync needs its secret", async () => {
    assert.equal((await fetch(`${base}/api/cron/sync`)).status, 401);
    const res = await fetch(`${base}/api/cron/sync`, { headers: { authorization: `Bearer ${CRON}` } });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.results[0].bank, "spankki");
    assert.equal(data.results[0].ok, true);
  });

  // SHOTS=<folder>: also save phone-size screenshots of the main screens (for looking at, not checked).
  if (process.env.SHOTS) {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: "solvo_auth", value: jar.get("solvo_auth"), url: base }]);
    const page = await ctx.newPage();
    await page.goto(`${base}/login`);
    await page.evaluate(() => sessionStorage.setItem("solvo.intro.v1", "1"));
    for (const [name, path] of [["onboarding", "/onboarding"], ["home", "/"], ["bills", "/bills"], ["profile", "/profile"], ["calendar", "/calendar"]]) {
      if (name === "home") await page.evaluate(() => localStorage.setItem("solvo.onboarding.v1", JSON.stringify({ skipped: true })));
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
    }
    const login = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await login.goto(`${base}/login`);
    await login.screenshot({ path: `${process.env.SHOTS}/login.png` });
    await browser.close();
  }

  await step("logging out locks the app again", async () => {
    const out = await go("/api/logout", { method: "POST" });
    assert.equal(out.status, 303);
    assert.ok(!jar.has("solvo_auth"));
    assert.equal(loc(await go("/")), "/login");
  });

  console.log(`\nAll ${ok} checks passed.`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  stop();
}
