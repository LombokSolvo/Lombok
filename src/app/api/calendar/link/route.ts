import { baselinesFor } from "@/lib/calendar-source";
import { forecast } from "@/lib/forecast";
import { LinkError, connectLink, linkGuard } from "@/lib/ics-link";
import { todayIso } from "@/lib/demo-clock";

// LOCAL ONLY. Reads the calendar behind a pasted link, keeps the events that look like spending, and answers with a count and a
// preview of labels, dates, amounts and titles, for the person's own screen on this computer.
export async function POST(req: Request) {
  const refused = linkGuard(req, { post: true });
  if (refused) return refused;
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  if (typeof body.url !== "string" || body.url.length > 2000) return Response.json({ error: "Paste the calendar link." }, { status: 400 });
  try {
    const { found, kept } = await connectLink(body.url);
    const items = forecast(kept, await baselinesFor(), todayIso(), "link", { keepTitle: true });
    return Response.json({ found, counted: items.length, preview: items.map((i) => ({ label: i.label, date: i.date, amount: i.amount, title: i.detail, category: i.category })) });
  } catch (e) {
    if (e instanceof LinkError) return Response.json({ error: e.message }, { status: 422 });
    return Response.json({ error: "Something went wrong reading that calendar." }, { status: 500 });
  }
}
