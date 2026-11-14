// LOCAL ONLY. Connecting the owner's own bank accounts (Nordea, Trade Republic, Revolut) from inside the app, so the only thing the
// person does is approve with the bank's own login. Switched on with SOLVO_LIVE=1 (npm run dev:live: 127.0.0.1 only, https) and
// never on Vercel: every function here refuses otherwise. Everything it stores lives in data/private/ (gitignored, owner-only files).
//
// Flow (the routes are thin wrappers around these functions), the same for every bank:
//   Add a bank > the bank -> POST /api/live/start     makes a state token, asks Enable Banking for the bank's approval URL
//   the bank, with its own login                       approves and redirects to /callback?code=&state=
//   GET /callback                                      checks the state, swaps the code for a session, saves it
//   /connect/live -> POST /api/live/sync               downloads transactions, builds the customer, Home merges it in
//   Profile "Sync now" / "Disconnect"                  sync again, or end the consent and delete everything stored for that bank
//
// Where each bank keeps its files: Nordea keeps the names it has always had (data/private/nordea-api/, nordea-customer.json) so an
// existing connection carries on; the others use data/private/live/<bank>/.
import "server-only";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EbError,
  configFromEnv,
  createSession,
  deleteSession,
  fetchAccountTransactions,
  fetchBalances,
  listAspsps,
  pickBalance,
  startAuth,
  type EbConfig,
  type EbSession,
} from "@/lib/enable-banking-core";
import { LIVE_BANKS, LIVE_BANK_IDS, type LiveBankId } from "@/lib/live-bank-ids";
import { isLoopbackRequest, isSameOriginPost } from "@/lib/loopback";
import { buildNordeaCustomer, type RawTx } from "@/lib/nordea-customer";

const root = () => path.join(process.cwd(), "data/private");
const dirOf = (b: LiveBankId) => (b === "nordea" ? path.join(root(), "nordea-api") : path.join(root(), "live", b));
const sessionFile = (b: LiveBankId) => path.join(dirOf(b), "session.json");
const metaFile = (b: LiveBankId) => path.join(dirOf(b), "meta.json");
export const customerFileOf = (b: LiveBankId) => (b === "nordea" ? path.join(root(), "nordea-customer.json") : path.join(dirOf(b), "customer.json"));

export const STATE_COOKIE = "solvo_eb_state";
const DEFAULT_REDIRECT = "https://localhost:3000/callback";

/** The master switch. Off on Vercel no matter what the environment says. */
export const liveEnabled = () => process.env.SOLVO_LIVE === "1" && !process.env.VERCEL;
export const redirectUrl = () => process.env.ENABLE_REDIRECT_URL ?? DEFAULT_REDIRECT;
const config = (): EbConfig | null => configFromEnv(process.env);

/** Null when the request may proceed; otherwise the refusal to send. A 404 when the feature is off, so it looks like it isn't there. */
export function guard(req: Request, { post = false }: { post?: boolean } = {}): Response | null {
  if (!liveEnabled()) return new Response("Not found", { status: 404 });
  if (!isLoopbackRequest(req)) return Response.json({ error: "Live bank data only works on this computer (localhost)." }, { status: 403 });
  if (post && !isSameOriginPost(req)) return Response.json({ error: "Refused: not sent from the app." }, { status: 403 });
  return null;
}

function writePrivate(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
  chmodSync(file, 0o600);
}
const readJson = <T>(file: string): T | null => {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
  } catch {
    return null;
  }
};

type Meta = { syncedAt: string; transactions: number; accounts: number; asOf: string };

export type LiveBankStatus = {
  id: LiveBankId;
  name: string;
  connected: boolean;
  syncedAt: string | null;
  asOf: string | null;
  validUntil: string | null;
  /** Whole days until the consent ends, worked out when the page is served. Negative once it has ended. */
  daysLeft: number | null;
  accounts: number;
  transactions: number;
};
export type LiveStatus = {
  enabled: boolean;
  /** Key and application id are set in .env.local. */
  configured: boolean;
  redirectUrl: string;
  banks: LiveBankStatus[];
};

