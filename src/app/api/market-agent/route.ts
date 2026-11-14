import { exaKey } from "@/lib/exa";
import { runElectricityAgent } from "@/lib/market-agent";
import { runTelecomAgent } from "@/lib/telecom-agent";
import type { AgentEvent } from "@/lib/market-agent-events";
import { checkLimit, withCookie } from "@/lib/rate-limit";

// Runs one of Solvo's market agents and streams its steps as NDJSON, one event per line.
// POST { agent: "electricity" | "telecom" }. The last line is { type: "result", db, live }.
// Without a key, or on any failure, db is the saved database.
// In production the agents run nightly for everyone; "Run now" in the app calls them live for the demo.
//
// A successful live run is kept for a few hours and replayed step by step to the next visitors,
// so a crowd pressing "Run now" costs one search, not hundreds. Market prices don't move by the hour.

export const maxDuration = 60;

const AGENTS = { electricity: runElectricityAgent, telecom: runTelecomAgent };
type Name = keyof typeof AGENTS;

const KEEP_MS = 6 * 60 * 60 * 1000;
const lastRun = new Map<Name, { events: AgentEvent[]; until: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* replay(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  for (const e of events) {
    await sleep(e.type === "step" && e.status === "running" ? 700 : 150);
    yield e;
  }
}

async function* live(name: Name): AsyncGenerator<AgentEvent> {
  const events: AgentEvent[] = [];
  for await (const e of AGENTS[name]()) {
    events.push(e);
    yield e;
  }
  const result = events.at(-1);
  if (result?.type === "result" && result.live) lastRun.set(name, { events, until: Date.now() + KEEP_MS });
}

export async function POST(request: Request) {
  const { agent = "electricity" } = (await request.json().catch(() => ({}))) as { agent?: string };
  if (!(agent in AGENTS)) return Response.json({ error: "Unknown agent" }, { status: 404 });
  const name = agent as Name;

  let events: AsyncGenerator<AgentEvent>;
  let limit: ReturnType<typeof checkLimit> | undefined;
  const kept = lastRun.get(name);
  if (kept && kept.until > Date.now()) events = replay(kept.events);
  else if (!exaKey()) events = AGENTS[name]();
  else {
    limit = checkLimit(request, "agent");
    events = limit.ok ? live(name) : AGENTS[name]({ offline: true });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of events) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      controller.close();
    },
  });
  const res = new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  return limit ? withCookie(res, limit) : res;
}
