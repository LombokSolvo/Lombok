// DEMO DATA: card subscriptions for Aino, the main demo customer. The S-Pankki dataset has no streaming or cloud
// merchants (its merchants are anonymous ids), so these are invented, like the dentist e-invoice. Prices are
// illustrative, not the services' current price lists. In production Solvo would find them as card payments that
// repeat every month with the same merchant and amount.

export type Subscription = {
  id: string;
  name: string;
  what: string;
  monthly: number; // EUR
  day: number; // charged on this day of the month
  since: string; // YYYY-MM
};

export const SUBSCRIPTIONS: Subscription[] = [
  { id: "netflix", name: "Netflix", what: "Streaming, Standard plan", monthly: 13.99, day: 12, since: "2022-03" },
  { id: "spotify", name: "Spotify", what: "Music, Premium Individual", monthly: 11.99, day: 3, since: "2019-08" },
  { id: "icloud", name: "iCloud+", what: "Cloud storage, 200 GB", monthly: 2.99, day: 21, since: "2023-01" },
];

export const subscriptionsMonthly = (subs: Subscription[]) => subs.reduce((s, x) => s + x.monthly, 0);

/** Every monthly charge between two dates (inclusive), newest first. */
export function subscriptionCharges(subs: Subscription[], from: string, to: string) {
  const out: { date: string; name: string; amount: number }[] = [];
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const month = d.toISOString().slice(0, 7);
    for (const s of subs) {
      const date = `${month}-${String(s.day).padStart(2, "0")}`;
      if (month >= s.since && date >= from && date <= to) out.push({ date, name: s.name, amount: s.monthly });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
