import { LinkError, linkGuard, syncLink } from "@/lib/ics-link";

// LOCAL ONLY. Reads the saved calendar link again. Answers with counts and a time only.
export async function POST(req: Request) {
  const refused = linkGuard(req, { post: true });
  if (refused) return refused;
  try {
    const { found, kept, syncedAt } = await syncLink();
    return Response.json({ found, counted: kept.length, syncedAt });
  } catch (e) {
    return Response.json({ error: e instanceof LinkError ? e.message : "Something went wrong reading that calendar." }, { status: 502 });
  }
}
