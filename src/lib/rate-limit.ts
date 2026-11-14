import "server-only";

// Simple limits on the routes that call paid APIs (Gemini, Exa), so a crowd trying the public
// demo can't run up the bill. In memory, per server instance: good enough for one weekend,
// with the budget caps in Google AI Studio and Exa as the hard stop behind it.
//
// Three counters per kind of call:
// - per visitor (an anonymous random id in an httpOnly cookie), the one people normally meet;
// - per IP address, set high because a whole venue shares one Wi-Fi address;
// - one global count per day for the whole app.
// When a limit hits, the route answers from saved or offline data instead of failing.

export type LimitKind = "chat" | "invoice" | "photo" | "agent";

type Rule = { perVisitor: number; perIp: number; perDay: number; windowMs: number };

const HOUR = 60 * 60 * 1000;
const env = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const RULES: Record<LimitKind, Rule> = {
  chat: { perVisitor: env("LIMIT_CHAT_PER_HOUR", 20), perIp: 400, perDay: env("LIMIT_CHAT_PER_DAY", 3000), windowMs: HOUR },
  invoice: { perVisitor: 15, perIp: 300, perDay: env("LIMIT_INVOICE_PER_DAY", 400), windowMs: HOUR },
  photo: { perVisitor: 5, perIp: 100, perDay: env("LIMIT_PHOTO_PER_DAY", 200), windowMs: HOUR },
  agent: { perVisitor: env("LIMIT_AGENT_PER_HOUR", 3), perIp: 40, perDay: env("LIMIT_AGENT_PER_DAY", 60), windowMs: HOUR },
};

const windows = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, max: number, windowMs: number, now: number) {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (w.count >= max) return false;
  w.count++;
  return true;
}

function sweep(now: number) {
  if (windows.size < 5000) return;
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}

const COOKIE = "solvo_vid";

function visitorId(request: Request): { id: string; isNew: boolean } {
  const m = request.headers.get("cookie")?.match(/(?:^|;\s*)solvo_vid=([a-f0-9-]{36})/);
  return m ? { id: m[1], isNew: false } : { id: crypto.randomUUID(), isNew: true };
}

function clientIp(request: Request) {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export type LimitResult = { ok: boolean; reason?: "visitor" | "ip" | "day"; cookie?: string };

/**
 * Counts one paid call of this kind. Returns ok: false when any limit is reached (nothing is
 * counted then). Pass `cookie` on as a Set-Cookie header so the visitor keeps the same id.
 */
export function checkLimit(request: Request, kind: LimitKind): LimitResult {
  const rule = RULES[kind];
  const now = Date.now();
  sweep(now);
  const { id, isNew } = visitorId(request);
  const cookie = isNew ? `${COOKIE}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 7}; HttpOnly; SameSite=Lax${process.env.VERCEL ? "; Secure" : ""}` : undefined;
  const day = new Date(now).toISOString().slice(0, 10);
  const keys: [string, number, number, LimitResult["reason"]][] = [
    [`${kind}:day:${day}`, rule.perDay, 24 * HOUR, "day"],
    [`${kind}:ip:${clientIp(request)}`, rule.perIp, rule.windowMs, "ip"],
    [`${kind}:v:${id}`, rule.perVisitor, rule.windowMs, "visitor"],
  ];
  // Check all first, so a refused call doesn't use up the other counters.
  for (const [key, max, , reason] of keys) {
    const w = windows.get(key);
    if (w && w.resetAt > now && w.count >= max) return { ok: false, reason, cookie };
  }
  for (const [key, max, windowMs] of keys) hit(key, max, windowMs, now);
  return { ok: true, cookie };
}

/** Adds the visitor cookie, when there is a new one, to a response. */
export function withCookie(res: Response, limit: LimitResult): Response {
  if (limit.cookie) res.headers.append("set-cookie", limit.cookie);
  return res;
}
