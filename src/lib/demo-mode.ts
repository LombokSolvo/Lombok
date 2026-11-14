// Shared by the server (which customer to load) and the browser (Profile's demo account switch).
export type DemoMode = "aino" | "new";
export const DEMO_COOKIE = "solvo-demo";

/**
 * The account a visit starts as. The public demo starts as Aino (the finished account, sample data, no onboarding). Running Solvo
 * yourself, `NEXT_PUBLIC_SOLVO_START=onboarding` in .env.local starts as the new customer, who goes through onboarding first.
 * (NEXT_PUBLIC_ so the browser and the server agree.) A cookie or the Profile switch overrides it either way.
 */
export const DEFAULT_MODE: DemoMode = process.env.NEXT_PUBLIC_SOLVO_START === "onboarding" ? "new" : "aino";
export const parseMode = (v: string | undefined | null): DemoMode => (v === "aino" || v === "new" ? v : DEFAULT_MODE);
