import { disconnectLive, explain, guard } from "@/lib/live-banks";
import { parseLiveBank } from "@/lib/live-bank-ids";

// LOCAL ONLY (SOLVO_LIVE=1). Ends one bank's consent at Enable Banking and deletes its session, raw cache and customer file.
// POST { bank }.
export async function POST(req: Request) {
  const refused = guard(req, { post: true });
  if (refused) return refused;
  const bank = parseLiveBank(((await req.json().catch(() => ({}))) as { bank?: unknown }).bank);
  if (!bank) return Response.json({ error: "Choose a bank." }, { status: 400 });
  try {
    await disconnectLive(bank);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: explain(e) }, { status: 500 });
  }
}
