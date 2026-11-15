// Which other banks the person has connected, and which view they chose. Both live in cookies (not localStorage) because the
// pages render on the server and need to know. DEMO: connecting is simulated and attaches example data (see second-bank.ts).

// What a simulated connection adds: "nordea" is any bank (income and bills), "klarna" pay-later instalments, "traderepublic"
// cash waiting to be invested. Each carries its own example data (second-bank.ts).
export type BankId = "nordea" | "klarna" | "traderepublic";
export const BANK_IDS: BankId[] = ["nordea", "klarna", "traderepublic"];
export type View = "all" | "spankki";

export const BANKS_COOKIE = "solvo_banks";
export const VIEW_COOKIE = "solvo_view";

export const BANK_INFO: Record<BankId, { name: string }> = {
  nordea: { name: "Nordea" },
  klarna: { name: "Klarna" },
  traderepublic: { name: "Trade Republic" },
};

/** Which example data a picked name attaches: Klarna has its own, the investing platforms share one, any other name is a bank. */
export const INVESTING_NAMES = ["Trade Republic", "Nordnet"];
export const simulatedIdFor = (name: string): BankId => (name === "Klarna" ? "klarna" : INVESTING_NAMES.includes(name) ? "traderepublic" : "nordea");

// The bank shown for the simulated second bank (the demo data stays the same whichever the person picks). Sanitised: it ends up in text.
export const BANKNAME_COOKIE = "solvo_bankname";
export const DEFAULT_BANKNAME = "Nordea";
export const parseBankName = (raw: string | undefined | null): string => {
  const v = raw ? decodeURIComponent(raw).trim() : "";
  return /^[\p{L}\p{N} .&'-]{1,40}$/u.test(v) ? v : DEFAULT_BANKNAME;
};
export function writeBankNameCookie(name: string) {
  document.cookie = `${BANKNAME_COOKIE}=${encodeURIComponent(name)}; path=/; max-age=31536000; samesite=lax`;
}
export function readBankNameCookie(): string {
  return parseBankName(document.cookie.split("; ").find((c) => c.startsWith(`${BANKNAME_COOKIE}=`))?.slice(BANKNAME_COOKIE.length + 1));
}

// Banks and neobanks as Enable Banking lists them for Finland (checked 14 Nov 2026), shown when the live list is not set up.
// Connecting one is simulated. Nordnet is not on that list (open banking does not reach it): it is offered as a simulated investing
// platform only, and attaches the same example data as Trade Republic.
export const FALLBACK_BANKS = [
  "OP", "Nordea", "S-Pankki", "Danske Bank", "Säästöpankki", "Aktia", "Ålandsbanken", "POP Pankki", "Oma Säästöpankki",
  "Revolut", "Trade Republic", "Nordnet", "bunq", "N26", "Wise", "Klarna", "PayPal",
];

export const parseBanks = (raw: string | undefined | null): BankId[] =>
  (raw ?? "")
    .split(",")
    .filter((b): b is BankId => (BANK_IDS as string[]).includes(b));

/** Browser only. Saves the connected banks (and the view) for a year. */
export function writeBanksCookie(banks: BankId[], view: View = "all") {
  const opts = "; path=/; max-age=31536000; samesite=lax";
  document.cookie = `${BANKS_COOKIE}=${banks.join(",")}${opts}`;
  document.cookie = `${VIEW_COOKIE}=${view}${opts}`;
}

export function clearBanksCookie() {
  document.cookie = `${BANKNAME_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${BANKS_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${VIEW_COOKIE}=; path=/; max-age=0`;
  // The investing-platform choice of an earlier version, if this browser still has it.
  document.cookie = "solvo_platform=; path=/; max-age=0";
}

export function readBanksCookie(): { banks: BankId[]; view: View } {
  const get = (name: string) => document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  return { banks: parseBanks(get(BANKS_COOKIE)), view: get(VIEW_COOKIE) === "spankki" ? "spankki" : "all" };
}
