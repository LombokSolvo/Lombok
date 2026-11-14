import { disconnectLink, linkGuard } from "@/lib/ics-link";

// LOCAL ONLY. Deletes the saved link and the events kept from it.
export async function POST(req: Request) {
  const refused = linkGuard(req, { post: true });
  if (refused) return refused;
  disconnectLink();
  return Response.json({ ok: true });
}