function bankStatus(b: LiveBankId): LiveBankStatus {
  const session = readJson<EbSession>(sessionFile(b));
  let meta = readJson<Meta>(metaFile(b));
  // A connection made earlier with scripts/nordea-psd2.mjs has no counts saved: read them from the customer file once.
  if (session && !meta && existsSync(customerFileOf(b))) {
    const customer = readJson<{ transactions?: unknown[]; asOf?: string }>(customerFileOf(b));
    if (customer?.transactions) {
      meta = { syncedAt: statSync(customerFileOf(b)).mtime.toISOString(), transactions: customer.transactions.length, accounts: session.accounts?.length ?? 0, asOf: customer.asOf ?? "" };
      writePrivate(metaFile(b), meta);
    }
  }
  return {
    id: b,
    name: LIVE_BANKS[b].name,
    connected: !!session && existsSync(customerFileOf(b)),
    syncedAt: meta?.syncedAt ?? null,
    asOf: meta?.asOf ?? null,
    validUntil: session?.access?.valid_until ?? null,
    daysLeft: session?.access?.valid_until ? Math.ceil((Date.parse(session.access.valid_until) - Date.now()) / 864e5) : null,
    accounts: session?.accounts?.length ?? 0,
    transactions: meta?.transactions ?? 0,
  };
}
export function liveStatus(): LiveStatus {
  return { enabled: liveEnabled(), configured: !!config(), redirectUrl: redirectUrl(), banks: LIVE_BANK_IDS.map(bankStatus) };
}

/** What went wrong, said so a person can act on it. Never includes account data. */
export function explain(e: unknown): string {
  if (e instanceof EbError) {
    if (e.status === 401 || e.status === 403) return "Enable Banking refused the request. Check the application id and key in .env.local, and that the consent is still valid.";
    if (e.status === 422 || e.status === 400) return `Enable Banking rejected the request (${e.status}). The redirect address must match the one registered for the application, and the bank must be enabled for it.`;
    if (e.status === 429) return "Too many requests. Wait a minute and try again.";
    return `Enable Banking answered with an error (${e.status}).`;
  }
  return e instanceof Error ? e.message.slice(0, 200) : "Something went wrong.";
}

/** Step 1: ask Enable Banking for the bank's approval page. `state` is checked again in the callback. */
export async function beginConsent(bank: LiveBankId, state: string): Promise<string> {
  const cfg = config();
  if (!cfg) throw new Error("Set ENABLE_APP_ID and ENABLE_KEY_PATH in .env.local, then restart npm run dev:live.");
  const { aspsp, country } = LIVE_BANKS[bank];
  // As long as open banking allows (180 days) and the bank agrees to, so the person renews twice a year, not monthly. The bank's own
  // limit comes from its entry in Enable Banking's list; if it still refuses the length, fall back to shorter ones.
  const wanted = Math.min(180, Math.max(1, Number(process.env.LIVE_CONSENT_DAYS ?? process.env.NORDEA_CONSENT_DAYS ?? 180)));
  const bankMax = (await listAspsps(cfg, country).catch(() => [])).find((b) => b.name === aspsp)?.maxConsentSeconds;
  const first = Math.min(wanted, bankMax ? Math.max(1, Math.floor(bankMax / 86400)) : wanted);
  let lastError: unknown;
  for (const validDays of [...new Set([first, Math.min(first, 90), Math.min(first, 30)])]) {
    try {
      return (await startAuth(cfg, { bank: aspsp, country, state, redirectUrl: redirectUrl(), validDays })).url;
    } catch (e) {
      lastError = e;
      if (!(e instanceof EbError) || (e.status !== 400 && e.status !== 422)) throw e;
    }
  }
  throw lastError;
}

const lastFinished = new Map<LiveBankId, number>();

