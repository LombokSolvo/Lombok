// Where real bank data is kept. Two places, chosen by the environment:
//   - on the person's own computer (npm run dev:live): files under data/private/ (gitignored, owner-only), as before;
//   - on the private deployment (SOLVO_PERSONAL=1 on Vercel, which has no disk): an Upstash Redis database, added in Vercel's
//     Storage tab, which sets KV_REST_API_URL and KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* names).
// Everything written to the database is sealed first with AES-256-GCM under SOLVO_DATA_KEY, so the database only ever holds
// scrambled bytes: someone who got into it would see nothing readable without the key, which lives only in Vercel's settings.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const kvUrl = () => process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const kvToken = () => process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

/** True when the database is set up; otherwise files on this computer. */
export const remoteStore = () => !!(kvUrl() && kvToken());

function dataKey(): Buffer {
  const k = process.env.SOLVO_DATA_KEY;
  if (!k || k.length < 32) throw new Error("Set SOLVO_DATA_KEY (at least 32 characters) before storing bank data.");
  return createHash("sha256").update(`solvo-store:${k}`).digest();
}

/** AES-256-GCM: a fresh 12-byte nonce per write, the tag checks nothing was changed. Format: v1.<nonce>.<tag>.<ciphertext>, base64url. */
export function sealText(plain: string, key = dataKey()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
export function openText(sealed: string, key = dataKey()): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || body === undefined) throw new Error("Stored data is in an unknown format.");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

async function kv(command: unknown[]): Promise<unknown> {
  const res = await fetch(kvUrl() as string, {
    method: "POST",
    headers: { Authorization: `Bearer ${kvToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  // The command name only: never the value, which is bank data.
  if (!res.ok || json.error) throw new Error(`Database ${String(command[0])} failed (${res.status}).`);
  return json.result;
}

const fileOf = (key: string) => {
  if (!/^[a-z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Bad storage key.");
  return path.join(process.cwd(), "data/private", key);
};

// One copy in memory per server instance, so a page that reads the same thing several times asks the database once.
const memo = new Map<string, { at: number; value: unknown }>();
const MEMO_MS = 60_000;

export async function readStored<T>(key: string): Promise<T | null> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value as T | null;
  let value: T | null = null;
  if (remoteStore()) {
    const raw = await kv(["GET", `solvo:${key}`]);
    value = typeof raw === "string" ? (JSON.parse(openText(raw)) as T) : null;
  } else {
    const file = fileOf(key);
    try {
      value = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
    } catch {
      value = null;
    }
  }
  // Only what exists is remembered: a bank connected a moment ago on another server instance shows up at once.
  if (value !== null) memo.set(key, { at: Date.now(), value });
  return value;
}

export async function writeStored(key: string, value: unknown): Promise<void> {
  if (remoteStore()) await kv(["SET", `solvo:${key}`, sealText(JSON.stringify(value))]);
  else {
    const file = fileOf(key);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(value));
    chmodSync(file, 0o600);
  }
  memo.set(key, { at: Date.now(), value });
}

export async function deleteStored(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (remoteStore()) await kv(["DEL", ...keys.map((k) => `solvo:${k}`)]);
  else for (const k of keys) rmSync(fileOf(k), { force: true });
  for (const k of keys) memo.delete(k);
}
