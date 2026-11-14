// The customer as the person has chosen to see them: S-Pankki alone, or merged with the banks they connected (cookies, set from
// Profile) and, locally, their real Nordea. Anything that talks to an outside model uses getDemoEffective instead: synthetic only.
import "server-only";
import { cookies } from "next/headers";
import { BANKNAME_COOKIE, BANKS_COOKIE, VIEW_COOKIE, parseBankName, parseBanks, type BankId, type View } from "@/lib/banks";
import { combinedCustomer } from "@/lib/combine";
import type { DemoCustomer } from "@/lib/demo";
import type { DemoMode } from "@/lib/demo-mode";
import type { RealBank } from "@/lib/live-bank-ids";
import { demoCustomerFor, getSource } from "@/lib/source";

export async function getEffective(mode: DemoMode = "new"): Promise<{ base: DemoCustomer; customer: DemoCustomer; local: boolean; real: RealBank[]; mode: DemoMode; banks: BankId[]; cookieBanks: BankId[]; view: View; bankName: string }> {
  const { customer: base, local, real } = getSource(mode);
  const jar = await cookies();
  // What the person added themselves (the Profile list), and what is merged: the same, plus the real Nordea when it is connected.
  const cookieBanks = parseBanks(jar.get(BANKS_COOKIE)?.value);
  const banks: BankId[] = real.length ? [...new Set<BankId>([...cookieBanks, "nordea"])] : cookieBanks;
  const view: View = jar.get(VIEW_COOKIE)?.value === "spankki" ? "spankki" : "all";
  return {
    base,
    customer: banks.length && view === "all" ? combinedCustomer(base, banks, real) : base,
    local,
    real,
    mode,
    banks,
    cookieBanks,
    view,
    bankName: parseBankName(jar.get(BANKNAME_COOKIE)?.value),
  };
}

/** Like getEffective, but always the synthetic demo customer, never real bank data. For anything that talks to an outside model. */
export async function getDemoEffective(mode: DemoMode = "new"): Promise<{ base: DemoCustomer; customer: DemoCustomer; mode: DemoMode; banks: BankId[]; view: View; bankName: string }> {
  const base = demoCustomerFor(mode);
  const jar = await cookies();
  const banks = parseBanks(jar.get(BANKS_COOKIE)?.value);
  const view: View = jar.get(VIEW_COOKIE)?.value === "spankki" ? "spankki" : "all";
  return { base, customer: banks.length && view === "all" ? combinedCustomer(base, banks) : base, mode, banks, view, bankName: parseBankName(jar.get(BANKNAME_COOKIE)?.value) };
}