/** Step 2: the bank sent the person back with a code. Swap it for a session and keep it. */
export async function completeConsent(bank: LiveBankId, code: string): Promise<void> {
  const cfg = config();
  if (!cfg) throw new Error("Enable Banking is not configured.");
  const old = readJson<EbSession>(sessionFile(bank));
  const session = await createSession(cfg, code);
  if (!session.accounts?.length) throw new Error("The bank returned no accounts.");
  writePrivate(sessionFile(bank), session);
  lastFinished.set(bank, 0); // a new approval always downloads again, even right after an earlier sync
  // Connecting again replaces the earlier consent: end the old one at Enable Banking (best effort).
  if (old?.session_id && old.session_id !== session.session_id) deleteSession(cfg, old.session_id).catch(() => {});
}

/**
 * Every transaction a bank will give for one account. Banks cap how far back an app may read (Nordea 540 days, others less), and
 * refuse a start date past their cap, so ask for the most and step down to what the bank allows.
 */
async function history(cfg: EbConfig, uid: string): Promise<RawTx[]> {
  let last: unknown;
  for (const days of [535, 365, 180, 90, 30]) {
    try {
      return (await fetchAccountTransactions(cfg, uid, new Date(Date.now() - days * 864e5).toISOString().slice(0, 10))).transactions;
    } catch (e) {
      last = e;
      if (!(e instanceof EbError) || (e.status !== 400 && e.status !== 422)) throw e;
    }
  }
  throw last;
}

const inFlight = new Map<LiveBankId, Promise<Meta>>();

/** Step 3 (and every refresh): download transactions for every account of a bank, rebuild its customer. Throttled to one run per 30 s. */
export function syncLive(bank: LiveBankId): Promise<Meta> {
  const running = inFlight.get(bank);
  if (running) return running;
  if (Date.now() - (lastFinished.get(bank) ?? 0) < 30_000 && existsSync(metaFile(bank))) return Promise.resolve(readJson<Meta>(metaFile(bank)) as Meta);
  const run = (async () => {
    const cfg = config();
    const session = readJson<EbSession>(sessionFile(bank));
    if (!cfg || !session?.accounts?.length) throw new Error("Not connected yet.");
    const perAccount: RawTx[][] = [];
    const balances: (number | null)[] = [];
    for (const acc of session.accounts) {
      perAccount.push(await history(cfg, acc.uid));
      // What is in each account now. Not every bank puts a balance on each transaction, so ask for it.
      balances.push(await fetchBalances(cfg, acc.uid).then(pickBalance, () => null));
    }
    // Keep the raw cache under the same names as scripts/nordea-psd2.mjs, so the command-line builder keeps working.
    perAccount.forEach((txs, i) => writePrivate(path.join(dirOf(bank), `tx_account${i + 1}.json`), txs));
    for (const f of readdirSync(dirOf(bank))) {
      const n = /^tx_account(\d+)\.json$/.exec(f)?.[1];
      if (n && Number(n) > perAccount.length) rmSync(path.join(dirOf(bank), f));
    }
    const { customer } = buildNordeaCustomer(perAccount, balances, bank === "nordea" ? "ME-NORDEA" : `ME-${bank.toUpperCase()}`);
    writePrivate(customerFileOf(bank), customer);
    const meta: Meta = { syncedAt: new Date().toISOString(), transactions: customer.transactions.length, accounts: perAccount.length, asOf: customer.asOf };
    writePrivate(metaFile(bank), meta);
    return meta;
  })().finally(() => {
    inFlight.delete(bank);
    lastFinished.set(bank, Date.now());
  });
  inFlight.set(bank, run);
  return run;
}

/** Ends the consent at Enable Banking (best effort) and deletes everything stored here for one bank: session, raw cache and customer. */
export async function disconnectLive(bank: LiveBankId): Promise<void> {
  const cfg = config();
  const session = readJson<EbSession>(sessionFile(bank));
  if (cfg && session?.session_id) {
    try {
      await deleteSession(cfg, session.session_id);
    } catch {
      // Already expired or ended: the local copy still goes.
    }
  }
  rmSync(dirOf(bank), { recursive: true, force: true });
  rmSync(customerFileOf(bank), { force: true });
  lastFinished.delete(bank);
}
