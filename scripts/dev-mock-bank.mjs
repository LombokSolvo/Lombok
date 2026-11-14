// Try the bank picker and the demo bank connection on your own computer, with no Enable Banking sandbox application.
//
//   npm run dev:mock-bank        then open http://localhost:3100/profile and tap "Add another bank"
//
// It starts a stand-in for api.enablebanking.com (a few banks per country, a bank approval page with Approve and Cancel, and
// invented accounts and transactions) and the app on port 3100 pointed at it, bound to 127.0.0.1. Everything is made up:
// no real bank, no real data, and the real-Nordea mode is off. Stop both with Ctrl+C. To use the real sandbox instead, put
// ENABLE_SANDBOX_APP_ID and ENABLE_SANDBOX_KEY in .env.local (see src/lib/linked-bank.ts) and run npm run dev.
import { generateKeyPairSync } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const APP_PORT = Number(process.env.PORT ?? 3100);
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 4010);

const BANKS = {
  FI: ["Aktia", "Danske Bank", "Mock ASPSP", "Nordea", "OP", "S-Pankki", "Säästöpankki"],
  SE: ["Handelsbanken", "Nordea", "SEB", "Swedbank"],
  NO: ["DNB", "Nordea", "SpareBank 1"],
  DK: ["Danske Bank", "Jyske Bank", "Nordea"],
  EE: ["LHV", "Swedbank"],
  DE: ["Commerzbank", "Deutsche Bank", "N26"],
  NL: ["ABN AMRO", "ING", "Rabobank"],
  FR: ["BNP Paribas", "Crédit Agricole"],
};

const iso = (d) => d.toISOString().slice(0, 10);

// About 17 months of invented activity: a salary, rent, power, two subscriptions, groceries, take-away.
function transactions(account) {
  if (account !== "acc-1") return [];
  const out = [];
  for (let k = 0; k < 520; k++) {
    const d = new Date(Date.now() - k * 864e5);
    const date = iso(d);
    const dom = d.getUTCDate();
    const add = (name, amount, code, debit = true) =>
      out.push({
        booking_date: date,
        transaction_date: date,
        credit_debit_indicator: debit ? "DBIT" : "CRDT",
        transaction_amount: { amount: String(amount), currency: "EUR" },
        [debit ? "creditor" : "debtor"]: { name },
        bank_transaction_code: { description: code },
        remittance_information: [],
        status: "BOOK",
      });
    if (dom === 25) add("Example Employer Oy", 2400, "Palkka", false);
    if (dom === 1) add("Example Housing Oy", 640, "e-lasku");
    if (dom === 3) add("Example Energia Oy", 58.4, "e-lasku");
    if (dom === 7) add("SPOTIFY", 11.99, "Korttiosto");
    if (dom === 12) add("NETFLIX", 13.99, "Korttiosto");
    if (k % 2 === 0) add("EXAMPLE GROCERY", (12 + (k % 17)).toFixed(2), "Korttiosto");
    if (k % 9 === 0) add("EXAMPLE TAKEAWAY", (18 + (k % 11)).toFixed(2), "Korttiosto");
  }
  return out;
}

let lastBank = "Mock ASPSP";
const page = (title, body) =>
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font:16px system-ui;max-width:420px;margin:40px auto;padding:0 16px"><h1 style="font-size:22px">${title}</h1>${body}`;

function mock() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${MOCK_PORT}`);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = (code, obj) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const b = body ? JSON.parse(body) : {};
      const p = url.pathname;

      if (p === "/application") return json(200, { name: "mock", active: true, environment: "SANDBOX", countries: Object.keys(BANKS) });
      if (p === "/aspsps") {
        const country = url.searchParams.get("country") ?? "FI";
        return json(200, { aspsps: (BANKS[country] ?? []).map((name) => ({ name, country, psu_types: ["personal"] })) });
      }
      if (p === "/auth" && req.method === "POST") {
        lastBank = b.aspsp?.name ?? lastBank;
        const q = new URLSearchParams({ state: b.state, redirect: b.redirect_url, bank: lastBank });
        return json(200, { url: `http://127.0.0.1:${MOCK_PORT}/approve?${q}`, authorization_id: "mock" });
      }
      if (p === "/approve") {
        // The bank's own page. The real one asks for the bank's ID; this one just asks.
        const redirect = url.searchParams.get("redirect") ?? "";
        const state = encodeURIComponent(url.searchParams.get("state") ?? "");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(
          page(`${url.searchParams.get("bank")} (test bank)`, `<p>Solvo wants to read your accounts, balances and transactions. Nothing here is real.</p>
<p><a href="${redirect}?code=MOCKCODE&state=${state}" style="display:block;padding:14px;background:#13623f;color:#fff;text-align:center;border-radius:14px;text-decoration:none">Approve</a></p>
<p><a href="${redirect}?error=access_denied&state=${state}" style="display:block;padding:14px;background:#e6ebe7;text-align:center;border-radius:14px;text-decoration:none;color:#111">Cancel</a></p>`),
        );
      }
      if (p === "/sessions" && req.method === "POST") {
        return json(200, {
          session_id: "mock-session",
          aspsp: { name: lastBank, country: "FI" },
          accounts: [{ uid: "acc-1" }, { uid: "acc-2" }],
          access: { valid_until: new Date(Date.now() + 30 * 864e5).toISOString() },
        });
      }
      if (p.startsWith("/sessions/") && req.method === "DELETE") return json(200, {});
      const bal = /^\/accounts\/([\w-]+)\/balances$/.exec(p);
      if (bal) return json(200, { balances: [{ name: "Booked", balance_type: "CLAV", balance_amount: { currency: "EUR", amount: bal[1] === "acc-1" ? "1234.50" : "300.00" } }] });
      const tx = /^\/accounts\/([\w-]+)\/transactions$/.exec(p);
      if (tx) {
        const all = transactions(tx[1]);
        const half = Math.ceil(all.length / 2);
        const second = !!url.searchParams.get("continuation_key");
        return json(200, second || !all.length ? { transactions: all.slice(half) } : { transactions: all.slice(0, half), continuation_key: "page-2" });
      }
      json(404, { error: "mock: not found", path: p });
    });
  });
}

// A throwaway key: the stand-in does not check signatures, but the app signs every request exactly as it would for real.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

const server = mock();
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${MOCK_PORT} is busy. Stop whatever uses it, or set MOCK_PORT.` : e.message);
  process.exit(1);
});
server.listen(MOCK_PORT, "127.0.0.1", () => {
  console.log(`Stand-in bank API on http://127.0.0.1:${MOCK_PORT} (made-up data). Starting the app on port ${APP_PORT}...`);
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SOLVO_LIVE: "", // real Nordea stays off
      ENABLE_SANDBOX_APP_ID: "mock-sandbox-app",
      ENABLE_SANDBOX_KEY: privateKey,
      ENABLE_API_URL: `http://127.0.0.1:${MOCK_PORT}`,
    },
  });
  const stop = () => {
    app.kill();
    server.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  app.on("exit", (code) => {
    server.close();
    process.exit(code ?? 0);
  });
  console.log(`\nOpen http://localhost:${APP_PORT}/profile and tap "Add another bank". Ctrl+C stops everything.\n`);
});
