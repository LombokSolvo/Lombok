// Starts Solvo's two-way call: asks ElevenLabs for a signed, short-lived conversation URL for the coach agent and hands only
// that URL to the browser. The API key never leaves the server. The agent is private (signed URLs only), so the agent id alone
// can't start a conversation.
// POST (same origin) -> { signedUrl } | 404 when not configured | 429 | 502

export const maxDuration = 15;

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let bucket = { start: 0, count: 0 };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agentId) return Response.json({ error: "The call isn't set up on this server." }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "Not allowed." }, { status: 403 });

  const now = Date.now();
  if (now - bucket.start > WINDOW_MS) bucket = { start: now, count: 0 };
  if (++bucket.count > MAX_PER_WINDOW) return Response.json({ error: "Too many calls, try again in a minute." }, { status: 429 });

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10_000), cache: "no-store" },
    );
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
    const data = (await res.json()) as { signed_url?: string };
    if (!data.signed_url) throw new Error("no signed_url");
    return Response.json({ signedUrl: data.signed_url }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("call session:", e instanceof Error ? e.message : "failed");
    return Response.json({ error: "Couldn't reach the call service." }, { status: 502 });
  }
}
