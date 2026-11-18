// The private deployment's login (SOLVO_PERSONAL=1). One person, one password (SOLVO_PASSWORD, set in Vercel). Logging in gives the
// browser a signed cookie that lasts 180 days, so the phone stays logged in. Web Crypto only, so the proxy (src/proxy.ts) and the
// login route share it. Changing SOLVO_PASSWORD or SOLVO_DATA_KEY logs every device out.

export const AUTH_COOKIE = "solvo_auth";
export const AUTH_DAYS = 180;

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmacKey(): Promise<CryptoKey | null> {
  const pw = process.env.SOLVO_PASSWORD;
  const dk = process.env.SOLVO_DATA_KEY;
  if (!pw || !dk) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`solvo-auth:${dk}:${pw}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(payload: string): Promise<string | null> {
  const key = await hmacKey();
  return key ? b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload))) : null;
}

/** Same length and same bytes, compared without stopping early. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeToken(now = Date.now()): Promise<string | null> {
  const exp = Math.floor(now / 1000) + AUTH_DAYS * 86400;
  const sig = await sign(`v1.${exp}`);
  return sig ? `v1.${exp}.${sig}` : null;
}

export async function validToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [v, exp, sig] = token.split(".");
  if (v !== "v1" || !exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const want = await sign(`v1.${exp}`);
  return !!want && sameText(sig, want);
}

/** Compares the typed password with SOLVO_PASSWORD, through a hash so the time taken does not depend on the password's length. */
export async function passwordMatches(typed: string): Promise<boolean> {
  const pw = process.env.SOLVO_PASSWORD;
  if (!pw) return false;
  const h = async (s: string) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return sameText(await h(typed), await h(pw));
}
