import { explainGoogle, googleGuard, syncGoogle } from "@/lib/google-calendar";

// LOCAL ONLY (SOLVO_GOOGLE=1). Reads the upcoming events again. Answers with a count and a time, never events.
export async function POST(req: Request) {
  const refused = googleGuard(req, { post: true });
  if (refused) return refused;
  try {
    const { events, syncedAt } = await syncGoogle();
    return Response.json({ events: events.length, syncedAt });
  } catch (e) {
    return Response.json({ error: explainGoogle(e) }, { status: 502 });
  }
}
