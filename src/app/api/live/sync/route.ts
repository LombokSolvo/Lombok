import { explain, guard, syncLive } from "@/lib/live-banks";
import { LIVE_BANK_IDS, parseLiveBank } from "@/lib/live-bank-ids";

// LOCAL ONLY (SOLVO_LIVE=1). Downloads one bank's transactions (POST { bank }) and rebuilds its customer, or every connected bank when
// no bank is named. Answers with counts and dates only, never transactions.
export async function POST(req: Request) {
  const refused = guard(req, { post: true });
  if (refused) return refused;
  const asked = ((await req.json().catch(() => ({}))) as { bank?: unknown }).bank;
  const bank = parseLiveBank(asked);
  if (asked !== undefined && !bank) return Response.json({ error: "Choose a bank." }, { status: 400 });
  try {
    const banks = bank ? [bank] : LIVE_BANK_IDS;
    const results = [];
    for (const b of banks) {
      try {
        const { transactions, accounts, asOf, syncedAt } = await syncLive(b);
        results.push({ bank: b, transactions, accounts, asOf, syncedAt });
      } catch (e) {
        // With no bank named, a bank that is not connected is skipped; a named bank's error is the answer.
        if (bank) throw e;
      }
    }
    // The first result's numbers stay at the top level, so a caller that syncs one bank reads them directly.
    return Response.json({ ...(results[0] ?? {}), results });
  } catch (e) {
    return Response.json({ error: explain(e) }, { status: 502 });
  }
}
