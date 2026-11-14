import { disconnectGoogle, explainGoogle, googleGuard } from "@/lib/google-calendar";

// LOCAL ONLY (SOLVO_GOOGLE=1). Revokes the token at Google and deletes the saved token and events from this computer.
export async function POST(req: Request) {
  const refused = googleGuard(req, { post: true });
  if (refused) return refused;
  try {
    await disconnectGoogle();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: explainGoogle(e) }, { status: 500 });
  }
}
