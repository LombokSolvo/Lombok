// The banks, neobanks and trading platforms a person can connect for real on their own computer (npm run dev:live), through Enable
// Banking. Client-safe: no server code. `aspsp` is the exact name Enable Banking lists the bank under (its Finland list, checked 14 Nov
// 2026: every Finnish bank in the picker is on it, Handelsbanken is not); `kind` is what the picker calls it. Open banking (PSD2) covers payment accounts: balances and payments, in euro here. It does
// NOT return share holdings, which is why Trade Republic, the one trading platform on the list, brings only its cash account.
import type { DemoCustomer } from "./demo";

export const LIVE_BANKS = {
  nordea: { name: "Nordea", aspsp: "Nordea", country: "FI", kind: "Bank", note: null },
  op: { name: "OP", aspsp: "OP", country: "FI", kind: "Bank", note: null },
  spankki: { name: "S-Pankki", aspsp: "S-Pankki", country: "FI", kind: "Bank", note: "The S-Pankki on your Profile is demo data. This adds your own real account next to it." },
  danske: { name: "Danske Bank", aspsp: "Danske Bank", country: "FI", kind: "Bank", note: null },
  saastopankki: { name: "Säästöpankki", aspsp: "Säästöpankki", country: "FI", kind: "Bank", note: null },
  aktia: { name: "Aktia", aspsp: "Aktia", country: "FI", kind: "Bank", note: null },
  alandsbanken: { name: "Ålandsbanken", aspsp: "Ålandsbanken", country: "FI", kind: "Bank", note: null },
  pop: { name: "POP Pankki", aspsp: "POP Pankki", country: "FI", kind: "Bank", note: null },
  omasp: { name: "Oma Säästöpankki", aspsp: "Oma Säästöpankki", country: "FI", kind: "Bank", note: null },
  revolut: { name: "Revolut", aspsp: "Revolut", country: "FI", kind: "Neobank", note: "Euro accounts only. Investments inside Revolut aren't included." },
  bunq: { name: "bunq", aspsp: "bunq", country: "FI", kind: "Neobank", note: "Euro accounts only." },
  n26: { name: "N26", aspsp: "N26", country: "FI", kind: "Neobank", note: "Euro account only." },
  wise: { name: "Wise", aspsp: "Wise", country: "FI", kind: "Money app", note: "Euro balances only." },
  klarna: { name: "Klarna", aspsp: "Klarna", country: "FI", kind: "Money app", note: "Euro payments only." },
  paypal: { name: "PayPal", aspsp: "PayPal", country: "FI", kind: "Money app", note: "Euro payments only." },
  traderepublic: { name: "Trade Republic", aspsp: "Trade Republic", country: "FI", kind: "Trading platform", note: "Only its cash account, not your shares." },
} as const;

export type LiveBankId = keyof typeof LIVE_BANKS;
export const LIVE_BANK_IDS = Object.keys(LIVE_BANKS) as LiveBankId[];

export const parseLiveBank = (v: unknown): LiveBankId | null => (typeof v === "string" && Object.hasOwn(LIVE_BANKS, v) ? (v as LiveBankId) : null);

/** The live bank a bank-list entry stands for (by the name and country Enable Banking uses), if it is one of ours. */
export const liveBankOf = (name: string, country: string): LiveBankId | null =>
  LIVE_BANK_IDS.find((id) => LIVE_BANKS[id].aspsp === name && LIVE_BANKS[id].country === country) ?? null;

/** One connected real bank, as the app reads it. */
export type RealBank = { id: LiveBankId; name: string; customer: DemoCustomer };

/**
 * What the person is told before approving a real connection, in plain words, the same for every bank. Enable Banking is the service
 * that connects Solvo to the bank, and it always shows a short approval step of its own first, so the text says so.
 */
export function liveConsentPoints(id: LiveBankId): string[] {
  const b = LIVE_BANKS[id];
  return [
    "Solvo can see your balances and payments. It can never move money.",
    `You sign in at ${b.name}. Before that, Enable Banking, which connects Solvo to the bank, asks you to continue.`,
    ...(b.note ? [b.note] : []),
    "Access lasts up to 6 months. Disconnect any time.",
    "Your data stays on this computer.",
  ];
}
