import { connection } from "next/server";
import { sameText } from "@/lib/auth-token";
import { explain, liveStatus, syncLive } from "@/lib/live-banks";
import { isPersonal } from "@/lib/personal";

// The private deployment's daily refresh. Vercel Cron calls this once a day (vercel.json) with CRON_SECRET as a bearer token; nothing
// else can start it. Each connected bank whose consent is still valid downloads its latest payments. Answers with counts only.
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!isPersonal() || !secret) return new Response("Not found", { status: 404 });
  if (!sameText(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Refused", { status: 401 });
  const results: { bank: string; ok: boolean; transactions?: number; error?: string }[] = [];
  for (const bank of (await liveStatus()).banks) {
    if (!bank.connected) continue;
    if (bank.validUntil && Date.parse(bank.validUntil) < Date.now()) {
      results.push({ bank: bank.id, ok: false, error: "Consent ended: connect again in Profile." });
      continue;
    }
    try {
      const meta = await syncLive(bank.id);
      results.push({ bank: bank.id, ok: true, transactions: meta.transactions });
    } catch (e) {
      results.push({ bank: bank.id, ok: false, error: explain(e) });
    }
  }
  return Response.json({ results });
}
