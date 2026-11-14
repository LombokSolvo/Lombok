// The banks a person can connect for real on their own computer (npm run dev:live), through Enable Banking. Client-safe: no server code.
// `aspsp` is the exact name Enable Banking lists the bank under (checked against its Finland list, 14 Nov 2026). Trade Republic and
// Revolut are banks with a payment account, so open banking (PSD2) gives their cash balance and transactions, NOT share holdings.
import type { DemoCustomer } from "./demo";

export const LIVE_BANKS = {
  nordea: { name: "Nordea", aspsp: "Nordea", country: "FI", login: "Nordea ID", note: null },
  traderepublic: {
    name: "Trade Republic",
    aspsp: "Trade Republic",
    country: "FI",
    login: "your Trade Republic login",
    note: "Open banking covers your cash account: balance and payments. Your share holdings aren't included.",
  },
  revolut: {
    name: "Revolut",
    aspsp: "Revolut",
    country: "FI",
    login: "your Revolut login",
    note: "Open banking covers your Revolut accounts and cards: balances and payments. Investments inside Revolut aren't included.",
  },
} as const;

export type LiveBankId = keyof typeof LIVE_BANKS;
export const LIVE_BANK_IDS = Object.keys(LIVE_BANKS) as LiveBankId[];

export const parseLiveBank = (v: unknown): LiveBankId | null => (typeof v === "string" && v in LIVE_BANKS ? (v as LiveBankId) : null);

/** The live bank a bank-list entry stands for (by the name and country Enable Banking uses), if it is one of ours. */
export const liveBankOf = (name: string, country: string): LiveBankId | null =>
  LIVE_BANK_IDS.find((id) => LIVE_BANKS[id].aspsp === name && LIVE_BANKS[id].country === country) ?? null;

/** One connected real bank, as the app reads it. */
export type RealBank = { id: LiveBankId; name: string; customer: DemoCustomer };

/** What the person is told before approving a real connection, the same shape for every bank. */
export function liveConsentPoints(id: LiveBankId): string[] {
  const b = LIVE_BANKS[id];
  return [
    "Solvo reads your accounts, balances and transactions. Read-only: it can't move money.",
    `You approve at ${b.name} with ${b.login}. You never open Enable Banking's website.`,
    ...(b.note ? [b.note] : []),
    "Access lasts up to 6 months, the most open banking allows. Renew or disconnect any time.",
    "Real data: it stays on this computer.",
  ];
}
