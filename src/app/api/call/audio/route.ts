import { CALL_SCRIPT, CALL_VOICE_ID } from "@/data/reminders";

// The recorded message, the fallback when the two-way call can't start ("Can't talk? Play the message instead").
// Spoken by ElevenLabs from CALL_SCRIPT on the first request and kept for the life of the server instance (and by the CDN), so
// the script, not a stale mp3, is the one source of truth. The CDN keeps it for a year, so a deploy pays for it about once. The key stays on the server. Without a key, or if ElevenLabs is
// unavailable, it answers 503 and the call screen lets the phone's own voice read the same script.
// GET -> audio/mpeg

export const maxDuration = 30;

const MODELS = ["eleven_v4", "eleven_multilingual_v2"];
let cached: ArrayBuffer | null = null;

async function speak(key: string): Promise<ArrayBuffer> {
  let last: unknown = null;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CALL_VOICE_ID}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": key, Accept: "audio/mpeg" },
        body: JSON.stringify({ text: CALL_SCRIPT, model_id: model }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
      return await res.arrayBuffer();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response("Not configured", { status: 503 });
  try {
    cached ??= await speak(key);
  } catch (e) {
    console.error("call audio:", e instanceof Error ? e.message : "failed");
    return new Response("Unavailable", { status: 503 });
  }
  return new Response(cached, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
  });
}
